import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Shield,
  Clock,
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  Search,
  Filter,
  AlertTriangle,
  Eye,
  Lock,
  Smartphone,
  Monitor,
  ChevronDown,
  ChevronRight,
  Save
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSystemToast } from './ui/SystemToast';
import {
  createUserId,
  evaluatePasswordPolicy,
  formatRoleOptions,
  generateRandomPassword,
  getIpAddress,
  getSystemDefaultPassword,
  getTenantName,
  hashPassword,
  sanitizeSecurityPolicy,
  type AccessLog,
  type Permission,
  type Role,
  type SecurityPolicy,
  type UserRecord
} from '../data/authStore';
import {
  createUser,
  deleteUserRequest,
  fetchAccessLogs,
  fetchPermissions,
  fetchSecurityPolicy,
  fetchUsers,
  recordAccessLog,
  savePermissions,
  saveSecurityPolicy,
  updateUserRequest
} from '../data/api';

type UserTab = 'users' | 'permissions' | 'access-history' | 'security';

const roleOptions = formatRoleOptions();
const statusLabels = {
  active: 'Ativo',
  inactive: 'Inativo',
  blocked: 'Bloqueado'
};

const accessStatusConfig = {
  SUCESSO: { color: 'bg-green-100 text-green-700', label: 'Sucesso' },
  FALHA: { color: 'bg-red-100 text-red-700', label: 'Falha' },
  BLOQUEADO: { color: 'bg-orange-100 text-orange-700', label: 'Bloqueado' }
};

const profileOrder: Role[] = [
  'SYSTEM',
  'ADMIN',
  'MANAGER',
  'DOCTOR',
  'NURSE',
  'ADMINISTRATIVE',
  'PATIENT',
  'VISITOR'
];

const profileMeta: Record<Role, { title: string; description: string; color: string; icon: React.ReactNode }> = {
  SYSTEM: {
    title: 'Sistema',
    description: 'Acesso total e governanca global',
    color: 'bg-slate-50 border-slate-200 text-slate-700',
    icon: <Shield className="w-5 h-5" />
  },
  ADMIN: {
    title: 'Administrador',
    description: 'Acesso total ao sistema',
    color: 'bg-red-50 border-red-200 text-red-700',
    icon: <Shield className="w-5 h-5" />
  },
  MANAGER: {
    title: 'Gestor',
    description: 'Gestao de unidade e relatorios',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    icon: <Users className="w-5 h-5" />
  },
  DOCTOR: {
    title: 'Medico',
    description: 'Acesso clinico completo',
    color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    icon: <Users className="w-5 h-5" />
  },
  NURSE: {
    title: 'Enfermeiro',
    description: 'Monitoramento e alertas',
    color: 'bg-green-50 border-green-200 text-green-700',
    icon: <Users className="w-5 h-5" />
  },
  ADMINISTRATIVE: {
    title: 'Administrativo',
    description: 'Operacoes administrativas',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    icon: <Users className="w-5 h-5" />
  },
  PATIENT: {
    title: 'Paciente',
    description: 'App mobile apenas',
    color: 'bg-pink-50 border-pink-200 text-pink-700',
    icon: <Smartphone className="w-5 h-5" />
  },
  VISITOR: {
    title: 'Visitante',
    description: 'Acompanhamento limitado',
    color: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    icon: <Eye className="w-5 h-5" />
  }
};

const permissionLabels: Record<keyof Permission, string> = {
  module: 'Modulo',
  view: 'Visualizar',
  create: 'Criar',
  edit: 'Editar',
  delete: 'Excluir',
  web: 'Web',
  app: 'App'
};

const normalizeLogin = (value: string) => value.trim().toLowerCase();

const emptyForm = (tenantId: string | null) => ({
  id: '',
  name: '',
  email: '',
  cpf: '',
  birthDate: '',
  admissionDate: '',
  documentId: '',
  login: '',
  password: '',
  confirmPassword: '',
  adminResetPassword: false,
  role: 'ADMIN' as Role,
  unit: '',
  sector: '',
  status: 'active' as UserRecord['status'],
  platforms: { web: true, app: false },
  tenantId
});

