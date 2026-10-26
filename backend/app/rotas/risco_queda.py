"""Score de risco de queda: Escala de Morse mais os fatores que o sistema já sabe.

Entrou em 26/10/2026 (Monitoramento → Score de Risco). A Escala de Morse é
preenchida pela enfermagem, item a item; o banco soma. Ao lado dela a tela
mostra o que o sistema sabe sem ninguém digitar (idade, ocorrências recentes,
polifarmácia, alergia/risco grave, quarto sem câmera) — como contexto, não
somado à escala, porque somar mudaria a escala validada.

Faixas de Morse usadas no Brasil: 0–24 baixo, 25–44 moderado, ≥45 alto.

Permissão: `clinical_logs` (ver para listar, criar para avaliar).
"""

from fastapi import APIRouter, Depends, HTTPException
from financeiro.relogio import hoje
from pydantic import BaseModel, Field

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant
from .acompanhantes import paciente_da_clinica

router = APIRouter()


class AvaliacaoMorsePayload(BaseModel):
    tenantId: str
    pacienteId: str
    historicoQueda: int = Field(description="0 ou 25")
    diagnosticoSecundario: int = Field(description="0 ou 15")
    auxilioDeambulacao: int = Field(description="0, 15 ou 30")
    terapiaEndovenosa: int = Field(description="0 ou 20")
    marcha: int = Field(description="0, 10 ou 20")
    estadoMental: int = Field(description="0 ou 15")
    observacao: str | None = Field(default=None, max_length=1000)


PERMITIDOS = {
    "historicoQueda": (0, 25), "diagnosticoSecundario": (0, 15), "auxilioDeambulacao": (0, 15, 30),
    "terapiaEndovenosa": (0, 20), "marcha": (0, 10, 20), "estadoMental": (0, 15),
}


def faixa(total: int | None) -> str | None:
    if total is None:
        return None
    return "alto" if total >= 45 else "moderado" if total >= 25 else "baixo"


def montar_avaliacao(l: dict) -> dict:
    return {
        "id": str(l["id"]), "pacienteId": str(l["paciente_id"]),
        "historicoQueda": l["historico_queda"], "diagnosticoSecundario": l["diagnostico_secundario"],
        "auxilioDeambulacao": l["auxilio_deambulacao"], "terapiaEndovenosa": l["terapia_endovenosa"],
        "marcha": l["marcha"], "estadoMental": l["estado_mental"],
        "total": l["total"], "faixa": faixa(l["total"]), "observacao": l["observacao"],
        "autorNome": l["autor_nome"], "criadoEm": iso(l["created_at"]),
    }


