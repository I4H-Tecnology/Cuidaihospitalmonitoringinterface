"""Cadastro de usuários do sistema (RF03, RN02)."""

import secrets

from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import CheckViolation, UniqueViolation

from .. import db
from ..comum import clinica_por_slug, iso, ler_politica, logger
from ..seguranca import (
    UsuarioAutenticado,
    exigir_permissao,
    exigir_tenant,
)
from ..schemas import (
    Ok,
    UsuarioPayload,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Usuários
# -----------------------------------------------------------------------------

def erro_de_gravacao(erro: Exception) -> HTTPException:
    """Traduz a recusa do banco numa mensagem que diz o que corrigir.

    Sem isto o INSERT/UPDATE estoura num 500 e a tela só mostra "não foi
    possível salvar", sem dizer se o problema é login repetido ou e-mail ruim.
    """
    constraint = getattr(getattr(erro, "diag", None), "constraint_name", None) or ""
    if isinstance(erro, UniqueViolation):
        if constraint == "usuario_login_por_clinica":
            return HTTPException(409, "Já existe um usuário com este login.")
        if constraint == "usuario_email_por_clinica":
            return HTTPException(409, "Já existe um usuário com este e-mail.")
        return HTTPException(409, "Já existe um usuário com estes dados.")
    if constraint == "usuario_email_check":
        return HTTPException(400, "E-mail inválido. Use o formato nome@dominio.com.")
    return HTTPException(400, "Dados do usuário inválidos.")


def usuario_para_frontend(linha: dict) -> dict:
    return {
        "id": str(linha["id"]),
        "tenantId": linha["slug"],
        "name": linha["nome"],
        "email": linha["email"],
        "login": linha["login"],
        "role": linha["perfil_nome"],
        "status": {"ativo": "active", "inativo": "inactive", "bloqueado": "blocked"}[linha["status"]],
        "platforms": ["web", "app"],
        "unit": "—",
        "createdAt": iso(linha["created_at"]),
        "lastAccess": iso(linha["ultimo_acesso"]),
        "passwordChangedAt": iso(linha["senha_alterada_em"]),
        "failedAttempts": linha["tentativas_falhas"],
        "lockedUntil": iso(linha["bloqueado_ate"]),
        # O hash real nunca sai do backend.
        "passwordHash": "",
    }


@router.get("/api/users")
def listar_usuarios(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("users", "view"))):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linhas = db.buscar_todos(
        """
        SELECT u.*, c.slug, p.nome AS perfil_nome
        FROM usuario u
        JOIN clinica c ON c.id = u.clinica_id
        JOIN perfil  p ON p.id = u.perfil_id
        WHERE u.clinica_id = %s
        ORDER BY u.nome
        """,
        (clinica["id"],),
    )
    return [usuario_para_frontend(l) for l in linhas]


@router.post("/api/users")
def criar_usuario(payload: UsuarioPayload,
                  usuario: UsuarioAutenticado = Depends(exigir_permissao("users", "create"))):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    u = payload.user
    perfil = db.buscar_um(
        "SELECT id FROM perfil WHERE upper(nome) = upper(%s) AND (clinica_id = %s OR clinica_id IS NULL) LIMIT 1",
        (u.get("role", "NURSE"), clinica["id"]),
    )
    if not perfil:
        raise HTTPException(400, "Perfil informado não existe.")

    senha = u.get("password") or secrets.token_urlsafe(12)
    try:
        novo = db.buscar_um(
            """
            INSERT INTO usuario (clinica_id, perfil_id, nome, email, login, senha_hash, status, senha_alterada_em)
            VALUES (%s, %s, %s, %s, lower(%s), crypt(%s, gen_salt('bf', 12)), 'ativo', now())
            RETURNING id
            """,
            (clinica["id"], perfil["id"], u.get("name"), u.get("email"), u.get("login"), senha),
        )
    except (UniqueViolation, CheckViolation) as erro:
        raise erro_de_gravacao(erro)
    return {"id": str(novo["id"]), "ok": True}


@router.put("/api/users/{user_id}")
def atualizar_usuario(user_id: str, payload: UsuarioPayload,
                      usuario: UsuarioAutenticado = Depends(exigir_permissao("users", "edit"))):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    u = payload.user
    try:
        db.executar(
            """
            UPDATE usuario SET nome = COALESCE(%s, nome), email = COALESCE(%s, email)
            WHERE id = %s AND clinica_id = %s
            """,
            (u.get("name"), u.get("email"), user_id, clinica["id"]),
        )
    except (UniqueViolation, CheckViolation) as erro:
        raise erro_de_gravacao(erro)
    if u.get("password"):
        db.executar(
            "UPDATE usuario SET senha_hash = crypt(%s, gen_salt('bf', 12)), senha_alterada_em = now() WHERE id = %s",
            (u["password"], user_id),
        )
    return {"id": user_id, "ok": True}


@router.delete("/api/users/{user_id}", response_model=Ok)
def remover_usuario(user_id: str, tenantId: str,
                    usuario: UsuarioAutenticado = Depends(exigir_permissao("users", "delete"))):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    removidos = db.executar(
        "DELETE FROM usuario WHERE id = %s AND clinica_id = %s", (user_id, clinica["id"])
    )
    if not removidos:
        raise HTTPException(404, "Usuário não encontrado.")
    return Ok()
