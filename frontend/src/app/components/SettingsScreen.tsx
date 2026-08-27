import React, { useState } from 'react';
import { Building2, Layers, Camera, Bell, Plug, Plus, Edit, Trash2, Power, PowerOff, ChevronRight, ChevronDown, Settings, Check, X, Save, MapPin, Phone, Mail } from 'lucide-react';

type SettingsTab = 'units' | 'structure' | 'devices' | 'alerts' | 'integrations';

interface Unit {
  id: number;
  name: string;
  type: 'hospital' | 'clinic' | 'nursing-home';
  address: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
}

interface Floor {
  id: number;
  name: string;
  level: number;
  sectors: Sector[];
  expanded?: boolean;
}

interface Sector {
  id: number;
  name: string;
  type: string;
  rooms: Room[];
  expanded?: boolean;
}

interface Room {
  id: number;
  number: string;
  beds: Bed[];
  expanded?: boolean;
}

interface Bed {
  id: number;
  code: string;
  status: 'occupied' | 'available' | 'blocked';
}

interface Device {
  id: number;
  name: string;
  type: 'camera' | 'sensor' | 'tablet';
  location: string;
  status: 'online' | 'offline';
  lastSync: string;
  deviceId: string;
}

interface AlertType {
  id: number;
  name: string;
  category: 'fall' | 'bed-exit' | 'vital-signs' | 'custom';
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  aiEnabled: boolean;
  description: string;
}

interface Integration {
  id: number;
  name: string;
  type: 'api' | 'webhook' | 'external';
  status: 'active' | 'inactive';
  endpoint?: string;
  lastSync?: string;
}

const mockUnits: Unit[] = [
  {
    id: 1,
    name: 'Hospital Central',
    type: 'hospital',
    address: 'Av. Principal, 1000 - Centro',
    phone: '(11) 3000-0000',
    email: 'contato@hospitalcentral.com.br',
    status: 'active'
  },
  {
    id: 2,
    name: 'Clínica Norte',
    type: 'clinic',
    address: 'Rua das Flores, 250 - Zona Norte',
    phone: '(11) 3100-0000',
    email: 'contato@clinicanorte.com.br',
    status: 'active'
  },
  {
    id: 3,
    name: 'Casa de Repouso Vida Plena',
    type: 'nursing-home',
    address: 'Alameda Tranquila, 88 - Jardins',
    phone: '(11) 3200-0000',
    email: 'contato@vidaplena.com.br',
    status: 'inactive'
  }
];

