"""Prescrições: o medicamento que o médico receitou ao paciente.

Fora das 12 entidades da RFC; entrou em 13/09/2026 por decisão de produto
(RFC 2.6 lista medicação como fora do MVP; errata pendente). O médico que
prescreveu fica como texto: o cadastro de usuários é da equipe da clínica,
e o prescritor pode ser um médico de fora dela.

Mesma disciplina de alergia e risco: registra-se e inativa-se (prescrição
suspensa), não se edita nem se apaga. Permissão `clinical_logs`: listar
exige `view`; registrar e inativar exigem `create`.
"""

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..schemas import Ok, PrescricaoPayload, PrescricaoResumo
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant
from .acompanhantes import paciente_da_clinica

router = APIRouter()

SELECT_PRESCRICAO = """
    SELECT pr.id, pr.paciente_id, pr.medicamento, pr.posologia, pr.medico_prescritor,
           pr.observacao, pr.ativo, pr.created_at, pr.inativado_em,
           u.nome AS autor_nome, p.nome AS paciente_nome, p.clinica_id
      FROM prescricao pr
      JOIN usuario u ON u.id = pr.usuario_id
      JOIN paciente p ON p.id = pr.paciente_id
"""


def montar(l: dict) -> PrescricaoResumo:
    return PrescricaoResumo(
        id=str(l["id"]),
        pacienteId=str(l["paciente_id"]),
        medicamento=l["medicamento"],
        posologia=l["posologia"],
        medicoPrescritor=l["medico_prescritor"],
        observacao=l["observacao"],
        ativo=bool(l["ativo"]),
        autorNome=l["autor_nome"],
        pacienteNome=l.get("paciente_nome"),
        criadoEm=iso(l["created_at"]) or "",
        inativadoEm=iso(l["inativado_em"]),
    )


@router.get("/api/pacientes/{paciente_id}/prescricoes", response_model=list[PrescricaoResumo])
def listar_prescricoes(
    paciente_id: str,
    tenantId: str,
    incluirInativas: bool = False,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "view")),
):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    paciente_da_clinica(paciente_id, clinica["id"])
    filtro = "" if incluirInativas else " AND pr.ativo"
    linhas = db.buscar_todos(
        SELECT_PRESCRICAO + " WHERE pr.paciente_id = %s" + filtro  # nosec B608 - filtro é constante deste módulo
        + " ORDER BY pr.ativo DESC, pr.created_at DESC",
        (paciente_id,),
    )
    return [montar(l) for l in linhas]


@router.post("/api/prescricoes", response_model=PrescricaoResumo, status_code=201)
def criar_prescricao(
    payload: PrescricaoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "create")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    paciente = paciente_da_clinica(payload.pacienteId, clinica["id"])

    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO prescricao (paciente_id, medicamento, posologia, medico_prescritor, observacao, usuario_id)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (
                payload.pacienteId,
                payload.medicamento.strip(),
                (payload.posologia or "").strip() or None,
                (payload.medicoPrescritor or "").strip() or None,
                (payload.observacao or "").strip() or None,
                usuario.id,
            ),
        )
        novo_id = cur.fetchone()["id"]
    logger.info("Prescrição de %s para %s por %s", payload.medicamento, paciente["nome"], usuario.nome)
    return montar(db.buscar_um(SELECT_PRESCRICAO + " WHERE pr.id = %s", (novo_id,)))


@router.post("/api/prescricoes/{prescricao_id}/inativar", response_model=Ok)
def inativar_prescricao(
    prescricao_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "create")),
):
    """Suspende a prescrição. Idempotente."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linha = db.buscar_um(SELECT_PRESCRICAO + " WHERE pr.id = %s", (prescricao_id,))
    if not linha or str(linha["clinica_id"]) != str(clinica["id"]):
        raise HTTPException(404, "Prescrição não encontrada.")
    if not linha["ativo"]:
        return Ok()
    db.executar(
        "UPDATE prescricao SET ativo = false, inativado_em = now() WHERE id = %s AND ativo",
        (prescricao_id,),
    )
    logger.info("Prescrição de %s suspensa por %s", linha["medicamento"], usuario.nome)
    return Ok()
