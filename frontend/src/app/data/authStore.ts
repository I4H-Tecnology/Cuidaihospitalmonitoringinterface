export type Platform = 'web' | 'app';
export type UserStatus = 'active' | 'inactive' | 'blocked';
export type Role =
  | 'SYSTEM'
  | 'ADMIN'
  | 'MANAGER'
  | 'DOCTOR'
  | 'NURSE'
  | 'ADMINISTRATIVE'
  | 'PATIENT'
  | 'VISITOR'
  | 'TCC';

export interface UserRecord {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  cpf?: string;
  login: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  platforms: Platform[];
  unit: string;
  sector?: string;
  createdAt: string;
  lastAccess?: string;
  passwordChangedAt?: string;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string;
  failedAttempts: number;
  failedAttemptWindowStartedAt?: string;
  lockedUntil?: string;
  isSystemUser?: boolean;
  birthDate?: string;
  admissionDate?: string;
  documentId?: string;
}

export interface Permission {
  module: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  web: boolean;
  app: boolean;
}

export interface SecurityPolicy {
  requireStrongPassword: boolean;
  minPasswordLength: number;
  passwordExpiryDays: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
  disallowPersonalData: boolean;
  blockedPasswords: string[];
  forcePasswordChangeOnFirstAccess: boolean;
  adminResetPasswordTtlHours: number;
  idleTimeoutMinutes: number;
  twoFactorEnabled: boolean;
}

export type AccessStatus = 'SUCESSO' | 'FALHA' | 'BLOQUEADO';

export interface AccessLog {
  id: string;
  tenant_id: string;
  user_id?: string;
  /** Nome de quem agiu, como a API devolve em /api/access-logs (null: sem usuário, como um login que falhou). */
  user_name?: string | null;
  action: string;
  module: string;
  platform: Platform;
  ip_address: string;
  created_at: string;
  status: AccessStatus;
}

interface TenantData {
  tenantId: string;
  active: boolean;
  users: UserRecord[];
  permissions: Record<Role, Permission[]>;
  securityPolicy: SecurityPolicy;
  accessLogs: AccessLog[];
}

const TENANT_REGISTRY_KEY = 'cuidai_tenants';
const DEFAULT_TENANT = 'clinicaunimed';
const IP_PLACEHOLDER = '127.0.0.1';

const MODULES = [
  'Dashboard',
  'Monitoramento IA',
  'Alertas Clinicos',
  'Prontuario (PEP)',
  'Pacientes',
  'Leitos e Quartos',
  'Agendamentos',
  'Relatorios',
  'Configuracoes',
  'Usuarios',
  'Gestao Hospitalar',
  'Financeiro',
  'Estoque',
  'Recursos Humanos'
];

const ROLE_LABELS: Record<Role, string> = {
  SYSTEM: 'Sistema',
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  DOCTOR: 'Médico',
  NURSE: 'Enfermeiro',
  ADMINISTRATIVE: 'Administrativo',
  PATIENT: 'Paciente',
  VISITOR: 'Visitante',
  TCC: 'TCC (banca)'
};

const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_PASSWORD_BLOCKLIST = [
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'qwerty',
  'abc123',
  'admin',
  'senha123',
  'senha@123',
  'welcome',
  'letmein',
  '111111',
  '000000'
];

const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  requireStrongPassword: true,
  minPasswordLength: 8,
  passwordExpiryDays: 0,
  maxFailedAttempts: 5,
  lockoutMinutes: 5,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  disallowPersonalData: true,
  blockedPasswords: DEFAULT_PASSWORD_BLOCKLIST,
  forcePasswordChangeOnFirstAccess: true,
  adminResetPasswordTtlHours: 24,
  idleTimeoutMinutes: 30,
  twoFactorEnabled: false
};

const nowIso = () => new Date().toISOString();

const getTenantKey = (tenantId: string) => `cuidai_tenant_${tenantId}`;

export const getRoleLabel = (role: Role) => ROLE_LABELS[role];

export const getModules = () => [...MODULES];

