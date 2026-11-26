import { semBarraFinal } from './texto';

const rawApiBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  '';
// Keep requests working on same-origin deployments when env var is missing.
if (!rawApiBaseUrl) {
  console.error('[api] VITE_API_URL is not set. Falling back to same-origin requests.');
}
export const API_BASE_URL = semBarraFinal(rawApiBaseUrl);

/* ---------------------------------------------------------------------------
 * Token de sessão
 *
 * O backend passou a exigir credencial em toda rota protegida. Todo o acesso
 * agora depende deste token viajar no cabeçalho — sem ele a API responde 401,
 * que é exatamente o comportamento desejado.
 *
 * Fica em localStorage por compatibilidade com o resto da aplicação, que já
 * guarda a sessão ali. A alternativa correta é cookie httpOnly, fora do
 * alcance de JavaScript e portanto imune a XSS — mas isso exige o backend
 * definir o cookie e o frontend parar de ler a sessão, e é mudança que
 * pertence ao backend definitivo, não a este remendo.
 * -------------------------------------------------------------------------- */
const CHAVE_TOKEN = 'medsignal_token';

export const guardarToken = (token: string): void => {
  localStorage.setItem(CHAVE_TOKEN, token);
};

export const lerToken = (): string | null => localStorage.getItem(CHAVE_TOKEN);

export const descartarToken = (): void => {
  localStorage.removeItem(CHAVE_TOKEN);
};

/** Chamado quando a API devolve 401: a sessão morreu, não adianta insistir. */
let aoPerderSessao: (() => void) | null = null;

export const registrarPerdaDeSessao = (callback: () => void): void => {
  aoPerderSessao = callback;
};

/**
 * A sessão morreu (a API respondeu 401): descarta o token e avisa quem
 * registrou. Exportada para clientes que não passam por `request`, como o do
 * módulo financeiro, que tem cliente HTTP próprio.
 */
export const perderSessao = (): void => {
  descartarToken();
  aoPerderSessao?.();
};

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

type FetchOptions = RequestInit & { json?: boolean };

export const request = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const requestUrl = `${API_BASE_URL}${normalizedPath}`;
  if (import.meta.env.DEV) {
    console.debug('[api] request', requestUrl);
  }
  const token = lerToken();
  const response = await fetch(requestUrl, {
    headers: {
      'Content-Type': 'application/json',
      // Só manda o cabeçalho quando há token: mandar "Bearer null" faria a
      // API recusar até as rotas públicas, como a listagem de clínicas que
      // roda antes do login.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      // Token expirado ou inválido. Insistir com ele só gera mais 401.
      perderSessao();
    }
    throw new ApiError(payload.error || 'Erro inesperado.', response.status, payload);
  }

  return response.json() as Promise<T>;
};

export interface TenantInfo {
  id: string;
  active: boolean;
  /** Nome da clinica, para o rodape do menu. */
  nome?: string;
}

export interface PermissionRow {
  module: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  web: boolean;
  app: boolean;
}

export interface LoginResponse {
  /** JWT emitido no login. Sem ele nenhuma rota protegida responde. */
  token: string;
  id: string;
  tenantId: string;
  login: string;
  name: string;
  role: string;
  platforms: string[];
  unit?: string;
  sector?: string;
  lastAccess?: string;
  passwordChangedAt?: string;
  isSystemUser?: boolean;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string;
}

export interface AuthFlowResponse {
  ok: boolean;
  message?: string;
  devResetCode?: string;
}

