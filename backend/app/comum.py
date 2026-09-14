"""Peças que mais de um domínio de rota usa.

Ficavam no topo do main.py, que por isso precisava ser importado por todas as
rotas — e importar o módulo que monta a aplicação a partir de uma rota é o
caminho mais curto para um import circular.
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException

from . import db

logger = logging.getLogger(__name__)


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

# Um módulo por tela que existe. Os cinco de gestão hospitalar ampla
# (agenda, gestão, financeiro, estoque, RH) saíram junto com as telas em
# 13/09/2026; `companions` entrou com a aba de acompanhantes do prontuário.
MODULOS = [
    "dashboard", "monitoring", "alerts", "clinical_logs", "patients",
    "beds", "reports", "settings", "users", "companions",
]


def agora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def iso(valor) -> str | None:
    return valor.isoformat() if valor else None


def mascarar_credencial(url: str) -> str:
    """Esconde usuário e senha embutidos na URL da câmera.

    RTSP quase sempre vem como rtsp://usuario:senha@host/stream. Quem abre o
    painel precisa saber para onde a câmera aponta, não com que credencial —
    e listar isso na tela colocaria a senha no HTML de todo mundo.
    """
    if "@" not in url or "//" not in url:
        return url
    esquema, _, resto = url.partition("//")
    credencial, _, host = resto.rpartition("@")
    if not credencial:
        return url
    usuario = credencial.split(":", 1)[0]
    return f"{esquema}//{usuario}:***@{host}"


def clinica_por_slug(slug: str) -> dict:
    linha = db.buscar_um("SELECT id, slug, ativa FROM clinica WHERE slug = %s", (slug,))
    if not linha:
        raise HTTPException(404, "Clínica não encontrada.")
    if not linha["ativa"]:
        raise HTTPException(403, "Clínica inativa.")
    return linha


def ler_politica(clinica_id) -> dict:
    linha = db.buscar_um(
        "SELECT politica FROM stub_politica_seguranca WHERE clinica_id = %s", (clinica_id,)
    )
    return linha["politica"] if linha else dict(POLITICA_PADRAO)
