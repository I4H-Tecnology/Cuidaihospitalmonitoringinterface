import React, { useState } from 'react';
import { Plus, Settings, Search, ChevronDown, ChevronRight, Building, BedDouble, AlertCircle, Eye, RefreshCw, Ban, CheckCircle } from 'lucide-react';
import { InteractiveBedMap } from './InteractiveBedMap';

interface Bed {
  id: string;
  name: string;
  status: 'occupied' | 'available' | 'blocked';
  patient?: {
    name: string;
    status: 'stable' | 'attention' | 'critical';
    lastEvent: string;
  };
  alerts: number;
  aiRisk?: 'low' | 'moderate' | 'high';
  blockReason?: string;
}

interface Room {
  id: string;
  number: string;
  type: 'uti' | 'ward' | 'isolation';
  beds: Bed[];
  alerts: number;
}

interface Floor {
  id: string;
  name: string;
  rooms: Room[];
}

const mockData: Floor[] = [
  {
    id: 'floor-1',
    name: '1º Andar - UTI',
    rooms: [
      {
        id: 'room-101',
        number: 'Quarto 101',
        type: 'uti',
        alerts: 2,
        beds: [
          {
            id: 'bed-101a',
            name: 'Leito A',
            status: 'occupied',
            patient: {
              name: 'Maria Silva Santos',
              status: 'critical',
              lastEvent: 'Queda detectada - há 2h'
            },
            alerts: 2,
            aiRisk: 'high'
          },
          {
            id: 'bed-101b',
            name: 'Leito B',
            status: 'occupied',
            patient: {
              name: 'João Pereira Souza',
              status: 'attention',
              lastEvent: 'FC elevada - há 5h'
            },
            alerts: 1,
            aiRisk: 'moderate'
          }
        ]
      },
      {
        id: 'room-102',
        number: 'Quarto 102',
        type: 'uti',
        alerts: 1,
        beds: [
          {
            id: 'bed-102a',
            name: 'Leito A',
            status: 'occupied',
            patient: {
              name: 'Carlos Mendes Oliveira',
              status: 'attention',
              lastEvent: 'Temperatura elevada - há 3h'
            },
            alerts: 1,
            aiRisk: 'moderate'
          },
          {
            id: 'bed-102b',
            name: 'Leito B',
            status: 'blocked',
            blockReason: 'Em manutenção',
            alerts: 0
          }
        ]
      },
      {
        id: 'room-103',
        number: 'Quarto 103',
        type: 'uti',
        alerts: 0,
        beds: [
          {
            id: 'bed-103a',
            name: 'Leito A',
            status: 'available',
            alerts: 0
          },
          {
            id: 'bed-103b',
            name: 'Leito B',
            status: 'available',
            alerts: 0
          }
        ]
      }
    ]
  },
  {
    id: 'floor-2',
    name: '2º Andar - Cardiologia',
    rooms: [
      {
        id: 'room-201',
        number: 'Quarto 201',
        type: 'ward',
        alerts: 0,
        beds: [
          {
            id: 'bed-201a',
            name: 'Leito A',
            status: 'occupied',
            patient: {
              name: 'Ana Costa Lima',
              status: 'stable',
              lastEvent: 'Sinais vitais normais - há 1h'
            },
            alerts: 0,
            aiRisk: 'low'
          }
        ]
      },
      {
        id: 'room-202',
        number: 'Quarto 202',
        type: 'ward',
        alerts: 1,
        beds: [
          {
            id: 'bed-202a',
            name: 'Leito A',
            status: 'occupied',
            patient: {
              name: 'Lucia Martins Rocha',
              status: 'stable',
              lastEvent: 'Evolução médica - há 2h'
            },
            alerts: 0,
            aiRisk: 'low'
          },
          {
            id: 'bed-202b',
            name: 'Leito B',
            status: 'occupied',
            patient: {
              name: 'Pedro Santos Oliveira',
              status: 'attention',
              lastEvent: 'Medicação administrada - há 30min'
            },
            alerts: 1,
            aiRisk: 'moderate'
          }
        ]
      },
      {
        id: 'room-203',
        number: 'Quarto 203',
        type: 'ward',
        alerts: 0,
        beds: [
          {
            id: 'bed-203a',
            name: 'Leito A',
            status: 'blocked',
            blockReason: 'Em limpeza',
            alerts: 0
          },
          {
            id: 'bed-203b',
            name: 'Leito B',
            status: 'available',
            alerts: 0
          }
        ]
      }
    ]
  },
  {
    id: 'floor-3',
    name: '3º Andar - Geriatria',
    rooms: [
      {
        id: 'room-301',
        number: 'Quarto 301',
        type: 'ward',
        alerts: 0,
        beds: [
          {
            id: 'bed-301a',
            name: 'Leito A',
            status: 'occupied',
            patient: {
              name: 'Roberto Alves Ferreira',
              status: 'stable',
              lastEvent: 'Glicemia controlada - há 4h'
            },
            alerts: 0,
            aiRisk: 'low'
          },
          {
            id: 'bed-301b',
            name: 'Leito B',
            status: 'occupied',
            patient: {
              name: 'Helena Souza Costa',
              status: 'stable',
              lastEvent: 'Deambulando com auxílio - há 1h'
            },
            alerts: 0,
            aiRisk: 'low'
          }
        ]
      },
      {
        id: 'room-302',
        number: 'Quarto 302',
        type: 'isolation',
        alerts: 0,
        beds: [
          {
            id: 'bed-302a',
            name: 'Leito A',
            status: 'occupied',
            patient: {
              name: 'Francisco Lima Santos',
              status: 'stable',
              lastEvent: 'Fisioterapia realizada - há 2h'
            },
            alerts: 0,
            aiRisk: 'low'
          }
        ]
      },
      {
        id: 'room-303',
        number: 'Quarto 303',
        type: 'ward',
        alerts: 0,
        beds: [
          {
            id: 'bed-303a',
            name: 'Leito A',
            status: 'available',
            alerts: 0
          },
          {
            id: 'bed-303b',
            name: 'Leito B',
            status: 'available',
            alerts: 0
          }
        ]
      }
    ]
  }
];

