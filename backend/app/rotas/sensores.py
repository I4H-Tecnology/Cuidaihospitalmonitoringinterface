"""Sensores IoT: dispositivos além da câmera (Monitoramento → Sensores IoT).

Entrou em 26/10/2026. O produto não vem com sensor; o que existe aqui é o
lado do sistema para receber um: cadastro com token próprio, e uma rota onde
o dispositivo manda leituras (`POST /api/sensores/leitura`). O token segue a
regra de todo segredo deste backend: hash bcrypt no banco, em claro só na
resposta do cadastro. Leitura com `alerta: true` (botão de chamada apertado,
cama vazia de madrugada) fica marcada e a tela destaca.

A tela também lista as câmeras, que são os sensores que a clínica já tem.

Permissão: `monitoring` (ver para listar; editar para cadastrar e desativar).
A rota de leitura é pública e autentica pelo token do sensor.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant

router = APIRouter()

JANELA_ONLINE = timedelta(minutes=5)


class SensorPayload(BaseModel):
    tenantId: str
    nome: str = Field(min_length=2, max_length=80)
    tipo: Literal["cama", "porta", "presenca", "botao_chamada", "ambiente", "outro"]
    ambienteId: str | None = None


class LeituraPayload(BaseModel):
    sensorId: str
    token: str = Field(min_length=20, max_length=200)
    valor: dict[str, Any]
    alerta: bool = False


def montar(l: dict) -> dict:
    agora = datetime.now(timezone.utc)
    return {
        "id": str(l["id"]), "nome": l["nome"], "tipo": l["tipo"],
        "ambienteId": str(l["ambiente_id"]) if l["ambiente_id"] else None, "ambienteNome": l.get("ambiente_nome"),
        "ativo": l["ativo"], "ultimoSinal": iso(l["ultimo_sinal"]), "ultimaLeitura": l["ultima_leitura"],
        "online": bool(l["ativo"] and l["ultimo_sinal"] and agora - l["ultimo_sinal"] < JANELA_ONLINE),
        "alertas24h": l.get("alertas24h", 0), "criadoEm": iso(l["created_at"]),
    }


@router.get("/api/sensores")
def listar(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view"))):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linhas = db.buscar_todos(
        """
        SELECT s.*, amb.nome AS ambiente_nome,
               (SELECT count(*) FROM sensor_leitura sl WHERE sl.sensor_id = s.id AND sl.alerta
                   AND sl.recebida_em > now() - interval '24 hours') AS alertas24h
          FROM sensor s LEFT JOIN ambiente amb ON amb.id = s.ambiente_id
         WHERE s.clinica_id = %s ORDER BY s.ativo DESC, s.nome
        """,
        (clinica["id"],),
    )
    return [montar(l) for l in linhas]


@router.post("/api/sensores", status_code=201)
def cadastrar(payload: SensorPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "edit"))):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    if payload.ambienteId and not db.buscar_um(
        "SELECT 1 FROM ambiente WHERE id = %s AND clinica_id = %s", (payload.ambienteId, clinica["id"])
    ):
        raise HTTPException(404, "Ambiente não encontrado nesta clínica.")
    if db.buscar_um("SELECT 1 FROM sensor WHERE clinica_id = %s AND lower(nome) = lower(%s)", (clinica["id"], payload.nome.strip())):
        raise HTTPException(409, "Já existe um sensor com esse nome.")
    token = secrets.token_urlsafe(32)
    linha = db.buscar_um(
        """INSERT INTO sensor (clinica_id, ambiente_id, nome, tipo, token_hash)
           VALUES (%s, %s, %s, %s, crypt(%s, gen_salt('bf', 10))) RETURNING *""",
        (clinica["id"], payload.ambienteId or None, payload.nome.strip(), payload.tipo, token),
    )
    logger.info("Sensor %s cadastrado por %s", payload.nome, usuario.nome)
    return {**montar(linha), "token": token}


@router.post("/api/sensores/{sensor_id}/desativar")
def desativar(sensor_id: str, tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "edit"))):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    if not db.executar("UPDATE sensor SET ativo = false WHERE id = %s AND clinica_id = %s", (sensor_id, clinica["id"])):
        raise HTTPException(404, "Sensor não encontrado.")
    return {"ok": True}


@router.get("/api/sensores/{sensor_id}/leituras")
def leituras(sensor_id: str, tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view"))):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    if not db.buscar_um("SELECT 1 FROM sensor WHERE id = %s AND clinica_id = %s", (sensor_id, clinica["id"])):
        raise HTTPException(404, "Sensor não encontrado.")
    linhas = db.buscar_todos(
        "SELECT valor, alerta, recebida_em FROM sensor_leitura WHERE sensor_id = %s ORDER BY recebida_em DESC LIMIT 50",
        (sensor_id,),
    )
    return [{"valor": l["valor"], "alerta": l["alerta"], "recebidaEm": iso(l["recebida_em"])} for l in linhas]


@router.post("/api/sensores/leitura")
def receber_leitura(payload: LeituraPayload):
    """Rota do dispositivo. Mesma resposta para sensor inexistente e token errado."""
    import json

    sensor = None
    if len(payload.sensorId) == 36:
        sensor = db.buscar_um(
            "SELECT id, ativo FROM sensor WHERE id = %s AND token_hash = crypt(%s, token_hash)",
            (payload.sensorId, payload.token),
        )
    if not sensor or not sensor["ativo"]:
        raise HTTPException(401, "Sensor não autorizado.")
    valor = json.dumps(payload.valor)[:4000]
    with db.cursor() as cur:
        cur.execute("INSERT INTO sensor_leitura (sensor_id, valor, alerta) VALUES (%s, %s::jsonb, %s)", (sensor["id"], valor, payload.alerta))
        cur.execute("UPDATE sensor SET ultimo_sinal = now(), ultima_leitura = %s::jsonb WHERE id = %s", (valor, sensor["id"]))
        # Retenção: sete dias de leitura bastam para a tela; o resto é ruído.
        cur.execute("DELETE FROM sensor_leitura WHERE sensor_id = %s AND recebida_em < now() - interval '7 days'", (sensor["id"],))
    return {"ok": True}
