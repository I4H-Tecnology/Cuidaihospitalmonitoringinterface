const rawApiBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  '';
// Keep requests working on same-origin deployments when env var is missing.
if (!rawApiBaseUrl) {
  console.error('[api] VITE_API_URL is not set. Falling back to same-origin requests.');
}
const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');

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

const request = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
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
      descartarToken();
      aoPerderSessao?.();
    }
    throw new ApiError(payload.error || 'Erro inesperado.', response.status, payload);
  }

  return response.json() as Promise<T>;
};

export interface TenantInfo {
  id: string;
  active: boolean;
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

export const recordAccessLog = (tenantId: string, log: any) =>
  request<{ ok: boolean }>('/api/access-logs', {
    method: 'POST',
    body: JSON.stringify({ tenantId, log })
  });

export const fetchOperationalOverview = (tenantId: string) =>
  request<OperationalOverviewResponse>(`/api/operational-overview?tenantId=${encodeURIComponent(tenantId)}`);
