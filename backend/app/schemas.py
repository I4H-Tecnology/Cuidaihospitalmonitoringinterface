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
    # Processo do serviço de visão que analisa esta câmera. Nulo = o painel usa
    # o serviço padrão, se for esta a câmera que ele está observando.
    visaoUrl: str | None = None


# Ao contrário de urlStream, aqui o esquema é fixo: o endereço vai parar num
# <img src> e num fetch do navegador, e só HTTP serve para isso.
URL_DA_VISAO = r"^https?://\S+$"


class CameraPayload(BaseModel):
    tenantId: str
    ambienteId: str
    identificador: str = Field(min_length=2, max_length=60)
    # RTSP, HTTP ou o que a câmera expuser. Validação leve de propósito: exigir
    # esquema fixo aqui barraria fonte legítima que o MVP ainda nem conhece.
    urlStream: str = Field(min_length=4, max_length=500)
    visaoUrl: str | None = Field(default=None, max_length=300, pattern=URL_DA_VISAO)


class CameraEdicaoPayload(BaseModel):
    """Edição parcial: só o que vier muda."""

    tenantId: str
    identificador: str | None = Field(default=None, min_length=2, max_length=60)
    urlStream: str | None = Field(default=None, min_length=4, max_length=500)
    ambienteId: str | None = None
    # Texto vazio limpa o campo (volta ao serviço padrão); ausente, mantém.
    visaoUrl: str | None = Field(default=None, max_length=300, pattern=r"^$|" + URL_DA_VISAO)


# -----------------------------------------------------------------------------
# A clínica do tenant (cadastro editável em Configurações)
# -----------------------------------------------------------------------------

class ClinicaResumo(BaseModel):
    slug: str
    nome: str
    cnpj: str | None = None
    endereco: str | None = None
    telefone: str | None = None
    email: str | None = None
    # Só leitura. Desativar tranca todos os usuários da clínica, login
    # incluso; não é ação de autoatendimento.
    ativa: bool


class ClinicaEdicaoPayload(BaseModel):
    # Sem `ativa` e sem `cnpj` de propósito: ver rotas/clinica.py. Campo
    # desconhecido no corpo é ignorado pelo pydantic, então mandar `ativa`
    # aqui não faz nada.
    tenantId: str
    nome: str | None = Field(default=None, min_length=3, max_length=120)
    endereco: str | None = Field(default=None, max_length=300)
    telefone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=120, pattern=r"^$|^[^@\s]+@[^@\s]+$")


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
    # Quadro clínico da admissão (texto livre). None quando não informado.
    historicoMedico: str | None = None
    medicoResponsavel: str | None = None
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
    historicoMedico: str | None = Field(default=None, max_length=4000)
    medicoResponsavel: str | None = Field(default=None, max_length=120)


class AcompanhanteResumo(BaseModel):
    """Acompanhante do paciente (RN03-RN07). O token nunca sai daqui."""

    id: str
    pacienteId: str
    nome: str
    documento: str
    ativo: bool
    expiraEm: str
    revogadoEm: str | None = None
    criadoEm: str


class AcompanhanteCriado(AcompanhanteResumo):
    # Só existe nesta resposta: no banco fica o hash, e não há rota que o
    # devolva de novo. Quem perder, revoga e cria outro.
    tokenQrcode: str


class AcompanhantePayload(BaseModel):
    tenantId: str
    pacienteId: str
    nome: str = Field(min_length=3, max_length=120)
    documento: str = Field(min_length=5, max_length=20)
    # RN05/RN07: temporário por definição. 30 dias é o teto.
    validadeHoras: int = Field(default=72, ge=1, le=720)


class EvolucaoResumo(BaseModel):
    """Nota de evolução clínica: quem escreveu importa tanto quanto o texto."""

    id: str
    pacienteId: str
    texto: str
    autorNome: str
    dataHora: str
    # Preenchido nas listagens por clínica; na do paciente é redundante.
    pacienteNome: str | None = None


class EvolucaoPayload(BaseModel):
    tenantId: str
    pacienteId: str
    texto: str = Field(min_length=3, max_length=4000)


class RiscoResumo(BaseModel):
    id: str
    pacienteId: str
    tipo: Literal["alergia", "risco"]
    descricao: str
    gravidade: Literal["leve", "moderada", "grave"]
    ativo: bool
    autorNome: str
    criadoEm: str
    inativadoEm: str | None = None
    pacienteNome: str | None = None


class RiscoPayload(BaseModel):
    tenantId: str
    pacienteId: str
    tipo: Literal["alergia", "risco"]
    descricao: str = Field(min_length=3, max_length=300)
    gravidade: Literal["leve", "moderada", "grave"] = "moderada"


class PrescricaoResumo(BaseModel):
    id: str
    pacienteId: str
    medicamento: str
    posologia: str | None = None
    medicoPrescritor: str | None = None
    observacao: str | None = None
    ativo: bool
    autorNome: str
    pacienteNome: str | None = None
    criadoEm: str
    inativadoEm: str | None = None


class PrescricaoPayload(BaseModel):
    tenantId: str
    pacienteId: str
    medicamento: str = Field(min_length=2, max_length=120)
    posologia: str | None = Field(default=None, max_length=200)
    medicoPrescritor: str | None = Field(default=None, max_length=120)
    observacao: str | None = Field(default=None, max_length=500)


