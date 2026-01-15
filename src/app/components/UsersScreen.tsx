import React, { useState } from 'react';
import { Users, Shield, Clock, Plus, Edit, Trash2, Check, X, Search, Filter, AlertTriangle, Eye, Lock, Smartphone, Monitor, ChevronDown, ChevronRight } from 'lucide-react';

type UserTab = 'users' | 'permissions' | 'access-history' | 'security';

interface User {
  id: number;
  name: string;
  email: string;
  profile: 'admin' | 'manager' | 'doctor' | 'nurse' | 'technician' | 'family' | 'patient';
  unit: string;
  sector?: string;
  status: 'active' | 'inactive' | 'blocked';
  lastAccess: string;
  createdAt: string;
  platforms: ('web' | 'app')[];
}

interface Profile {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  userCount: number;
}

interface Permission {
  module: string;
  view: boolean;
  edit: boolean;
  delete: boolean;
  web: boolean;
  app: boolean;
}

interface AccessLog {
  id: number;
  user: string;
  action: string;
  module: string;
  timestamp: string;
  ip: string;
  platform: 'web' | 'app';
  status: 'success' | 'failed' | 'blocked';
}

const mockUsers: User[] = [
  {
    id: 1,
    name: 'Dr. Carlos Silva',
    email: 'carlos.silva@hospital.com.br',
    profile: 'doctor',
    unit: 'Hospital Central',
    sector: 'UTI',
    status: 'active',
    lastAccess: 'há 5 min',
    createdAt: '15/01/2024',
    platforms: ['web', 'app']
  },
  {
    id: 2,
    name: 'Enf. Maria Santos',
    email: 'maria.santos@hospital.com.br',
    profile: 'nurse',
    unit: 'Hospital Central',
    sector: 'Cardiologia',
    status: 'active',
    lastAccess: 'há 12 min',
    createdAt: '20/01/2024',
    platforms: ['web', 'app']
  },
  {
    id: 3,
    name: 'Admin Sistema',
    email: 'admin@cuidai.com.br',
    profile: 'admin',
    unit: 'Todas',
    status: 'active',
    lastAccess: 'há 2 min',
    createdAt: '01/01/2024',
    platforms: ['web']
  },
  {
    id: 4,
    name: 'João Pereira',
    email: 'joao.pereira@email.com',
    profile: 'patient',
    unit: 'Hospital Central',
    sector: 'UTI',
    status: 'active',
    lastAccess: 'há 1 hora',
    createdAt: '10/02/2024',
    platforms: ['app']
  },
  {
    id: 5,
    name: 'Ana Costa (Familiar)',
    email: 'ana.costa@email.com',
    profile: 'family',
    unit: 'Hospital Central',
    sector: 'UTI',
    status: 'active',
    lastAccess: 'há 30 min',
    createdAt: '11/02/2024',
    platforms: ['app']
  },
  {
    id: 6,
    name: 'Dr. Roberto Alves',
    email: 'roberto.alves@hospital.com.br',
    profile: 'doctor',
    unit: 'Hospital Central',
    sector: 'Geriatria',
    status: 'inactive',
    lastAccess: 'há 3 dias',
    createdAt: '05/12/2023',
    platforms: ['web']
  }
];

const profiles: Profile[] = [
  {
    id: 'admin',
    name: 'Administrador',
    description: 'Acesso total ao sistema',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: <Shield className="w-5 h-5" />,
    userCount: 1
  },
  {
    id: 'manager',
    name: 'Gestor',
    description: 'Gestão de unidade e relatórios',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: <Users className="w-5 h-5" />,
    userCount: 0
  },
  {
    id: 'doctor',
    name: 'Médico',
    description: 'Acesso clínico completo',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: <Shield className="w-5 h-5" />,
    userCount: 2
  },
  {
    id: 'nurse',
    name: 'Enfermagem',
    description: 'Monitoramento e alertas',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: <Users className="w-5 h-5" />,
    userCount: 1
  },
  {
    id: 'technician',
    name: 'Técnico',
    description: 'Suporte e dispositivos',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: <Shield className="w-5 h-5" />,
    userCount: 0
  },
  {
    id: 'family',
    name: 'Familiar',
    description: 'Acompanhamento de paciente',
    color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    icon: <Users className="w-5 h-5" />,
    userCount: 1
  },
  {
    id: 'patient',
    name: 'Paciente',
    description: 'App mobile apenas',
    color: 'bg-pink-100 text-pink-700 border-pink-200',
    icon: <Smartphone className="w-5 h-5" />,
    userCount: 1
  }
];

