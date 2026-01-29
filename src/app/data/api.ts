const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

type FetchOptions = RequestInit & { json?: boolean };

const request = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
  if (import.meta.env.DEV) {
    console.debug('[api] request', `${API_BASE_URL}${path}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Erro inesperado.');
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
