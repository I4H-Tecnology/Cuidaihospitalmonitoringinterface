"""Autenticação por token e autorização no servidor.

Esta é a correção da falha central do projeto: até aqui nenhuma rota exigia
credencial, e o controle de acesso existia só no frontend. Controle no cliente
não é controle — é sugestão. Quem chama a API direto ignora a interface
inteira, e a interface é a única coisa que estava barrando.

Duas garantias que passam a valer:

  1. Toda rota protegida exige um token válido, emitido no login.
  2. A permissão é conferida AQUI, contra o perfil gravado no banco, e não
     contra o que o cliente afirma ser.

O token carrega o tenant. Um token da clínica A não abre dado da clínica B,
mesmo que o id venha certo na URL — isolamento entre tenants é decidido no
servidor, nunca no parâmetro que o cliente mandou.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db

ALGORITMO = "HS256"
HORAS_DE_VALIDADE = int(os.environ.get("TOKEN_HORAS", "8"))

# Sem valor padrão de propósito. Chave de assinatura com padrão é chave
# publicada: qualquer um que leia o código forja um token válido.
SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY não definida. Gere uma com:\n"
        '  python -c "import secrets; print(secrets.token_urlsafe(48))"'
    )

esquema = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class UsuarioAutenticado:
    """Quem está chamando, segundo o token — e confirmado no banco."""

    id: str
    login: str
    nome: str
    papel: str
    clinica_id: str
    tenant: str


def emitir_token(usuario_id: str, tenant: str, papel: str) -> str:
    agora = datetime.now(timezone.utc)
    carga = {
        "sub": str(usuario_id),
        "tenant": tenant,
        "papel": papel,
        "iat": agora,
        "exp": agora + timedelta(hours=HORAS_DE_VALIDADE),
    }
    return jwt.encode(carga, SECRET_KEY, algorithm=ALGORITMO)


def _decodificar(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITMO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido.")


def usuario_atual(
    credencial: HTTPAuthorizationCredentials | None = Depends(esquema),
) -> UsuarioAutenticado:
    """Dependência que protege uma rota.

    Não confia só no que o token diz: relê o usuário no banco a cada chamada.
    Um token continua válido até expirar, então sem esta releitura uma conta
    desativada ou com perfil rebaixado seguiria com o acesso antigo até oito
    horas depois.
    """
    if credencial is None or not credencial.credentials:
        raise HTTPException(401, "Autenticação obrigatória.")

    carga = _decodificar(credencial.credentials)

    linha = db.buscar_um(
        """
        SELECT u.id, u.login, u.nome, u.status, u.clinica_id,
               c.slug, c.ativa, p.nome AS papel
        FROM usuario u
        JOIN clinica c ON c.id = u.clinica_id
        JOIN perfil  p ON p.id = u.perfil_id
        WHERE u.id = %s
        """,
        (carga.get("sub"),),
    )
    if not linha:
        raise HTTPException(401, "Usuário do token não existe mais.")
    if linha["status"] != "ativo":
        raise HTTPException(403, "Usuário inativo ou bloqueado.")
    if not linha["ativa"]:
        raise HTTPException(403, "Clínica inativa.")

    return UsuarioAutenticado(
        id=str(linha["id"]),
        login=linha["login"],
        nome=linha["nome"],
        papel=linha["papel"],
        clinica_id=str(linha["clinica_id"]),
        tenant=linha["slug"],
    )


def exigir_tenant(usuario: UsuarioAutenticado, tenant_pedido: str) -> None:
    """Impede que um token de uma clínica leia dado de outra.

    O frontend manda o tenant na query string. Aceitar esse valor sem conferir
    contra o token transformaria `?tenantId=outra-clinica` numa porta aberta.
    """
    if tenant_pedido != usuario.tenant:
        # 404, não 403: confirmar que a outra clínica existe já é informação.
        raise HTTPException(404, "Recurso não encontrado.")


def exigir_permissao(modulo: str, acao: str = "view"):
    """Fábrica de dependência que confere permissão no servidor.

    A permissão vem do perfil gravado no banco. O que o cliente acha que pode
    fazer é irrelevante aqui — e é justamente esse o ponto.
    """

    def verificador(usuario: UsuarioAutenticado = Depends(usuario_atual)) -> UsuarioAutenticado:
        linha = db.buscar_um(
            """
            SELECT permissoes FROM perfil
            WHERE upper(nome) = upper(%s) AND (clinica_id = %s OR clinica_id IS NULL)
            ORDER BY clinica_id NULLS LAST
            LIMIT 1
            """,
            (usuario.papel, usuario.clinica_id),
        )
        permissoes = (linha or {}).get("permissoes") or {}
        do_modulo = permissoes.get(modulo) or {}
        if not do_modulo.get(acao):
            raise HTTPException(
                403, f"Seu perfil não permite {acao} em {modulo}."
            )
        return usuario

    return verificador
