"""Evolução clínica: a nota do profissional no prontuário do paciente.

Fora das 12 entidades da RFC. Entrou em 13/09/2026 por decisão de produto:
o prontuário deixou de ser só visão de produto e passou a registrar o que a
equipe escreve. A RFC 2.6 ainda a lista como "fora do MVP", e isso fica para
errata na próxima revisão; o código não finge o contrário.

Evolução é registro, não rascunho: uma vez criada não tem edição nem
exclusão, nem pelo autor, nem por administrador. É o mesmo raciocínio de
`atendimento` e `log_acesso`: nota errada não se apaga, se complementa com
uma nota nova dizendo o que corrigir. Por isso não há PATCH nem DELETE aqui.

Permissão: o módulo do prontuário, `clinical_logs`. Quem escreve é quem tem
`create` nele (a enfermagem, pela matriz de perfis); administrador e gestor
leem.
"""

from fastapi import APIRouter, Depends

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..schemas import EvolucaoPayload, EvolucaoResumo
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant
from .acompanhantes import paciente_da_clinica

router = APIRouter()

SELECT_EVOLUCAO = """
    SELECT e.id, e.paciente_id, e.texto, e.data_hora, u.nome AS autor_nome,
           p.nome AS paciente_nome, p.clinica_id
      FROM evolucao e
      JOIN usuario u ON u.id = e.usuario_id
      JOIN paciente p ON p.id = e.paciente_id
"""


def montar(l: dict) -> EvolucaoResumo:
    return EvolucaoResumo(
        id=str(l["id"]),
        pacienteId=str(l["paciente_id"]),
        texto=l["texto"],
        autorNome=l["autor_nome"],
        dataHora=iso(l["data_hora"]) or "",
        pacienteNome=l.get("paciente_nome"),
    )


@router.get("/api/evolucoes", response_model=list[EvolucaoResumo])
def listar_evolucoes_da_clinica(
    tenantId: str,
    limite: int = 200,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "view")),
):
    """Todas as evoluções da clínica, de todos os pacientes, mais recentes primeiro.

    É a visão de quem passa o plantão. A visão por paciente é a rota abaixo.
    """
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linhas = db.buscar_todos(
        SELECT_EVOLUCAO + " WHERE p.clinica_id = %s ORDER BY e.data_hora DESC LIMIT %s",
        (clinica["id"], max(1, min(limite, 1000))),
    )
    return [montar(l) for l in linhas]


@router.get("/api/pacientes/{paciente_id}/evolucoes", response_model=list[EvolucaoResumo])
def listar_evolucoes(
    paciente_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "view")),
):
    """Todas as evoluções do paciente, mais recentes primeiro."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    paciente_da_clinica(paciente_id, clinica["id"])
    linhas = db.buscar_todos(
        SELECT_EVOLUCAO + " WHERE e.paciente_id = %s ORDER BY e.data_hora DESC",
        (paciente_id,),
    )
    return [montar(l) for l in linhas]


@router.post("/api/evolucoes", response_model=EvolucaoResumo, status_code=201)
def criar_evolucao(
    payload: EvolucaoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("clinical_logs", "create")),
):
    """Registra uma evolução. Sem PUT nem DELETE: uma vez criada, não muda."""
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    paciente = paciente_da_clinica(payload.pacienteId, clinica["id"])

    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO evolucao (paciente_id, usuario_id, texto) VALUES (%s, %s, %s) RETURNING id",
            (payload.pacienteId, usuario.id, payload.texto.strip()),
        )
        novo_id = cur.fetchone()["id"]
    logger.info("Evolução registrada para %s por %s", paciente["nome"], usuario.nome)
    return montar(db.buscar_um(SELECT_EVOLUCAO + " WHERE e.id = %s", (novo_id,)))
