"""Login, troca obrigatória de senha e recuperação (RNF01)."""

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import clinica_por_slug, iso, ler_politica, logger
from ..seguranca import (
    emitir_token,
)
import os
import secrets
import threading
from datetime import datetime, timedelta, timezone

from ..seguranca import emitir_token
from ..schemas import (
    AuthFlowResponse,
    ForceChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordReset,
    LoginRequest,
    LoginResponse,
    Ok,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Autenticação
# -----------------------------------------------------------------------------

@router.post("/api/auth/login", response_model=LoginResponse)
def login(dados: LoginRequest):
    clinica = clinica_por_slug(dados.tenant)

    usuario = db.buscar_um(
        """
        SELECT u.*, p.nome AS perfil_nome,
               (u.senha_hash = crypt(%s, u.senha_hash)) AS senha_confere
        FROM usuario u
        JOIN perfil p ON p.id = u.perfil_id
        WHERE u.clinica_id = %s AND lower(u.login) = lower(%s)
        """,
        (dados.password, clinica["id"], dados.username),
    )

    # Mesma mensagem para usuário inexistente e senha errada: dizer qual dos
    # dois falhou entrega a existência da conta a quem está tentando adivinhar.
    if not usuario:
        raise HTTPException(401, "Usuário ou senha inválidos.")

    politica = ler_politica(clinica["id"])

    if usuario["bloqueado_ate"] and usuario["bloqueado_ate"] > datetime.now(timezone.utc):
        raise HTTPException(423, "Usuário temporariamente bloqueado. Tente mais tarde.")

    if not usuario["senha_confere"]:
        registrar_tentativa_falha(usuario, politica)
        raise HTTPException(401, "Usuário ou senha inválidos.")

    if usuario["status"] != "ativo":
        raise HTTPException(403, "Usuário inativo ou bloqueado. Procure o administrador.")

    db.executar(
        """
        UPDATE usuario
        SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_acesso = now()
        WHERE id = %s
        """,
        (usuario["id"],),
    )

    token = emitir_token(str(usuario["id"]), clinica["slug"], usuario["perfil_nome"])

    return LoginResponse(
        token=token,
        id=str(usuario["id"]),
        tenantId=clinica["slug"],
        login=usuario["login"],
        name=usuario["nome"],
        role=usuario["perfil_nome"],
        platforms=["web", "app"],
        unit=None,
        sector=None,
        lastAccess=iso(usuario["ultimo_acesso"]),
        passwordChangedAt=iso(usuario["senha_alterada_em"]),
        isSystemUser=False,
        mustChangePassword=False,
    )


def registrar_tentativa_falha(usuario: dict, politica: dict) -> None:
    tentativas = (usuario["tentativas_falhas"] or 0) + 1
    maximo = int(politica.get("maxFailedAttempts", 5))
    minutos = int(politica.get("lockoutMinutes", 5))

    if tentativas >= maximo:
        db.executar(
            """
            UPDATE usuario
            SET tentativas_falhas = %s,
                bloqueado_ate = now() + (%s || ' minutes')::interval
            WHERE id = %s
            """,
            (tentativas, str(minutos), usuario["id"]),
        )
    else:
        db.executar(
            "UPDATE usuario SET tentativas_falhas = %s WHERE id = %s",
            (tentativas, usuario["id"]),
        )


@router.post("/api/auth/force-change-password", response_model=Ok)
def trocar_senha(dados: ForceChangePasswordRequest):
    clinica = clinica_por_slug(dados.tenant)
    usuario = db.buscar_um(
        """
        SELECT id, (senha_hash = crypt(%s, senha_hash)) AS senha_confere
        FROM usuario WHERE clinica_id = %s AND lower(login) = lower(%s)
        """,
        (dados.currentPassword, clinica["id"], dados.username),
    )
    if not usuario or not usuario["senha_confere"]:
        raise HTTPException(401, "Senha atual incorreta.")

    politica = ler_politica(clinica["id"])
    validar_forca_da_senha(dados.newPassword, politica)

    db.executar(
        """
        UPDATE usuario
        SET senha_hash = crypt(%s, gen_salt('bf', 12)),
            senha_alterada_em = now(),
            tentativas_falhas = 0,
            bloqueado_ate = NULL
        WHERE id = %s
        """,
        (dados.newPassword, usuario["id"]),
    )
    return Ok()


def validar_forca_da_senha(senha: str, politica: dict) -> None:
    if not politica.get("requireStrongPassword", True):
        return
    minimo = int(politica.get("minPasswordLength", 8))
    problemas = []
    if len(senha) < minimo:
        problemas.append(f"mínimo de {minimo} caracteres")
    if politica.get("requireUppercase", True) and not any(c.isupper() for c in senha):
        problemas.append("uma letra maiúscula")
    if politica.get("requireLowercase", True) and not any(c.islower() for c in senha):
        problemas.append("uma letra minúscula")
    if politica.get("requireNumber", True) and not any(c.isdigit() for c in senha):
        problemas.append("um número")
    if politica.get("requireSpecialChar", True) and senha.isalnum():
        problemas.append("um caractere especial")
    if senha.lower() in [b.lower() for b in politica.get("blockedPasswords", [])]:
        problemas.append("uma senha que não esteja na lista de bloqueadas")
    if problemas:
        raise HTTPException(400, "A senha precisa ter " + ", ".join(problemas) + ".")


# O código de recuperação vive em memória: reiniciar o container o descarta.
# É andaime — o backend real manda por e-mail e persiste.
#
# Três defesas, todas apontadas em review (PR #2):
#   1. o código só volta na resposta da API quando MEDSIGNAL_AMBIENTE=dev; o
#      padrão é "producao", então esquecer a variável fecha a porta, não abre;
#   2. expira em 10 minutos;
#   3. 5 erros invalidam o código, senão 1 milhão de combinações seriam
#      tentáveis à força bruta (o login já tinha bloqueio, este endpoint não).
AMBIENTE = os.getenv("MEDSIGNAL_AMBIENTE", "producao").strip().lower()
VALIDADE_CODIGO = timedelta(minutes=10)
MAX_TENTATIVAS_CODIGO = 5

_codigos_recuperacao: dict[str, dict] = {}
_trava_codigos = threading.Lock()


@router.post("/api/auth/forgot-password/request", response_model=AuthFlowResponse)
def pedir_recuperacao(dados: ForgotPasswordRequest):
    clinica = clinica_por_slug(dados.tenant)
    usuario = db.buscar_um(
        "SELECT id FROM usuario WHERE clinica_id = %s AND lower(email) = lower(%s)",
        (clinica["id"], dados.email),
    )
    # Resposta idêntica exista ou não a conta, para não revelar cadastros.
    if not usuario:
        return AuthFlowResponse(ok=True, message="Se o e-mail existir, enviaremos as instruções.")

    codigo = f"{secrets.randbelow(1000000):06d}"
    with _trava_codigos:
        _codigos_recuperacao[f"{clinica['slug']}:{dados.email.lower()}"] = {
            "codigo": codigo,
            "expira_em": datetime.now(timezone.utc) + VALIDADE_CODIGO,
            "tentativas": 0,
        }
    return AuthFlowResponse(
        ok=True,
        message="Se o e-mail existir, enviaremos as instruções.",
        # Só existe porque não há envio de e-mail neste andaime, e só em dev:
        # fora dele, devolver o código deixaria qualquer um tomar a conta de
        # quem tem e-mail conhecido, sem acesso à caixa de entrada.
        devResetCode=codigo if AMBIENTE == "dev" else None,
    )


@router.post("/api/auth/forgot-password/reset", response_model=Ok)
def concluir_recuperacao(dados: ForgotPasswordReset):
    clinica = clinica_por_slug(dados.tenant)
    chave = f"{clinica['slug']}:{dados.email.lower()}"
    with _trava_codigos:
        registro = _codigos_recuperacao.get(chave)
        if registro and registro["expira_em"] < datetime.now(timezone.utc):
            _codigos_recuperacao.pop(chave, None)
            registro = None
        if not registro:
            raise HTTPException(400, "Código inválido ou expirado.")
        if not secrets.compare_digest(registro["codigo"], dados.code):
            registro["tentativas"] += 1
            if registro["tentativas"] >= MAX_TENTATIVAS_CODIGO:
                _codigos_recuperacao.pop(chave, None)
                logger.warning("Código de recuperação de %s invalidado por excesso de tentativas", chave)
            # Mesma mensagem nos três casos: não diz se o código existe.
            raise HTTPException(400, "Código inválido ou expirado.")

    validar_forca_da_senha(dados.newPassword, ler_politica(clinica["id"]))
    alterados = db.executar(
        """
        UPDATE usuario
        SET senha_hash = crypt(%s, gen_salt('bf', 12)),
            senha_alterada_em = now(),
            tentativas_falhas = 0,
            bloqueado_ate = NULL
        WHERE clinica_id = %s AND lower(email) = lower(%s)
        """,
        (dados.newPassword, clinica["id"], dados.email),
    )
    if not alterados:
        raise HTTPException(404, "Usuário não encontrado.")
    with _trava_codigos:
        _codigos_recuperacao.pop(chave, None)
    return Ok()