export const getDefaultPermissions = (): Record<Role, Permission[]> => {
  const fullAccess = MODULES.map((module) => ({
    module,
    view: true,
    create: true,
    edit: true,
    delete: true,
    web: true,
    app: true
  }));

  const viewOnly = (module: string, web: boolean, app: boolean): Permission => ({
    module,
    view: true,
    create: false,
    edit: false,
    delete: false,
    web,
    app
  });

  return {
    SYSTEM: fullAccess,
    ADMIN: fullAccess,
    MANAGER: [
      viewOnly('Dashboard', true, false),
      viewOnly('Monitoramento IA', true, false),
      viewOnly('Alertas Clinicos', true, false),
      viewOnly('Prontuario (PEP)', true, false),
      viewOnly('Pacientes', true, false),
      viewOnly('Leitos e Quartos', true, false),
      viewOnly('Agendamentos', true, false),
      viewOnly('Relatorios', true, false),
      viewOnly('Configuracoes', false, false),
      viewOnly('Usuarios', false, false),
      viewOnly('Gestao Hospitalar', true, false),
      viewOnly('Financeiro', true, false),
      viewOnly('Estoque', true, false),
      viewOnly('Recursos Humanos', true, false)
    ],
    DOCTOR: [
      viewOnly('Dashboard', true, true),
      viewOnly('Monitoramento IA', true, true),
      { ...viewOnly('Alertas Clinicos', true, true), edit: true },
      { ...viewOnly('Prontuario (PEP)', true, true), edit: true },
      { ...viewOnly('Pacientes', true, false), edit: true },
      viewOnly('Leitos e Quartos', true, false),
      { ...viewOnly('Agendamentos', true, true), edit: true },
      viewOnly('Relatorios', true, false),
      viewOnly('Configuracoes', false, false),
      viewOnly('Usuarios', false, false),
      viewOnly('Gestao Hospitalar', false, false),
      viewOnly('Financeiro', false, false),
      viewOnly('Estoque', false, false),
      viewOnly('Recursos Humanos', false, false)
    ],
    NURSE: [
      viewOnly('Dashboard', true, true),
      { ...viewOnly('Monitoramento IA', true, true), edit: true },
      { ...viewOnly('Alertas Clinicos', true, true), edit: true },
      { ...viewOnly('Prontuario (PEP)', true, true), edit: true },
      viewOnly('Pacientes', true, true),
      { ...viewOnly('Leitos e Quartos', true, false), edit: true },
      viewOnly('Agendamentos', true, true),
      viewOnly('Relatorios', false, false),
      viewOnly('Configuracoes', false, false),
      viewOnly('Usuarios', false, false),
      viewOnly('Gestao Hospitalar', false, false),
      viewOnly('Financeiro', false, false),
      viewOnly('Estoque', false, false),
      viewOnly('Recursos Humanos', false, false)
    ],
    ADMINISTRATIVE: [
      viewOnly('Dashboard', true, false),
      viewOnly('Monitoramento IA', false, false),
      viewOnly('Alertas Clinicos', false, false),
      viewOnly('Prontuario (PEP)', false, false),
      viewOnly('Pacientes', true, false),
      viewOnly('Leitos e Quartos', true, false),
      { ...viewOnly('Agendamentos', true, false), edit: true, create: true },
      { ...viewOnly('Relatorios', true, false), edit: true },
      viewOnly('Configuracoes', false, false),
      viewOnly('Usuarios', false, false),
      { ...viewOnly('Gestao Hospitalar', true, false), edit: true },
      { ...viewOnly('Financeiro', true, false), edit: true },
      { ...viewOnly('Estoque', true, false), edit: true },
      { ...viewOnly('Recursos Humanos', true, false), edit: true }
    ],
    PATIENT: [
      viewOnly('Dashboard', false, true),
      viewOnly('Monitoramento IA', false, false),
      viewOnly('Alertas Clinicos', false, true),
      viewOnly('Prontuario (PEP)', false, true),
      viewOnly('Pacientes', false, false),
      viewOnly('Leitos e Quartos', false, false),
      viewOnly('Agendamentos', false, true),
      viewOnly('Relatorios', false, false),
      viewOnly('Configuracoes', false, false),
      viewOnly('Usuarios', false, false),
      viewOnly('Gestao Hospitalar', false, false),
      viewOnly('Financeiro', false, false),
      viewOnly('Estoque', false, false),
      viewOnly('Recursos Humanos', false, false)
    ],
    VISITOR: [
      viewOnly('Dashboard', false, true),
      viewOnly('Monitoramento IA', false, false),
      viewOnly('Alertas Clinicos', false, true),
      viewOnly('Prontuario (PEP)', false, false),
      viewOnly('Pacientes', false, false),
      viewOnly('Leitos e Quartos', false, false),
      viewOnly('Agendamentos', false, false),
      viewOnly('Relatorios', false, false),
      viewOnly('Configuracoes', false, false),
      viewOnly('Usuarios', false, false),
      viewOnly('Gestao Hospitalar', false, false),
      viewOnly('Financeiro', false, false),
      viewOnly('Estoque', false, false),
      viewOnly('Recursos Humanos', false, false)
    ],
    // Só o rótulo de módulo antigo deste arquivo; quem vale é a matriz do
    // banco (db/init/02_perfis.sql), que a API devolve.
    TCC: [
      viewOnly('Dashboard', true, false),
      { ...viewOnly('Monitoramento IA', true, false), edit: true },
      { ...viewOnly('Alertas Clinicos', true, false), edit: true },
      { ...viewOnly('Prontuario (PEP)', false, false), view: false },
      { ...viewOnly('Pacientes', true, false), create: true, edit: true },
      viewOnly('Leitos e Quartos', true, false),
      { ...viewOnly('Agendamentos', false, false), view: false },
      viewOnly('Relatorios', true, false),
      viewOnly('Configuracoes', true, false),
      viewOnly('Usuarios', true, false),
      { ...viewOnly('Gestao Hospitalar', false, false), view: false },
      { ...viewOnly('Financeiro', false, false), view: false },
      { ...viewOnly('Estoque', false, false), view: false },
      { ...viewOnly('Recursos Humanos', false, false), view: false }
    ]
  };
};

