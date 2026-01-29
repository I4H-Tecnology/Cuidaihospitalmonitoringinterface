import React, { useState } from 'react';
import { Users, UserCheck, Clock, AlertCircle, Download, Calendar, TrendingUp, Lightbulb, Filter } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = {
  primary: '#0EA5E9',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  purple: '#8B5CF6'
};

interface Employee {
  id: number;
  name: string;
  role: 'medico' | 'enfermeiro' | 'tecnico' | 'administrativo';
  sector: string;
  shift: 'manha' | 'tarde' | 'noite';
  status: 'ativo' | 'folga' | 'ausente';
  alertsAttended: number;
  avgResponseTime: number;
}

const mockEmployees: Employee[] = [
  { id: 1, name: 'Dr. Carlos Silva', role: 'medico', sector: 'UTI', shift: 'manha', status: 'ativo', alertsAttended: 12, avgResponseTime: 2.3 },
  { id: 2, name: 'Enf. Maria Santos', role: 'enfermeiro', sector: 'UTI', shift: 'manha', status: 'ativo', alertsAttended: 28, avgResponseTime: 1.8 },
  { id: 3, name: 'Téc. João Oliveira', role: 'tecnico', sector: 'Cardiologia', shift: 'tarde', status: 'ativo', alertsAttended: 15, avgResponseTime: 3.1 },
  { id: 4, name: 'Dr. Ana Costa', role: 'medico', sector: 'Cardiologia', shift: 'tarde', status: 'ativo', alertsAttended: 10, avgResponseTime: 2.5 },
  { id: 5, name: 'Enf. Pedro Lima', role: 'enfermeiro', sector: 'Geriatria', shift: 'noite', status: 'ativo', alertsAttended: 22, avgResponseTime: 4.2 },
  { id: 6, name: 'Téc. Lucia Martins', role: 'tecnico', sector: 'UTI', shift: 'noite', status: 'ativo', alertsAttended: 18, avgResponseTime: 3.8 },
  { id: 7, name: 'Dr. Roberto Ferreira', role: 'medico', sector: 'Geriatria', shift: 'manha', status: 'folga', alertsAttended: 0, avgResponseTime: 0 },
  { id: 8, name: 'Enf. Helena Souza', role: 'enfermeiro', sector: 'Cardiologia', shift: 'tarde', status: 'ativo', alertsAttended: 25, avgResponseTime: 2.1 }
];

const responseTimeBySectorData = [
  { sector: 'UTI', tempoMedio: 2.1 },
  { sector: 'Cardiologia', tempoMedio: 2.8 },
  { sector: 'Geriatria', tempoMedio: 4.2 },
  { sector: 'Pronto Socorro', tempoMedio: 3.5 }
];

const alertsAttendedByTeamData = [
  { turno: 'Manhã', atendidos: 55 },
  { turno: 'Tarde', atendidos: 50 },
  { turno: 'Noite', atendidos: 40 }
];

const workloadByShiftData = [
  { hour: '00h', manha: 0, tarde: 0, noite: 12 },
  { hour: '06h', manha: 8, tarde: 0, noite: 5 },
  { hour: '12h', manha: 15, tarde: 10, noite: 0 },
  { hour: '18h', manha: 5, tarde: 18, noite: 8 },
  { hour: '24h', manha: 0, tarde: 3, noite: 14 }
];