export function BedsRoomsScreen() {
  const [expandedFloor, setExpandedFloor] = useState<string | null>(null);
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'occupied' | 'available' | 'blocked'>('all');
  const [viewMode, setViewMode] = useState<'hierarchy' | 'map'>('hierarchy');

  // Calculate stats
  const allBeds = mockData.flatMap(floor => 
    floor.rooms.flatMap(room => room.beds)
  );
  
  const totalBeds = allBeds.length;
  const occupiedBeds = allBeds.filter(bed => bed.status === 'occupied').length;
  const availableBeds = allBeds.filter(bed => bed.status === 'available').length;
  const blockedBeds = allBeds.filter(bed => bed.status === 'blocked').length;
  const totalAlerts = allBeds.reduce((sum, bed) => sum + bed.alerts, 0);
  const occupancyRate = Math.round((occupiedBeds / totalBeds) * 100);

  const roomTypeConfig = {
    uti: { label: 'UTI', color: 'bg-red-100 text-red-700', icon: '🚨' },
    ward: { label: 'Enfermaria', color: 'bg-blue-100 text-blue-700', icon: '🏥' },
    isolation: { label: 'Isolamento', color: 'bg-purple-100 text-purple-700', icon: '🔒' }
  };

  const bedStatusConfig = {
    occupied: { label: 'Ocupado', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    available: { label: 'Livre', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    blocked: { label: 'Bloqueado', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500' }
  };

  const patientStatusConfig = {
    stable: { label: 'Estável', color: 'bg-green-100 text-green-700' },
    attention: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700' },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700' }
  };

  const aiRiskConfig = {
    low: { label: 'Baixo', color: 'bg-blue-100 text-blue-700' },
    moderate: { label: 'Moderado', color: 'bg-yellow-100 text-yellow-700' },
    high: { label: 'Alto', color: 'bg-red-100 text-red-700' }
  };

  const toggleFloor = (floorId: string) => {
    setExpandedFloor(expandedFloor === floorId ? null : floorId);
    setExpandedRoom(null);
  };

  const toggleRoom = (roomId: string) => {
    setExpandedRoom(expandedRoom === roomId ? null : roomId);
  };

  const getRoomStatus = (room: Room) => {
    const totalBeds = room.beds.length;
    const occupiedBeds = room.beds.filter(b => b.status === 'occupied').length;
    
    if (occupiedBeds === 0) return { label: 'Vazio', color: 'bg-green-100 text-green-700' };
    if (occupiedBeds === totalBeds) return { label: 'Totalmente Ocupado', color: 'bg-blue-100 text-blue-700' };
    return { label: 'Parcialmente Ocupado', color: 'bg-yellow-100 text-yellow-700' };
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Leitos e Quartos</h1>
          <p className="text-sm text-gray-500">
            {totalBeds} leitos totais • Taxa de ocupação: {occupancyRate}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Configurar Estrutura
          </button>
          <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Novo Quarto
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Total de Leitos</p>
          <p className="text-3xl text-gray-800 mb-1">{totalBeds}</p>
          <p className="text-xs text-gray-400">Capacidade total</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-blue-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Leitos Ocupados</p>
          <p className="text-3xl text-gray-800 mb-1">{occupiedBeds}</p>
          <p className="text-xs text-gray-400">{occupancyRate}% de ocupação</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-green-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Leitos Livres</p>
          <p className="text-3xl text-gray-800 mb-1">{availableBeds}</p>
          <p className="text-xs text-gray-400">Disponíveis</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-gray-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Leitos Bloqueados</p>
          <p className="text-3xl text-gray-800 mb-1">{blockedBeds}</p>
          <p className="text-xs text-gray-400">Manutenção/Limpeza</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-yellow-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Alertas Ativos</p>
          <p className="text-3xl text-gray-800 mb-1">{totalAlerts}</p>
          <p className="text-xs text-gray-400">Em leitos ocupados</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('hierarchy')}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                viewMode === 'hierarchy' ? 'bg-white text-[#0EA5E9] shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Hierarquia
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                viewMode === 'map' ? 'bg-white text-[#0EA5E9] shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Mapa Interativo
            </button>
          </div>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por quarto ou leito..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
          >
            <option value="all">Todos os status</option>
            <option value="occupied">Ocupados</option>
            <option value="available">Livres</option>
            <option value="blocked">Bloqueados</option>
          </select>
        </div>
      </div>

      {/* Content - Conditional Rendering */}
      {viewMode === 'map' ? (
        <InteractiveBedMap />
      ) : (
        <div className="space-y-4">
          {/* Floors Structure */}
          {mockData.map(floor => {
            const floorBeds = floor.rooms.flatMap(r => r.beds);
            const floorOccupied = floorBeds.filter(b => b.status === 'occupied').length;
            const floorTotal = floorBeds.length;
            const floorAlerts = floor.rooms.reduce((sum, r) => sum + r.alerts, 0);
            const isFloorExpanded = expandedFloor === floor.id;

            return (
              <div key={floor.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {/* Floor Header */}
                <button
                  onClick={() => toggleFloor(floor.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#E8F4F8] rounded-lg flex items-center justify-center">
                      <Building className="w-6 h-6 text-[#0A7EA4]" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-gray-800 mb-1">{floor.name}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>🛏️ {floorOccupied}/{floorTotal} leitos ocupados</span>
                        <span>{floor.rooms.length} quartos</span>
                        {floorAlerts > 0 && (
                          <span className="flex items-center gap-1 text-yellow-600">
                            <AlertCircle className="w-4 h-4" />
                            {floorAlerts} alertas
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isFloorExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {/* Rooms */}
                {isFloorExpanded && (
                  <div className="px-6 pb-4 space-y-3">
                    {floor.rooms.map(room => {
                      const roomStatus = getRoomStatus(room);
                      const roomType = roomTypeConfig[room.type];
                      const isRoomExpanded = expandedRoom === room.id;
                      const roomOccupied = room.beds.filter(b => b.status === 'occupied').length;

                      return (
                        <div key={room.id} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                          {/* Room Header */}
                          <button
                            onClick={() => toggleRoom(room.id)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <BedDouble className="w-5 h-5 text-[#0A7EA4]" />
                              <div className="text-left">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm text-gray-800">{room.number}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs ${roomType.color}`}>
                                    {roomType.icon} {roomType.label}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs ${roomStatus.color}`}>
                                    {roomStatus.label}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500">
                                  {roomOccupied}/{room.beds.length} leitos ocupados
                                  {room.alerts > 0 && ` • ${room.alerts} alerta(s)`}
                                </p>
                              </div>
                            </div>
                            {isRoomExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                          </button>

                          {/* Beds */}
                          {isRoomExpanded && (
                            <div className="px-4 pb-3 space-y-2">
                              {room.beds.map(bed => {
                                const bedStatus = bedStatusConfig[bed.status];

                                return (
                                  <div
                                    key={bed.id}
                                    className="bg-white rounded-lg border border-gray-200 p-4"
                                  >
                                    <div className="flex items-start justify-between mb-3">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <h4 className="text-gray-800">{bed.name}</h4>
                                          <span className={`px-2 py-1 rounded-full text-xs ${bedStatus.color} flex items-center gap-1`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${bedStatus.dot}`}></span>
                                            {bedStatus.label}
                                          </span>
                                          {bed.alerts > 0 && (
                                            <span className="px-2 py-1 bg-yellow-50 text-yellow-600 rounded text-xs flex items-center gap-1">
                                              <AlertCircle className="w-3 h-3" />
                                              {bed.alerts}
                                            </span>
                                          )}
                                          {bed.aiRisk && (
                                            <span className={`px-2 py-1 rounded-full text-xs ${aiRiskConfig[bed.aiRisk].color}`}>
                                              🤖 Risco {aiRiskConfig[bed.aiRisk].label}
                                            </span>
                                          )}
                                        </div>

                                        {bed.status === 'occupied' && bed.patient && (
                                          <div className="space-y-1">
                                            <p className="text-sm text-gray-700">
                                              👤 {bed.patient.name}
                                            </p>
                                            <span className={`inline-block px-2 py-1 rounded-full text-xs ${patientStatusConfig[bed.patient.status].color}`}>
                                              {patientStatusConfig[bed.patient.status].label}
                                            </span>
                                            <p className="text-xs text-gray-500 mt-1">
                                              {bed.patient.lastEvent}
                                            </p>
                                          </div>
                                        )}

                                        {bed.status === 'blocked' && (
                                          <p className="text-sm text-gray-600">
                                            🚫 {bed.blockReason}
                                          </p>
                                        )}
                                      </div>

                                      {/* Actions */}
                                      <div className="flex items-center gap-2 ml-4">
                                        {bed.status === 'occupied' && (
                                          <>
                                            <button className="px-3 py-1.5 bg-[#E8F4F8] text-[#0A7EA4] rounded-lg text-xs hover:bg-[#D6EEF5] transition-colors flex items-center gap-1">
                                              <Eye className="w-3 h-3" />
                                              Ver Paciente
                                            </button>
                                            <button className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1">
                                              <RefreshCw className="w-3 h-3" />
                                              Transferir
                                            </button>
                                          </>
                                        )}
                                        {bed.status === 'available' && (
                                          <button className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1">
                                            <Ban className="w-3 h-3" />
                                            Bloquear
                                          </button>
                                        )}
                                        {bed.status === 'blocked' && (
                                          <button className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition-colors flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" />
                                            Liberar
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}