export const getTenantRegistry = (): { id: string; active: boolean }[] => {
  const raw = localStorage.getItem(TENANT_REGISTRY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const saveTenantRegistry = (tenants: { id: string; active: boolean }[]) => {
  localStorage.setItem(TENANT_REGISTRY_KEY, JSON.stringify(tenants));
};

export const ensureTenantExists = (tenantId: string) => {
  const tenants = getTenantRegistry();
  if (!tenants.find((tenant) => tenant.id === tenantId)) {
    tenants.push({ id: tenantId, active: true });
    saveTenantRegistry(tenants);
  }
};

export const getTenantData = (tenantId: string): TenantData => {
  const raw = localStorage.getItem(getTenantKey(tenantId));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as TenantData;
      const sanitizedPolicy = sanitizeSecurityPolicy(parsed.securityPolicy);
      if (JSON.stringify(sanitizedPolicy) !== JSON.stringify(parsed.securityPolicy)) {
        parsed.securityPolicy = sanitizedPolicy;
        saveTenantData(tenantId, parsed);
      }
      return parsed;
    } catch {
      localStorage.removeItem(getTenantKey(tenantId));
    }
  }

  const initialData = seedTenant(tenantId);
  saveTenantData(tenantId, initialData);
  return initialData;
};

export const saveTenantData = (tenantId: string, data: TenantData) => {
  localStorage.setItem(getTenantKey(tenantId), JSON.stringify(data));
};

export const seedTenant = (tenantId: string): TenantData => {
  ensureTenantExists(tenantId);
  const systemLogin = `sistema.${tenantId}`;
  const systemUser: UserRecord = {
    id: `system-${tenantId}`,
    tenantId,
    name: `Usuario Sistema (${tenantId})`,
    email: `sistema@${tenantId}.com`,
    login: systemLogin,
    // A senha vive só no backend (bcrypt, `senha_hash`); a API devolve "" aqui.
    passwordHash: '',
    role: 'SYSTEM',
    status: 'active',
    platforms: ['web'],
    unit: 'Sistema',
    createdAt: nowIso(),
    failedAttempts: 0,
    isSystemUser: true
  };

  return {
    tenantId,
    active: true,
    users: [systemUser],
    permissions: getDefaultPermissions(),
    securityPolicy: { ...DEFAULT_SECURITY_POLICY },
    accessLogs: []
  };
};