const modules = [
  'Dashboard',
  'Monitoramento IA',
  'Alertas Clínicos',
  'Prontuário (PEP)',
  'Pacientes',
  'Leitos e Quartos',
  'Agendamentos',
  'Relatórios',
  'Configurações'
];

const mockPermissions: Record<string, Permission[]> = {
  admin: modules.map(m => ({ module: m, view: true, edit: true, delete: true, web: true, app: true })),
  doctor: [
    { module: 'Dashboard', view: true, edit: false, delete: false, web: true, app: true },
    { module: 'Monitoramento IA', view: true, edit: false, delete: false, web: true, app: true },
    { module: 'Alertas Clínicos', view: true, edit: true, delete: false, web: true, app: true },
    { module: 'Prontuário (PEP)', view: true, edit: true, delete: false, web: true, app: true },
    { module: 'Pacientes', view: true, edit: true, delete: false, web: true, app: false },
    { module: 'Leitos e Quartos', view: true, edit: false, delete: false, web: true, app: false },
    { module: 'Agendamentos', view: true, edit: true, delete: false, web: true, app: true },
    { module: 'Relatórios', view: true, edit: false, delete: false, web: true, app: false },
    { module: 'Configurações', view: false, edit: false, delete: false, web: false, app: false }
  ],
  nurse: [
    { module: 'Dashboard', view: true, edit: false, delete: false, web: true, app: true },
    { module: 'Monitoramento IA', view: true, edit: true, delete: false, web: true, app: true },
    { module: 'Alertas Clínicos', view: true, edit: true, delete: false, web: true, app: true },
    { module: 'Prontuário (PEP)', view: true, edit: true, delete: false, web: true, app: true },
    { module: 'Pacientes', view: true, edit: false, delete: false, web: true, app: true },
    { module: 'Leitos e Quartos', view: true, edit: true, delete: false, web: true, app: false },
    { module: 'Agendamentos', view: true, edit: false, delete: false, web: true, app: true },
    { module: 'Relatórios', view: false, edit: false, delete: false, web: false, app: false },
    { module: 'Configurações', view: false, edit: false, delete: false, web: false, app: false }
  ],
  patient: [
    { module: 'Dashboard', view: true, edit: false, delete: false, web: false, app: true },
    { module: 'Monitoramento IA', view: false, edit: false, delete: false, web: false, app: false },
    { module: 'Alertas Clínicos', view: true, edit: false, delete: false, web: false, app: true },
    { module: 'Prontuário (PEP)', view: true, edit: false, delete: false, web: false, app: true },
    { module: 'Pacientes', view: false, edit: false, delete: false, web: false, app: false },
    { module: 'Leitos e Quartos', view: false, edit: false, delete: false, web: false, app: false },
    { module: 'Agendamentos', view: true, edit: false, delete: false, web: false, app: true },
    { module: 'Relatórios', view: false, edit: false, delete: false, web: false, app: false },
    { module: 'Configurações', view: false, edit: false, delete: false, web: false, app: false }
  ]
};

