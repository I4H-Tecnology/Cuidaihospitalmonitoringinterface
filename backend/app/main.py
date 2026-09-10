"""MedSignal — backend mínimo de autenticação (andaime).

Existe para destravar o login do frontend enquanto o backend definitivo não
está disponível. Implementa exatamente os endpoints que `src/app/data/api.ts`
chama, contra o mesmo Postgres do docker-compose.

SEGURANÇA:
  - Emite JWT no login e exige token em toda rota protegida.
  - A permissão é conferida no SERVIDOR, contra o perfil gravado no banco.
  - O token carrega o tenant: token da clínica A não abre dado da clínica B,
    mesmo que a query string peça outra.
  - O que falta: refresh token, revogação (logout só descarta no cliente) e
    rate limit no login.

Substitua por inteiro quando o FastAPI real chegar.
"""

import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db
from .seguranca import (
    UsuarioAutenticado,
    emitir_token,
    exigir_permissao,
    exigir_tenant,
    usuario_atual,
)
from .schemas import (
    AccessLogPayload,
    ContextoCamera,
    AuthFlowResponse,
    ForceChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordReset,
    Insight,
    LoginRequest,
    LoginResponse,
    OcorrenciaCriada,
    OcorrenciaPayload,
    OcorrenciaResumo,
    Ok,
    OperationalOverviewResponse,
    PermissionRow,
    PermissionsPayload,
    SecurityPolicyPayload,
    SetorCritico,
    TenantInfo,
    UsuarioPayload,
)

# A política de segurança não está no DER da RFC (12 entidades, nenhuma delas
# guarda isso). Para não sujar db/init/, que espelha o diagrama, o andaime cria
# a própria tabela. O backend definitivo decide onde isso mora de verdade.
TABELA_POLITICA = """
CREATE TABLE IF NOT EXISTS stub_politica_seguranca (
  clinica_id uuid PRIMARY KEY REFERENCES clinica(id) ON DELETE CASCADE,
  politica   jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)
"""

# Mesma decisão da tabela acima: o DER da RFC tem 12 entidades e nenhuma guarda
# chave de idempotência. Em vez de sujar db/init/, que espelha o diagrama, o
# andaime cria a própria. Sem isto, um reenvio da fila do serviço de visão
# viraria um segundo alerta para o mesmo tombo.
TABELA_EVENTOS = """
CREATE TABLE IF NOT EXISTS stub_evento_publicado (
  chave         text PRIMARY KEY,
  ocorrencia_id uuid NOT NULL REFERENCES ocorrencia(id) ON DELETE CASCADE,
  criado_em     timestamptz NOT NULL DEFAULT now()
)
"""

POLITICA_PADRAO = {
    "requireStrongPassword": True,
    "minPasswordLength": 8,
    "passwordExpiryDays": 0,
    "maxFailedAttempts": 5,
    "lockoutMinutes": 5,
    "requireLowercase": True,
    "requireUppercase": True,
    "requireNumber": True,
    "requireSpecialChar": True,
    "disallowPersonalData": True,
    "blockedPasswords": ["123456", "password", "admin", "qwerty"],
    "forcePasswordChangeOnFirstAccess": False,
    "adminResetPasswordTtlHours": 24,
    "idleTimeoutMinutes": 30,
    "twoFactorEnabled": False,
}

