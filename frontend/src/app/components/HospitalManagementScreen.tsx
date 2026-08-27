import React, { useState } from 'react';
import { Building2, TrendingUp, TrendingDown, Users, BedDouble, DollarSign, Activity, AlertTriangle, Award, Target, BarChart3, Download } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

const COLORS = {
  primary: '#0EA5E9',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  purple: '#8B5CF6',
  cyan: '#06B6D4'
};

// Mock data for strategic indicators
const occupancyTrendData = [
  { month: 'Jul', taxa: 78, meta: 85 },
  { month: 'Ago', taxa: 82, meta: 85 },
  { month: 'Set', taxa: 85, meta: 85 },
  { month: 'Out', taxa: 88, meta: 85 },
  { month: 'Nov', taxa: 86, meta: 85 },
  { month: 'Dez', taxa: 90, meta: 85 }
];

const revenueVsCostData = [
  { month: 'Jul', receita: 2800, custo: 2100 },
  { month: 'Ago', receita: 3100, custo: 2300 },
  { month: 'Set', receita: 3400, custo: 2500 },
  { month: 'Out', receita: 3600, custo: 2700 },
  { month: 'Nov', receita: 3800, custo: 2800 },
  { month: 'Dez', receita: 4200, custo: 3000 }
];

const sectorPerformanceData = [
  { sector: 'UTI', ocupacao: 95, eficiencia: 88, qualidade: 92 },
  { sector: 'Cardiologia', ocupacao: 85, eficiencia: 90, qualidade: 94 },
  { sector: 'Geriatria', ocupacao: 78, eficiencia: 75, qualidade: 88 },
  { sector: 'Pronto Socorro', ocupacao: 92, eficiencia: 82, qualidade: 85 }
];

const unitComparisonData = [
  { name: 'Hospital Central', value: 450 },
  { name: 'Unidade Sul', value: 280 },
  { name: 'Unidade Norte', value: 320 },
  { name: 'Clínica Especializada', value: 180 }
];

const satisfactionData = [
  { category: 'Atendimento', score: 4.5 },
  { category: 'Estrutura', score: 4.2 },
  { category: 'Profissionais', score: 4.7 },
  { category: 'Limpeza', score: 4.8 },
  { category: 'Alimentação', score: 3.9 }
];

const PIE_COLORS = ['#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B'];

