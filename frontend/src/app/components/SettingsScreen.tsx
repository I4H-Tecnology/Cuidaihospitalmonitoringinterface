import { useState } from 'react';
import { Building2, Layers, Camera, Bell, Plug, Plus, Edit, ChevronRight, ChevronDown, Settings, Check, X, Save } from 'lucide-react';
import { AbaClinica } from './settings/AbaClinica';
import { AbaCameras } from './settings/AbaCameras';

type SettingsTab = 'units' | 'structure' | 'devices' | 'alerts' | 'integrations';

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

  const tabs = [
    { id: 'units' as const, label: 'Unidades', icon: Building2 },
    { id: 'structure' as const, label: 'Estrutura Física', icon: Layers },
    { id: 'devices' as const, label: 'Dispositivos', icon: Camera },
    { id: 'alerts' as const, label: 'Tipos de Alertas', icon: Bell },
    { id: 'integrations' as const, label: 'Integrações', icon: Plug }
  ];

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
            <p className="text-sm text-gray-500">Cadastro da clínica, câmeras, tipos de alerta e integrações</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Cada aba salva no próprio formulário; não há "salvar tudo". Fica
                visível e travado, com o motivo, em vez de sumir. */}
            <button
              type="button"
              disabled
              title="Cada formulário salva sozinho ao confirmar; não há alteração pendente para salvar aqui."
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed"
            >
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

      {/* Tab: Unidades — a clínica do tenant, de /api/clinica */}
      {currentTab === 'units' && <AbaClinica />}

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

      {/* Tab: Dispositivos — câmeras reais, de /api/cameras */}
      {currentTab === 'devices' && <AbaCameras />}

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

    </main>
  );
}
