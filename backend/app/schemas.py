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
    # Nome da clinica, para o rodape do menu nao precisar de outra rota.
    nome: str | None = None
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
    # Há clipe de evidência em disco agora? False também quando já foi
    # expurgado (24 h): a ocorrência continua, o vídeo não (RN09, RNF18).
    temClipe: bool = False


class AmbienteResumo(BaseModel):
    id: str
    nome: str
    tipo: str
    cameras: int = 0
    pacienteNome: str | None = None


class CameraResumo(BaseModel):
    id: str
    identificador: str
    urlStream: str
    status: str
    # Derivada do último ping, não lida da coluna status: câmera que cai não
    # avisa, então só o sinal de vida recente prova que ela está de pé.
    conectada: bool
    ultimoPing: str | None = None
    ambienteId: str
    ambienteNome: str
    ambienteTipo: str
    pacienteId: str | None = None
    pacienteNome: str | None = None
    ocorrencias24h: int = 0
    ultimaOcorrencia: str | None = None


class CameraPayload(BaseModel):
    tenantId: str
    ambienteId: str
    identificador: str = Field(min_length=2, max_length=60)
    # RTSP, HTTP ou o que a câmera expuser. Validação leve de propósito: exigir
    # esquema fixo aqui barraria fonte legítima que o MVP ainda nem conhece.
    urlStream: str = Field(min_length=4, max_length=500)


# -----------------------------------------------------------------------------
# Ciclo de atendimento (RF17-RF20, RN11)
# -----------------------------------------------------------------------------

# Só os três estados de encerramento da RN11. 'pendente' e 'em_atendimento'
# ficam de fora de propósito: são estados de passagem, não desfecho, e chegam
# pelas rotas de ciência e atendimento.
Classificacao = Literal["encerrada", "falso_positivo", "queda_confirmada"]


class AtendimentoPayload(BaseModel):
    tenantId: str


class EncerramentoPayload(BaseModel):
    tenantId: str
    # Obrigatória (RF20): é o que separa queda real de alarme falso, e sem essa
    # separação não há como aferir a precisão que a RFC promete.
    classificacao: Classificacao
    observacao: str | None = Field(default=None, max_length=2000)


# -----------------------------------------------------------------------------
# Pacientes (RF05, RF21, RF22)
#
# Só o que o DER modela. Sexo, leito e setor não existem na entidade Paciente
# da RFC -- e inventar campo para a tela ficar cheia é o mesmo defeito do
# "97,4% de precisão" que saiu do monitoramento.
# -----------------------------------------------------------------------------

class PacienteResumo(BaseModel):
    id: str
    nome: str
    # Calculada de data_nascimento. None quando a data não foi cadastrada.
    idade: int | None = None
    dataNascimento: str | None = None
    status: str
    dataAdmissao: str
    dataAlta: str | None = None
    ambienteId: str | None = None
    ambienteNome: str | None = None
    ambienteTipo: str | None = None
    # Derivado das ocorrências, não de uma coluna de gravidade: o sistema não
    # emite diagnóstico (RN16), então "atenção" aqui significa evento aberto.
    situacao: str
    ocorrenciasAbertas: int = 0
    quedasConfirmadas: int = 0
    totalOcorrencias: int = 0
    ultimaOcorrencia: str | None = None


class AltaPayload(BaseModel):
    tenantId: str
    # A RN07 fala em "alta ou remoção do paciente". O CHECK da tabela recusa
    # status 'internado' com data_alta, então os dois têm de andar juntos.
    motivo: Literal["alta", "transferido"] = "alta"
    observacao: str | None = Field(default=None, max_length=500)


class AltaResultado(BaseModel):
    ok: bool = True
    paciente: PacienteResumo
    # Quantos acessos de acompanhante caíram junto (RN07). Aparece na tela
    # porque é consequência que quem dá alta precisa saber que aconteceu.
    acessosRevogados: int = 0


class PacientePayload(BaseModel):
    """Cadastro de paciente (RF05) com vínculo a ambiente (RF08)."""

    tenantId: str
    nome: str = Field(min_length=3, max_length=120)
    # Opcional porque nem toda clínica tem a data na admissão. Sem ela a idade
    # some da tela em vez de virar um número inventado.
    dataNascimento: str | None = None
    # RF08: é o vínculo que faz a ocorrência saber onde aconteceu. Sem ambiente
    # a câmera detecta e não tem a quem atribuir.
    ambienteId: str | None = None
    dataAdmissao: str | None = None


class PacienteEdicaoPayload(BaseModel):
    tenantId: str
    nome: str | None = Field(default=None, min_length=3, max_length=120)
    dataNascimento: str | None = None
    ambienteId: str | None = None
    # Permite reinternar quem recebeu alta, sem apagar o histórico dele.
    status: Literal["internado"] | None = None