MODULOS = [
    "dashboard", "monitoring", "alerts", "clinical_logs", "patients",
    "beds", "appointments", "reports", "settings", "users",
    "hospital_management", "financial", "inventory", "hr",
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.abrir_pool()
    db.executar(TABELA_POLITICA)
    db.executar(TABELA_EVENTOS)
    yield
    db.fechar_pool()


app = FastAPI(title="MedSignal — backend mínimo", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:8080"
    ).split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def erro_no_formato_do_frontend(_: Request, exc: HTTPException):
    """O frontend lê `payload.error`; o FastAPI devolveria `detail`.

    Sem esta tradução toda mensagem viraria o genérico "Erro inesperado."
    na tela de login.
    """
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


def agora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def iso(valor) -> str | None:
    return valor.isoformat() if valor else None


def clinica_por_slug(slug: str) -> dict:
    linha = db.buscar_um("SELECT id, slug, ativa FROM clinica WHERE slug = %s", (slug,))
    if not linha:
        raise HTTPException(404, "Clínica não encontrada.")
    if not linha["ativa"]:
        raise HTTPException(403, "Clínica inativa.")
    return linha


# -----------------------------------------------------------------------------
# Saúde e tenants
# -----------------------------------------------------------------------------

@app.get("/health")
def health():
    db.buscar_um("SELECT 1 AS ok")
    return {"status": "ok", "banco": "conectado", "aviso": "andaime, nao usar em producao"}


@app.get("/api/tenants", response_model=list[TenantInfo])
def listar_tenants():
    linhas = db.buscar_todos("SELECT slug, ativa FROM clinica ORDER BY nome")
    return [TenantInfo(id=l["slug"], active=l["ativa"]) for l in linhas]


# -----------------------------------------------------------------------------
# Autenticação
# -----------------------------------------------------------------------------

@app.post("/api/auth/login", response_model=LoginResponse)
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


@app.post("/api/auth/force-change-password", response_model=Ok)
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
# É andaime — o backend real manda por e-mail e persiste com expiração.
_codigos_recuperacao: dict[str, str] = {}


@app.post("/api/auth/forgot-password/request", response_model=AuthFlowResponse)
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
    _codigos_recuperacao[f"{clinica['slug']}:{dados.email.lower()}"] = codigo
    return AuthFlowResponse(
        ok=True,
        message="Se o e-mail existir, enviaremos as instruções.",
        # Só existe porque não há envio de e-mail neste andaime.
        devResetCode=codigo,
    )


@app.post("/api/auth/forgot-password/reset", response_model=Ok)
def concluir_recuperacao(dados: ForgotPasswordReset):
    clinica = clinica_por_slug(dados.tenant)
    chave = f"{clinica['slug']}:{dados.email.lower()}"
    if _codigos_recuperacao.get(chave) != dados.code:
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
    _codigos_recuperacao.pop(chave, None)
    return Ok()


# -----------------------------------------------------------------------------
# Permissões
# -----------------------------------------------------------------------------

@app.get("/api/permissions/{tenant_id}/{role}", response_model=list[PermissionRow])
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


@app.put("/api/permissions/{tenant_id}/{role}", response_model=Ok)
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
# Usuários
# -----------------------------------------------------------------------------

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


@app.get("/api/users")
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


@app.post("/api/users")
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
    novo = db.buscar_um(
        """
        INSERT INTO usuario (clinica_id, perfil_id, nome, email, login, senha_hash, status, senha_alterada_em)
        VALUES (%s, %s, %s, %s, lower(%s), crypt(%s, gen_salt('bf', 12)), 'ativo', now())
        RETURNING id
        """,
        (clinica["id"], perfil["id"], u.get("name"), u.get("email"), u.get("login"), senha),
    )
    return {"id": str(novo["id"]), "ok": True}


@app.put("/api/users/{user_id}")
def atualizar_usuario(user_id: str, payload: UsuarioPayload,
                      usuario: UsuarioAutenticado = Depends(exigir_permissao("users", "edit"))):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    u = payload.user
    db.executar(
        """
        UPDATE usuario SET nome = COALESCE(%s, nome), email = COALESCE(%s, email)
        WHERE id = %s AND clinica_id = %s
        """,
        (u.get("name"), u.get("email"), user_id, clinica["id"]),
    )
    if u.get("password"):
        db.executar(
            "UPDATE usuario SET senha_hash = crypt(%s, gen_salt('bf', 12)), senha_alterada_em = now() WHERE id = %s",
            (u["password"], user_id),
        )
    return {"id": user_id, "ok": True}


@app.delete("/api/users/{user_id}", response_model=Ok)
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


# -----------------------------------------------------------------------------
# Política de segurança
# -----------------------------------------------------------------------------

def ler_politica(clinica_id) -> dict:
    linha = db.buscar_um(
        "SELECT politica FROM stub_politica_seguranca WHERE clinica_id = %s", (clinica_id,)
    )
    return linha["politica"] if linha else dict(POLITICA_PADRAO)


@app.get("/api/security-policy")
def obter_politica(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("settings", "view"))):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    return ler_politica(clinica["id"])


