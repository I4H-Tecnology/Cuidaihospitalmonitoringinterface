"""Permissões por perfil (RBAC) e política de segurança da clínica."""

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import MODULOS, POLITICA_PADRAO, clinica_por_slug, ler_politica, logger
from ..seguranca import (
    UsuarioAutenticado,
    exigir_permissao,
    exigir_tenant,
    usuario_atual,
)
from ..schemas import (
    Ok,
    PermissionRow,
    PermissionsPayload,
    SecurityPolicyPayload,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Permissões
# -----------------------------------------------------------------------------

@router.get("/api/permissions/{tenant_id}/{role}", response_model=list[PermissionRow])
def obter_permissoes(tenant_id: str, role: str, usuario: UsuarioAutenticado = Depends(usuario_atual)):
    exigir_tenant(usuario, tenant_id)
    clinica = clinica_por_slug(tenant_id)
    perfil = db.buscar_um(
        """
        SELECT permissoes FROM perfil
        WHERE upper(nome) = upper(%s) AND (clinica_id = %s OR clinica_id IS NULL)
        ORDER BY clinica_id NULLS LAST
        LIMIT 1
        """,
        (role, clinica["id"]),
    )
    if not perfil:
        # Papel desconhecido não derruba a tela: devolve tudo negado.
        return [PermissionRow(module=m) for m in MODULOS]

    permissoes = perfil["permissoes"] or {}
    return [
        PermissionRow(
            module=modulo,
            view=bool(dados.get("view")),
            create=bool(dados.get("create")),
            edit=bool(dados.get("edit")),
            delete=bool(dados.get("delete")),
            web=bool(dados.get("web")),
            app=bool(dados.get("app")),
        )
        for modulo, dados in permissoes.items()
    ]


@router.put("/api/permissions/{tenant_id}/{role}", response_model=Ok)
def salvar_permissoes(tenant_id: str, role: str, payload: PermissionsPayload,
                      usuario: UsuarioAutenticado = Depends(exigir_permissao("settings", "edit"))):
    exigir_tenant(usuario, tenant_id)
    clinica = clinica_por_slug(tenant_id)
    mapa = {
        p.module: {
            "view": p.view, "create": p.create, "edit": p.edit,
            "delete": p.delete, "web": p.web, "app": p.app,
        }
        for p in payload.permissions
    }
    import json

    atualizados = db.executar(
        """
        UPDATE perfil SET permissoes = %s::jsonb
        WHERE upper(nome) = upper(%s) AND (clinica_id = %s OR clinica_id IS NULL)
        """,
        (json.dumps(mapa), role, clinica["id"]),
    )
    if not atualizados:
        raise HTTPException(404, "Perfil não encontrado.")
    return Ok()


# -----------------------------------------------------------------------------
# Política de segurança
# -----------------------------------------------------------------------------

@router.get("/api/security-policy")
def obter_politica(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("settings", "view"))):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    return ler_politica(clinica["id"])


@router.put("/api/security-policy", response_model=Ok)
def salvar_politica(payload: SecurityPolicyPayload,
                    usuario: UsuarioAutenticado = Depends(exigir_permissao("settings", "edit"))):
    exigir_tenant(usuario, payload.tenantId)
    import json

    clinica = clinica_por_slug(payload.tenantId)
    db.executar(
        """
        INSERT INTO stub_politica_seguranca (clinica_id, politica)
        VALUES (%s, %s::jsonb)
        ON CONFLICT (clinica_id) DO UPDATE SET politica = EXCLUDED.politica, updated_at = now()
        """,
        (clinica["id"], json.dumps(payload.policy)),
    )
    return Ok()
