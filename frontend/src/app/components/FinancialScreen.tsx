import React, { useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, BedDouble, Users, Calendar, Download, FileText, AlertCircle, Lightbulb, Filter } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

const COLORS = {
  primary: '#0EA5E9',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  purple: '#8B5CF6'
};

interface PatientCost {
  id: number;
  patient: string;
  sector: string;
  daysAdmitted: number;
  estimatedCost: number;
  status: 'normal' | 'attention' | 'critical';
}

const mockPatientCosts: PatientCost[] = [
  { id: 1, patient: 'Maria Silva Santos', sector: 'UTI', daysAdmitted: 12, estimatedCost: 45600, status: 'attention' },
  { id: 2, patient: 'João Pereira Souza', sector: 'Cardiologia', daysAdmitted: 8, estimatedCost: 18400, status: 'normal' },
  { id: 3, patient: 'Ana Costa Lima', sector: 'Geriatria', daysAdmitted: 15, estimatedCost: 22500, status: 'attention' },
  { id: 4, patient: 'Carlos Mendes Oliveira', sector: 'UTI', daysAdmitted: 6, estimatedCost: 28800, status: 'critical' },
  { id: 5, patient: 'Lucia Martins Rocha', sector: 'Cardiologia', daysAdmitted: 5, estimatedCost: 11500, status: 'normal' },
  { id: 6, patient: 'Roberto Alves Ferreira', sector: 'Geriatria', daysAdmitted: 10, estimatedCost: 15000, status: 'normal' }
];

const costBySectorData = [
  { sector: 'UTI', custo: 74400 },
  { sector: 'Cardiologia', custo: 29900 },
  { sector: 'Geriatria', custo: 37500 },
  { sector: 'Pediatria', custo: 18600 }
];

const costEvolutionData = [
  { period: 'Sem 1', custo: 145000 },
  { period: 'Sem 2', custo: 158000 },
  { period: 'Sem 3', custo: 162000 },
  { period: 'Sem 4', custo: 160400 }
];

const averageStayVsCostData = [
  { setor: 'UTI', diasMedios: 9, custoMedio: 37200 },
  { setor: 'Cardiologia', diasMedios: 6.5, custoMedio: 14950 },
  { setor: 'Geriatria', diasMedios: 12.5, custoMedio: 18750 },
  { setor: 'Pediatria', diasMedios: 4, custoMedio: 9300 }
];