@app.put("/api/security-policy", response_model=Ok)
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


# -----------------------------------------------------------------------------
# Trilha de auditoria
# -----------------------------------------------------------------------------

MAPA_RESULTADO = {"SUCESSO": "sucesso", "FALHA": "falha", "BLOQUEADO": "bloqueado"}


@app.get("/api/access-logs")
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


@app.post("/api/access-logs", response_model=Ok)
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


# -----------------------------------------------------------------------------
# Visão operacional
# -----------------------------------------------------------------------------

@app.get("/api/operational-overview", response_model=OperationalOverviewResponse)
def visao_operacional(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("dashboard", "view"))):
    exigir_tenant(usuario, tenantId)
    """Todos os números saem de consulta ao banco.

    Nada aqui é gerado aleatoriamente — se não houver dado, o número é zero.
    Um painel que inventa valor não é painel, é enfeite.
    """
    clinica = clinica_por_slug(tenantId)
    cid = clinica["id"]

    numeros = db.buscar_um(
        """
        SELECT
          (SELECT count(*) FROM alerta a
             JOIN ocorrencia o ON o.id = a.ocorrencia_id
            WHERE o.clinica_id = %(cid)s AND a.nivel = 'critico' AND a.status <> 'ciente') AS alertas_criticos,
          (SELECT count(*) FROM ocorrencia
            WHERE clinica_id = %(cid)s AND status IN ('pendente', 'em_atendimento')) AS casos_abertos,
          (SELECT count(*) FROM ocorrencia
            WHERE clinica_id = %(cid)s AND data_hora > now() - interval '24 hours') AS incidentes_24h,
          (SELECT count(*) FROM paciente WHERE clinica_id = %(cid)s AND status = 'internado') AS internados,
          (SELECT count(*) FROM ambiente WHERE clinica_id = %(cid)s) AS ambientes,
          (SELECT COALESCE(avg(EXTRACT(EPOCH FROM (at.finalizado_em - at.iniciado_em)) / 60), 0)
             FROM atendimento at
             JOIN ocorrencia o ON o.id = at.ocorrencia_id
            WHERE o.clinica_id = %(cid)s AND at.finalizado_em IS NOT NULL) AS media_resposta
        """,
        {"cid": cid},
    )

    ambientes = numeros["ambientes"] or 0
    ocupacao = round((numeros["internados"] / ambientes) * 100, 1) if ambientes else 0.0

    if numeros["alertas_criticos"] > 0:
        status = "critical"
    elif numeros["casos_abertos"] > 0 or ocupacao >= 85:
        status = "attention"
    else:
        status = "operational"

    setores = db.buscar_todos(
        """
        SELECT a.id, a.nome,
               count(DISTINCT p.id) FILTER (WHERE p.status = 'internado') AS internados,
               count(DISTINCT o.id) FILTER (WHERE o.status IN ('pendente', 'em_atendimento')) AS abertos
        FROM ambiente a
        LEFT JOIN paciente p ON p.ambiente_id = a.id
        LEFT JOIN ocorrencia o ON o.ambiente_id = a.id
        WHERE a.clinica_id = %s
        GROUP BY a.id, a.nome
        ORDER BY abertos DESC, a.nome
        """,
        (cid,),
    )

    insights: list[Insight] = []
    if numeros["alertas_criticos"]:
        insights.append(Insight(
            id="alertas-criticos",
            title=f"{numeros['alertas_criticos']} alerta(s) crítico(s) sem ciência",
            description="Há alerta crítico aguardando confirmação de atendimento (RN12).",
            priority="high",
        ))
    if numeros["incidentes_24h"]:
        insights.append(Insight(
            id="incidentes-24h",
            title=f"{numeros['incidentes_24h']} ocorrência(s) nas últimas 24h",
            description="Volume registrado no período pelo serviço de detecção.",
            priority="medium",
        ))
    if not insights:
        insights.append(Insight(
            id="sem-eventos",
            title="Nenhuma ocorrência registrada",
            description="Sem eventos no banco. Os números aparecem conforme a operação gera dados.",
            priority="low",
        ))

    return OperationalOverviewResponse(
        status=status,
        criticalAlerts=numeros["alertas_criticos"],
        criticalCases=numeros["casos_abertos"],
        occupancyRate=ocupacao,
        avgResponseMinutes=round(float(numeros["media_resposta"]), 1),
        incidentsLast24h=numeros["incidentes_24h"],
        updatedAt=agora_iso(),
        criticalSectors=[
            SetorCritico(
                id=str(s["id"]),
                name=s["nome"],
                occupancyRate=float(s["internados"] or 0),
                activeAlerts=s["abertos"] or 0,
                status="critical" if s["abertos"] else "operational",
            )
            for s in setores
        ],
        insights=insights,
    )


