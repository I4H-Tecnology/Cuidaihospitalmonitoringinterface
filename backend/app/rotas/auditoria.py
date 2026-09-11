"""Trilha de acesso para auditoria (RF29, RNF06)."""

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import agora_iso, clinica_por_slug, iso, logger
from ..seguranca import (
    UsuarioAutenticado,
    exigir_permissao,
    exigir_tenant,
    usuario_atual,
)
from ..schemas import (
    AccessLogPayload,
    Ok,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Trilha de auditoria
# -----------------------------------------------------------------------------

MAPA_RESULTADO = {"SUCESSO": "sucesso", "FALHA": "falha", "BLOQUEADO": "bloqueado"}


@router.get("/api/access-logs")
def listar_logs(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("settings", "view"))):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linhas = db.buscar_todos(
        """
        SELECT l.id, l.acao, l.resultado, l.ip, l.data_hora, u.nome AS usuario
        FROM log_acesso l
        LEFT JOIN usuario u ON u.id = l.usuario_id
        WHERE l.clinica_id = %s
        ORDER BY l.data_hora DESC
        LIMIT 200
        """,
        (clinica["id"],),
    )
    return [
        {
            "id": str(l["id"]),
            "action": l["acao"],
            "status": {"sucesso": "SUCESSO", "falha": "FALHA", "bloqueado": "BLOQUEADO"}[l["resultado"]],
            "ip_address": str(l["ip"]) if l["ip"] else None,
            "created_at": iso(l["data_hora"]),
            "user_name": l["usuario"],
        }
        for l in linhas
    ]


@router.post("/api/access-logs", response_model=Ok)
def registrar_log(payload: AccessLogPayload, usuario: UsuarioAutenticado = Depends(usuario_atual)):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    log = payload.log
    db.executar(
        """
        INSERT INTO log_acesso (clinica_id, usuario_id, acao, resultado, ip)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            clinica["id"],
            log.get("user_id"),
            log.get("action", "Ação"),
            MAPA_RESULTADO.get(log.get("status", "SUCESSO"), "sucesso"),
            log.get("ip_address"),
        ),
    )
    return Ok()