export const initializeDefaults = () => {
  const tenants = getTenantRegistry();
  if (!tenants.length) {
    saveTenantRegistry([{ id: DEFAULT_TENANT, active: true }]);
    if (!localStorage.getItem(getTenantKey(DEFAULT_TENANT))) {
      saveTenantData(DEFAULT_TENANT, seedTenant(DEFAULT_TENANT));
    }
  }
};

export const isTenantActive = (tenantId: string): boolean => {
  const registry = getTenantRegistry();
  const match = registry.find((tenant) => tenant.id === tenantId);
  return !!match?.active;
};

export const listUsers = (tenantId: string): UserRecord[] => {
  return getTenantData(tenantId).users;
};

export const addUser = (tenantId: string, user: UserRecord) => {
  const data = getTenantData(tenantId);
  data.users = [...data.users, user];
  saveTenantData(tenantId, data);
};

export const updateUser = (tenantId: string, user: UserRecord) => {
  const data = getTenantData(tenantId);
  data.users = data.users.map((existing) => (existing.id === user.id ? user : existing));
  saveTenantData(tenantId, data);
};

export const deleteUser = (tenantId: string, userId: string): boolean => {
  const data = getTenantData(tenantId);
  const target = data.users.find((user) => user.id === userId);
  if (target?.isSystemUser) {
    return false;
  }
  data.users = data.users.filter((user) => user.id !== userId);
  saveTenantData(tenantId, data);
  return true;
};

export const addAccessLog = (tenantId: string, log: Omit<AccessLog, 'id' | 'tenant_id' | 'created_at'>) => {
  const data = getTenantData(tenantId);
  const entry: AccessLog = {
    ...log,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenant_id: tenantId,
    created_at: nowIso()
  };
  data.accessLogs = [entry, ...data.accessLogs];
  saveTenantData(tenantId, data);
};

export const listAccessLogs = (tenantId: string): AccessLog[] => {
  return getTenantData(tenantId).accessLogs;
};

export const getSecurityPolicy = (tenantId: string): SecurityPolicy => {
  return getTenantData(tenantId).securityPolicy;
};

export const updateSecurityPolicy = (tenantId: string, policy: SecurityPolicy) => {
  const data = getTenantData(tenantId);
  data.securityPolicy = sanitizeSecurityPolicy(policy);
  saveTenantData(tenantId, data);
};

export const getPermissions = (tenantId: string, role: Role): Permission[] => {
  const data = getTenantData(tenantId);
  if (!data.permissions[role]) {
    const defaults = getDefaultPermissions();
    data.permissions[role] = defaults[role] || [];
    saveTenantData(tenantId, data);
  }
  return data.permissions[role] || [];
};

export const updatePermissions = (tenantId: string, role: Role, permissions: Permission[]) => {
  const data = getTenantData(tenantId);
  data.permissions[role] = permissions;
  saveTenantData(tenantId, data);
};

export const getIpAddress = () => IP_PLACEHOLDER;

export const isPasswordStrong = (password: string, policy: SecurityPolicy) => {
  const normalizedPolicy = sanitizeSecurityPolicy(policy);
  if (!normalizedPolicy.requireStrongPassword) return true;
  const result = evaluatePasswordPolicy(password, null, normalizedPolicy);
  return result.isValid;
};

const normalizeComparableValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const splitNameTokens = (name?: string) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .map((part) => normalizeComparableValue(part))
    .filter((part) => part.length >= 3);

const extractComparableTokens = (
  context: {
    login?: string;
    username?: string;
    name?: string;
    birthDate?: string;
    admissionDate?: string;
    cpf?: string;
    documentId?: string;
  } | null
) => {
  if (!context) return [];
  const direct = [
    context.login,
    context.username,
    context.birthDate,
    context.admissionDate,
    context.cpf,
    context.documentId
  ]
    .map((value) => normalizeComparableValue(String(value || '')))
    .filter(Boolean);

  return [...direct, ...splitNameTokens(context.name)];
};