# -----------------------------------------------------------------------------
# Monitoramento — ingestão do serviço de visão e leitura do painel
#
# É aqui que a detecção deixa de ser um log e vira registro. Até esta fase o
# pipeline via a queda, decidia que era queda, e não contava para ninguém.
#
# Quem escreve é o usuário de serviço (perfil SYSTEM, permissão monitoring:
# create). Ele passa pelas MESMAS dependências de um humano — mesmo token,
# mesma releitura no banco, mesmo isolamento por tenant. Um segundo mecanismo
# de autenticação só para máquina seria mais código e mais superfície de ataque
# para resolver um problema que o primeiro já resolve.
# -----------------------------------------------------------------------------

@app.get("/api/cameras/{camera_id}/contexto", response_model=ContextoCamera)
def contexto_da_camera(
    camera_id: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view")),
):
    """Onde a câmera está e quem ela observa.

    O serviço de visão chama uma vez no boot. A ocorrência exige ambiente_id, e
    quem sabe disso é o cadastro — deixar o vínculo no `.env` duplicaria o
    cadastro e desalinharia no primeiro remanejamento de leito.
    """
    linha = db.buscar_um(
        """
        SELECT cam.id, cam.identificador, cam.status,
               amb.id AS ambiente_id, amb.nome AS ambiente_nome,
               cli.slug AS tenant, cli.id AS clinica_id,
               pac.id AS paciente_id, pac.nome AS paciente_nome
        FROM camera cam
        JOIN ambiente amb ON amb.id = cam.ambiente_id
        JOIN clinica  cli ON cli.id = amb.clinica_id
        LEFT JOIN paciente pac
               ON pac.ambiente_id = amb.id AND pac.status = 'internado'
        WHERE cam.id = %s
        ORDER BY pac.data_admissao DESC
        LIMIT 1
        """,
        (camera_id,),
    )
    if not linha:
        raise HTTPException(404, "Câmera não encontrada.")
    # A câmera pertence a uma clínica através do ambiente. Sem esta conferência,
    # um token de uma clínica leria o cadastro da outra pelo id da câmera.
    exigir_tenant(usuario, linha["tenant"])

    return ContextoCamera(
        cameraId=str(linha["id"]),
        identificador=linha["identificador"],
        status=linha["status"],
        tenantId=linha["tenant"],
        ambienteId=str(linha["ambiente_id"]),
        ambienteNome=linha["ambiente_nome"],
        pacienteId=str(linha["paciente_id"]) if linha["paciente_id"] else None,
        pacienteNome=linha["paciente_nome"],
    )