export interface OperationalOverviewResponse {
  status: 'operational' | 'attention' | 'critical';
  criticalAlerts: number;
  criticalCases: number;
  occupancyRate: number;
  avgResponseMinutes: number;
  incidentsLast24h: number;
  updatedAt: string;
  criticalSectors: Array<{
    id: string;
    name: string;
    occupancyRate: number;
    activeAlerts: number;
    status: 'operational' | 'attention' | 'critical';
  }>;
  insights: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export const fetchTenants = () => request<TenantInfo[]>('/api/tenants');

/** O modo de teste EFETIVO do backend. Pública: a faixa aparece antes do login. */
export const fetchModoDeTeste = () => request<{ modoTeste: boolean }>('/api/modo-de-teste');

export const loginRequest = (payload: { tenant: string; username: string; password: string }) =>
  request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const forceChangePasswordRequest = (payload: {
  tenant: string;
  username: string;
  currentPassword: string;
  newPassword: string;
}) =>
  request<{ ok: boolean }>('/api/auth/force-change-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const requestForgotPassword = (payload: { tenant: string; email: string }) =>
  request<AuthFlowResponse>('/api/auth/forgot-password/request', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const resetForgotPassword = (payload: {
  tenant: string;
  email: string;
  code: string;
  newPassword: string;
}) =>
  request<{ ok: boolean }>('/api/auth/forgot-password/reset', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const fetchPermissions = (tenantId: string, role: string) =>
  request<PermissionRow[]>(`/api/permissions/${tenantId}/${role}`);

export const fetchUsers = (tenantId: string) =>
  request<any[]>(`/api/users?tenantId=${encodeURIComponent(tenantId)}`);

export const fetchSecurityPolicy = (tenantId: string) =>
  request<any>(`/api/security-policy?tenantId=${encodeURIComponent(tenantId)}`);

export const saveSecurityPolicy = (tenantId: string, policy: any) =>
  request<{ ok: boolean }>('/api/security-policy', {
    method: 'PUT',
    body: JSON.stringify({ tenantId, policy })
  });

export const savePermissions = (tenantId: string, role: string, permissions: PermissionRow[]) =>
  request<{ ok: boolean }>(`/api/permissions/${tenantId}/${role}`, {
    method: 'PUT',
    body: JSON.stringify({ permissions })
  });

export const createUser = (tenantId: string, user: any) =>
  request<any>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ tenantId, user })
  });

export const updateUserRequest = (tenantId: string, userId: string, user: any) =>
  request<any>(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ tenantId, user })
  });