export function HospitalManagementScreen() {
  const [selectedPeriod, setSelectedPeriod] = useState('semestre');
  const [selectedUnit, setSelectedUnit] = useState('todas');

  // Strategic KPIs
  const totalBeds = 320;
  const occupancyRate = 87.5;
  const averageStay = 5.8;
  const patientSatisfaction = 4.4;
  const operationalMargin = 28.5;
  const activeStaff = 450;

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-gray-800 mb-1">Gestão Hospitalar</h1>
            <p className="text-sm text-gray-500">Painel executivo e indicadores estratégicos</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700"
            >
              <option value="mes">Último Mês</option>
              <option value="trimestre">Último Trimestre</option>
              <option value="semestre">Último Semestre</option>
              <option value="ano">Último Ano</option>
            </select>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700"
            >
              <option value="todas">Todas as Unidades</option>
              <option value="central">Hospital Central</option>
              <option value="sul">Unidade Sul</option>
              <option value="norte">Unidade Norte</option>
            </select>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Download className="w-4 h-4" />
              Relatório Executivo
            </button>
          </div>
        </div>
      </div>

      {/* Strategic KPI Cards */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <BedDouble className="w-7 h-7 text-blue-600" />
          </div>
          <p className="text-2xl text-gray-800">{totalBeds}</p>
          <p className="text-xs text-gray-600">Total de Leitos</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-7 h-7 text-green-600" />
            <span className="text-xs text-green-700 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +3%
            </span>
          </div>
          <p className="text-2xl text-gray-800">{occupancyRate}%</p>
          <p className="text-xs text-gray-600">Taxa de Ocupação</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-7 h-7 text-purple-600" />
          </div>
          <p className="text-2xl text-gray-800">{averageStay}</p>
          <p className="text-xs text-gray-600">Tempo Médio (dias)</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg border border-yellow-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Award className="w-7 h-7 text-yellow-600" />
          </div>
          <p className="text-2xl text-gray-800">{patientSatisfaction}</p>
          <p className="text-xs text-gray-600">NPS Pacientes</p>
        </div>

        <div className="bg-gradient-to-br from-cyan-50 to-sky-50 rounded-lg border border-cyan-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-7 h-7 text-cyan-600" />
            <span className="text-xs text-cyan-700 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +5%
            </span>
          </div>
          <p className="text-2xl text-gray-800">{operationalMargin}%</p>
          <p className="text-xs text-gray-600">Margem Operacional</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg border border-orange-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-7 h-7 text-orange-600" />
          </div>
          <p className="text-2xl text-gray-800">{activeStaff}</p>
          <p className="text-xs text-gray-600">Colaboradores Ativos</p>
        </div>
      </div>

      {/* Strategic Alerts */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm text-blue-900 mb-2">Alertas Estratégicos</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-gray-500 mb-1">Meta de Ocupação</p>
                <p className="text-sm text-blue-800"><strong>Superada:</strong> 90% vs meta 85%</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-yellow-100">
                <p className="text-xs text-gray-500 mb-1">Geriatria</p>
                <p className="text-sm text-yellow-800"><strong>Atenção:</strong> Eficiência abaixo da média</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <p className="text-xs text-gray-500 mb-1">NPS</p>
                <p className="text-sm text-green-800"><strong>Excelente:</strong> 4.4/5.0 (+0.3 vs período anterior)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Occupancy Trend */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-gray-800 mb-4">Evolução da Taxa de Ocupação</h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={occupancyTrendData}>
              <defs>
                <linearGradient id="colorTaxa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#6B7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
              <Legend />
              <Area type="monotone" dataKey="taxa" stroke={COLORS.primary} fillOpacity={1} fill="url(#colorTaxa)" name="Taxa Atual (%)" />
              <Line type="monotone" dataKey="meta" stroke={COLORS.danger} strokeDasharray="5 5" name="Meta (%)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue vs Cost */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-gray-800 mb-4">Receita vs Custos (R$ mil)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenueVsCostData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#6B7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
              <Legend />
              <Bar dataKey="receita" fill={COLORS.success} radius={[8, 8, 0, 0]} name="Receita" />
              <Bar dataKey="custo" fill={COLORS.warning} radius={[8, 8, 0, 0]} name="Custo" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sector Performance & Unit Comparison */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Sector Performance Radar */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 col-span-2">
          <h2 className="text-gray-800 mb-4">Performance por Setor</h2>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={sectorPerformanceData}>
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis dataKey="sector" stroke="#6B7280" style={{ fontSize: '12px' }} />
              <PolarRadiusAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
              <Radar name="Ocupação (%)" dataKey="ocupacao" stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.3} />
              <Radar name="Eficiência (%)" dataKey="eficiencia" stroke={COLORS.success} fill={COLORS.success} fillOpacity={0.3} />
              <Radar name="Qualidade (%)" dataKey="qualidade" stroke={COLORS.purple} fill={COLORS.purple} fillOpacity={0.3} />
              <Legend />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Unit Comparison Pie */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-gray-800 mb-4">Atendimentos por Unidade</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={unitComparisonData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {unitComparisonData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Satisfaction Metrics */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h2 className="text-gray-800 mb-4">Avaliação de Satisfação (NPS por Categoria)</h2>
        <div className="space-y-4">
          {satisfactionData.map(item => (
            <div key={item.category}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700">{item.category}</span>
                <span className="text-sm text-gray-800 font-medium">{item.score.toFixed(1)} / 5.0</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all ${
                    item.score >= 4.5 ? 'bg-green-500' :
                    item.score >= 4.0 ? 'bg-blue-500' :
                    item.score >= 3.5 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${(item.score / 5) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Goals vs Achieved */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Target className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Meta Ocupação</p>
              <p className="text-lg text-gray-800 font-medium">106%</p>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full" style={{ width: '106%' }}></div>
          </div>
          <p className="text-xs text-green-600 mt-2">Meta superada em 6%</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Meta Financeira</p>
              <p className="text-lg text-gray-800 font-medium">95%</p>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full" style={{ width: '95%' }}></div>
          </div>
          <p className="text-xs text-blue-600 mt-2">Faltam 5% para meta</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <Award className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Meta NPS</p>
              <p className="text-lg text-gray-800 font-medium">110%</p>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-purple-500 h-2 rounded-full" style={{ width: '110%' }}></div>
          </div>
          <p className="text-xs text-purple-600 mt-2">Meta superada em 10%</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Eficiência Geral</p>
              <p className="text-lg text-gray-800 font-medium">88%</p>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '88%' }}></div>
          </div>
          <p className="text-xs text-yellow-600 mt-2">Faltam 12% para meta</p>
        </div>
      </div>
    </main>
  );
}
