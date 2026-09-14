"""Alergias e riscos do paciente.

Fora das 12 entidades da RFC; entrou em 13/09/2026 por decisão de produto,
junto com a evolução clínica. Diferente da evolução, isto **pode ser
inativado**: alergia que se confirma não existir, risco que deixou de valer.
Mas não é editado depois de criado nem apagado de verdade, mesmo raciocínio
de `acompanhante` (`ativo` / `inativado_em`). O histórico de quem foi
marcado como alérgico a quê é informação clínica, não lixo.

Permissão: `clinical_logs`. Listar exige `view`; registrar e inativar exigem
`create`, porque inativar é um registro (marca de fim com autor e data), não
uma edição.
"""

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..schemas import Ok, RiscoPayload, RiscoResumo
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant
from .acompanhantes import paciente_da_clinica

router = APIRouter()

SELECT_RISCO = """
    SELECT r.id, r.paciente_id, r.tipo, r.descricao, r.gravidade, r.ativo,
           r.created_at, r.inativado_em, u.nome AS autor_nome, p.clinica_id,
           p.nome AS paciente_nome
      FROM risco_paciente r
      JOIN usuario u ON u.id = r.usuario_id
      JOIN paciente p ON p.id = r.paciente_id
"""


def montar(l: dict) -> RiscoResumo:
    return RiscoResumo(
        id=str(l["id"]),
        pacienteId=str(l["paciente_id"]),
        tipo=l["tipo"],
        descricao=l["descricao"],
        gravidade=l["gravidade"],
        ativo=bool(l["ativo"]),
        autorNome=l["autor_nome"],
        criadoEm=iso(l["created_at"]) or "",
        inativadoEm=iso(l["inativado_em"]),
        pacienteNome=l.get("paciente_nome"),
    )


@router.get("/api/riscos", response_model=list[RiscoResumo])
def listar_riscos_da_clinica(
    tenantId: str,
    incluirInativos: bool = False,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "view")),
):
    """Alergias e riscos de todos os pacientes da clínica: graves primeiro."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    filtro = "" if incluirInativos else " AND r.ativo"
    linhas = db.buscar_todos(
        SELECT_RISCO
        + " WHERE p.clinica_id = %s" + filtro  # nosec B608 - filtro é constante deste módulo
        + """
        ORDER BY r.ativo DESC,
                 CASE r.gravidade WHEN 'grave' THEN 0 WHEN 'moderada' THEN 1 ELSE 2 END,
                 p.nome, r.created_at DESC
        """,
        (clinica["id"],),
    )
    return [montar(l) for l in linhas]


@router.get("/api/pacientes/{paciente_id}/riscos", response_model=list[RiscoResumo])
def listar_riscos(
    paciente_id: str,
    tenantId: str,
    incluirInativos: bool = False,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "view")),
):
    """Alergias e riscos do paciente: graves primeiro, depois os mais recentes."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    paciente_da_clinica(paciente_id, clinica["id"])
    filtro = "" if incluirInativos else " AND r.ativo"
    linhas = db.buscar_todos(
        SELECT_RISCO
        + " WHERE r.paciente_id = %s" + filtro  # nosec B608 - filtro é constante deste módulo
        + """
        ORDER BY r.ativo DESC,
                 CASE r.gravidade WHEN 'grave' THEN 0 WHEN 'moderada' THEN 1 ELSE 2 END,
                 r.created_at DESC
        """,
        (paciente_id,),
    )
    return [montar(l) for l in linhas]


@router.post("/api/riscos", response_model=RiscoResumo, status_code=201)
def criar_risco(
    payload: RiscoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "create")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    paciente = paciente_da_clinica(payload.pacienteId, clinica["id"])

    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO risco_paciente (paciente_id, tipo, descricao, gravidade, usuario_id)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
            """,
            (payload.pacienteId, payload.tipo, payload.descricao.strip(), payload.gravidade, usuario.id),
        )
        novo_id = cur.fetchone()["id"]
    logger.info("%s registrada para %s por %s (%s)", payload.tipo, paciente["nome"], usuario.nome, payload.gravidade)
    return montar(db.buscar_um(SELECT_RISCO + " WHERE r.id = %s", (novo_id,)))


@router.post("/api/riscos/{risco_id}/inativar", response_model=Ok)
def inativar_risco(
    risco_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "create")),
):
    """Marca o fim da validade. Idempotente: inativar duas vezes não é erro."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linha = db.buscar_um(SELECT_RISCO + " WHERE r.id = %s", (risco_id,))
    if not linha or str(linha["clinica_id"]) != str(clinica["id"]):
        raise HTTPException(404, "Registro não encontrado.")
    if not linha["ativo"]:
        return Ok()
    db.executar(
        "UPDATE risco_paciente SET ativo = false, inativado_em = now() WHERE id = %s AND ativo",
        (risco_id,),
    )
    logger.info("%s '%s' inativada por %s", linha["tipo"], linha["descricao"], usuario.nome)
    return Ok()
