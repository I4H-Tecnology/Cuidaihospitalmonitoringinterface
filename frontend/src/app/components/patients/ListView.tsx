import React, { useState } from 'react';
import { Search, Filter, Eye, Edit, MoreVertical, AlertCircle } from 'lucide-react';
import { PatientData } from '../PatientsScreen';

interface ListViewProps {
  patients: PatientData[];
}

export function ListView({ patients }: ListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFloor, setFilterFloor] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'lastUpdate' | 'critical'>('lastUpdate');

  // Get unique floors
  const floors = Array.from(new Set(patients.map(p => p.floor)));

  // Filter patients
  let filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.bed.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.diagnosis.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFloor = filterFloor === 'all' || patient.floor === filterFloor;
    const matchesStatus = filterStatus === 'all' || patient.status === filterStatus;
    
    return matchesSearch && matchesFloor && matchesStatus;
  });

  // Sort patients
  if (sortBy === 'critical') {
    filteredPatients = [...filteredPatients].sort((a, b) => {
      const statusOrder = { critical: 0, attention: 1, stable: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
  }

  const statusConfig = {
    stable: { label: 'Estável', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    attention: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  };

  const aiRiskConfig = {
    low: { label: 'Baixo', color: 'bg-blue-100 text-blue-700' },
    moderate: { label: 'Moderado', color: 'bg-yellow-100 text-yellow-700' },
    high: { label: 'Alto', color: 'bg-red-100 text-red-700' }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Search */}
          <div className="lg:col-span-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome, leito ou diagnóstico..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
              />
            </div>
          </div>

          {/* Filter by Floor */}
          <div className="lg:col-span-2">
            <select
              value={filterFloor}
              onChange={(e) => setFilterFloor(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
            >
              <option value="all">Todos os andares</option>
              {floors.map(floor => (
                <option key={floor} value={floor}>{floor}</option>
              ))}
            </select>
          </div>

          {/* Filter by Status */}
          <div className="lg:col-span-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
            >
              <option value="all">Todos os status</option>
              <option value="stable">Estáveis</option>
              <option value="attention">Atenção</option>
              <option value="critical">Críticos</option>
            </select>
          </div>

          {/* Sort by */}
          <div className="lg:col-span-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'lastUpdate' | 'critical')}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
            >
              <option value="lastUpdate">Última atualização</option>
              <option value="critical">Mais críticos primeiro</option>
            </select>
          </div>

          {/* Filter Button */}
          <div className="lg:col-span-1">
            <button className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-500">
          Mostrando {filteredPatients.length} de {patients.length} pacientes
        </div>
      </div>

      {/* Patients Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Paciente
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Localização
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Diagnóstico
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Internação
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Último Evento
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Risco IA
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPatients.map(patient => {
                const status = statusConfig[patient.status];
                const aiRisk = patient.aiRisk ? aiRiskConfig[patient.aiRisk] : null;

                return (
                  <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                    {/* Patient */}
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-gray-800 mb-1">{patient.name}</p>
                        <p className="text-xs text-gray-500">
                          {patient.age} anos • {patient.gender === 'M' ? 'M' : 'F'}
                        </p>
                      </div>
                    </td>

                    {/* Location */}
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p className="text-gray-800">{patient.floor}</p>
                        <p className="text-xs text-gray-500">
                          {patient.room} • {patient.bed}
                        </p>
                      </div>
                    </td>

                    {/* Diagnosis */}
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{patient.diagnosis}</p>
                    </td>

                    {/* Admission Date */}
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{patient.admissionDate}</p>
                    </td>

                    {/* Last Event */}
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{patient.lastEvent}</p>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${status.color}`}>
                        <span className={`w-2 h-2 rounded-full ${status.dot}`}></span>
                        {status.label}
                      </span>
                      {patient.activeAlerts > 0 && (
                        <span className="inline-flex items-center gap-1 ml-2 px-2 py-1 bg-red-50 text-red-600 rounded text-xs">
                          <AlertCircle className="w-3 h-3" />
                          {patient.activeAlerts}
                        </span>
                      )}
                    </td>

                    {/* AI Risk */}
                    <td className="px-6 py-4">
                      {aiRisk && (
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs ${aiRisk.color}`}>
                          🤖 {aiRisk.label}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button 
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Ver Prontuário"
                        >
                          <Eye className="w-4 h-4 text-gray-600" />
                        </button>
                        <button 
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4 text-gray-600" />
                        </button>
                        <button 
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Mais opções"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
