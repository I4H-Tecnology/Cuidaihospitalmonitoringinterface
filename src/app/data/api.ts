const rawApiBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  '';
// Keep requests working on same-origin deployments when env var is missing.
if (!rawApiBaseUrl) {
  console.error('[api] VITE_API_URL is not set. Falling back to same-origin requests.');
}
const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');

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
  const response = await fetch(requestUrl, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
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
}

export const fetchTenants = () => request<TenantInfo[]>('/api/tenants');

export const loginRequest = (payload: { tenant: string; username: string; password: string }) =>
  request<LoginResponse>('/api/auth/login', {
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