export const sanitizeSecurityPolicy = (policy?: Partial<SecurityPolicy> | null): SecurityPolicy => {
  const candidate = policy || {};
  const minPasswordLength = Math.max(MIN_PASSWORD_LENGTH, Number(candidate.minPasswordLength || MIN_PASSWORD_LENGTH));
  const blockedPasswords = Array.isArray(candidate.blockedPasswords)
    ? candidate.blockedPasswords
    : DEFAULT_PASSWORD_BLOCKLIST;
  return {
    requireStrongPassword: candidate.requireStrongPassword ?? true,
    minPasswordLength,
    passwordExpiryDays: Math.max(0, Number(candidate.passwordExpiryDays ?? 0)),
    maxFailedAttempts: Math.max(1, Number(candidate.maxFailedAttempts ?? 5)),
    lockoutMinutes: Math.max(1, Number(candidate.lockoutMinutes ?? 5)),
    requireLowercase: candidate.requireLowercase ?? true,
    requireUppercase: candidate.requireUppercase ?? true,
    requireNumber: candidate.requireNumber ?? true,
    requireSpecialChar: candidate.requireSpecialChar ?? true,
    disallowPersonalData: candidate.disallowPersonalData ?? true,
    blockedPasswords: Array.from(new Set(blockedPasswords.map((item) => normalizeComparableValue(String(item || ''))).filter(Boolean))),
    forcePasswordChangeOnFirstAccess: candidate.forcePasswordChangeOnFirstAccess ?? true,
    adminResetPasswordTtlHours: Math.max(1, Number(candidate.adminResetPasswordTtlHours ?? 24)),
    idleTimeoutMinutes: Math.max(1, Number(candidate.idleTimeoutMinutes ?? 30)),
    twoFactorEnabled: candidate.twoFactorEnabled ?? false
  };
};

export const evaluatePasswordPolicy = (
  password: string,
  context: {
    login?: string;
    username?: string;
    name?: string;
    birthDate?: string;
    admissionDate?: string;
    cpf?: string;
    documentId?: string;
  } | null,
  policy: SecurityPolicy
) => {
  const normalizedPolicy = sanitizeSecurityPolicy(policy);
  if (!normalizedPolicy.requireStrongPassword) {
    return {
      isValid: true,
      errors: [],
      checks: {
        hasMinLength: true,
        hasLower: true,
        hasUpper: true,
        hasNumber: true,
        hasSpecial: true,
        inBlocklist: false,
        reusesPersonalData: false
      }
    };
  }
  const passwordValue = String(password || '');
  const comparablePassword = normalizeComparableValue(passwordValue);
  const hasMinLength = passwordValue.length >= normalizedPolicy.minPasswordLength;
  const hasLower = /[a-z]/.test(passwordValue);
  const hasUpper = /[A-Z]/.test(passwordValue);
  const hasNumber = /\d/.test(passwordValue);
  const hasSpecial = /[^A-Za-z0-9]/.test(passwordValue);
  const inBlocklist = normalizedPolicy.blockedPasswords.includes(comparablePassword);
  const personalTokens = extractComparableTokens(context);
  const reusesPersonalData =
    normalizedPolicy.disallowPersonalData &&
    personalTokens.some((token) => token.length >= 3 && comparablePassword.includes(token));

  const checks = {
    hasMinLength,
    hasLower,
    hasUpper,
    hasNumber,
    hasSpecial,
    inBlocklist,
    reusesPersonalData
  };

  const errors: string[] = [];
  if (!hasMinLength) errors.push(`A senha deve ter no minimo ${normalizedPolicy.minPasswordLength} caracteres.`);
  if (normalizedPolicy.requireLowercase && !hasLower) errors.push('A senha deve conter pelo menos 1 letra minuscula.');
  if (normalizedPolicy.requireUppercase && !hasUpper) errors.push('A senha deve conter pelo menos 1 letra maiuscula.');
  if (normalizedPolicy.requireNumber && !hasNumber) errors.push('A senha deve conter pelo menos 1 digito.');
  if (normalizedPolicy.requireSpecialChar && !hasSpecial) errors.push('A senha deve conter pelo menos 1 caractere especial.');
  if (inBlocklist) errors.push('Essa senha e fraca e apareceu em vazamentos de dados anteriores.');
  if (reusesPersonalData) errors.push('A senha nao pode ser igual ou baseada em dados pessoais do usuario.');

  return {
    isValid: errors.length === 0,
    errors,
    checks
  };
};

