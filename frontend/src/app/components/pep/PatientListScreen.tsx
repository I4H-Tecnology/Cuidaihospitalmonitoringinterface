import React from 'react';
import { Search, User, BedDouble, AlertCircle, ChevronRight } from 'lucide-react';

interface Patient {
  id: number;
  name: string;
  age: number;
  gender: 'M' | 'F';
  room: string;
  bed: string;
  sector: string;
  status: 'stable' | 'attention' | 'critical';
  admissionDate: string;
  activeAlerts: number;
}

interface PatientListScreenProps {
  patients: Patient[];
  onSelectPatient: (patient: Patient) => void;
}

export function PatientListScreen({ patients, onSelectPatient }: PatientListScreenProps) {
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.room.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.bed.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusConfig = {
    stable: { label: 'Estável', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    attention: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6">
        <h1 className="text-2xl text-gray-800 mb-1">Prontuário Eletrônico</h1>
        <p className="text-sm text-gray-500">Selecione um paciente para visualizar o prontuário</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, quarto ou leito..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Total de Pacientes</p>
          <p className="text-3xl text-gray-800">{patients.length}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-green-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Estáveis</p>
          <p className="text-3xl text-gray-800">{patients.filter(p => p.status === 'stable').length}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-yellow-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Atenção</p>
          <p className="text-3xl text-gray-800">{patients.filter(p => p.status === 'attention').length}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-red-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Críticos</p>
          <p className="text-3xl text-gray-800">{patients.filter(p => p.status === 'critical').length}</p>
        </div>
      </div>

      {/* Patients List */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-gray-800">Pacientes Internados</h2>
        </div>

        <div className="divide-y divide-gray-100">
          {filteredPatients.map(patient => {
            const config = statusConfig[patient.status];
            
            return (
              <button
                key={patient.id}
                onClick={() => onSelectPatient(patient)}
                className="w-full px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-4 flex-1">
                  {/* Avatar */}
                  <div className="w-12 h-12 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-full flex items-center justify-center text-white">
                    <User className="w-6 h-6" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-gray-800">{patient.name}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs ${config.color}`}>
                        {config.label}
                      </span>
                      {patient.activeAlerts > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded text-xs">
                          <AlertCircle className="w-3 h-3" />
                          {patient.activeAlerts} alertas
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{patient.age} anos • {patient.gender === 'M' ? 'Masculino' : 'Feminino'}</span>
                      <span className="flex items-center gap-1">
                        <BedDouble className="w-4 h-4" />
                        {patient.sector} → {patient.room} → Leito {patient.bed}
                      </span>
                      <span>Internado em {patient.admissionDate}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#0A7EA4] transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