export function FinancialScreen() {
  const [selectedPeriod, setSelectedPeriod] = useState('mes-atual');
  const [selectedUnit, setSelectedUnit] = useState('todas');
  const [selectedSector, setSelectedSector] = useState('todos');

  const totalCost = mockPatientCosts.reduce((acc, p) => acc + p.estimatedCost, 0);
  const averageCostPerPatient = totalCost / mockPatientCosts.length;
  const occupiedBeds = 18;
  const averageCostPerBed = totalCost / occupiedBeds;
  const dailyCost = totalCost / 30;
  const admissions = mockPatientCosts.length;
  const efficiency = 87.5;

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-gray-800 mb-1">Financeiro</h1>
            <p className="text-sm text-gray-500">Gestão financeira e custos assistenciais</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              <FileText className="w-4 h-4 text-gray-600" />
              Ver Relatórios
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Download className="w-4 h-4" />
              Exportar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="text-sm text-gray-700 bg-transparent border-none outline-none"
            >
              <option value="hoje">Hoje</option>
              <option value="semana">Esta Semana</option>
              <option value="mes-atual">Mês Atual</option>
              <option value="trimestre">Trimestre</option>
              <option value="ano">Ano</option>
            </select>
          </div>

          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none"
          >
            <option value="todas">Todas as Unidades</option>
            <option value="central">Hospital Central</option>
            <option value="sul">Hospital Sul</option>
          </select>

          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none"
          >
            <option value="todos">Todos os Setores</option>
            <option value="uti">UTI</option>
            <option value="cardiologia">Cardiologia</option>
            <option value="geriatria">Geriatria</option>
            <option value="pediatria">Pediatria</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 text-blue-600" />
            <span className="text-xs text-blue-700 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +5%
            </span>
          </div>
          <p className="text-2xl text-gray-800">R$ {averageCostPerPatient.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          <p className="text-xs text-gray-600">Custo Médio por Paciente</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <BedDouble className="w-8 h-8 text-purple-600" />
          </div>
          <p className="text-2xl text-gray-800">R$ {averageCostPerBed.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          <p className="text-xs text-gray-600">Custo por Leito Ocupado</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-2xl text-gray-800">R$ {dailyCost.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          <p className="text-xs text-gray-600">Custo Diário Operacional</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-orange-600" />
            <span className="text-xs text-orange-700">+2</span>
          </div>
          <p className="text-2xl text-gray-800">{admissions}</p>
          <p className="text-xs text-gray-600">Internações no Período</p>
        </div>

        <div className="bg-gradient-to-br from-cyan-50 to-sky-50 rounded-lg border border-cyan-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-cyan-600" />
          </div>
          <p className="text-2xl text-gray-800">{efficiency}%</p>
          <p className="text-xs text-gray-600">Eficiência Financeira</p>
        </div>
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Lightbulb className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm text-purple-900 mb-2">Insights Financeiros da IA</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-purple-800">
                  <strong>Custo UTI acima da média:</strong> Pacientes da UTI apresentaram aumento de custo 18% acima da média mensal
                </p>
              </div>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-purple-800">
                  <strong>Permanência prolongada:</strong> 3 pacientes com internação acima de 10 dias impactando custo médio
                </p>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-purple-800">
                  <strong>Oportunidade:</strong> Setor de Geriatria apresenta baixa eficiência operacional comparado ao histórico
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custos Assistenciais */}
      <div className="mb-6">
        <h2 className="text-gray-800 mb-4">Custos Assistenciais</h2>
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Custo por Setor */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Custo por Setor</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={costBySectorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="sector" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
                />
                <Bar dataKey="custo" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Evolução de Custos */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Evolução de Custos no Período</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={costEvolutionData}>
                <defs>
                  <linearGradient id="colorCusto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="period" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
                />
                <Area type="monotone" dataKey="custo" stroke={COLORS.success} fillOpacity={1} fill="url(#colorCusto)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabela de Pacientes */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-gray-800">Custos por Paciente</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Paciente</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Setor</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Dias Internado</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Custo Estimado</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mockPatientCosts.map(patient => (
                <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-800">{patient.patient}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{patient.sector}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{patient.daysAdmitted} dias</td>
                  <td className="px-6 py-4 text-sm text-gray-800 font-medium">
                    R$ {patient.estimatedCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs ${
                      patient.status === 'critical' ? 'bg-red-100 text-red-700' :
                      patient.status === 'attention' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {patient.status === 'critical' ? 'Crítico' : patient.status === 'attention' ? 'Atenção' : 'Normal'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indicadores Financeiros Operacionais */}
      <div>
        <h2 className="text-gray-800 mb-4">Indicadores Financeiros Operacionais</h2>
        <div className="grid grid-cols-3 gap-6">
          {/* Tempo Médio x Custo */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 col-span-2">
            <h3 className="text-gray-800 mb-4">Tempo Médio de Permanência x Custo</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={averageStayVsCostData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="setor" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="diasMedios" fill={COLORS.warning} radius={[8, 8, 0, 0]} name="Dias Médios" />
                <Bar yAxisId="right" dataKey="custoMedio" fill={COLORS.primary} radius={[8, 8, 0, 0]} name="Custo Médio (R$)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Alertas Financeiros */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Alertas Financeiros</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-800 font-medium">Permanência Prolongada</p>
                  <p className="text-xs text-red-700">3 pacientes acima de 10 dias</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 font-medium">Custo UTI Elevado</p>
                  <p className="text-xs text-yellow-700">18% acima da média</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-orange-800 font-medium">Baixa Eficiência</p>
                  <p className="text-xs text-orange-700">Geriatria abaixo do esperado</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