const mockAccessLogs: AccessLog[] = [
  {
    id: 1,
    user: 'Dr. Carlos Silva',
    action: 'Login',
    module: 'Sistema',
    timestamp: '24/12/2024 14:35',
    ip: '192.168.1.100',
    platform: 'web',
    status: 'success'
  },
  {
    id: 2,
    user: 'Enf. Maria Santos',
    action: 'Visualizou prontuário',
    module: 'PEP',
    timestamp: '24/12/2024 14:33',
    ip: '192.168.1.105',
    platform: 'app',
    status: 'success'
  },
  {
    id: 3,
    user: 'João Pereira',
    action: 'Tentativa de acesso',
    module: 'Configurações',
    timestamp: '24/12/2024 14:30',
    ip: '10.0.0.50',
    platform: 'app',
    status: 'blocked'
  },
  {
    id: 4,
    user: 'Admin Sistema',
    action: 'Criou usuário',
    module: 'Usuários',
    timestamp: '24/12/2024 14:25',
    ip: '192.168.1.10',
    platform: 'web',
    status: 'success'
  },
  {
    id: 5,
    user: 'Dr. Roberto Alves',
    action: 'Login falhou',
    module: 'Sistema',
    timestamp: '24/12/2024 14:20',
    ip: '192.168.1.120',
    platform: 'web',
    status: 'failed'
  }
];

