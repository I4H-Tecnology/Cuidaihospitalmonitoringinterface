"""Operacional assistencial: checklists, escalas e movimentação de pacientes.

Entrou em 26/10/2026 com as telas Checklists Operacionais, Escalas
Assistenciais, Fluxo do Paciente, Alta e Transferência e Internações.

- Checklists e escalas: permissão `operations` (`view` vê, `create` executa
  checklist, `edit` mantém modelos e monta a escala).
- Movimentação e transferência: permissão `patients`, a mesma do cadastro do
  paciente (`view` vê o fluxo; `edit` transfere).
"""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant

router = APIRouter()

Turno = Literal["manha", "tarde", "noite"]


def clinica_de(tenant: str, usuario: UsuarioAutenticado) -> dict:
    exigir_tenant(usuario, tenant)
    return clinica_por_slug(tenant)


def vazio(v: str | None) -> str | None:
    return (v or "").strip() or None


def registrar_movimentacao(cur, clinica_id, paciente_id, tipo: str, origem=None, destino=None, motivo=None, usuario_id=None) -> None:
    """Usado também por pacientes.py: toda admissão, troca de ambiente e saída deixa rastro."""
    cur.execute(
        """INSERT INTO movimentacao_paciente (clinica_id, paciente_id, tipo, ambiente_origem_id, ambiente_destino_id, motivo, usuario_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (clinica_id, paciente_id, tipo, origem, destino, motivo, usuario_id),
    )


# -----------------------------------------------------------------------------
# Checklists
# -----------------------------------------------------------------------------

class ModeloPayload(BaseModel):
    tenantId: str
    titulo: str = Field(min_length=3, max_length=120)
    descricao: str | None = Field(default=None, max_length=500)
    itens: list[str] = Field(min_length=1, max_length=60)
    frequencia: Literal["turno", "diaria", "semanal", "sob_demanda"] = "turno"
    ativo: bool = True


class Resposta(BaseModel):
    item: str = Field(max_length=200)
    feito: bool
    observacao: str | None = Field(default=None, max_length=300)


class ExecucaoPayload(BaseModel):
    tenantId: str
    modeloId: str
    turno: Turno
    respostas: list[Resposta] = Field(min_length=1, max_length=60)
    observacao: str | None = Field(default=None, max_length=1000)


def montar_modelo(l: dict) -> dict:
    return {
        "id": str(l["id"]), "titulo": l["titulo"], "descricao": l["descricao"], "itens": l["itens"],
        "frequencia": l["frequencia"], "ativo": l["ativo"], "ultimaExecucaoEm": iso(l.get("ultima_execucao")),
        "execucoes7d": l.get("execucoes7d", 0),
    }


def itens_limpos(itens: list[str]) -> list[str]:
    limpos = [i.strip() for i in itens if i.strip()]
    if not limpos:
        raise HTTPException(422, "O checklist precisa de pelo menos um item.")
    if any(len(i) > 200 for i in limpos):
        raise HTTPException(422, "Cada item tem no máximo 200 caracteres.")
    return limpos


@router.get("/api/checklists/modelos")
def listar_modelos(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("operations", "view"))):
    clinica = clinica_de(tenantId, usuario)
    linhas = db.buscar_todos(
        """SELECT m.*, (SELECT max(concluido_em) FROM checklist_execucao e WHERE e.modelo_id = m.id) AS ultima_execucao,
                  (SELECT count(*) FROM checklist_execucao e WHERE e.modelo_id = m.id AND e.concluido_em > now() - interval '7 days') AS execucoes7d
             FROM checklist_modelo m WHERE m.clinica_id = %s ORDER BY m.ativo DESC, m.titulo""",
        (clinica["id"],),
    )
    return [montar_modelo(l) for l in linhas]


@router.post("/api/checklists/modelos", status_code=201)
def criar_modelo(payload: ModeloPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("operations", "edit"))):
    import json

    clinica = clinica_de(payload.tenantId, usuario)
    linha = db.buscar_um(
        """INSERT INTO checklist_modelo (clinica_id, titulo, descricao, itens, frequencia, ativo, criado_por)
           VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s) RETURNING *""",
        (clinica["id"], payload.titulo.strip(), vazio(payload.descricao), json.dumps(itens_limpos(payload.itens)),
         payload.frequencia, payload.ativo, usuario.id),
    )
    return montar_modelo(linha)


@router.patch("/api/checklists/modelos/{modelo_id}")
def editar_modelo(modelo_id: str, payload: ModeloPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("operations", "edit"))):
    import json

    clinica = clinica_de(payload.tenantId, usuario)
    linha = db.buscar_um(
        """UPDATE checklist_modelo SET titulo = %s, descricao = %s, itens = %s::jsonb, frequencia = %s, ativo = %s
            WHERE id = %s AND clinica_id = %s RETURNING *""",
        (payload.titulo.strip(), vazio(payload.descricao), json.dumps(itens_limpos(payload.itens)), payload.frequencia,
         payload.ativo, modelo_id, clinica["id"]),
    )
    if not linha:
        raise HTTPException(404, "Checklist não encontrado.")
    return montar_modelo(linha)


@router.get("/api/checklists/execucoes")
def listar_execucoes(tenantId: str, dias: int = 7, usuario: UsuarioAutenticado = Depends(exigir_permissao("operations", "view"))):
    clinica = clinica_de(tenantId, usuario)
    linhas = db.buscar_todos(
        """SELECT e.*, m.titulo, u.nome AS usuario_nome FROM checklist_execucao e
             JOIN checklist_modelo m ON m.id = e.modelo_id JOIN usuario u ON u.id = e.usuario_id
            WHERE e.clinica_id = %s AND e.concluido_em > now() - make_interval(days => %s)
            ORDER BY e.concluido_em DESC LIMIT 300""",
        (clinica["id"], max(1, min(dias, 90))),
    )
    return [{
        "id": str(l["id"]), "modeloId": str(l["modelo_id"]), "titulo": l["titulo"], "turno": l["turno"],
        "respostas": l["respostas"], "itensTotal": l["itens_total"], "itensFeitos": l["itens_feitos"],
        "observacao": l["observacao"], "usuarioNome": l["usuario_nome"], "concluidoEm": iso(l["concluido_em"]),
    } for l in linhas]


@router.post("/api/checklists/execucoes", status_code=201)
def executar(payload: ExecucaoPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("operations", "create"))):
    import json

    clinica = clinica_de(payload.tenantId, usuario)
    modelo = db.buscar_um("SELECT itens, ativo FROM checklist_modelo WHERE id = %s AND clinica_id = %s", (payload.modeloId, clinica["id"]))
    if not modelo or not modelo["ativo"]:
        raise HTTPException(404, "Checklist não encontrado ou desativado.")
    # A execução vale contra os itens do modelo agora: item a mais não entra.
    previstos = set(modelo["itens"])
    respostas = [r.model_dump() for r in payload.respostas if r.item in previstos]
    if len(respostas) != len(modelo["itens"]):
        raise HTTPException(409, "O checklist mudou enquanto você preenchia. Abra de novo.")
    feitos = sum(1 for r in respostas if r["feito"])
    db.executar(
        """INSERT INTO checklist_execucao (modelo_id, clinica_id, usuario_id, turno, respostas, itens_total, itens_feitos, observacao)
           VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s)""",
        (payload.modeloId, clinica["id"], usuario.id, payload.turno, json.dumps(respostas), len(respostas), feitos, vazio(payload.observacao)),
    )
    return {"ok": True, "itensFeitos": feitos, "itensTotal": len(respostas)}


# -----------------------------------------------------------------------------
# Escalas
# -----------------------------------------------------------------------------

class TurnoPayload(BaseModel):
    tenantId: str
    usuarioId: str
    data: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    turno: Turno
    funcao: str | None = Field(default=None, max_length=60)


@router.get("/api/escalas")
def escala(tenantId: str, inicio: str, fim: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("operations", "view"))):
    clinica = clinica_de(tenantId, usuario)
    try:
        i, f = date.fromisoformat(inicio), date.fromisoformat(fim)
    except ValueError:
        raise HTTPException(422, "Datas no formato AAAA-MM-DD.")
    if f < i or (f - i).days > 62:
        raise HTTPException(422, "Período de até dois meses.")
    turnos = db.buscar_todos(
        """SELECT t.id, t.usuario_id, t.data, t.turno, t.funcao, u.nome FROM escala_turno t JOIN usuario u ON u.id = t.usuario_id
            WHERE t.clinica_id = %s AND t.data BETWEEN %s AND %s ORDER BY t.data, t.turno, u.nome""",
        (clinica["id"], i, f),
    )
    # Só o necessário para montar a grade: quem é da clínica e está ativo.
    equipe = db.buscar_todos(
        """SELECT u.id, u.nome, p.nome AS perfil FROM usuario u JOIN perfil p ON p.id = u.perfil_id
            WHERE u.clinica_id = %s AND u.status = 'ativo' AND upper(p.nome) <> 'SYSTEM' ORDER BY u.nome""",
        (clinica["id"],),
    )
    return {
        "turnos": [{"id": str(t["id"]), "usuarioId": str(t["usuario_id"]), "usuarioNome": t["nome"], "data": t["data"].isoformat(),
                    "turno": t["turno"], "funcao": t["funcao"]} for t in turnos],
        "equipe": [{"id": str(u["id"]), "nome": u["nome"], "perfil": u["perfil"]} for u in equipe],
    }


@router.post("/api/escalas", status_code=201)
def escalar(payload: TurnoPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("operations", "edit"))):
    clinica = clinica_de(payload.tenantId, usuario)
    if not db.buscar_um("SELECT 1 FROM usuario WHERE id = %s AND clinica_id = %s AND status = 'ativo'", (payload.usuarioId, clinica["id"])):
        raise HTTPException(404, "Profissional não encontrado nesta clínica.")
    linha = db.buscar_um(
        """INSERT INTO escala_turno (clinica_id, usuario_id, data, turno, funcao, criado_por) VALUES (%s, %s, %s, %s, %s, %s)
           ON CONFLICT (usuario_id, data, turno) DO UPDATE SET funcao = EXCLUDED.funcao RETURNING id""",
        (clinica["id"], payload.usuarioId, payload.data, payload.turno, vazio(payload.funcao), usuario.id),
    )
    return {"id": str(linha["id"])}


@router.delete("/api/escalas/{turno_id}")
def tirar_da_escala(turno_id: str, tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("operations", "edit"))):
    clinica = clinica_de(tenantId, usuario)
    if not db.executar("DELETE FROM escala_turno WHERE id = %s AND clinica_id = %s", (turno_id, clinica["id"])):
        raise HTTPException(404, "Turno não encontrado.")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Movimentação de pacientes
# -----------------------------------------------------------------------------

class TransferenciaPayload(BaseModel):
    tenantId: str
    ambienteId: str
    motivo: str = Field(min_length=3, max_length=300)


ROTULOS = {"admissao": "Admissão", "transferencia": "Transferência", "alta": "Alta", "transferencia_externa": "Transferência externa"}


@router.get("/api/movimentacoes")
def movimentacoes(tenantId: str, dias: int = 30, usuario: UsuarioAutenticado = Depends(exigir_permissao("patients", "view"))):
    clinica = clinica_de(tenantId, usuario)
    dias = max(7, min(dias, 365))
    linhas = db.buscar_todos(
        """SELECT m.id, m.tipo, m.data_hora, m.motivo, p.id AS paciente_id, p.nome AS paciente_nome,
                  o.nome AS origem, d.nome AS destino, u.nome AS usuario_nome
             FROM movimentacao_paciente m JOIN paciente p ON p.id = m.paciente_id
             LEFT JOIN ambiente o ON o.id = m.ambiente_origem_id LEFT JOIN ambiente d ON d.id = m.ambiente_destino_id
             LEFT JOIN usuario u ON u.id = m.usuario_id
            WHERE m.clinica_id = %s AND m.data_hora > now() - make_interval(days => %s)
            ORDER BY m.data_hora DESC""",
        (clinica["id"], dias),
    )
    censo = db.buscar_todos(
        """SELECT amb.id, amb.nome, amb.tipo, count(p.id) AS pacientes
             FROM ambiente amb LEFT JOIN paciente p ON p.ambiente_id = amb.id AND p.status = 'internado'
            WHERE amb.clinica_id = %s GROUP BY amb.id ORDER BY amb.nome""",
        (clinica["id"],),
    )
    sem_ambiente = db.buscar_um(
        "SELECT count(*) AS n FROM paciente WHERE clinica_id = %s AND status = 'internado' AND ambiente_id IS NULL", (clinica["id"],)
    )["n"]
    return {
        "movimentacoes": [{
            "id": str(l["id"]), "tipo": l["tipo"], "rotulo": ROTULOS[l["tipo"]], "dataHora": iso(l["data_hora"]), "motivo": l["motivo"],
            "pacienteId": str(l["paciente_id"]), "pacienteNome": l["paciente_nome"], "origem": l["origem"], "destino": l["destino"],
            "usuarioNome": l["usuario_nome"],
        } for l in linhas],
        "censo": [{"ambienteId": str(c["id"]), "nome": c["nome"], "tipo": c["tipo"], "pacientes": c["pacientes"]} for c in censo],
        "semAmbiente": sem_ambiente,
    }


@router.post("/api/pacientes/{paciente_id}/transferir")
def transferir(paciente_id: str, payload: TransferenciaPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("patients", "edit"))):
    clinica = clinica_de(payload.tenantId, usuario)
    paciente = db.buscar_um("SELECT id, nome, status, ambiente_id FROM paciente WHERE id = %s AND clinica_id = %s", (paciente_id, clinica["id"]))
    if not paciente:
        raise HTTPException(404, "Paciente não encontrado.")
    if paciente["status"] != "internado":
        raise HTTPException(409, "Só pacientes internados são transferidos.")
    destino = db.buscar_um("SELECT id, nome FROM ambiente WHERE id = %s AND clinica_id = %s", (payload.ambienteId, clinica["id"]))
    if not destino:
        raise HTTPException(404, "Ambiente de destino não encontrado.")
    if paciente["ambiente_id"] and str(paciente["ambiente_id"]) == payload.ambienteId:
        raise HTTPException(409, "O paciente já está nesse ambiente.")
    with db.cursor() as cur:
        cur.execute("UPDATE paciente SET ambiente_id = %s WHERE id = %s", (payload.ambienteId, paciente_id))
        registrar_movimentacao(cur, clinica["id"], paciente_id, "transferencia", paciente["ambiente_id"], payload.ambienteId,
                               payload.motivo.strip(), usuario.id)
    logger.info("Paciente %s transferido para %s por %s", paciente["nome"], destino["nome"], usuario.nome)
    return {"ok": True}