export const deleteUserRequest = (tenantId: string, userId: string) =>
  request<{ ok: boolean }>(`/api/users/${userId}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'DELETE'
  });

export const fetchAccessLogs = (tenantId: string) =>
  request<any[]>(`/api/access-logs?tenantId=${encodeURIComponent(tenantId)}`);

// Melhor esforço: quem chama não espera o registro e uma falha dele não pode
// virar rejeição sem tratamento (nem derrubar a ação do usuário).
export const recordAccessLog = (tenantId: string, log: any) =>
  request<{ ok: boolean }>('/api/access-logs', {
    method: 'POST',
    body: JSON.stringify({ tenantId, log })
  }).catch((erro: unknown) => {
    console.warn('Não foi possível registrar o log de acesso.', erro);
    return { ok: false };
  });

export const fetchOperationalOverview = (tenantId: string) =>
  request<OperationalOverviewResponse>(`/api/operational-overview?tenantId=${encodeURIComponent(tenantId)}`);

/* ---------------------------------------------------------------------------
 * Monitoramento — câmeras, ambientes e ocorrências
 * -------------------------------------------------------------------------- */

export interface AmbienteResumo {
  id: string;
  nome: string;
  tipo: string;
  cameras: number;
  pacienteNome?: string | null;
}

export interface CameraResumo {
  id: string;
  identificador: string;
  /** Credencial vem mascarada pela API; nunca chega inteira ao navegador. */
  urlStream: string;
  status: string;
  /** Derivada do último ping no servidor, não da coluna de status. */
  conectada: boolean;
  ultimoPing?: string | null;
  ambienteId: string;
  ambienteNome: string;
  ambienteTipo: string;
  pacienteId?: string | null;
  pacienteNome?: string | null;
  ocorrencias24h: number;
  ultimaOcorrencia?: string | null;
  /** Processo do serviço de visão desta câmera. Nulo = serviço padrão do painel. */
  visaoUrl?: string | null;
}

export interface OcorrenciaResumo {
  id: string;
  tipoEvento: string;
  status: string;
  confianca?: number | null;
  dataHora: string;
  encerradaEm?: string | null;
  observacao?: string | null;
  ambienteId: string;
  ambienteNome: string;
  pacienteId?: string | null;
  pacienteNome?: string | null;
  cameraId?: string | null;
  cameraIdentificador?: string | null;
  alertaNivel?: string | null;
  alertaStatus?: string | null;
  /** Clipe de evidência em disco agora. Some após 24 h; a ocorrência fica. */
  temClipe?: boolean;
}

export const fetchAmbientes = (tenantId: string) =>
  request<AmbienteResumo[]>(`/api/ambientes?tenantId=${encodeURIComponent(tenantId)}`);

export const fetchCameras = (tenantId: string, somenteConectadas = false) =>
  request<CameraResumo[]>(
    `/api/cameras?tenantId=${encodeURIComponent(tenantId)}` +
      (somenteConectadas ? '&somenteConectadas=true' : '')
  );

export const createCamera = (payload: {
  tenantId: string;
  ambienteId: string;
  identificador: string;
  urlStream: string;
  visaoUrl?: string;
}) =>
  request<CameraResumo>('/api/cameras', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const editarCamera = (
  cameraId: string,
  // visaoUrl vazio limpa o campo e a câmera volta ao serviço padrão.
  payload: { tenantId: string; identificador?: string; urlStream?: string; ambienteId?: string; visaoUrl?: string }
) =>
  request<CameraResumo>(`/api/cameras/${cameraId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

/* ---------------------------------------------------------------------------
 * A clínica do tenant (Configurações → Unidades)
 * -------------------------------------------------------------------------- */

export interface ClinicaResumo {
  slug: string;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  /** Só leitura: desativar tranca todos os usuários da clínica. */
  ativa: boolean;
}

export const fetchClinica = (tenantId: string) =>
  request<ClinicaResumo>(`/api/clinica?tenantId=${encodeURIComponent(tenantId)}`);

export const editarClinica = (payload: {
  tenantId: string;
  nome?: string;
  endereco?: string;
  telefone?: string;
  email?: string;
}) =>
  request<ClinicaResumo>('/api/clinica', { method: 'PATCH', body: JSON.stringify(payload) });

export const fetchOcorrencias = (tenantId: string, limite = 20) =>
  request<OcorrenciaResumo[]>(
    `/api/ocorrencias?tenantId=${encodeURIComponent(tenantId)}&limite=${limite}`
  );

/* ---------------------------------------------------------------------------
 * Ciclo de atendimento (RF17-RF20)
 * -------------------------------------------------------------------------- */

export type ClassificacaoOcorrencia = 'encerrada' | 'falso_positivo' | 'queda_confirmada';

export const darCiencia = (tenantId: string, ocorrenciaId: string) =>
  request<{ ok: boolean }>(
    `/api/ocorrencias/${ocorrenciaId}/ciencia?tenantId=${encodeURIComponent(tenantId)}`,
    { method: 'POST' }
  );

export const iniciarAtendimento = (tenantId: string, ocorrenciaId: string) =>
  request<{ ok: boolean }>(`/api/ocorrencias/${ocorrenciaId}/atendimento`, {
    method: 'POST',
    body: JSON.stringify({ tenantId })
  });

export const encerrarOcorrencia = (
  tenantId: string,
  ocorrenciaId: string,
  classificacao: ClassificacaoOcorrencia,
  observacao?: string
) =>
  request<{ ok: boolean }>(`/api/ocorrencias/${ocorrenciaId}/encerrar`, {
    method: 'POST',
    body: JSON.stringify({ tenantId, classificacao, observacao })
  });

/** Endereco do canal de tempo real, derivado da URL da API. */
export const urlDoCanalDeAlertas = (): string => {
  const base = API_BASE_URL || window.location.origin;
  return base.replace(/^http/, 'ws') + '/api/ws/alertas';
};

/* ---------------------------------------------------------------------------
 * Pacientes (RF05, RF21, RF22)
 *
 * Só os campos que a entidade Paciente do DER tem. Sexo, leito e setor nao
 * existem no modelo -- a tela nao inventa o que o banco nao guarda.
 * -------------------------------------------------------------------------- */

export interface PacienteResumo {
  id: string;
  nome: string;
  idade?: number | null;
  dataNascimento?: string | null;
  status: string;
  dataAdmissao: string;
  dataAlta?: string | null;
  ambienteId?: string | null;
  ambienteNome?: string | null;
  ambienteTipo?: string | null;
  historicoMedico?: string | null;
  medicoResponsavel?: string | null;
  /** Derivada das ocorrencias abertas, nao de julgamento clinico (RN16). */
  situacao: 'stable' | 'attention' | 'critical';
  ocorrenciasAbertas: number;
  quedasConfirmadas: number;
  totalOcorrencias: number;
  ultimaOcorrencia?: string | null;
}

export const fetchPacientes = (tenantId: string, incluirAlta = false) =>
  request<PacienteResumo[]>(
    `/api/pacientes?tenantId=${encodeURIComponent(tenantId)}` +
      (incluirAlta ? '&incluirAlta=true' : '')
  );

export const fetchPaciente = (tenantId: string, pacienteId: string) =>
  request<PacienteResumo>(
    `/api/pacientes/${pacienteId}?tenantId=${encodeURIComponent(tenantId)}`
  );

export const fetchOcorrenciasDoPaciente = (tenantId: string, pacienteId: string) =>
  request<OcorrenciaResumo[]>(
    `/api/ocorrencias?tenantId=${encodeURIComponent(tenantId)}` +
      `&pacienteId=${encodeURIComponent(pacienteId)}&limite=100`
  );

/**
 * Nome do ambiente com o tipo na frente, sem repetir.
 *
 * O cadastro costuma nomear o ambiente ja com o tipo dentro ("Quarto 101"), e
 * prefixar de novo produzia "Quarto · Quarto 101" na tela.
 */
export const descreverAmbiente = (nome?: string | null, tipo?: string | null): string => {
  if (!nome) return 'Sem ambiente vinculado';
  const rotulos: Record<string, string> = {
    quarto: 'Quarto',
    corredor: 'Corredor',
    sala_convivencia: 'Sala de convivência',
    refeitorio: 'Refeitório',
    banheiro: 'Banheiro',
    outro: 'Outro'
  };
  const rotulo = rotulos[tipo ?? ''];
  if (!rotulo) return nome;
  const jaTemOTipo = nome.toLowerCase().startsWith(rotulo.toLowerCase());
  return jaTemOTipo ? nome : `${rotulo} · ${nome}`;
};

export interface AltaResultado {
  ok: boolean;
  paciente: PacienteResumo;
  /** Acessos de acompanhante revogados junto com a alta (RN07). */
  acessosRevogados: number;
}

export const darAltaPaciente = (
  tenantId: string,
  pacienteId: string,
  motivo: 'alta' | 'transferido',
  observacao?: string
) =>
  request<AltaResultado>(`/api/pacientes/${pacienteId}/alta`, {
    method: 'POST',
    body: JSON.stringify({ tenantId, motivo, observacao })
  });

export const criarPaciente = (payload: {
  tenantId: string;
  nome: string;
  dataNascimento?: string | null;
  ambienteId?: string | null;
  dataAdmissao?: string | null;
  historicoMedico?: string;
  medicoResponsavel?: string;
}) =>
  request<PacienteResumo>('/api/pacientes', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const editarPaciente = (
  pacienteId: string,
  payload: {
    tenantId: string;
    nome?: string;
    dataNascimento?: string | null;
    ambienteId?: string | null;
    status?: 'internado';
    historicoMedico?: string;
    medicoResponsavel?: string;
  }
) =>
  request<PacienteResumo>(`/api/pacientes/${pacienteId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

/* ---------------------------------------------------------------------------
 * Clipe de evidência e saúde do sistema
 * -------------------------------------------------------------------------- */

/** Como `request`, mas devolve o corpo bruto — para vídeo, não JSON. */
const requestBlob = async (path: string): Promise<Blob> => {
  const token = lerToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      descartarToken();
      aoPerderSessao?.();
    }
    throw new ApiError(payload.error || 'Erro inesperado.', response.status, payload);
  }
  return response.blob();
};

/**
 * O clipe vem por fetch, e não por `<video src=...>` direto: a tag não manda
 * o cabeçalho Authorization, e vídeo de paciente sem credencial seria uma
 * violação de LGPD. Quem chama transforma o Blob em URL de objeto.
 */
export const fetchClipeDaOcorrencia = (tenantId: string, ocorrenciaId: string) =>
  requestBlob(`/api/ocorrencias/${ocorrenciaId}/clipe?tenantId=${encodeURIComponent(tenantId)}`);

export interface SaudeApi {
  status: 'ok' | 'degradado';
  versao: string;
  hora_servidor: string;
  uptime_s: number;
  banco: { ok: boolean; latencia_ms: number | null; erro: string | null };
  canal_alertas: { ouvintes_desta_clinica: number; ouvintes_total: number };
  cameras: { total: number; conectadas: number; janela_de_ping: string };
  ocorrencias: { ultimas_24h: number; abertas: number };
  clipes: {
    pasta: string;
    pasta_existe: boolean;
    clipes_em_disco: number;
    bytes_em_disco: number;
    retencao_horas: number;
    ultimo_expurgo: string | null;
    ultimo_expurgo_removeu: number;
  };
  log: { nivel: string; formato: string };
}

export const fetchSaude = (tenantId: string) =>
  request<SaudeApi>(`/api/saude?tenantId=${encodeURIComponent(tenantId)}`);

/* ---------------------------------------------------------------------------
 * Acompanhantes (RF25-RF28, RN03-RN07)
 * -------------------------------------------------------------------------- */

export interface AcompanhanteResumo {
  id: string;
  pacienteId: string;
  nome: string;
  documento: string;
  ativo: boolean;
  expiraEm: string;
  revogadoEm: string | null;
  criadoEm: string;
}

export interface AcompanhanteCriado extends AcompanhanteResumo {
  /** Só existe nesta resposta. Depois disso não há como recuperar: o backend guarda só o hash. */
  tokenQrcode: string;
}

export const fetchAcompanhantes = (tenantId: string, pacienteId: string) =>
  request<AcompanhanteResumo[]>(
    `/api/pacientes/${pacienteId}/acompanhantes?tenantId=${encodeURIComponent(tenantId)}`
  );

export const criarAcompanhante = (payload: {
  tenantId: string;
  pacienteId: string;
  nome: string;
  documento: string;
  validadeHoras: number;
}) =>
  request<AcompanhanteCriado>('/api/acompanhantes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const revogarAcompanhante = (tenantId: string, acompanhanteId: string) =>
  request<{ ok: boolean }>(
    `/api/acompanhantes/${acompanhanteId}/revogar?tenantId=${encodeURIComponent(tenantId)}`,
    { method: 'POST' }
  );

/* ---------------------------------------------------------------------------
 * Prontuário: evoluções e alergias/riscos (decisão de produto de 13/09/2026)
 * -------------------------------------------------------------------------- */

export interface EvolucaoResumo {
  id: string;
  pacienteId: string;
  texto: string;
  autorNome: string;
  dataHora: string;
  /** Presente nas listagens por clínica. */
  pacienteNome?: string | null;
}

export const fetchEvolucoesDaClinica = (tenantId: string, limite = 200) =>
  request<EvolucaoResumo[]>(`/api/evolucoes?tenantId=${encodeURIComponent(tenantId)}&limite=${limite}`);

export const fetchEvolucoes = (tenantId: string, pacienteId: string) =>
  request<EvolucaoResumo[]>(
    `/api/pacientes/${pacienteId}/evolucoes?tenantId=${encodeURIComponent(tenantId)}`
  );

/** Sem editar nem apagar: evolução é registro. */
export const criarEvolucao = (payload: { tenantId: string; pacienteId: string; texto: string }) =>
  request<EvolucaoResumo>('/api/evolucoes', { method: 'POST', body: JSON.stringify(payload) });

export interface RiscoResumo {
  id: string;
  pacienteId: string;
  tipo: 'alergia' | 'risco';
  descricao: string;
  gravidade: 'leve' | 'moderada' | 'grave';
  ativo: boolean;
  autorNome: string;
  criadoEm: string;
  inativadoEm: string | null;
  pacienteNome?: string | null;
}

export const fetchRiscosDaClinica = (tenantId: string, incluirInativos = false) =>
  request<RiscoResumo[]>(
    `/api/riscos?tenantId=${encodeURIComponent(tenantId)}` + (incluirInativos ? '&incluirInativos=true' : '')
  );

export const fetchRiscos = (tenantId: string, pacienteId: string, incluirInativos = false) =>
  request<RiscoResumo[]>(
    `/api/pacientes/${pacienteId}/riscos?tenantId=${encodeURIComponent(tenantId)}` +
      (incluirInativos ? '&incluirInativos=true' : '')
  );

export const criarRisco = (payload: {
  tenantId: string;
  pacienteId: string;
  tipo: RiscoResumo['tipo'];
  descricao: string;
  gravidade: RiscoResumo['gravidade'];
}) => request<RiscoResumo>('/api/riscos', { method: 'POST', body: JSON.stringify(payload) });

export const inativarRisco = (tenantId: string, riscoId: string) =>
  request<{ ok: boolean }>(
    `/api/riscos/${riscoId}/inativar?tenantId=${encodeURIComponent(tenantId)}`,
    { method: 'POST' }
  );

/* ---------------------------------------------------------------------------
 * Prescrições (o que o médico receitou)
 * -------------------------------------------------------------------------- */

export interface PrescricaoResumo {
  id: string;
  pacienteId: string;
  medicamento: string;
  posologia: string | null;
  medicoPrescritor: string | null;
  observacao: string | null;
  ativo: boolean;
  autorNome: string;
  pacienteNome?: string | null;
  criadoEm: string;
  inativadoEm: string | null;
}

export const fetchPrescricoes = (tenantId: string, pacienteId: string, incluirInativas = false) =>
  request<PrescricaoResumo[]>(
    `/api/pacientes/${pacienteId}/prescricoes?tenantId=${encodeURIComponent(tenantId)}` +
      (incluirInativas ? '&incluirInativas=true' : '')
  );

export const criarPrescricao = (payload: {
  tenantId: string;
  pacienteId: string;
  medicamento: string;
  posologia?: string;
  medicoPrescritor?: string;
  observacao?: string;
}) => request<PrescricaoResumo>('/api/prescricoes', { method: 'POST', body: JSON.stringify(payload) });

export const inativarPrescricao = (tenantId: string, prescricaoId: string) =>
  request<{ ok: boolean }>(
    `/api/prescricoes/${prescricaoId}/inativar?tenantId=${encodeURIComponent(tenantId)}`,
    { method: 'POST' }
  );

/* ---------------------------------------------------------------------------
 * App Paciente: todos os acessos de família da clínica (25/10/2026)
 * -------------------------------------------------------------------------- */

export interface AcompanhanteDaClinica extends AcompanhanteResumo {
  pacienteNome: string;
  ambienteNome: string | null;
  termoAceitoEm: string | null;
  ultimoAcessoEm: string | null;
}

export const fetchAcompanhantesDaClinica = (tenantId: string) =>
  request<AcompanhanteDaClinica[]>(`/api/acompanhantes?tenantId=${encodeURIComponent(tenantId)}`);

/* ---------------------------------------------------------------------------
 * Contratos (Administração → Contratos, 25/10/2026)
 * -------------------------------------------------------------------------- */

export type CategoriaContrato = 'servico' | 'manutencao' | 'locacao' | 'fornecimento' | 'software' | 'outro';
export type SituacaoContrato = 'agendado' | 'vigente' | 'vencendo' | 'vencido' | 'encerrado';

export interface ContratoResumo {
  id: string;
  numero: string | null;
  objeto: string;
  fornecedor: string;
  fornecedorDocumento: string | null;
  categoria: CategoriaContrato;
  valorMensal: number | null;
  inicio: string;
  fim: string | null;
  renovacaoAutomatica: boolean;
  avisoPrevioDias: number;
  responsavel: string | null;
  observacoes: string | null;
  /** Calculada pelo servidor a partir das datas, no fuso da clínica. */
  situacao: SituacaoContrato;
  /** Até quando decidir renovar ou não (fim − aviso prévio). */
  decidirAte: string | null;
  encerradoEm: string | null;
  motivoEncerramento: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
  pedidosVinculados: number;
}

export interface ContratoPayload {
  numero?: string;
  objeto: string;
  fornecedor: string;
  fornecedorDocumento?: string;
  categoria: CategoriaContrato;
  valorMensal?: number | null;
  inicio: string;
  fim?: string;
  renovacaoAutomatica: boolean;
  avisoPrevioDias: number;
  responsavel?: string;
  observacoes?: string;
}

export const fetchContratos = (tenantId: string) =>
  request<ContratoResumo[]>(`/api/contratos?tenantId=${encodeURIComponent(tenantId)}`);

export const criarContrato = (tenantId: string, contrato: ContratoPayload) =>
  request<ContratoResumo>('/api/contratos', { method: 'POST', body: JSON.stringify({ tenantId, ...contrato }) });

export const editarContrato = (tenantId: string, contratoId: string, contrato: ContratoPayload) =>
  request<ContratoResumo>(`/api/contratos/${contratoId}`, { method: 'PATCH', body: JSON.stringify({ tenantId, ...contrato }) });

export const encerrarContrato = (tenantId: string, contratoId: string, motivo: string) =>
  request<{ ok: boolean }>(`/api/contratos/${contratoId}/encerrar`, { method: 'POST', body: JSON.stringify({ tenantId, motivo }) });

/* ---------------------------------------------------------------------------
 * Compras (Administração → Compras, 25/10/2026)
 * -------------------------------------------------------------------------- */

export type StatusPedido = 'solicitado' | 'aprovado' | 'recusado' | 'comprado' | 'recebido' | 'cancelado';

export interface ItemPedido {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number | null;
}

export interface EtapaPedido {
  etapa: 'solicitado' | 'decidido' | 'comprado' | 'recebido' | 'cancelado';
  quem: string | null;
  quando: string;
}

export interface PedidoResumo {
  id: string;
  numero: number;
  titulo: string;
  justificativa: string | null;
  urgente: boolean;
  status: StatusPedido;
  fornecedor: string | null;
  contratoId: string | null;
  contratoObjeto: string | null;
  itens: ItemPedido[];
  valorEstimado: number | null;
  valorFinal: number | null;
  solicitanteId: string;
  solicitanteNome: string;
  motivoRecusa: string | null;
  motivoCancelamento: string | null;
  trilha: EtapaPedido[];
  criadoEm: string;
}

const q = (tenantId: string) => `?tenantId=${encodeURIComponent(tenantId)}`;

export const fetchPedidos = (tenantId: string) => request<PedidoResumo[]>(`/api/compras${q(tenantId)}`);

export const criarPedido = (tenantId: string, pedido: { titulo: string; justificativa?: string; urgente: boolean; itens: ItemPedido[] }) =>
  request<PedidoResumo>('/api/compras', { method: 'POST', body: JSON.stringify({ tenantId, ...pedido }) });

export const aprovarPedido = (tenantId: string, id: string) =>
  request<PedidoResumo>(`/api/compras/${id}/aprovar${q(tenantId)}`, { method: 'POST' });

export const recusarPedido = (tenantId: string, id: string, motivo: string) =>
  request<PedidoResumo>(`/api/compras/${id}/recusar`, { method: 'POST', body: JSON.stringify({ tenantId, motivo }) });

export const registrarCompra = (tenantId: string, id: string, dados: { fornecedor: string; valorFinal: number; contratoId?: string | null }) =>
  request<PedidoResumo>(`/api/compras/${id}/comprar`, { method: 'POST', body: JSON.stringify({ tenantId, ...dados }) });

export const confirmarRecebimento = (tenantId: string, id: string) =>
  request<PedidoResumo>(`/api/compras/${id}/receber${q(tenantId)}`, { method: 'POST' });

export const cancelarPedido = (tenantId: string, id: string, motivo: string) =>
  request<{ ok: boolean }>(`/api/compras/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ tenantId, motivo }) });

/** "R$ 1.234,56". Valor ausente vira traço, não zero: zero é um valor. */
export const formatarReais = (valor: number | null | undefined): string =>
  valor == null ? '—' : valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
