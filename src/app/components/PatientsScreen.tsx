import React, { useState } from 'react';
import { Plus, LayoutGrid, List } from 'lucide-react';
import { StructureView } from './patients/StructureView';
import { ListView } from './patients/ListView';

export interface PatientData {
  id: number;
  name: string;
  age: number;
  gender: 'M' | 'F';
  floor: string;
  room: string;
  bed: string;
  diagnosis: string;
  admissionDate: string;
  status: 'stable' | 'attention' | 'critical';
  lastEvent: string;
  activeAlerts: number;
  aiRisk?: 'low' | 'moderate' | 'high';
}

export const mockPatients: PatientData[] = [
  // 1º Andar - UTI
  {
    id: 1,
    name: 'Maria Silva Santos',
    age: 78,
    gender: 'F',
    floor: '1º Andar',
    room: 'Quarto 101',
    bed: 'Leito A',
    diagnosis: 'Hipertensão Arterial Sistêmica',
    admissionDate: '18/12/2024',
    status: 'critical',
    lastEvent: 'Queda detectada - há 2h',
    activeAlerts: 2,
    aiRisk: 'high'
  },
  {
    id: 2,
    name: 'João Pereira Souza',
    age: 65,
    gender: 'M',
    floor: '1º Andar',
    room: 'Quarto 101',
    bed: 'Leito B',
    diagnosis: 'Insuficiência Cardíaca',
    admissionDate: '19/12/2024',
    status: 'attention',
    lastEvent: 'FC elevada - há 5h',
    activeAlerts: 1,
    aiRisk: 'moderate'
  },
  {
    id: 3,
    name: 'Carlos Mendes Oliveira',
    age: 70,
    gender: 'M',
    floor: '1º Andar',
    room: 'Quarto 102',
    bed: 'Leito A',
    diagnosis: 'Pneumonia',
    admissionDate: '20/12/2024',
    status: 'attention',
    lastEvent: 'Temperatura elevada - há 3h',
    activeAlerts: 1,
    aiRisk: 'moderate'
  },
  // 2º Andar - Cardiologia
  {
    id: 4,
    name: 'Ana Costa Lima',
    age: 82,
    gender: 'F',
    floor: '2º Andar',
    room: 'Quarto 201',
    bed: 'Leito A',
    diagnosis: 'Angina Pectoris',
    admissionDate: '20/12/2024',
    status: 'stable',
    lastEvent: 'Sinais vitais normais - há 1h',
    activeAlerts: 0,
    aiRisk: 'low'
  },
  {
    id: 5,
    name: 'Lucia Martins Rocha',
    age: 75,
    gender: 'F',
    floor: '2º Andar',
    room: 'Quarto 202',
    bed: 'Leito A',
    diagnosis: 'Arritmia Cardíaca',
    admissionDate: '21/12/2024',
    status: 'stable',
    lastEvent: 'Evolução médica - há 2h',
    activeAlerts: 0,
    aiRisk: 'low'
  },
  {
    id: 6,
    name: 'Pedro Santos Oliveira',
    age: 68,
    gender: 'M',
    floor: '2º Andar',
    room: 'Quarto 202',
    bed: 'Leito B',
    diagnosis: 'Infarto Agudo do Miocárdio',
    admissionDate: '21/12/2024',
    status: 'attention',
    lastEvent: 'Medicação administrada - há 30min',
    activeAlerts: 1,
    aiRisk: 'moderate'
  },
  // 3º Andar - Geriatria
  {
    id: 7,
    name: 'Roberto Alves Ferreira',
    age: 80,
    gender: 'M',
    floor: '3º Andar',
    room: 'Quarto 301',
    bed: 'Leito A',
    diagnosis: 'Diabetes Mellitus',
    admissionDate: '21/12/2024',
    status: 'stable',
    lastEvent: 'Glicemia controlada - há 4h',
    activeAlerts: 0,
    aiRisk: 'low'
  },
  {
    id: 8,
    name: 'Helena Souza Costa',
    age: 85,
    gender: 'F',
    floor: '3º Andar',
    room: 'Quarto 301',
    bed: 'Leito B',
    diagnosis: 'Alzheimer',
    admissionDate: '19/12/2024',
    status: 'stable',
    lastEvent: 'Deambulando com auxílio - há 1h',
    activeAlerts: 0,
    aiRisk: 'low'
  },
  {
    id: 9,
    name: 'Francisco Lima Santos',
    age: 77,
    gender: 'M',
    floor: '3º Andar',
    room: 'Quarto 302',
    bed: 'Leito A',
    diagnosis: 'Osteoporose',
    admissionDate: '20/12/2024',
    status: 'stable',
    lastEvent: 'Fisioterapia realizada - há 2h',
    activeAlerts: 0,
    aiRisk: 'low'
  }
];

export function PatientsScreen() {
  const [viewMode, setViewMode] = useState<'structure' | 'list'>('structure');

  const stats = {
    total: mockPatients.length,
    stable: mockPatients.filter(p => p.status === 'stable').length,
    attention: mockPatients.filter(p => p.status === 'attention').length,
    critical: mockPatients.filter(p => p.status === 'critical').length
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Gestão de Pacientes</h1>
          <p className="text-sm text-gray-500">
            {stats.total} pacientes internados • Última atualização: agora
          </p>
        </div>
        <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nova Internação
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Total Internados</p>
          <p className="text-3xl text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-green-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Estáveis</p>
          <p className="text-3xl text-gray-800">{stats.stable}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-yellow-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Em Atenção</p>
          <p className="text-3xl text-gray-800">{stats.attention}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-red-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Críticos</p>
          <p className="text-3xl text-gray-800">{stats.critical}</p>
        </div>
      </div>

      {/* View Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Visualizar por:</span>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('structure')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                viewMode === 'structure'
                  ? 'bg-[#0EA5E9] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Estrutura Física
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                viewMode === 'list'
                  ? 'bg-[#0EA5E9] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <List className="w-4 h-4" />
              Lista de Pacientes
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'structure' ? (
        <StructureView patients={mockPatients} />
      ) : (
        <ListView patients={mockPatients} />
      )}
    </main>
  );
}