export const isPasswordExpired = (user: UserRecord, policy: SecurityPolicy) => {
  if (!policy.passwordExpiryDays || !user.passwordChangedAt) return false;
  const changedAt = new Date(user.passwordChangedAt).getTime();
  const expiry = changedAt + policy.passwordExpiryDays * 24 * 60 * 60 * 1000;
  return Date.now() > expiry;
};

export const isUserLocked = (user: UserRecord) => {
  if (!user.lockedUntil) return false;
  return Date.now() < new Date(user.lockedUntil).getTime();
};

export const registerFailedAttempt = (tenantId: string, user: UserRecord, policy: SecurityPolicy) => {
  const normalizedPolicy = sanitizeSecurityPolicy(policy);
  const now = Date.now();
  const existingWindow = user.failedAttemptWindowStartedAt ? new Date(user.failedAttemptWindowStartedAt).getTime() : 0;
  const windowLimitMs = normalizedPolicy.lockoutMinutes * 60 * 1000;
  const windowExpired = !existingWindow || now - existingWindow > windowLimitMs;
  const attempts = windowExpired ? 1 : user.failedAttempts + 1;

  const updated: UserRecord = {
    ...user,
    failedAttempts: attempts,
    failedAttemptWindowStartedAt: windowExpired ? new Date(now).toISOString() : user.failedAttemptWindowStartedAt
  };
  if (updated.failedAttempts >= normalizedPolicy.maxFailedAttempts) {
    updated.status = 'blocked';
    updated.lockedUntil = new Date(now + normalizedPolicy.lockoutMinutes * 60 * 1000).toISOString();
  }
  updateUser(tenantId, updated);
  return updated;
};

export const clearFailedAttempts = (tenantId: string, user: UserRecord) => {
  if (user.failedAttempts === 0 && !user.lockedUntil && !user.failedAttemptWindowStartedAt) return user;
  const updated = { ...user, failedAttempts: 0, failedAttemptWindowStartedAt: undefined, lockedUntil: undefined };
  updateUser(tenantId, updated);
  return updated;
};

export const isTemporaryPasswordExpired = (user: UserRecord) => {
  if (!user.temporaryPasswordExpiresAt) return false;
  return Date.now() > new Date(user.temporaryPasswordExpiresAt).getTime();
};

/**
 * Inteiro uniforme em [0, limite). Descarta os valores que sobrariam no fim do
 * intervalo de 32 bits para que nenhum índice saia mais provável que outro
 * (viés de módulo).
 */
const randomIndex = (limite: number): number => {
  const faixa = 0x100000000;
  const maximo = faixa - (faixa % limite);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= maximo);
  return buffer[0] % limite;
};

export const generateRandomPassword = (policy: SecurityPolicy) => {
  const normalizedPolicy = sanitizeSecurityPolicy(policy);
  const length = Math.max(normalizedPolicy.minPasswordLength, 12);
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const uppers = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const specials = '!@#$%&*()-_=+?';

  const all = `${lowers}${uppers}${numbers}${specials}`;
  const picks: string[] = [];

  // Senha temporária é segredo: o sorteio vem do gerador criptográfico do
  // navegador (crypto.getRandomValues), não de Math.random(), que é previsível.
  const pick = (source: string) => source[randomIndex(source.length)];

  if (normalizedPolicy.requireLowercase) picks.push(pick(lowers));
  if (normalizedPolicy.requireUppercase) picks.push(pick(uppers));
  if (normalizedPolicy.requireNumber) picks.push(pick(numbers));
  if (normalizedPolicy.requireSpecialChar) picks.push(pick(specials));

  while (picks.length < length) {
    picks.push(pick(all));
  }

  for (let i = picks.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }

  return picks.join('');
};

export const buildUserAvatar = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export const createUserId = () => `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const formatRoleOptions = (): { value: Role; label: string }[] => {
  return (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({
    value: role,
    label: ROLE_LABELS[role]
  }));
};

export const getTenantName = (tenantId: string) => tenantId;