@router.get("/api/risco-queda")
def painel_de_risco(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "view")),
):
    """Cada internado com a última Morse, a anterior (para ver a tendência) e os fatores do sistema."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linhas = db.buscar_todos(
        """
        SELECT p.id, p.nome, p.data_nascimento, p.data_admissao, amb.nome AS ambiente_nome,
               (SELECT count(*) FROM camera cam WHERE cam.ambiente_id = p.ambiente_id) AS cameras,
               (SELECT count(*) FROM ocorrencia o WHERE o.paciente_id = p.id AND o.status <> 'falso_positivo'
                   AND o.data_hora > now() - interval '30 days') AS ocorrencias30,
               (SELECT count(*) FROM ocorrencia o WHERE o.paciente_id = p.id AND o.status = 'queda_confirmada'
                   AND o.data_hora > now() - interval '90 days') AS quedas90,
               (SELECT count(*) FROM prescricao pr WHERE pr.paciente_id = p.id AND pr.ativo) AS prescricoes,
               (SELECT count(*) FROM risco_paciente r WHERE r.paciente_id = p.id AND r.ativo AND r.gravidade = 'grave') AS graves,
               ult.total AS morse, ult.created_at AS morse_em, ua.nome AS morse_autor, ant.total AS morse_anterior
          FROM paciente p
          LEFT JOIN ambiente amb ON amb.id = p.ambiente_id
          LEFT JOIN LATERAL (SELECT total, created_at, usuario_id FROM avaliacao_risco_queda a
                              WHERE a.paciente_id = p.id ORDER BY created_at DESC LIMIT 1) ult ON true
          LEFT JOIN usuario ua ON ua.id = ult.usuario_id
          LEFT JOIN LATERAL (SELECT total FROM avaliacao_risco_queda a
                              WHERE a.paciente_id = p.id ORDER BY created_at DESC OFFSET 1 LIMIT 1) ant ON true
         WHERE p.clinica_id = %s AND p.status = 'internado'
         ORDER BY ult.total DESC NULLS FIRST, p.nome
        """,
        (clinica["id"],),
    )
    saida = []
    for l in linhas:
        fatores = []
        if l["data_nascimento"]:
            n, h = l["data_nascimento"], hoje()
            idade = h.year - n.year - ((h.month, h.day) < (n.month, n.day))
            if idade >= 80:
                fatores.append(f"{idade} anos")
        if l["quedas90"]:
            fatores.append(f"{l['quedas90']} queda(s) confirmada(s) em 90 dias")
        elif l["ocorrencias30"]:
            fatores.append(f"{l['ocorrencias30']} ocorrência(s) em 30 dias")
        if l["prescricoes"] >= 5:
            fatores.append(f"polifarmácia ({l['prescricoes']} medicamentos)")
        if l["graves"]:
            fatores.append(f"{l['graves']} alergia/risco grave")
        if not l["cameras"]:
            fatores.append("quarto sem câmera")
        saida.append({
            "pacienteId": str(l["id"]), "pacienteNome": l["nome"], "ambienteNome": l["ambiente_nome"],
            "morse": l["morse"], "faixa": faixa(l["morse"]), "morseAnterior": l["morse_anterior"],
            "avaliadoEm": iso(l["morse_em"]), "avaliadoPor": l["morse_autor"],
            "admissao": l["data_admissao"].isoformat(), "fatores": fatores,
        })
    return saida


@router.get("/api/pacientes/{paciente_id}/avaliacoes-morse")
def avaliacoes_do_paciente(
    paciente_id: str, tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "view")),
):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    paciente_da_clinica(paciente_id, clinica["id"])
    linhas = db.buscar_todos(
        """SELECT a.*, u.nome AS autor_nome FROM avaliacao_risco_queda a JOIN usuario u ON u.id = a.usuario_id
            WHERE a.paciente_id = %s ORDER BY a.created_at DESC LIMIT 50""",
        (paciente_id,),
    )
    return [montar_avaliacao(l) for l in linhas]


@router.post("/api/avaliacoes-morse", status_code=201)
def avaliar(
    payload: AvaliacaoMorsePayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "create")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    paciente = paciente_da_clinica(payload.pacienteId, clinica["id"])
    if paciente["status"] != "internado":
        raise HTTPException(409, "Só pacientes internados são avaliados.")
    for campo, aceitos in PERMITIDOS.items():
        if getattr(payload, campo) not in aceitos:
            raise HTTPException(422, f"Valor inválido em {campo}: use {', '.join(map(str, aceitos))}.")
    linha = db.buscar_um(
        """
        INSERT INTO avaliacao_risco_queda (paciente_id, historico_queda, diagnostico_secundario, auxilio_deambulacao,
                                           terapia_endovenosa, marcha, estado_mental, observacao, usuario_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (payload.pacienteId, payload.historicoQueda, payload.diagnosticoSecundario, payload.auxilioDeambulacao,
         payload.terapiaEndovenosa, payload.marcha, payload.estadoMental, (payload.observacao or "").strip() or None, usuario.id),
    )
    nova = db.buscar_um(
        "SELECT a.*, u.nome AS autor_nome FROM avaliacao_risco_queda a JOIN usuario u ON u.id = a.usuario_id WHERE a.id = %s",
        (linha["id"],),
    )
    logger.info("Morse %s para %s por %s", nova["total"], paciente["nome"], usuario.nome)
    return montar_avaliacao(nova)
