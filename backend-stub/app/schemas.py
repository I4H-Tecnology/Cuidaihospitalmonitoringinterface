"""Contratos de entrada e saída.

Os formatos abaixo copiam exatamente o que `src/app/data/api.ts` do frontend
espera. Alterar qualquer nome de campo aqui quebra a tela correspondente.
"""

from pydantic import BaseModel, Field


class TenantInfo(BaseModel):
    id: str
    active: bool


class LoginRequest(BaseModel):
    tenant: str
    username: str
    password: str


class LoginResponse(BaseModel):
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