export function HRScreen() {
  const [selectedSector, setSelectedSector] = useState('todos');
  const [selectedRole, setSelectedRole] = useState('todos');
  const [selectedShift, setSelectedShift] = useState('todos');

  const activeEmployees = mockEmployees.filter(e => e.status === 'ativo').length;
  const morningShift = mockEmployees.filter(e => e.shift === 'manha' && e.status === 'ativo').length;
  const afternoonShift = mockEmployees.filter(e => e.shift === 'tarde' && e.status === 'ativo').length;
  const nightShift = mockEmployees.filter(e => e.shift === 'noite' && e.status === 'ativo').length;
  const unassignedAlerts = 3;
  const avgResponseTime = 2.8;

  const filteredEmployees = mockEmployees.filter(emp => {
    const matchesSector = selectedSector === 'todos' || emp.sector === selectedSector;
    const matchesRole = selectedRole === 'todos' || emp.role === selectedRole;
    const matchesShift = selectedShift === 'todos' || emp.shift === selectedShift;
    return matchesSector && matchesRole && matchesShift;
  });

  const roleLabels = {
    medico: 'Médico',
    enfermeiro: 'Enfermeiro',
    tecnico: 'Técnico',
    administrativo: 'Administrativo'
  };

  const shiftLabels = {
    manha: 'Manhã',
    tarde: 'Tarde',
    noite: 'Noite'
  };

  const statusConfig = {
    ativo: { color: 'bg-green-100 text-green-700', label: 'Ativo' },
    folga: { color: 'bg-gray-100 text-gray-600', label: 'Folga' },
    ausente: { color: 'bg-red-100 text-red-700', label: 'Ausente' }
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-gray-800 mb-1">Recursos Humanos</h1>
            <p className="text-sm text-gray-500">Gestão operacional de equipes assistenciais</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              <Calendar className="w-4 h-4 text-gray-600" />
              Ver Escala
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
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="text-sm text-gray-700 bg-transparent border-none outline-none"
            >
              <option value="todos">Todos os Setores</option>
              <option value="UTI">UTI</option>
              <option value="Cardiologia">Cardiologia</option>
              <option value="Geriatria">Geriatria</option>
              <option value="Pronto Socorro">Pronto Socorro</option>
            </select>
          </div>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none"
          >
            <option value="todos">Todos os Cargos</option>
            <option value="medico">Médicos</option>
            <option value="enfermeiro">Enfermeiros</option>
            <option value="tecnico">Técnicos</option>
            <option value="administrativo">Administrativos</option>
          </select>

          <select
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none"
          >
            <option value="todos">Todos os Turnos</option>
            <option value="manha">Manhã</option>
            <option value="tarde">Tarde</option>
            <option value="noite">Noite</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-blue-600" />
          </div>
          <p className="text-2xl text-gray-800">{activeEmployees}</p>
          <p className="text-xs text-gray-600">Profissionais Ativos</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <UserCheck className="w-8 h-8 text-green-600" />
          </div>
          <div className="flex items-center gap-2">
            <div>
              <p className="text-sm text-gray-700">🌅 {morningShift}</p>
              <p className="text-xs text-gray-500">Manhã</p>
            </div>
            <div>
              <p className="text-sm text-gray-700">☀️ {afternoonShift}</p>
              <p className="text-xs text-gray-500">Tarde</p>
            </div>
            <div>
              <p className="text-sm text-gray-700">🌙 {nightShift}</p>
              <p className="text-xs text-gray-500">Noite</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-pink-50 rounded-lg border border-red-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <span className="text-xs text-red-700">Urgente</span>
          </div>
          <p className="text-2xl text-gray-800">{unassignedAlerts}</p>
          <p className="text-xs text-gray-600">Alertas Sem Responsável</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-purple-600" />
          </div>
          <p className="text-2xl text-gray-800">{avgResponseTime.toFixed(1)} min</p>
          <p className="text-xs text-gray-600">Tempo Médio de Resposta</p>
        </div>
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-lg p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Lightbulb className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm text-orange-900 mb-2">Insights de Equipe (IA)</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800">
                  <strong>Sobrecarga detectada:</strong> Turno noturno da UTI apresenta tempo de resposta 40% acima da média (4.2 min vs 2.8 min)
                </p>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800">
                  <strong>Eficiência da equipe:</strong> Setor de Cardiologia com melhor desempenho em tempo de resposta (2.8 min)
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800">
                  <strong>Ação sugerida:</strong> Realocar 1 profissional do turno da tarde para reforçar equipe noturna na Geriatria
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-gray-800">Equipes por Setor ({filteredEmployees.length})</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Profissional</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Cargo</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Setor</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Turno</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Alertas Atendidos</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Tempo Médio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredEmployees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm text-gray-800 font-medium">{emp.name}</td>
                <td className="px-6 py-4">
                  <span className="px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                    {roleLabels[emp.role]}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{emp.sector}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    emp.shift === 'manha' ? 'bg-blue-100 text-blue-700' :
                    emp.shift === 'tarde' ? 'bg-orange-100 text-orange-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {shiftLabels[emp.shift]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs ${statusConfig[emp.status].color}`}>
                    {statusConfig[emp.status].label}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-800">{emp.alertsAttended}</td>
                <td className="px-6 py-4">
                  <span className={`text-sm ${
                    emp.avgResponseTime > 3.5 ? 'text-red-600 font-medium' :
                    emp.avgResponseTime > 2.5 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {emp.avgResponseTime > 0 ? `${emp.avgResponseTime.toFixed(1)} min` : '-'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Efficiency Analytics */}
      <div>
        <h2 className="text-gray-800 mb-4">Eficiência Assistencial</h2>
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Response Time by Sector */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Tempo Médio de Resposta por Setor</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={responseTimeBySectorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="sector" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value: number) => `${value.toFixed(1)} min`}
                />
                <Bar dataKey="tempoMedio" fill={COLORS.warning} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Alerts Attended by Team */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Alertas Atendidos por Turno</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={alertsAttendedByTeamData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="turno" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                <Bar dataKey="atendidos" fill={COLORS.success} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Workload by Shift */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-gray-800 mb-4">Carga de Trabalho por Turno (24h)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={workloadByShiftData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="hour" stroke="#6B7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
              <Legend />
              <Line type="monotone" dataKey="manha" stroke={COLORS.primary} strokeWidth={2} name="Manhã" />
              <Line type="monotone" dataKey="tarde" stroke={COLORS.warning} strokeWidth={2} name="Tarde" />
              <Line type="monotone" dataKey="noite" stroke={COLORS.purple} strokeWidth={2} name="Noite" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Cards */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Melhor Desempenho</p>
                <p className="text-lg text-gray-800 font-medium">Cardiologia</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">Tempo médio: 2.8 min</p>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg border border-yellow-100 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Atenção Necessária</p>
                <p className="text-lg text-gray-800 font-medium">Geriatria</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">Tempo médio: 4.2 min</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Equipe Mais Ativa</p>
                <p className="text-lg text-gray-800 font-medium">UTI</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">58 alertas atendidos</p>
          </div>
        </div>
      </div>
    </main>
  );
}
