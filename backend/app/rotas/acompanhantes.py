"""Acompanhantes: acesso temporário de um familiar à câmera do paciente (RF25-RF28, RN03-RN07).

A entidade já existia no DER e a revogação automática na alta já rodava
(`pacientes.py`). Faltava a outra metade: criar, listar e revogar à mão.

O token do QR Code segue a regra da senha: guardado como hash bcrypt pelo
`pgcrypto`, e devolvido em claro uma única vez, na resposta da criação. Não
há rota que o mostre de novo — se o familiar perder, o profissional revoga e
cria outro. É o mesmo tratamento que qualquer segredo de curta duração recebe.

O app do acompanhante (o lado público, que troca o token pelo vídeo, RN06)
mora em `familia.py` desde 25/10/2026; o que está aqui é o lado da clínica.
"""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..schemas import AcompanhanteCriado, AcompanhantePayload, AcompanhanteResumo, Ok
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant

router = APIRouter()

SELECT_ACOMPANHANTE = """
    SELECT a.id, a.paciente_id, a.nome, a.documento, a.ativo, a.expira_em, a.revogado_em,
           a.created_at, p.clinica_id, p.nome AS paciente_nome
      FROM acompanhante a
      JOIN paciente p ON p.id = a.paciente_id
"""


def montar(l: dict) -> AcompanhanteResumo:
    return AcompanhanteResumo(
        id=str(l["id"]),
        pacienteId=str(l["paciente_id"]),
        nome=l["nome"],
        documento=l["documento"],
        ativo=bool(l["ativo"]),
        expiraEm=iso(l["expira_em"]) or "",
        revogadoEm=iso(l["revogado_em"]),
        criadoEm=iso(l["created_at"]) or "",
    )


def paciente_da_clinica(paciente_id: str, clinica_id) -> dict:
    """Mesma resposta para inexistente e de outra clínica (não confirma que existe)."""
    linha = db.buscar_um(
        "SELECT id, nome, status, clinica_id FROM paciente WHERE id = %s",
        (paciente_id,),
    )
    if not linha or str(linha["clinica_id"]) != str(clinica_id):
        raise HTTPException(404, "Paciente não encontrado.")
    return linha


@router.get("/api/pacientes/{paciente_id}/acompanhantes", response_model=list[AcompanhanteResumo])
def listar_acompanhantes(
    paciente_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("companions", "view")),
):
    """Todos os acompanhantes do paciente, ativos ou não, mais recentes primeiro.

    Os revogados e expirados ficam na lista de propósito: quem já teve acesso
    à câmera de um paciente é informação de auditoria, não lixo.
    """
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    paciente_da_clinica(paciente_id, clinica["id"])

    linhas = db.buscar_todos(
        SELECT_ACOMPANHANTE + " WHERE a.paciente_id = %s ORDER BY a.created_at DESC",
        (paciente_id,),
    )
    return [montar(l) for l in linhas]


@router.post("/api/acompanhantes", response_model=AcompanhanteCriado, status_code=201)
def criar_acompanhante(
    payload: AcompanhantePayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("companions", "edit")),
):
    """Vincula um acompanhante ao paciente e gera o token do QR Code (RF25, RF26, RN05).

    O token só existe em claro nesta resposta. No banco fica o hash.
    """
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    paciente = paciente_da_clinica(payload.pacienteId, clinica["id"])

    # RN07: quem já recebeu alta não tem câmera para mostrar. Criar acesso aqui
    # seria criar um acesso que a própria regra mandaria revogar.
    if paciente["status"] != "internado":
        raise HTTPException(409, f"O paciente consta como '{paciente['status']}'; só internados recebem acompanhante.")

    token = secrets.token_urlsafe(32)
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO acompanhante (paciente_id, nome, documento, token_qrcode, ativo, expira_em)
            VALUES (%s, %s, %s, crypt(%s, gen_salt('bf', 12)), true, now() + make_interval(hours => %s))
            RETURNING id
            """,
            (
                payload.pacienteId,
                payload.nome.strip(),
                payload.documento.strip(),
                token,
                payload.validadeHoras,
            ),
        )
        novo_id = cur.fetchone()["id"]
        cur.execute(
            """
            INSERT INTO log_acesso (clinica_id, usuario_id, acao, resultado, ip)
            VALUES (%s, %s, %s, 'sucesso', NULL)
            """,
            (clinica["id"], usuario.id, f"Acesso de acompanhante criado para paciente {paciente['nome']} ({payload.validadeHoras}h)"),
        )

    linha = db.buscar_um(SELECT_ACOMPANHANTE + " WHERE a.id = %s", (novo_id,))
    logger.info(
        "Acompanhante %s criado para %s por %s, válido por %dh",
        linha["nome"], paciente["nome"], usuario.nome, payload.validadeHoras,
    )
    # O QR leva o id junto: o portal da família acha a linha pelo id e confere
    # um hash só, em vez de testar o token contra todos os acessos ativos.
    return AcompanhanteCriado(**montar(linha).model_dump(), tokenQrcode=f"{novo_id}.{token}")


@router.post("/api/acompanhantes/{acompanhante_id}/revogar", response_model=Ok)
def revogar_acompanhante(
    acompanhante_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("companions", "edit")),
):
    """Cancela o acesso antes do prazo (RN07). Idempotente: revogar duas vezes não é erro."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)

    linha = db.buscar_um(SELECT_ACOMPANHANTE + " WHERE a.id = %s", (acompanhante_id,))
    if not linha or str(linha["clinica_id"]) != str(clinica["id"]):
        raise HTTPException(404, "Acompanhante não encontrado.")
    if not linha["ativo"]:
        return Ok()

    with db.cursor() as cur:
        cur.execute(
            "UPDATE acompanhante SET ativo = false, revogado_em = now() WHERE id = %s AND ativo",
            (acompanhante_id,),
        )
        cur.execute(
            """
            INSERT INTO log_acesso (clinica_id, usuario_id, acao, resultado, ip)
            VALUES (%s, %s, %s, 'sucesso', NULL)
            """,
            (clinica["id"], usuario.id, f"Acesso de acompanhante revogado: {linha['nome']} (paciente {linha['paciente_nome']})"),
        )
    logger.info("Acompanhante %s revogado por %s", linha["nome"], usuario.nome)
    return Ok()


def expirado(expira_em: datetime) -> bool:
    return expira_em <= datetime.now(timezone.utc)
