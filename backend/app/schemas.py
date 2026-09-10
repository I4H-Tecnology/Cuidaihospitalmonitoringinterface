"""Contratos de entrada e saída.

Os formatos abaixo copiam exatamente o que `src/app/data/api.ts` do frontend
espera. Alterar qualquer nome de campo aqui quebra a tela correspondente.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Espelha o CHECK de ocorrencia.tipo_evento no schema. Duplicar a lista é
# proposital: aqui o valor errado vira 422 com o campo apontado, em vez de
# estourar como violação de constraint lá no fundo do banco.
TipoEvento = Literal["queda", "perda_verticalidade", "permanencia_solo", "ausencia_prolongada"]


class TenantInfo(BaseModel):
    id: str
    active: bool


class LoginRequest(BaseModel):
    tenant: str
    username: str
    password: str


class LoginResponse(BaseModel):
    # O token e a mudanca central: sem ele o frontend nao consegue provar quem
    # e nas chamadas seguintes, e o controle de acesso volta a ser decorativo.
    token: str
    id: str
    tenantId: str
    login: str
    name: str
    role: str
    platforms: list[str]
    unit: str | None = None
    sector: str | None = None
    lastAccess: str | None = None
    passwordChangedAt: str | None = None
    isSystemUser: bool = False
    mustChangePassword: bool = False
    temporaryPasswordExpiresAt: str | None = None


class ForceChangePasswordRequest(BaseModel):
    tenant: str
    username: str
    currentPassword: str
    newPassword: str


class ForgotPasswordRequest(BaseModel):
    tenant: str
    email: str


class ForgotPasswordReset(BaseModel):
    tenant: str
    email: str
    code: str
    newPassword: str


class AuthFlowResponse(BaseModel):
    ok: bool
    message: str | None = None
    devResetCode: str | None = None


class PermissionRow(BaseModel):
    module: str
    view: bool = False
    create: bool = False
    edit: bool = False
    delete: bool = False
    web: bool = False
    app: bool = False


class PermissionsPayload(BaseModel):
    permissions: list[PermissionRow]


class SecurityPolicyPayload(BaseModel):
    tenantId: str
    policy: dict


class UsuarioPayload(BaseModel):
    tenantId: str
    user: dict


class AccessLogPayload(BaseModel):
    tenantId: str
    log: dict


class Ok(BaseModel):
    ok: bool = True


class SetorCritico(BaseModel):
    id: str
    name: str
    occupancyRate: float
    activeAlerts: int
    status: str


class Insight(BaseModel):
    id: str
    title: str
    description: str
    priority: str


class OperationalOverviewResponse(BaseModel):
    status: str
    criticalAlerts: int
    criticalCases: int
    occupancyRate: float
    avgResponseMinutes: float
    incidentsLast24h: int
    updatedAt: str
    criticalSectors: list[SetorCritico] = Field(default_factory=list)
    insights: list[Insight] = Field(default_factory=list)


# -----------------------------------------------------------------------------
# Monitoramento — o que o serviço de visão manda e o que o painel lê de volta.
# -----------------------------------------------------------------------------

class ContextoCamera(BaseModel):
    """Onde esta câmera está e quem ela observa.

    O serviço de visão consulta isto uma vez no boot: a ocorrência exige
    ambiente_id, e quem tem essa informação é o cadastro, não o `.env`.
    """

    cameraId: str
    identificador: str
    status: str
    tenantId: str
    ambienteId: str
    ambienteNome: str
    pacienteId: str | None = None
    pacienteNome: str | None = None


class OcorrenciaPayload(BaseModel):
    tenantId: str
    cameraId: str
    tipoEvento: TipoEvento = "queda"
    # Índice de confiança da camada de regras, de 0 a 1. O CHECK da tabela
    # recusa qualquer coisa fora dessa faixa; barrar aqui dá erro melhor.
    confianca: float | None = Field(default=None, ge=0, le=1)
    # Instante em que a pessoa chegou ao chão — não o momento em que o limiar
    # de permanência foi cruzado, alguns segundos depois.
    dataHora: datetime
    motivo: str | None = None
    # Identifica o evento de forma estável entre tentativas: reconexão e
    # reenvio da fila não podem virar dois alertas do mesmo tombo.
    chaveEvento: str = Field(min_length=8, max_length=200)


class OcorrenciaCriada(BaseModel):
    id: str
    alertaId: str
    # True quando a chave já tinha sido registrada. O serviço de visão trata
    # como sucesso: o evento está no banco, que é o que importa.
    duplicada: bool = False


class OcorrenciaResumo(BaseModel):
    id: str
    tipoEvento: str
    status: str
    confianca: float | None = None
    dataHora: str
    encerradaEm: str | None = None
    observacao: str | None = None
    ambienteId: str
    ambienteNome: str
    pacienteId: str | None = None
    pacienteNome: str | None = None
    cameraId: str | None = None
    cameraIdentificador: str | None = None
    alertaNivel: str | None = None
    alertaStatus: str | None = None

