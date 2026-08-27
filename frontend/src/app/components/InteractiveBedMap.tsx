import React, { useState } from 'react';
import { BedDouble, User, AlertCircle, Clock, Activity, Droplet, Heart, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface BedDetail {
  id: string;
  number: string;
  status: 'occupied' | 'available' | 'cleaning' | 'maintenance';
  patient?: {
    name: string;
    age: number;
    admissionDate: string;
    diagnosis: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
  vitals?: {
    heartRate: number;
    bloodPressure: string;
    oxygen: number;
    temperature: number;
  };
  lastCleaned?: string;
  expectedDischarge?: string;
}

const mockBedsData: BedDetail[] = [
  {
    id: '301-A',
    number: '301-A',
    status: 'occupied',
    patient: {
      name: 'Maria Silva Santos',
      age: 78,
      admissionDate: '18/12/2024',
      diagnosis: 'Insuficiência Cardíaca',
      riskLevel: 'high'
    },
    vitals: {
      heartRate: 92,
      bloodPressure: '140/90',
      oxygen: 94,
      temperature: 37.2
    },
    expectedDischarge: '28/12/2024'
  },
  {
    id: '301-B',
    number: '301-B',
    status: 'available',
    lastCleaned: '25/12/2024 14:30'
  },
  {
    id: '302-A',
    number: '302-A',
    status: 'occupied',
    patient: {
      name: 'João Pereira',
      age: 65,
      admissionDate: '20/12/2024',
      diagnosis: 'Pneumonia',
      riskLevel: 'medium'
    },
    vitals: {
      heartRate: 78,
      bloodPressure: '130/85',
      oxygen: 96,
      temperature: 37.8
    },
    expectedDischarge: '26/12/2024'
  },
  {
    id: '302-B',
    number: '302-B',
    status: 'cleaning'
  },
  {
    id: '303-A',
    number: '303-A',
    status: 'occupied',
    patient: {
      name: 'Ana Costa',
      age: 82,
      admissionDate: '22/12/2024',
      diagnosis: 'Fratura de Fêmur',
      riskLevel: 'low'
    },
    vitals: {
      heartRate: 72,
      bloodPressure: '125/80',
      oxygen: 98,
      temperature: 36.8
    },
    expectedDischarge: '30/12/2024'
  },
  {
    id: '303-B',
    number: '303-B',
    status: 'maintenance'
  },
  {
    id: '304-A',
    number: '304-A',
    status: 'available',
    lastCleaned: '25/12/2024 16:00'
  },
  {
    id: '304-B',
    number: '304-B',
    status: 'available',
    lastCleaned: '25/12/2024 15:45'
  },
  {
    id: '205-A',
    number: '205-A',
    status: 'occupied',
    patient: {
      name: 'Carlos Mendes',
      age: 70,
      admissionDate: '21/12/2024',
      diagnosis: 'AVC Isquêmico',
      riskLevel: 'high'
    },
    vitals: {
      heartRate: 88,
      bloodPressure: '145/95',
      oxygen: 93,
      temperature: 37.5
    },
    expectedDischarge: '29/12/2024'
  },
  {
    id: '205-B',
    number: '205-B',
    status: 'available',
    lastCleaned: '25/12/2024 13:00'
  }
];

export function InteractiveBedMap() {
  const [selectedBed, setSelectedBed] = useState<BedDetail | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredBeds = mockBedsData.filter(bed => 
    filterStatus === 'all' || bed.status === filterStatus
  );

  const stats = {
    total: mockBedsData.length,
    occupied: mockBedsData.filter(b => b.status === 'occupied').length,
    available: mockBedsData.filter(b => b.status === 'available').length,
    cleaning: mockBedsData.filter(b => b.status === 'cleaning').length,
    maintenance: mockBedsData.filter(b => b.status === 'maintenance').length
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'occupied': return 'bg-red-500';
      case 'available': return 'bg-green-500';
      case 'cleaning': return 'bg-yellow-500';
      case 'maintenance': return 'bg-gray-500';
      default: return 'bg-gray-300';
    }
  };

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Bed Map */}
      <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-gray-800">Mapa de Leitos em Tempo Real</h2>
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            >
              <option value="all">Todos os Status</option>
              <option value="occupied">Ocupados</option>
              <option value="available">Disponíveis</option>
              <option value="cleaning">Em Higienização</option>
              <option value="maintenance">Em Manutenção</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl text-gray-800">{stats.total}</p>
            <p className="text-xs text-gray-600">Total</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center border border-red-100">
            <p className="text-2xl text-red-600">{stats.occupied}</p>
            <p className="text-xs text-red-700">Ocupados</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
            <p className="text-2xl text-green-600">{stats.available}</p>
            <p className="text-xs text-green-700">Disponíveis</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3 text-center border border-yellow-100">
            <p className="text-2xl text-yellow-600">{stats.cleaning}</p>
            <p className="text-xs text-yellow-700">Limpeza</p>
          </div>
          <div className="bg-gray-100 rounded-lg p-3 text-center border border-gray-200">
            <p className="text-2xl text-gray-600">{stats.maintenance}</p>
            <p className="text-xs text-gray-700">Manutenção</p>
          </div>
        </div>

        {/* Bed Grid */}
        <div className="grid grid-cols-4 gap-4">
          {filteredBeds.map(bed => (
            <button
              key={bed.id}
              onClick={() => setSelectedBed(bed)}
              className={`relative p-4 rounded-lg border-2 transition-all hover:shadow-lg ${
                selectedBed?.id === bed.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-700">{bed.number}</span>
                <div className={`w-3 h-3 rounded-full ${getStatusColor(bed.status)}`}></div>
              </div>
              
              <BedDouble className={`w-8 h-8 mb-2 ${
                bed.status === 'occupied' ? 'text-red-400' :
                bed.status === 'available' ? 'text-green-400' :
                bed.status === 'cleaning' ? 'text-yellow-400' :
                'text-gray-400'
              }`} />

              {bed.patient && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 truncate">{bed.patient.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {bed.patient.riskLevel === 'high' && <AlertCircle className="w-3 h-3 text-red-500" />}
                    {bed.patient.riskLevel === 'medium' && <AlertCircle className="w-3 h-3 text-yellow-500" />}
                    <span className={`text-xs ${getRiskColor(bed.patient.riskLevel)}`}>
                      {bed.patient.riskLevel === 'high' ? 'Alto Risco' : 
                       bed.patient.riskLevel === 'medium' ? 'Médio' : 'Baixo'}
                    </span>
                  </div>
                </div>
              )}

              {bed.status === 'available' && (
                <p className="text-xs text-green-600 mt-2">Disponível</p>
              )}

              {bed.status === 'cleaning' && (
                <div className="flex items-center gap-1 mt-2">
                  <RefreshCw className="w-3 h-3 text-yellow-600" />
                  <p className="text-xs text-yellow-600">Limpeza</p>
                </div>
              )}

              {bed.status === 'maintenance' && (
                <p className="text-xs text-gray-600 mt-2">Manutenção</p>
              )}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center gap-6 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Ocupado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Disponível</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Higienização</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-500"></div>
            <span>Manutenção</span>
          </div>
        </div>
      </div>

      {/* Bed Detail Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {selectedBed ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-800">Leito {selectedBed.number}</h3>
              <div className={`px-3 py-1 rounded-full text-xs ${
                selectedBed.status === 'occupied' ? 'bg-red-100 text-red-700' :
                selectedBed.status === 'available' ? 'bg-green-100 text-green-700' :
                selectedBed.status === 'cleaning' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {selectedBed.status === 'occupied' ? 'Ocupado' :
                 selectedBed.status === 'available' ? 'Disponível' :
                 selectedBed.status === 'cleaning' ? 'Limpeza' : 'Manutenção'}
              </div>
            </div>

            {selectedBed.patient ? (
              <div className="space-y-4">
                {/* Patient Info */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-600">Paciente</span>
                  </div>
                  <p className="text-gray-800 font-medium">{selectedBed.patient.name}</p>
                  <p className="text-sm text-gray-600">{selectedBed.patient.age} anos</p>
                </div>

                {/* Diagnosis */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Diagnóstico</p>
                  <p className="text-sm text-gray-800">{selectedBed.patient.diagnosis}</p>
                </div>

                {/* Risk Level */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Nível de Risco</p>
                  <div className="flex items-center gap-2">
                    {selectedBed.patient.riskLevel === 'high' && (
                      <span className="px-3 py-1 rounded-full text-sm bg-red-100 text-red-700 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        Alto Risco
                      </span>
                    )}
                    {selectedBed.patient.riskLevel === 'medium' && (
                      <span className="px-3 py-1 rounded-full text-sm bg-yellow-100 text-yellow-700">
                        Médio Risco
                      </span>
                    )}
                    {selectedBed.patient.riskLevel === 'low' && (
                      <span className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-700 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Baixo Risco
                      </span>
                    )}
                  </div>
                </div>

                {/* Vitals */}
                {selectedBed.vitals && (
                  <div>
                    <p className="text-xs text-gray-500 mb-3">Sinais Vitais</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                        <div className="flex items-center gap-2">
                          <Heart className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-gray-600">Frequência Cardíaca</span>
                        </div>
                        <span className="text-sm text-gray-800 font-medium">{selectedBed.vitals.heartRate} bpm</span>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-purple-500" />
                          <span className="text-sm text-gray-600">Pressão Arterial</span>
                        </div>
                        <span className="text-sm text-gray-800 font-medium">{selectedBed.vitals.bloodPressure} mmHg</span>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                        <div className="flex items-center gap-2">
                          <Droplet className="w-4 h-4 text-blue-500" />
                          <span className="text-sm text-gray-600">SpO2</span>
                        </div>
                        <span className={`text-sm font-medium ${
                          selectedBed.vitals.oxygen >= 95 ? 'text-green-600' :
                          selectedBed.vitals.oxygen >= 90 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>{selectedBed.vitals.oxygen}%</span>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-orange-500" />
                          <span className="text-sm text-gray-600">Temperatura</span>
                        </div>
                        <span className="text-sm text-gray-800 font-medium">{selectedBed.vitals.temperature}°C</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Internação</p>
                    <p className="text-sm text-gray-800">{selectedBed.patient.admissionDate}</p>
                  </div>
                  {selectedBed.expectedDischarge && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Previsão Alta</p>
                      <p className="text-sm text-gray-800">{selectedBed.expectedDischarge}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-gray-200 space-y-2">
                  <button className="w-full px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
                    Ver Prontuário Completo
                  </button>
                  <button className="w-full px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                    Histórico de Sinais Vitais
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedBed.status === 'available' && (
                  <>
                    <div className="flex items-center justify-center p-8 bg-green-50 rounded-lg">
                      <CheckCircle className="w-16 h-16 text-green-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-gray-800 font-medium mb-1">Leito Disponível</p>
                      <p className="text-sm text-gray-600">Pronto para nova internação</p>
                    </div>
                    {selectedBed.lastCleaned && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">Última higienização</p>
                        <p className="text-sm text-gray-800">{selectedBed.lastCleaned}</p>
                      </div>
                    )}
                    <button className="w-full px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
                      Reservar Leito
                    </button>
                  </>
                )}

                {selectedBed.status === 'cleaning' && (
                  <>
                    <div className="flex items-center justify-center p-8 bg-yellow-50 rounded-lg">
                      <RefreshCw className="w-16 h-16 text-yellow-500 animate-spin" />
                    </div>
                    <div className="text-center">
                      <p className="text-gray-800 font-medium mb-1">Em Higienização</p>
                      <p className="text-sm text-gray-600">Processo de limpeza em andamento</p>
                    </div>
                  </>
                )}

                {selectedBed.status === 'maintenance' && (
                  <>
                    <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg">
                      <XCircle className="w-16 h-16 text-gray-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-gray-800 font-medium mb-1">Em Manutenção</p>
                      <p className="text-sm text-gray-600">Leito indisponível temporariamente</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <BedDouble className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500">Selecione um leito no mapa para ver detalhes</p>
          </div>
        )}
      </div>
    </div>
  );
}