class PacienteEdicaoPayload(BaseModel):
    tenantId: str
    nome: str | None = Field(default=None, min_length=3, max_length=120)
    dataNascimento: str | None = None
    ambienteId: str | None = None
    # Permite reinternar quem recebeu alta, sem apagar o histórico dele.
    status: Literal["internado"] | None = None
    # String vazia limpa o campo; ausente mantém.
    historicoMedico: str | None = Field(default=None, max_length=4000)
    medicoResponsavel: str | None = Field(default=None, max_length=120)


# -----------------------------------------------------------------------------
# App Paciente: visão da equipe e portal da família (25/10/2026)
# -----------------------------------------------------------------------------

class AcompanhanteDaClinica(AcompanhanteResumo):
    """Acompanhante na lista geral da clínica (tela App Paciente)."""

    pacienteNome: str
    ambienteNome: str | None = None
    termoAceitoEm: str | None = None
    ultimoAcessoEm: str | None = None


class FamiliaEntrada(BaseModel):
    # "<id do acompanhante>.<token>", exatamente o que o QR Code carrega.
    codigo: str = Field(min_length=20, max_length=200)


class FamiliaSessao(BaseModel):
    token: str
    expiraEm: str


class FamiliaTermo(BaseModel):
    versao: str
    texto: str


class FamiliaPainel(BaseModel):
    """O que a família vê. Nada clínico: nome, lugar, câmera e prazo."""

    acompanhanteNome: str
    pacienteNome: str
    ambienteNome: str | None = None
    clinicaNome: str
    expiraEm: str
    termo: FamiliaTermo
    termoAceito: bool
    cameraConectada: bool
    videoDisponivel: bool


class FamiliaTermoAceite(BaseModel):
    versao: str


class FamiliaIngresso(BaseModel):
    """Ingresso de vídeo: vale 30 s para abrir o stream (vai na URL da <img>)."""

    ingresso: str


# -----------------------------------------------------------------------------
# Contratos (25/10/2026)
# -----------------------------------------------------------------------------

CategoriaContrato = Literal["servico", "manutencao", "locacao", "fornecimento", "software", "outro"]
SituacaoContrato = Literal["agendado", "vigente", "vencendo", "vencido", "encerrado"]


class ContratoResumo(BaseModel):
    id: str
    numero: str | None = None
    objeto: str
    fornecedor: str
    fornecedorDocumento: str | None = None
    categoria: CategoriaContrato
    valorMensal: float | None = None
    inicio: str
    fim: str | None = None
    renovacaoAutomatica: bool
    avisoPrevioDias: int
    responsavel: str | None = None
    observacoes: str | None = None
    situacao: SituacaoContrato
    # Data até a qual decidir renovar ou não (fim - aviso prévio).
    decidirAte: str | None = None
    encerradoEm: str | None = None
    motivoEncerramento: str | None = None
    criadoPorNome: str | None = None
    criadoEm: str
    pedidosVinculados: int = 0


class ContratoPayload(BaseModel):
    tenantId: str
    numero: str | None = Field(default=None, max_length=40)
    objeto: str = Field(min_length=3, max_length=200)
    fornecedor: str = Field(min_length=2, max_length=120)
    fornecedorDocumento: str | None = Field(default=None, pattern=r"^$|^(\d{11}|\d{14})$")
    categoria: CategoriaContrato
    valorMensal: float | None = Field(default=None, ge=0, le=99_999_999)
    inicio: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    fim: str | None = Field(default=None, pattern=r"^$|^\d{4}-\d{2}-\d{2}$")
    renovacaoAutomatica: bool = False
    avisoPrevioDias: int = Field(default=30, ge=0, le=365)
    responsavel: str | None = Field(default=None, max_length=120)
    observacoes: str | None = Field(default=None, max_length=2000)


class ContratoEncerramento(BaseModel):
    tenantId: str
    motivo: str = Field(min_length=5, max_length=500)


# -----------------------------------------------------------------------------
# Compras (25/10/2026)
# -----------------------------------------------------------------------------

StatusPedido = Literal["solicitado", "aprovado", "recusado", "comprado", "recebido", "cancelado"]


class ItemPedido(BaseModel):
    descricao: str = Field(min_length=2, max_length=200)
    quantidade: float = Field(gt=0, le=1_000_000)
    unidade: str = Field(default="un", min_length=1, max_length=20)
    valorUnitario: float | None = Field(default=None, ge=0, le=9_999_999)


class EtapaPedido(BaseModel):
    etapa: Literal["solicitado", "decidido", "comprado", "recebido", "cancelado"]
    quem: str | None = None
    quando: str


class PedidoResumo(BaseModel):
    id: str
    numero: int
    titulo: str
    justificativa: str | None = None
    urgente: bool
    status: StatusPedido
    fornecedor: str | None = None
    contratoId: str | None = None
    contratoObjeto: str | None = None
    itens: list[ItemPedido]
    # Soma de quantidade x valor estimado dos itens com preço.
    valorEstimado: float | None = None
    valorFinal: float | None = None
    solicitanteId: str
    solicitanteNome: str
    motivoRecusa: str | None = None
    motivoCancelamento: str | None = None
    trilha: list[EtapaPedido]
    criadoEm: str


class PedidoPayload(BaseModel):
    tenantId: str
    titulo: str = Field(min_length=3, max_length=160)
    justificativa: str | None = Field(default=None, max_length=1000)
    urgente: bool = False
    itens: list[ItemPedido] = Field(min_length=1, max_length=50)


class PedidoMotivo(BaseModel):
    tenantId: str
    motivo: str = Field(min_length=5, max_length=500)


class PedidoCompra(BaseModel):
    tenantId: str
    fornecedor: str = Field(min_length=2, max_length=120)
    valorFinal: float = Field(ge=0, le=99_999_999)
    contratoId: str | None = None