export function UsersScreen() {
  const { tenantId, user: currentUser } = useAuth();
  const { showToast } = useSystemToast();
  const [currentTab, setCurrentTab] = useState<UserTab>('users');
  const [selectedRole, setSelectedRole] = useState<Role>('ADMIN');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [expandedPermissions, setExpandedPermissions] = useState(true);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [formState, setFormState] = useState(() => emptyForm(tenantId));
  const [isEditing, setIsEditing] = useState(false);

  const systemLogin = tenantId ? `sistema.${tenantId}` : 'sistema';
  const systemUser = useMemo(() => users.find((u) => u.isSystemUser), [users]);
  const isSystemEditor = currentUser?.role === 'SYSTEM';
  const canEditPermissions = isSystemEditor || (currentUser?.role === 'ADMIN' && selectedRole !== 'SYSTEM');

  useEffect(() => {
    if (!tenantId) return;
    fetchUsers(tenantId)
      .then(setUsers)
      .catch(() => showToast({ message: 'Não foi possível carregar os usuários.' }));
    fetchPermissions(tenantId, selectedRole)
      .then(setPermissions)
      .catch(() => showToast({ message: 'Não foi possível carregar as permissões.' }));
    fetchAccessLogs(tenantId)
      .then(setAccessLogs)
      .catch(() => showToast({ message: 'Não foi possível carregar os logs de acesso.' }));
    fetchSecurityPolicy(tenantId)
      .then((loadedPolicy) => setPolicy(sanitizeSecurityPolicy(loadedPolicy)))
      .catch(() => showToast({ message: 'Não foi possível carregar a política de segurança.' }));
    setFormState(emptyForm(tenantId));
  }, [tenantId, selectedRole]);

  useEffect(() => {
    if (currentTab !== 'security' || isSystemEditor) return;
    showToast({ variant: 'warning', message: 'Apenas o usuário Sistema pode alterar políticas de segurança.' });
  }, [currentTab, isSystemEditor, showToast]);

  const openNewUserModal = () => {
    setIsEditing(false);
    setFormState({
      ...emptyForm(tenantId),
      unit: getTenantName(tenantId || '')
    });
    setShowUserModal(true);
  };

  const openEditUserModal = (user: UserRecord) => {
    setIsEditing(true);
    setFormState({
      id: user.id,
      name: user.name,
      email: user.email,
      cpf: user.cpf || '',
      birthDate: user.birthDate || '',
      admissionDate: user.admissionDate || '',
      documentId: user.documentId || '',
      login: user.login,
      password: '',
      confirmPassword: '',
      adminResetPassword: false,
      role: user.role,
      unit: user.unit,
      sector: user.sector || '',
      status: user.status,
      platforms: {
        web: user.platforms.includes('web'),
        app: user.platforms.includes('app')
      },
      tenantId: user.tenantId
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!tenantId || !policy) return;
    const normalizedLogin = normalizeLogin(formState.login);
    const isSystemRole = formState.role === 'SYSTEM';

    if (!formState.name || !formState.email || !normalizedLogin) {
      showToast({ message: 'Preencha os campos obrigatórios.' });
      return;
    }

    if (isSystemRole) {
      if (systemUser && (!isEditing || formState.id !== systemUser.id)) {
        showToast({ message: 'O usuário Sistema já existe para este tenant.' });
        return;
      }
      if (normalizedLogin !== systemLogin) {
        showToast({ message: `Login do usuário Sistema deve ser ${systemLogin}.` });
        return;
      }
    }

    if (!isEditing && !formState.password) {
      showToast({ message: 'Informe uma senha inicial.' });
      return;
    }

    if (formState.password && formState.password !== formState.confirmPassword) {
      showToast({ message: 'As senhas não conferem.' });
      return;
    }

    const passwordCandidate = formState.password;
    if (passwordCandidate) {
      const validation = evaluatePasswordPolicy(
        passwordCandidate,
        {
          login: normalizedLogin,
          username: normalizedLogin,
          name: formState.name,
          birthDate: formState.birthDate,
          admissionDate: formState.admissionDate,
          cpf: formState.cpf,
          documentId: formState.documentId
        },
        policy
      );
      if (!validation.isValid) {
        showToast({ message: validation.errors[0] || 'A senha não atende à política de segurança.' });
        return;
      }
    }

    if (!formState.platforms.web && !formState.platforms.app) {
      showToast({ message: 'Selecione pelo menos uma plataforma.' });
      return;
    }

    const now = new Date().toISOString();

    try {
      const adminResetPassword = isEditing && formState.adminResetPassword;
      const generatedPassword = adminResetPassword ? generateRandomPassword(policy) : '';
      const effectivePassword = adminResetPassword ? generatedPassword : formState.password;
      const mustChangePassword = policy.forcePasswordChangeOnFirstAccess && Boolean(effectivePassword);
      const temporaryPasswordExpiresAt = adminResetPassword
        ? new Date(Date.now() + policy.adminResetPasswordTtlHours * 60 * 60 * 1000).toISOString()
        : undefined;

      if (isEditing) {
        const existing = users.find((u) => u.id === formState.id);
        if (!existing) return;
        if (existing.isSystemUser && !isSystemEditor) {
          showToast({ message: 'Usuário Sistema não pode ser alterado.' });
          return;
        }

        const updated: UserRecord = {
          ...existing,
          name: formState.name,
          email: formState.email,
          cpf: formState.cpf || undefined,
          birthDate: formState.birthDate || undefined,
          admissionDate: formState.admissionDate || undefined,
          documentId: formState.documentId || undefined,
          login: normalizedLogin,
          role: formState.role,
          status: existing.isSystemUser ? existing.status : formState.status,
          unit: formState.unit,
          sector: formState.sector || undefined,
          platforms: [
            ...(formState.platforms.web ? ['web'] : []),
            ...(formState.platforms.app ? ['app'] : [])
          ],
          passwordHash: effectivePassword ? hashPassword(effectivePassword) : existing.passwordHash,
          passwordChangedAt: effectivePassword ? now : existing.passwordChangedAt,
          mustChangePassword: effectivePassword ? mustChangePassword : existing.mustChangePassword,
          temporaryPasswordExpiresAt: effectivePassword ? temporaryPasswordExpiresAt : existing.temporaryPasswordExpiresAt
        };

        await updateUserRequest(tenantId, updated.id, {
          ...updated,
          password: effectivePassword || undefined
        });
        const refreshed = await fetchUsers(tenantId);
        setUsers(refreshed);
        if (adminResetPassword) {
          showToast({ message: `Senha temporária aleatória gerada. Ela expira em ${policy.adminResetPasswordTtlHours}h e exigirá troca no primeiro acesso.` });
        }
        recordAccessLog(tenantId, {
          user_id: currentUser?.id,
          action: adminResetPassword ? 'Reset administrativo de senha' : 'Alteracao de usuario',
          module: 'Usuarios',
          platform: 'web',
          status: 'SUCESSO',
          ip_address: getIpAddress()
        });
      } else {
        const existingLogin = users.find((u) => u.login === normalizedLogin);
        if (existingLogin) {
          showToast({ message: 'Login já utilizado.' });
          return;
        }

        const newUser: UserRecord = {
          id: createUserId(),
          tenantId,
          name: formState.name,
          email: formState.email,
          cpf: formState.cpf || undefined,
          birthDate: formState.birthDate || undefined,
          admissionDate: formState.admissionDate || undefined,
          documentId: formState.documentId || undefined,
          login: normalizedLogin,
          passwordHash: hashPassword(effectivePassword),
          role: formState.role,
          status: formState.status,
          platforms: [
            ...(formState.platforms.web ? ['web'] : []),
            ...(formState.platforms.app ? ['app'] : [])
          ],
          unit: formState.unit,
          sector: formState.sector || undefined,
          createdAt: now,
          passwordChangedAt: now,
          mustChangePassword,
          temporaryPasswordExpiresAt,
          failedAttempts: 0,
          isSystemUser: formState.role === 'SYSTEM'
        };
        await createUser(tenantId, {
          ...newUser,
          password: effectivePassword
        });
        const refreshed = await fetchUsers(tenantId);
        setUsers(refreshed);
        recordAccessLog(tenantId, {
          user_id: currentUser?.id,
          action: 'Criacao de usuario',
          module: 'Usuarios',
          platform: 'web',
          status: 'SUCESSO',
          ip_address: getIpAddress()
        });
      }

      setShowUserModal(false);
    } catch (error) {
      showToast({ message: 'Não foi possível salvar o usuário.' });
    }
  };

  const handleDeleteUser = async (user: UserRecord) => {
    if (!tenantId) return;
    if (user.isSystemUser) return;
    try {
      await deleteUserRequest(tenantId, user.id);
      const refreshed = await fetchUsers(tenantId);
      setUsers(refreshed);
      recordAccessLog(tenantId, {
        user_id: currentUser?.id,
        action: 'Exclusao de usuario',
        module: 'Usuarios',
        platform: 'web',
        status: 'SUCESSO',
        ip_address: getIpAddress()
      });
    } catch (error) {
      showToast({ message: 'Não foi possível excluir o usuário.' });
    }
  };

  const handleTogglePermission = async (index: number, key: keyof Permission) => {
    if (!tenantId || !canEditPermissions) return;
    const previous = permissions;
    const target = previous[index];
    if (!target) return;
    const before = target[key] as boolean;
    const after = !before;
    const updated = { ...target, [key]: after };
    const next = previous.map((perm, idx) => (idx === index ? updated : perm));
    setPermissions(next);

    try {
      await savePermissions(tenantId, selectedRole, next);
      const impacted = users.filter((u) => u.role === selectedRole).length;
      const profileLabel = profileMeta[selectedRole]?.title || selectedRole;
      const label = permissionLabels[key] || String(key);

      recordAccessLog(tenantId, {
        user_id: currentUser?.id,
        action: `Alteracao permissao | Perfil: ${profileLabel} | Modulo: ${target.module} | ${label}: ${before ? 'ativo' : 'inativo'} -> ${after ? 'ativo' : 'inativo'} | Impacto: ${impacted} usuarios`,
        module: 'Permissoes',
        platform: 'web',
        status: 'SUCESSO',
        ip_address: getIpAddress()
      });
    } catch (error) {
      showToast({ message: 'Não foi possível salvar as permissões.' });
      setPermissions(previous);
    }
  };

  const handleSavePermissions = async () => {
    if (!tenantId) return;
    if (!canEditPermissions) return;
    try {
      await savePermissions(tenantId, selectedRole, permissions);
      recordAccessLog(tenantId, {
        user_id: currentUser?.id,
        action: 'Salvar permissoes do perfil',
        module: 'Permissoes',
        platform: 'web',
        status: 'SUCESSO',
        ip_address: getIpAddress()
      });
    } catch (error) {
      showToast({ message: 'Não foi possível salvar as permissões.' });
    }
  };

  const handleSavePolicy = async () => {
    if (!tenantId || !policy) return;
    if (!isSystemEditor) return;
    const normalizedPolicy = sanitizeSecurityPolicy(policy);
    try {
      await saveSecurityPolicy(tenantId, normalizedPolicy);
      setPolicy(normalizedPolicy);
      recordAccessLog(tenantId, {
        user_id: currentUser?.id,
        action: 'Alteracao de politica de senha',
        module: 'Seguranca',
        platform: 'web',
        status: 'SUCESSO',
        ip_address: getIpAddress()
      });
    } catch (error) {
      showToast({ message: 'Não foi possível salvar a política de segurança.' });
    }
  };

  const tabs = [
    { id: 'users' as const, label: 'Usuarios', icon: Users },
    { id: 'permissions' as const, label: 'Perfis e Permissoes', icon: Shield },
    { id: 'access-history' as const, label: 'Historico de Acessos', icon: Clock },
    { id: 'security' as const, label: 'Seguranca', icon: Lock }
  ];

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedUsers = users.filter((user) => user.role === selectedRole);
  const selectedProfile = profileMeta[selectedRole];
  const policyForUi = policy ? sanitizeSecurityPolicy(policy) : null;
  const passwordGuide = evaluatePasswordPolicy(
    formState.password,
    {
      login: normalizeLogin(formState.login),
      username: normalizeLogin(formState.login),
      name: formState.name,
      birthDate: formState.birthDate,
      admissionDate: formState.admissionDate,
      cpf: formState.cpf,
      documentId: formState.documentId
    },
    policyForUi || sanitizeSecurityPolicy(null)
  );

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-gray-800 mb-1">Usuarios</h1>
          </div>
          {currentTab === 'users' && (
            <button
              onClick={openNewUserModal}
              className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Usuario
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  currentTab === tab.id
                    ? 'border-[#0EA5E9] text-[#0A7EA4]'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {currentTab === 'users' && (
        <div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou e-mail..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                />
              </div>
              <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                <option>Todos os perfis</option>
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                <option>Todos os status</option>
                <option>Ativo</option>
                <option>Inativo</option>
                <option>Bloqueado</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Perfil</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Unidade/Setor</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Plataforma</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Ultimo Acesso</th>
                  <th className="px-6 py-3 text-right text-xs text-gray-500 uppercase tracking-wider">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-gray-800">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                        {roleOptions.find((r) => r.value === user.role)?.label || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-gray-700">{user.unit}</p>
                        {user.sector && <p className="text-xs text-gray-500">{user.sector}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {user.platforms.includes('web') && (
                          <div className="p-1 bg-blue-100 rounded" title="Web">
                            <Monitor className="w-3 h-3 text-blue-600" />
                          </div>
                        )}
                        {user.platforms.includes('app') && (
                          <div className="p-1 bg-green-100 rounded" title="App">
                            <Smartphone className="w-3 h-3 text-green-600" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-xs bg-green-100 text-green-700">
                        {statusLabels[user.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-500">
                        {user.lastAccess ? new Date(user.lastAccess).toLocaleString() : '-'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1 hover:bg-gray-100 rounded transition-colors" title="Editar" onClick={() => openEditUserModal(user)}>
                          <Edit className="w-4 h-4 text-gray-600" />
                        </button>
                        <button className="p-1 hover:bg-red-50 rounded transition-colors" title="Excluir" disabled={user.isSystemUser} onClick={() => handleDeleteUser(user)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredUsers.length && (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-sm text-gray-500">Nenhum usuario encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
              <Users className="w-8 h-8 text-blue-600 mb-2" />
              <p className="text-2xl text-gray-800">{users.length}</p>
              <p className="text-xs text-gray-600">Total de Usuarios</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
              <Check className="w-8 h-8 text-green-600 mb-2" />
              <p className="text-2xl text-gray-800">{users.filter((u) => u.status === 'active').length}</p>
              <p className="text-xs text-gray-600">Usuarios Ativos</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-4">
              <Monitor className="w-8 h-8 text-purple-600 mb-2" />
              <p className="text-2xl text-gray-800">{users.filter((u) => u.platforms.includes('web')).length}</p>
              <p className="text-xs text-gray-600">Acesso Web</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-100 p-4">
              <Smartphone className="w-8 h-8 text-orange-600 mb-2" />
              <p className="text-2xl text-gray-800">{users.filter((u) => u.platforms.includes('app')).length}</p>
              <p className="text-xs text-gray-600">Acesso App</p>
            </div>
          </div>
        </div>
      )}

      {currentTab === 'permissions' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {profileOrder.map((role) => {
              const meta = profileMeta[role];
              const count = users.filter((u) => u.role === role).length;
              const isSelected = selectedRole === role;
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    isSelected ? 'border-[#0EA5E9] shadow-lg bg-white' : `${meta.color} hover:border-gray-300`
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div>
                      <h3 className="text-gray-800">{meta.title}</h3>
                      <p className="text-xs text-gray-500">{meta.description}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">{count} usuarios</p>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-800">Usuarios vinculados</h3>
                <p className="text-xs text-gray-500">Este perfil possui {selectedUsers.length} usuarios vinculados</p>
              </div>
              {!canEditPermissions && (
                <span className="text-xs text-amber-600">Visualizacao somente leitura</span>
              )}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 uppercase text-xs border-b">
                  <tr>
                    <th className="text-left py-2">Nome</th>
                    <th className="text-left py-2">Login</th>
                    <th className="text-left py-2">Unidade/Setor</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Ultimo acesso</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="py-2 text-gray-800">{user.name}</td>
                      <td className="py-2 text-gray-600">{user.login}</td>
                      <td className="py-2 text-gray-600">
                        <div>{user.unit}</div>
                        {user.sector && <div className="text-xs text-gray-400">{user.sector}</div>}
                      </td>
                      <td className="py-2">
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">
                          {statusLabels[user.status]}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">
                        {user.lastAccess ? new Date(user.lastAccess).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                  {!selectedUsers.length && (
                    <tr>
                      <td className="py-6 text-sm text-gray-500" colSpan={5}>
                        Nenhum usuario vinculado a este perfil.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-800">
                <Shield className="w-5 h-5 text-gray-600" />
                Matriz de Permissoes - {selectedProfile?.title}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSavePermissions}
                  disabled={!canEditPermissions}
                  className="flex items-center gap-2 px-3 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] disabled:opacity-40"
                >
                  <Save className="w-4 h-4" />
                  Salvar
                </button>
                <button
                  onClick={() => setExpandedPermissions(!expandedPermissions)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  {expandedPermissions ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {expandedPermissions && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Modulo</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Visualizar</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Criar</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Editar</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Excluir</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Web</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">App</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {permissions.map((perm, index) => (
                      <tr key={perm.module} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-800">{perm.module}</span>
                        </td>
                        {(['view', 'create', 'edit', 'delete', 'web', 'app'] as Array<keyof Permission>).map((key) => {
                          const isActive = Boolean(perm[key]);
                          const label = permissionLabels[key] || String(key);
                          return (
                            <td key={key} className="px-6 py-4 text-center">
                              <button
                                onClick={() => handleTogglePermission(index, key)}
                                disabled={!canEditPermissions}
                                title={`${label}: ${isActive ? 'permitido' : 'negado'}`}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  isActive ? 'bg-sky-300' : 'bg-gray-300'
                                } ${!canEditPermissions ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                    isActive ? 'translate-x-5' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-700">
            <div className="font-semibold mb-2">Legenda</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-3 rounded-full bg-sky-300"></span>
                Permissao ativa
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-3 rounded-full bg-gray-300"></span>
                Permissao inativa
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-3 rounded-full bg-sky-300"></span>
                Disponivel na versao Web
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-3 rounded-full bg-sky-300"></span>
                Disponivel no App Mobile
              </div>
            </div>
          </div>
        </div>
      )}

      {currentTab === 'access-history' && (
        <div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-800">Ultimas Atividades</h3>
                <div className="flex items-center gap-2">
                  <select className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                    <option>Ultimas 24 horas</option>
                    <option>Ultimos 7 dias</option>
                    <option>Ultimos 30 dias</option>
                  </select>
                  <button className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filtrar
                  </button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {accessLogs.map((log) => (
                <div key={log.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`p-2 rounded-lg ${
                        log.status === 'SUCESSO' ? 'bg-green-100' :
                        log.status === 'FALHA' ? 'bg-red-100' :
                        'bg-orange-100'
                      }`}>
                        {log.platform === 'web' ? (
                          <Monitor className={`w-5 h-5 ${
                            log.status === 'SUCESSO' ? 'text-green-600' :
                            log.status === 'FALHA' ? 'text-red-600' :
                            'text-orange-600'
                          }`} />
                        ) : (
                          <Smartphone className={`w-5 h-5 ${
                            log.status === 'SUCESSO' ? 'text-green-600' :
                            log.status === 'FALHA' ? 'text-red-600' :
                            'text-orange-600'
                          }`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm text-gray-800">{log.user_id || 'Sistema'}</p>
                          <span className="text-xs text-gray-400">{'→'}</span>
                          <p className="text-sm text-gray-600">{log.action}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Modulo: {log.module}</span>
                          <span>IP: {log.ip_address}</span>
                          <span>{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs ${accessStatusConfig[log.status].color}`}>
                      {accessStatusConfig[log.status].label}
                    </span>
                  </div>
                </div>
              ))}
              {!accessLogs.length && (
                <div className="px-6 py-6 text-sm text-gray-500">Nenhum registro encontrado.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {currentTab === 'security' && policyForUi && (
        <div className="space-y-4">
          <div className="bg-red-50 border-l-4 border-l-red-500 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-800 mb-2">Alertas de Seguranca</h3>
                <ul className="space-y-2 text-sm text-red-700">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    {accessLogs.filter((log) => log.status === 'FALHA').length} tentativas de login falhas registradas
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    {accessLogs.filter((log) => log.status === 'BLOQUEADO').length} acessos bloqueados
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-gray-600" />
                Politicas de Senha
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policyForUi.requireStrongPassword}
                    disabled={!isSystemEditor}
                    onChange={(e) => setPolicy({ ...policyForUi, requireStrongPassword: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
                  />
                  <span className="text-sm text-gray-700">Exigir senha forte (min. caracteres)</span>
                </label>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span>Minimo de caracteres</span>
                  <input
                    type="number"
                    min={8}
                    value={policyForUi.minPasswordLength}
                    disabled={!isSystemEditor}
                    onChange={(e) =>
                      setPolicy({
                        ...policyForUi,
                        minPasswordLength: Math.max(8, Number(e.target.value || 8))
                      })
                    }
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span>Expiracao de senha (dias)</span>
                  <input
                    type="number"
                    min={0}
                    value={policyForUi.passwordExpiryDays}
                    disabled
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
                  />
                  <span className="text-xs text-gray-500">Sem expiracao por diretriz NIST</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-gray-600" />
                Controle de Acesso
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span>Bloqueio apos tentativas falhas</span>
                  <input
                    type="number"
                    min={5}
                    value={policyForUi.maxFailedAttempts}
                    disabled={!isSystemEditor}
                    onChange={(e) => setPolicy({ ...policyForUi, maxFailedAttempts: Math.max(5, Number(e.target.value || 5)) })}
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span>Tempo de bloqueio (min)</span>
                  <input
                    type="number"
                    min={5}
                    value={policyForUi.lockoutMinutes}
                    disabled={!isSystemEditor}
                    onChange={(e) => setPolicy({ ...policyForUi, lockoutMinutes: Math.max(5, Number(e.target.value || 5)) })}
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span>Logout por inatividade (min)</span>
                  <input
                    type="number"
                    min={1}
                    value={policyForUi.idleTimeoutMinutes}
                    disabled={!isSystemEditor}
                    onChange={(e) => setPolicy({ ...policyForUi, idleTimeoutMinutes: Number(e.target.value) })}
                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={policyForUi.twoFactorEnabled} disabled className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                  <span className="text-sm text-gray-700">2FA (preparado)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={handleSavePolicy}
              disabled={!isSystemEditor}
              className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] disabled:opacity-40"
            >
              <Save className="w-4 h-4" />
              Salvar Politicas
            </button>
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-6 py-4 flex items-center justify-between rounded-t-2xl sticky top-0">
              <h3 className="text-white text-lg">{isEditing ? 'Editar Usuario' : 'Novo Usuario'}</h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-1 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Nome Completo *</label>
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">E-mail *</label>
                  <input
                    type="email"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">CPF</label>
                  <input
                    type="text"
                    value={formState.cpf}
                    onChange={(e) => setFormState({ ...formState, cpf: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Data de Nascimento</label>
                  <input
                    type="date"
                    value={formState.birthDate}
                    onChange={(e) => setFormState({ ...formState, birthDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Data de Admissao</label>
                  <input
                    type="date"
                    value={formState.admissionDate}
                    onChange={(e) => setFormState({ ...formState, admissionDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Documento (opcional)</label>
                  <input
                    type="text"
                    value={formState.documentId}
                    onChange={(e) => setFormState({ ...formState, documentId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Login *</label>
                  <input
                    type="text"
                    value={formState.role === 'SYSTEM' ? systemLogin : formState.login}
                    onChange={(e) => setFormState({ ...formState, login: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                    disabled={formState.role === 'SYSTEM'}
                  />
                </div>
                {!isEditing && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Senha *</label>
                      <input
                        type="password"
                        value={formState.password}
                        onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Confirmar Senha</label>
                      <input
                        type="password"
                        value={formState.confirmPassword}
                        onChange={(e) => setFormState({ ...formState, confirmPassword: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                      />
                    </div>
                  </>
                )}
                {isEditing && (
                  <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.adminResetPassword}
                        onChange={(e) => setFormState({ ...formState, adminResetPassword: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
                      />
                      <span className="text-sm text-amber-800">Resetar senha com geracao aleatoria (expira em {policyForUi?.adminResetPasswordTtlHours || 24}h)</span>
                    </label>
                    <p className="text-xs text-amber-700 mt-2">
                      A senha temporaria sera trocada no primeiro acesso do usuario.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Perfil *</label>
                  <select
                    value={formState.role}
                    onChange={(e) => setFormState({ ...formState, role: e.target.value as Role })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                    disabled={isEditing && formState.role === 'SYSTEM'}
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value} disabled={role.value === 'SYSTEM' && !!systemUser}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Unidade *</label>
                  <input
                    type="text"
                    value={formState.unit}
                    onChange={(e) => setFormState({ ...formState, unit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Setor (opcional)</label>
                  <input
                    type="text"
                    value={formState.sector}
                    onChange={(e) => setFormState({ ...formState, sector: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) => setFormState({ ...formState, status: e.target.value as UserRecord['status'] })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                    disabled={formState.role === 'SYSTEM'}
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Plataformas de Acesso</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.platforms.web}
                        onChange={(e) => setFormState({ ...formState, platforms: { ...formState.platforms, web: e.target.checked } })}
                        className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
                      />
                      <Monitor className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-700">Web</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.platforms.app}
                        onChange={(e) => setFormState({ ...formState, platforms: { ...formState.platforms, app: e.target.checked } })}
                        className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
                      />
                      <Smartphone className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-700">App Mobile</span>
                    </label>
                  </div>
                </div>
                {!isEditing && (
                  <div className="col-span-2 rounded-lg border border-gray-200 p-3">
                    <p className="text-sm text-gray-800 mb-2">Guia de senha forte</p>
                    <ul className="space-y-1 text-xs text-gray-700">
                      <li className={passwordGuide.checks.hasMinLength ? 'text-green-700' : ''}>- Minimo de {policyForUi?.minPasswordLength || 8} caracteres</li>
                      <li className={passwordGuide.checks.hasLower ? 'text-green-700' : ''}>- Ao menos 1 letra minuscula</li>
                      <li className={passwordGuide.checks.hasUpper ? 'text-green-700' : ''}>- Ao menos 1 letra maiuscula</li>
                      <li className={passwordGuide.checks.hasNumber ? 'text-green-700' : ''}>- Ao menos 1 digito</li>
                      <li className={passwordGuide.checks.hasSpecial ? 'text-green-700' : ''}>- Ao menos 1 caractere especial</li>
                      <li className={!passwordGuide.checks.inBlocklist ? 'text-green-700' : 'text-red-700'}>- Nao pode estar na blocklist de senhas vazadas</li>
                      <li className={!passwordGuide.checks.reusesPersonalData ? 'text-green-700' : 'text-red-700'}>- Nao pode usar dados pessoais do usuario</li>
                    </ul>
                  </div>
                )}
              </div>

              {!isEditing && formState.role === 'SYSTEM' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    Usuario Sistema: login {systemLogin}. Senha padrao: {getSystemDefaultPassword()}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowUserModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors"
              >
                {isEditing ? 'Salvar Usuario' : 'Criar Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