@app.post("/api/cameras/{camera_id}/ping", response_model=Ok)
def ping_da_camera(
    camera_id: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "create")),
):
    """Sinal de vida da câmera (RF30, RN15).

    Marca online e carimba o horário. Quem decide que ela caiu é a ausência de
    ping, não uma chamada — câmera que morre não avisa. Essa parte é da Fase 4.
    """
    linha = db.buscar_um(
        """
        SELECT cam.id, cli.slug AS tenant
        FROM camera cam
        JOIN ambiente amb ON amb.id = cam.ambiente_id
        JOIN clinica  cli ON cli.id = amb.clinica_id
        WHERE cam.id = %s
        """,
        (camera_id,),
    )
    if not linha:
        raise HTTPException(404, "Câmera não encontrada.")
    exigir_tenant(usuario, linha["tenant"])

    db.executar(
        "UPDATE camera SET status = 'online', ultimo_ping = now() WHERE id = %s",
        (camera_id,),
    )
    return Ok()


@app.post("/api/ocorrencias", response_model=OcorrenciaCriada, status_code=201)
def registrar_ocorrencia(
    payload: OcorrenciaPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "create")),
):
    """Registra a ocorrência detectada e abre o alerta correspondente (RF13, RF14).

    Ocorrência e alerta nascem na MESMA transação. Meio caminho aqui seria o
    pior estado possível: um evento gravado que nunca notifica ninguém — o
    sistema acharia que avisou, e a equipe nunca teria sido avisada.
    """
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)

    camera = db.buscar_um(
        """
        SELECT cam.id, amb.id AS ambiente_id, amb.clinica_id,
               (SELECT p.id FROM paciente p
                 WHERE p.ambiente_id = amb.id AND p.status = 'internado'
                 ORDER BY p.data_admissao DESC LIMIT 1) AS paciente_id
        FROM camera cam
        JOIN ambiente amb ON amb.id = cam.ambiente_id
        WHERE cam.id = %s
        """,
        (payload.cameraId,),
    )
    # Mesma resposta para "não existe" e "é de outra clínica": distinguir as duas
    # já contaria que a câmera existe em algum lugar.
    if not camera or str(camera["clinica_id"]) != str(clinica["id"]):
        raise HTTPException(404, "Câmera não encontrada.")

    with db.cursor() as cur:
        # A chave é PK: se o evento já entrou, devolvemos o id antigo e nada é
        # criado. É o que torna o reenvio da fila seguro.
        cur.execute(
            "SELECT ocorrencia_id FROM stub_evento_publicado WHERE chave = %s",
            (payload.chaveEvento,),
        )
        ja_existe = cur.fetchone()
        if ja_existe:
            cur.execute(
                "SELECT id FROM alerta WHERE ocorrencia_id = %s",
                (ja_existe["ocorrencia_id"],),
            )
            alerta = cur.fetchone()
            return OcorrenciaCriada(
                id=str(ja_existe["ocorrencia_id"]),
                alertaId=str(alerta["id"]) if alerta else "",
                duplicada=True,
            )

        cur.execute(
            """
            INSERT INTO ocorrencia
              (clinica_id, paciente_id, ambiente_id, camera_id,
               tipo_evento, status, confianca, data_hora, observacao)
            VALUES (%s, %s, %s, %s, %s, 'pendente', %s, %s, %s)
            RETURNING id
            """,
            (
                clinica["id"],
                camera["paciente_id"],
                camera["ambiente_id"],
                camera["id"],
                payload.tipoEvento,
                payload.confianca,
                payload.dataHora,
                payload.motivo,
            ),
        )
        ocorrencia_id = cur.fetchone()["id"]

        # Toda queda entra como crítica: a RFC prioriza recall justamente porque
        # o custo de subestimar é o paciente no chão sem atendimento.
        cur.execute(
            """
            INSERT INTO alerta (ocorrencia_id, nivel, status)
            VALUES (%s, 'critico', 'enviado')
            RETURNING id
            """,
            (ocorrencia_id,),
        )
        alerta_id = cur.fetchone()["id"]

        cur.execute(
            "INSERT INTO stub_evento_publicado (chave, ocorrencia_id) VALUES (%s, %s)",
            (payload.chaveEvento, ocorrencia_id),
        )

    return OcorrenciaCriada(id=str(ocorrencia_id), alertaId=str(alerta_id))