const mockStructure: Floor[] = [
  {
    id: 1,
    name: '3º Andar',
    level: 3,
    expanded: true,
    sectors: [
      {
        id: 1,
        name: 'UTI',
        type: 'Unidade de Terapia Intensiva',
        expanded: true,
        rooms: [
          {
            id: 1,
            number: '301',
            expanded: true,
            beds: [
              { id: 1, code: 'A', status: 'occupied' },
              { id: 2, code: 'B', status: 'available' }
            ]
          },
          {
            id: 2,
            number: '302',
            expanded: false,
            beds: [
              { id: 3, code: 'A', status: 'occupied' }
            ]
          }
        ]
      },
      {
        id: 2,
        name: 'Cardiologia',
        type: 'Setor Cardiológico',
        expanded: false,
        rooms: [
          {
            id: 3,
            number: '305',
            beds: [
              { id: 4, code: 'A', status: 'available' },
              { id: 5, code: 'B', status: 'available' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 2,
    name: '4º Andar',
    level: 4,
    expanded: false,
    sectors: [
      {
        id: 3,
        name: 'Geriatria',
        type: 'Setor Geriátrico',
        rooms: [
          {
            id: 4,
            number: '410',
            beds: [
              { id: 6, code: 'A', status: 'occupied' },
              { id: 7, code: 'B', status: 'blocked' }
            ]
          }
        ]
      }
    ]
  }
];

const mockDevices: Device[] = [
  {
    id: 1,
    name: 'Câmera UTI 301-A',
    type: 'camera',
    location: '3º Andar → UTI → Quarto 301 → Leito A',
    status: 'online',
    lastSync: 'há 2 min',
    deviceId: 'CAM-UTI-301A'
  },
  {
    id: 2,
    name: 'Sensor Queda 301-B',
    type: 'sensor',
    location: '3º Andar → UTI → Quarto 301 → Leito B',
    status: 'online',
    lastSync: 'há 5 min',
    deviceId: 'SEN-UTI-301B'
  },
  {
    id: 3,
    name: 'Tablet Enfermagem UTI',
    type: 'tablet',
    location: '3º Andar → UTI → Posto de Enfermagem',
    status: 'offline',
    lastSync: 'há 2 horas',
    deviceId: 'TAB-UTI-01'
  },
  {
    id: 4,
    name: 'Câmera Geriatria 410-A',
    type: 'camera',
    location: '4º Andar → Geriatria → Quarto 410 → Leito A',
    status: 'online',
    lastSync: 'há 1 min',
    deviceId: 'CAM-GER-410A'
  }
];

const mockAlertTypes: AlertType[] = [
  {
    id: 1,
    name: 'Detecção de Queda',
    category: 'fall',
    severity: 'critical',
    enabled: true,
    aiEnabled: true,
    description: 'Detecta quando paciente cai do leito ou no chão'
  },
  {
    id: 2,
    name: 'Saída de Leito Não Autorizada',
    category: 'bed-exit',
    severity: 'warning',
    enabled: true,
    aiEnabled: true,
    description: 'Alerta quando paciente sai do leito sem permissão'
  },
  {
    id: 3,
    name: 'Frequência Cardíaca Anormal',
    category: 'vital-signs',
    severity: 'critical',
    enabled: true,
    aiEnabled: false,
    description: 'Monitora alterações na frequência cardíaca'
  },
  {
    id: 4,
    name: 'Temperatura Elevada',
    category: 'vital-signs',
    severity: 'warning',
    enabled: true,
    aiEnabled: false,
    description: 'Detecta febre acima de 37.8°C'
  },
  {
    id: 5,
    name: 'Agitação Psicomotora',
    category: 'custom',
    severity: 'warning',
    enabled: false,
    aiEnabled: true,
    description: 'Personalizado: detecta movimentos agitados prolongados'
  }
];

const mockIntegrations: Integration[] = [
  {
    id: 1,
    name: 'API REST - MedSignal',
    type: 'api',
    status: 'active',
    endpoint: 'https://api.cuidai.com.br/v1',
    lastSync: 'há 5 min'
  },
  {
    id: 2,
    name: 'Webhook - Alertas Telegram',
    type: 'webhook',
    status: 'active',
    endpoint: 'https://telegram.bot/webhook/alerts',
    lastSync: 'há 1 hora'
  },
  {
    id: 3,
    name: 'Sistema HIS Legado',
    type: 'external',
    status: 'inactive',
    endpoint: 'Não configurado'
  }
];

export function SettingsScreen() {
  const [currentTab, setCurrentTab] = useState<SettingsTab>('units');
  const [structure, setStructure] = useState(mockStructure);
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);
  const [showNewDeviceModal, setShowNewDeviceModal] = useState(false);

  const tabs = [
    { id: 'units' as const, label: 'Unidades', icon: Building2 },
    { id: 'structure' as const, label: 'Estrutura Física', icon: Layers },
    { id: 'devices' as const, label: 'Dispositivos', icon: Camera },
    { id: 'alerts' as const, label: 'Tipos de Alertas', icon: Bell },
    { id: 'integrations' as const, label: 'Integrações', icon: Plug }
  ];

  const unitTypeLabels = {
    'hospital': 'Hospital',
    'clinic': 'Clínica',
    'nursing-home': 'Casa de Repouso'
  };

  const deviceTypeConfig = {
    'camera': { icon: <Camera className="w-5 h-5" />, color: 'bg-blue-100 text-blue-700', label: 'Câmera' },
    'sensor': { icon: <Settings className="w-5 h-5" />, color: 'bg-purple-100 text-purple-700', label: 'Sensor' },
    'tablet': { icon: <Phone className="w-5 h-5" />, color: 'bg-green-100 text-green-700', label: 'Tablet' }
  };

  const alertCategoryConfig = {
    'fall': { color: 'bg-red-100 text-red-700', label: 'Queda' },
    'bed-exit': { color: 'bg-orange-100 text-orange-700', label: 'Saída de Leito' },
    'vital-signs': { color: 'bg-blue-100 text-blue-700', label: 'Sinais Vitais' },
    'custom': { color: 'bg-purple-100 text-purple-700', label: 'Personalizado' }
  };

  const severityConfig = {
    'critical': { color: 'text-red-600', label: 'Crítico' },
    'warning': { color: 'text-yellow-600', label: 'Atenção' },
    'info': { color: 'text-blue-600', label: 'Info' }
  };

  const bedStatusConfig = {
    'occupied': { color: 'bg-red-100 text-red-700', label: 'Ocupado' },
    'available': { color: 'bg-green-100 text-green-700', label: 'Disponível' },
    'blocked': { color: 'bg-gray-100 text-gray-700', label: 'Bloqueado' }
  };

  const toggleFloor = (floorId: number) => {
    setStructure(structure.map(floor => 
      floor.id === floorId ? { ...floor, expanded: !floor.expanded } : floor
    ));
  };

  const toggleSector = (floorId: number, sectorId: number) => {
    setStructure(structure.map(floor => 
      floor.id === floorId 
        ? { 
            ...floor, 
            sectors: floor.sectors.map(sector =>
              sector.id === sectorId ? { ...sector, expanded: !sector.expanded } : sector
            )
          }
        : floor
    ));
  };

  const toggleRoom = (floorId: number, sectorId: number, roomId: number) => {
    setStructure(structure.map(floor => 
      floor.id === floorId 
        ? { 
            ...floor, 
            sectors: floor.sectors.map(sector =>
              sector.id === sectorId 
                ? {
                    ...sector,
                    rooms: sector.rooms.map(room =>
                      room.id === roomId ? { ...room, expanded: !room.expanded } : room
                    )
                  }
                : sector
            )
          }
        : floor
    ));
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-gray-800 mb-1">Configurações do Sistema</h1>
            <p className="text-sm text-gray-500">Gestão de estrutura hospitalar, dispositivos e integrações</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Save className="w-4 h-4" />
              Salvar Alterações
            </button>
          </div>
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

      {/* Tab: Unidades */}
      {currentTab === 'units' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">Gerencie as unidades do sistema</p>
            <button
              onClick={() => setShowNewUnitModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Unidade
            </button>
          </div>

          <div className="space-y-3">
            {mockUnits.map(unit => (
              <div key={unit.id} className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`p-3 rounded-lg ${
                      unit.type === 'hospital' ? 'bg-blue-100' :
                      unit.type === 'clinic' ? 'bg-green-100' :
                      'bg-purple-100'
                    }`}>
                      <Building2 className={`w-6 h-6 ${
                        unit.type === 'hospital' ? 'text-blue-600' :
                        unit.type === 'clinic' ? 'text-green-600' :
                        'text-purple-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-gray-800">{unit.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          unit.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {unit.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                          {unitTypeLabels[unit.type]}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="w-4 h-4" />
                          <span>{unit.address}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone className="w-4 h-4" />
                          <span>{unit.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Mail className="w-4 h-4" />
                          <span>{unit.email}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Editar">
                      <Edit className="w-4 h-4 text-gray-600" />
                    </button>
                    <button className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Estrutura Física */}
      {currentTab === 'structure' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">Hierarquia: Andares → Setores → Quartos → Leitos</p>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Plus className="w-4 h-4" />
              Adicionar Andar
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="space-y-2">
              {structure.map(floor => (
                <div key={floor.id}>
                  {/* Floor */}
                  <button
                    onClick={() => toggleFloor(floor.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    {floor.expanded ? <ChevronDown className="w-5 h-5 text-blue-600" /> : <ChevronRight className="w-5 h-5 text-blue-600" />}
                    <Layers className="w-5 h-5 text-blue-600" />
                    <span className="flex-1 text-left text-gray-800">{floor.name}</span>
                    <span className="text-xs text-gray-500">{floor.sectors.length} setores</span>
                  </button>

                  {floor.expanded && (
                    <div className="ml-8 mt-2 space-y-2">
                      {floor.sectors.map(sector => (
                        <div key={sector.id}>
                          {/* Sector */}
                          <button
                            onClick={() => toggleSector(floor.id, sector.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                          >
                            {sector.expanded ? <ChevronDown className="w-5 h-5 text-green-600" /> : <ChevronRight className="w-5 h-5 text-green-600" />}
                            <Building2 className="w-5 h-5 text-green-600" />
                            <div className="flex-1 text-left">
                              <p className="text-gray-800">{sector.name}</p>
                              <p className="text-xs text-gray-500">{sector.type}</p>
                            </div>
                            <span className="text-xs text-gray-500">{sector.rooms.length} quartos</span>
                          </button>

                          {sector.expanded && (
                            <div className="ml-8 mt-2 space-y-2">
                              {sector.rooms.map(room => (
                                <div key={room.id}>
                                  {/* Room */}
                                  <button
                                    onClick={() => toggleRoom(floor.id, sector.id, room.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                                  >
                                    {room.expanded ? <ChevronDown className="w-5 h-5 text-purple-600" /> : <ChevronRight className="w-5 h-5 text-purple-600" />}
                                    <span className="text-gray-800">Quarto {room.number}</span>
                                    <span className="text-xs text-gray-500 ml-auto">{room.beds.length} leitos</span>
                                  </button>

                                  {room.expanded && (
                                    <div className="ml-8 mt-2 grid grid-cols-4 gap-2">
                                      {room.beds.map(bed => (
                                        <div
                                          key={bed.id}
                                          className={`px-3 py-2 rounded-lg border-2 ${
                                            bed.status === 'occupied' ? 'border-red-200 bg-red-50' :
                                            bed.status === 'available' ? 'border-green-200 bg-green-50' :
                                            'border-gray-200 bg-gray-50'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-gray-600">Leito</span>
                                            <span className={`w-2 h-2 rounded-full ${
                                              bed.status === 'occupied' ? 'bg-red-500' :
                                              bed.status === 'available' ? 'bg-green-500' :
                                              'bg-gray-400'
                                            }`}></span>
                                          </div>
                                          <p className="text-gray-800 mb-1">{bed.code}</p>
                                          <span className={`text-xs px-2 py-0.5 rounded-full ${bedStatusConfig[bed.status].color}`}>
                                            {bedStatusConfig[bed.status].label}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Dispositivos */}
      {currentTab === 'devices' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">Gerencie câmeras, sensores e tablets</p>
            <button
              onClick={() => setShowNewDeviceModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar Dispositivo
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mockDevices.map(device => {
              const config = deviceTypeConfig[device.type];
              return (
                <div key={device.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${config.color}`}>
                        {config.icon}
                      </div>
                      <div>
                        <h3 className="text-gray-800 mb-1">{device.name}</h3>
                        <p className="text-xs text-gray-500 mb-2">{device.location}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                            {config.label}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                            device.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {device.status === 'online' ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                            {device.status === 'online' ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      <Edit className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  <div className="border-t border-gray-200 pt-3 flex items-center justify-between text-xs">
                    <span className="text-gray-500">ID: {device.deviceId}</span>
                    <span className="text-gray-500">Última sinc: {device.lastSync}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
              <Camera className="w-8 h-8 text-blue-600 mb-2" />
              <p className="text-2xl text-gray-800">2</p>
              <p className="text-xs text-gray-600">Câmeras</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-4">
              <Settings className="w-8 h-8 text-purple-600 mb-2" />
              <p className="text-2xl text-gray-800">1</p>
              <p className="text-xs text-gray-600">Sensores</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
              <Phone className="w-8 h-8 text-green-600 mb-2" />
              <p className="text-2xl text-gray-800">1</p>
              <p className="text-xs text-gray-600">Tablets</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-100 p-4">
              <PowerOff className="w-8 h-8 text-orange-600 mb-2" />
              <p className="text-2xl text-gray-800">1</p>
              <p className="text-xs text-gray-600">Offline</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tipos de Alertas */}
      {currentTab === 'alerts' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">Configure tipos de alertas e IA</p>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Plus className="w-4 h-4" />
              Criar Alerta Personalizado
            </button>
          </div>

          <div className="space-y-3">
            {mockAlertTypes.map(alert => {
              const categoryConfig = alertCategoryConfig[alert.category];
              const severityConf = severityConfig[alert.severity];

              return (
                <div key={alert.id} className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-gray-800">{alert.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs ${categoryConfig.color}`}>
                          {categoryConfig.label}
                        </span>
                        <span className={`text-xs ${severityConf.color}`}>
                          {severityConf.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{alert.description}</p>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={alert.enabled} className="w-4 h-4 rounded border-gray-300 text-[#0EA5E9] focus:ring-[#0EA5E9]" readOnly />
                          <span className="text-sm text-gray-700">Alerta ativo</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={alert.aiEnabled} className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-600" readOnly />
                          <span className="text-sm text-gray-700">IA habilitada</span>
                        </label>
                      </div>
                    </div>
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      <Settings className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Integrações */}
      {currentTab === 'integrations' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">APIs, Webhooks e sistemas externos</p>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Plus className="w-4 h-4" />
              Nova Integração
            </button>
          </div>

          <div className="space-y-3">
            {mockIntegrations.map(integration => (
              <div key={integration.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`p-3 rounded-lg ${
                      integration.type === 'api' ? 'bg-blue-100' :
                      integration.type === 'webhook' ? 'bg-purple-100' :
                      'bg-gray-100'
                    }`}>
                      <Plug className={`w-6 h-6 ${
                        integration.type === 'api' ? 'text-blue-600' :
                        integration.type === 'webhook' ? 'text-purple-600' :
                        'text-gray-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-gray-800">{integration.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${
                          integration.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {integration.status === 'active' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {integration.status === 'active' ? 'Ativa' : 'Inativa'}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs uppercase">
                          {integration.type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1 font-mono">{integration.endpoint}</p>
                      {integration.lastSync && (
                        <p className="text-xs text-gray-500">Última sinc: {integration.lastSync}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Editar">
                      <Edit className="w-4 h-4 text-gray-600" />
                    </button>
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Testar">
                      <Settings className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm text-blue-800 mb-2">📘 Documentação da API</h4>
            <p className="text-xs text-blue-700 mb-3">Acesse a documentação completa para integrar sistemas externos ao MedSignal.</p>
            <button className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition-colors">
              Ver Documentação →
            </button>
          </div>
        </div>
      )}

      {/* Modal: Nova Unidade */}
      {showNewUnitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-white text-lg">Nova Unidade</h3>
              <button
                onClick={() => setShowNewUnitModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-1 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Nome da Unidade *</label>
                  <input
                    type="text"
                    placeholder="Ex: Hospital Central"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Tipo *</label>
                  <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                    <option>Hospital</option>
                    <option>Clínica</option>
                    <option>Casa de Repouso</option>
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
                  <label className="block text-sm text-gray-700 mb-2">Endereço *</label>
                  <input
                    type="text"
                    placeholder="Rua, número - Bairro"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Telefone</label>
                  <input
                    type="tel"
                    placeholder="(11) 3000-0000"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">E-mail</label>
                  <input
                    type="email"
                    placeholder="contato@hospital.com.br"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowNewUnitModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
                Criar Unidade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo Dispositivo */}
      {showNewDeviceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-white text-lg">Adicionar Dispositivo</h3>
              <button
                onClick={() => setShowNewDeviceModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-1 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Nome do Dispositivo *</label>
                  <input
                    type="text"
                    placeholder="Ex: Câmera UTI 301-A"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Tipo *</label>
                  <select className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                    <option>Câmera</option>
                    <option>Sensor</option>
                    <option>Tablet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">ID do Dispositivo *</label>
                  <input
                    type="text"
                    placeholder="CAM-UTI-301A"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Localização *</label>
                  <input
                    type="text"
                    placeholder="3º Andar → UTI → Quarto 301 → Leito A"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowNewDeviceModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
                Adicionar Dispositivo
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