export function UsersScreen() {
  const [currentTab, setCurrentTab] = useState<UserTab>('users');
  const [selectedProfile, setSelectedProfile] = useState<string>('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [expandedPermissions, setExpandedPermissions] = useState(true);

  const tabs = [
    { id: 'users' as const, label: 'Usuários', icon: Users },
    { id: 'permissions' as const, label: 'Perfis e Permissões', icon: Shield },
    { id: 'access-history' as const, label: 'Histórico de Acessos', icon: Clock },
    { id: 'security' as const, label: 'Segurança', icon: Lock }
  ];

  const profileLabels = {
    admin: 'Administrador',
    manager: 'Gestor',
    doctor: 'Médico',
    nurse: 'Enfermagem',
    technician: 'Técnico',
    family: 'Familiar',
    patient: 'Paciente'
  };

  const statusConfig = {
    active: { color: 'bg-green-100 text-green-700', label: 'Ativo' },
    inactive: { color: 'bg-gray-100 text-gray-600', label: 'Inativo' },
    blocked: { color: 'bg-red-100 text-red-700', label: 'Bloqueado' }
  };

  const accessStatusConfig = {
    success: { color: 'bg-green-100 text-green-700', label: 'Sucesso' },
    failed: { color: 'bg-red-100 text-red-700', label: 'Falhou' },
    blocked: { color: 'bg-orange-100 text-orange-700', label: 'Bloqueado' }
  };

  const filteredUsers = mockUsers.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedPermissions = mockPermissions[selectedProfile] || [];

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-gray-800 mb-1">Gestão de Usuários e Permissões</h1>
            <p className="text-sm text-gray-500">Controle de acessos Web e App</p>
          </div>
          {currentTab === 'users' && (
            <button
              onClick={() => setShowNewUserModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Usuário
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200">
          {tabs.map(tab => {
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

      {/* Tab: Usuários */}
      {currentTab === 'users' && (
        <div>
          {/* Filters */}
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
                <option>Administrador</option>
                <option>Médico</option>
                <option>Enfermagem</option>
                <option>Paciente</option>
              </select>
              <select className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                <option>Todos os status</option>
                <option>Ativo</option>
                <option>Inativo</option>
                <option>Bloqueado</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Perfil</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Unidade/Setor</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Plataforma</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Último Acesso</th>
                  <th className="px-6 py-3 text-right text-xs text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-gray-800">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                        {profileLabels[user.profile]}
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
                      <span className={`px-3 py-1 rounded-full text-xs ${statusConfig[user.status].color}`}>
                        {statusConfig[user.status].label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-500">{user.lastAccess}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1 hover:bg-gray-100 rounded transition-colors" title="Editar">
                          <Edit className="w-4 h-4 text-gray-600" />
                        </button>
                        <button className="p-1 hover:bg-red-50 rounded transition-colors" title="Excluir">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
              <Users className="w-8 h-8 text-blue-600 mb-2" />
              <p className="text-2xl text-gray-800">{mockUsers.length}</p>
              <p className="text-xs text-gray-600">Total de Usuários</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
              <Check className="w-8 h-8 text-green-600 mb-2" />
              <p className="text-2xl text-gray-800">{mockUsers.filter(u => u.status === 'active').length}</p>
              <p className="text-xs text-gray-600">Usuários Ativos</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-4">
              <Monitor className="w-8 h-8 text-purple-600 mb-2" />
              <p className="text-2xl text-gray-800">{mockUsers.filter(u => u.platforms.includes('web')).length}</p>
              <p className="text-xs text-gray-600">Acesso Web</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-100 p-4">
              <Smartphone className="w-8 h-8 text-orange-600 mb-2" />
              <p className="text-2xl text-gray-800">{mockUsers.filter(u => u.platforms.includes('app')).length}</p>
              <p className="text-xs text-gray-600">Acesso App</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Perfis e Permissões */}
      {currentTab === 'permissions' && (
        <div>
          {/* Profile Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => setSelectedProfile(profile.id)}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  selectedProfile === profile.id
                    ? 'border-[#0EA5E9] shadow-lg'
                    : `border-gray-200 hover:border-gray-300 ${profile.color}`
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  {profile.icon}
                  <h3 className="text-gray-800">{profile.name}</h3>
                </div>
                <p className="text-xs text-gray-600 mb-3">{profile.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{profile.userCount} usuários</span>
                  {selectedProfile === profile.id && (
                    <Check className="w-4 h-4 text-[#0EA5E9]" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Permissions Matrix */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-white">
                  <Shield className="w-5 h-5" />
                  <h3 className="text-white">
                    Matriz de Permissões - {profiles.find(p => p.id === selectedProfile)?.name}
                  </h3>
                </div>
                <button
                  onClick={() => setExpandedPermissions(!expandedPermissions)}
                  className="text-white hover:bg-white/20 rounded-lg p-1"
                >
                  {expandedPermissions ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {expandedPermissions && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Módulo</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Visualizar</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Editar</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Excluir</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">Web</th>
                      <th className="px-6 py-3 text-center text-xs text-gray-500 uppercase tracking-wider">App</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedPermissions.map((perm, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-800">{perm.module}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {perm.view ? (
                            <Check className="w-5 h-5 text-green-600 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-gray-300 mx-auto" />
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {perm.edit ? (
                            <Check className="w-5 h-5 text-green-600 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-gray-300 mx-auto" />
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {perm.delete ? (
                            <Check className="w-5 h-5 text-green-600 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-gray-300 mx-auto" />
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {perm.web ? (
                            <Monitor className="w-5 h-5 text-blue-600 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-gray-300 mx-auto" />
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {perm.app ? (
                            <Smartphone className="w-5 h-5 text-green-600 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-gray-300 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm text-blue-800 mb-3">Legenda</h4>
            <div className="grid grid-cols-2 gap-3 text-xs text-blue-700">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Permissão concedida</span>
              </div>
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-gray-300" />
                <span>Permissão negada</span>
              </div>
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-blue-600" />
                <span>Disponível na versão Web</span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-green-600" />
                <span>Disponível no App Mobile</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Histórico de Acessos */}
      {currentTab === 'access-history' && (
        <div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-800">Últimas Atividades</h3>
                <div className="flex items-center gap-2">
                  <select className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                    <option>Últimas 24 horas</option>
                    <option>Últimos 7 dias</option>
                    <option>Últimos 30 dias</option>
                  </select>
                  <button className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filtrar
                  </button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {mockAccessLogs.map(log => (
                <div key={log.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`p-2 rounded-lg ${
                        log.status === 'success' ? 'bg-green-100' :
                        log.status === 'failed' ? 'bg-red-100' :
                        'bg-orange-100'
                      }`}>
                        {log.platform === 'web' ? (
                          <Monitor className={`w-5 h-5 ${
                            log.status === 'success' ? 'text-green-600' :
                            log.status === 'failed' ? 'text-red-600' :
                            'text-orange-600'
                          }`} />
                        ) : (
                          <Smartphone className={`w-5 h-5 ${
                            log.status === 'success' ? 'text-green-600' :
                            log.status === 'failed' ? 'text-red-600' :
                            'text-orange-600'
                          }`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm text-gray-800">{log.user}</p>
                          <span className="text-xs text-gray-400">→</span>
                          <p className="text-sm text-gray-600">{log.action}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Módulo: {log.module}</span>
                          <span>IP: {log.ip}</span>
                          <span>{log.timestamp}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs ${accessStatusConfig[log.status].color}`}>
                      {accessStatusConfig[log.status].label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Segurança */}
      {currentTab === 'security' && (
        <div className="space-y-4">
          {/* Security Alerts */}
          <div className="bg-red-50 border-l-4 border-l-red-500 rounded-lg p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-red-800 mb-2">Alertas de Segurança</h3>
                <ul className="space-y-2 text-sm text-red-700">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    3 tentativas de login falhas detectadas nas últimas 24h
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                    1 acesso bloqueado por falta de permissão
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-gray-600" />
                Políticas de Senha
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" readOnly />
                  <span className="text-sm text-gray-700">Exigir senha forte (mín. 8 caracteres)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" readOnly />
                  <span className="text-sm text-gray-700">Expiração de senha a cada 90 dias</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" readOnly />
                  <span className="text-sm text-gray-700">Autenticação de dois fatores (2FA)</span>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-gray-600" />
                Controle de Acesso
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" readOnly />
                  <span className="text-sm text-gray-700">Bloquear após 3 tentativas falhas</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" readOnly />
                  <span className="text-sm text-gray-700">Logout automático após 30min inativo</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" readOnly />
                  <span className="text-sm text-gray-700">Registrar todos os acessos</span>
                </label>
              </div>
            </div>
          </div>

          {/* Security Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
              <Check className="w-8 h-8 text-green-600 mb-2" />
              <p className="text-2xl text-gray-800">98.5%</p>
              <p className="text-xs text-gray-600">Taxa de Segurança</p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-pink-50 rounded-lg border border-red-100 p-4">
              <X className="w-8 h-8 text-red-600 mb-2" />
              <p className="text-2xl text-gray-800">3</p>
              <p className="text-xs text-gray-600">Logins Falhos</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-100 p-4">
              <AlertTriangle className="w-8 h-8 text-orange-600 mb-2" />
              <p className="text-2xl text-gray-800">1</p>
              <p className="text-xs text-gray-600">Acessos Bloqueados</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
              <Eye className="w-8 h-8 text-blue-600 mb-2" />
              <p className="text-2xl text-gray-800">247</p>
              <p className="text-xs text-gray-600">Acessos Hoje</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo Usuário */}
      {showNewUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-6 py-4 flex items-center justify-between rounded-t-2xl sticky top-0">
              <h3 className="text-white text-lg">Novo Usuário</h3>
              <button
                onClick={() => setShowNewUserModal(false)}
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
                    placeholder="Ex: Dr. João Silva"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">E-mail *</label>
                  <input
                    type="email"
                    placeholder="usuario@hospital.com.br"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">CPF</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Perfil *</label>
                  <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                    <option>Selecione...</option>
                    <option>Administrador</option>
                    <option>Gestor</option>
                    <option>Médico</option>
                    <option>Enfermagem</option>
                    <option>Técnico</option>
                    <option>Familiar</option>
                    <option>Paciente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Unidade *</label>
                  <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                    <option>Hospital Central</option>
                    <option>Clínica Norte</option>
                    <option>Casa de Repouso Vida Plena</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Setor (opcional)</label>
                  <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                    <option>Nenhum</option>
                    <option>UTI</option>
                    <option>Cardiologia</option>
                    <option>Geriatria</option>
                    <option>Pediatria</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Status</label>
                  <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Plataformas de Acesso</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                      <Monitor className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-700">Web</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" />
                      <Smartphone className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-700">App Mobile</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>Senha temporária:</strong> Será enviada por e-mail. O usuário deverá alterá-la no primeiro acesso.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowNewUserModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
                Criar Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