# Colunas filtráveis do RF22. O mapa existe para que o nome vindo da query
# string nunca chegue ao SQL: só a coluna correspondente entra, e o valor vai
# sempre por parâmetro.
FILTROS_OCORRENCIA = {
    "pacienteId": "o.paciente_id",
    "ambienteId": "o.ambiente_id",
    "status": "o.status",
    "tipoEvento": "o.tipo_evento",
}


@app.get("/api/ocorrencias", response_model=list[OcorrenciaResumo])
def listar_ocorrencias(
    tenantId: str,
    pacienteId: str | None = None,
    ambienteId: str | None = None,
    status: str | None = None,
    tipoEvento: str | None = None,
    desde: datetime | None = None,
    ate: datetime | None = None,
    limite: int = 100,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view")),
):
    """Histórico com os filtros do RF22: paciente, ambiente, data, status e tipo."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)

    condicoes = ["o.clinica_id = %(cid)s"]
    params: dict = {"cid": clinica["id"], "limite": max(1, min(limite, 500))}

    recebidos = {
        "pacienteId": pacienteId,
        "ambienteId": ambienteId,
        "status": status,
        "tipoEvento": tipoEvento,
    }
    for nome, valor in recebidos.items():
        if valor:
            condicoes.append(f"{FILTROS_OCORRENCIA[nome]} = %({nome})s")
            params[nome] = valor
    if desde:
        condicoes.append("o.data_hora >= %(desde)s")
        params["desde"] = desde
    if ate:
        condicoes.append("o.data_hora <= %(ate)s")
        params["ate"] = ate

    linhas = db.buscar_todos(
        f"""
        SELECT o.id, o.tipo_evento, o.status, o.confianca, o.data_hora,
               o.encerrada_em, o.observacao,
               amb.id AS ambiente_id, amb.nome AS ambiente_nome,
               pac.id AS paciente_id, pac.nome AS paciente_nome,
               cam.id AS camera_id, cam.identificador AS camera_identificador,
               a.nivel AS alerta_nivel, a.status AS alerta_status
        FROM ocorrencia o
        JOIN ambiente amb ON amb.id = o.ambiente_id
        LEFT JOIN paciente pac ON pac.id = o.paciente_id
        LEFT JOIN camera   cam ON cam.id = o.camera_id
        LEFT JOIN alerta   a   ON a.ocorrencia_id = o.id
        WHERE {' AND '.join(condicoes)}
        ORDER BY o.data_hora DESC
        LIMIT %(limite)s
        """,
        params,
    )

    return [
        OcorrenciaResumo(
            id=str(l["id"]),
            tipoEvento=l["tipo_evento"],
            status=l["status"],
            confianca=float(l["confianca"]) if l["confianca"] is not None else None,
            dataHora=iso(l["data_hora"]),
            encerradaEm=iso(l["encerrada_em"]),
            observacao=l["observacao"],
            ambienteId=str(l["ambiente_id"]),
            ambienteNome=l["ambiente_nome"],
            pacienteId=str(l["paciente_id"]) if l["paciente_id"] else None,
            pacienteNome=l["paciente_nome"],
            cameraId=str(l["camera_id"]) if l["camera_id"] else None,
            cameraIdentificador=l["camera_identificador"],
            alertaNivel=l["alerta_nivel"],
            alertaStatus=l["alerta_status"],
        )
        for l in linhas
    ]


