import React, { useState } from 'react';
import { Activity, Bell, BedDouble, Users, Building, ChevronDown, Plus, Edit, LayoutDashboard, BarChart3, TrendingUp, AlertTriangle, Clock, Target, Lightbulb, ArrowUpRight, ArrowDownRight, Heart, Thermometer, Wind, CheckCircle, XCircle, MapPin, Filter, Search, Bot } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { StatCard } from './StatCard';
import { EventCard } from './EventCard';
import { PatientRow } from './PatientRow';
import { DashboardBuilder } from './DashboardBuilder';

const COLORS = {
  primary: '#0EA5E9',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  purple: '#8B5CF6',
  cyan: '#06B6D4'
};

interface Patient {
  id: number;
  name: string;
  age: number;
  gender: 'M' | 'F';
  location: {
    hospital: string;
    sector: string;
    room: string;
    bed: string;
  };
  status: 'normal' | 'attention' | 'critical';
  heartRate: number;
  temperature: number;
  saturation: number;
  lastUpdate: string;
  lastEvent?: string;
}

interface Event {
  id: number;
  type: 'critical' | 'warning' | 'info';
  title: string;
  location: string;
  time: string;
  patient: string;
  responseTime?: string;
  resolved?: boolean;
}

interface Alert {
  id: number;
  type: 'queda' | 'saida-leito' | 'freq-cardiaca' | 'temperatura' | 'saturacao';
  patient: string;
  sector: string;
  status: 'ativo' | 'respondendo' | 'resolvido';
  time: string;
  responseTime: number;
  severity: 'critical' | 'warning';
}

interface AIInsight {
  id: number;
  title: string;
  description: string;
  reason: string;
  sector: string;
  action: string;
  severity: 'critical' | 'warning' | 'info';
}

type DashboardView = 'overview' | 'realtime' | 'alerts' | 'beds' | 'clinical' | 'ai-insights';

interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  isCustom: boolean;
}

const mockPatients: Patient[] = [
  {
    id: 1,
    name: 'Maria Silva Santos',
    age: 78,
    gender: 'F',
    location: { hospital: 'Hospital Central', sector: 'UTI', room: 'Quarto 301', bed: 'A' },
    status: 'critical',
    heartRate: 125,
    temperature: 38.5,
    saturation: 89,
    lastUpdate: 'há 2 min',
    lastEvent: 'Queda detectada'
  },
  {
    id: 2,
    name: 'João Pereira Souza',
    age: 65,
    gender: 'M',
    location: { hospital: 'Hospital Central', sector: 'Cardiologia', room: 'Quarto 205', bed: 'B' },
    status: 'attention',
    heartRate: 95,
    temperature: 37.8,
    saturation: 94,
    lastUpdate: 'há 5 min',
    lastEvent: 'Frequência cardíaca elevada'
  },
  {
    id: 3,
    name: 'Ana Costa Lima',
    age: 82,
    gender: 'F',
    location: { hospital: 'Hospital Central', sector: 'Geriatria', room: 'Quarto 412', bed: 'C' },
    status: 'normal',
    heartRate: 72,
    temperature: 36.5,
    saturation: 97,
    lastUpdate: 'há 8 min'
  },
  {
    id: 4,
    name: 'Carlos Mendes Oliveira',
    age: 70,
    gender: 'M',
    location: { hospital: 'Hospital Central', sector: 'UTI', room: 'Quarto 302', bed: 'A' },
    status: 'attention',
    heartRate: 88,
    temperature: 37.2,
    saturation: 95,
    lastUpdate: 'há 3 min',
    lastEvent: 'Temperatura elevada'
  },
  {
    id: 5,
    name: 'Lucia Martins Rocha',
    age: 75,
    gender: 'F',
    location: { hospital: 'Hospital Central', sector: 'Cardiologia', room: 'Quarto 206', bed: 'A' },
    status: 'normal',
    heartRate: 68,
    temperature: 36.7,
    saturation: 98,
    lastUpdate: 'há 12 min'
  },
  {
    id: 6,
    name: 'Roberto Alves Ferreira',
    age: 80,
    gender: 'M',
    location: { hospital: 'Hospital Central', sector: 'Geriatria', room: 'Quarto 410', bed: 'B' },
    status: 'normal',
    heartRate: 75,
    temperature: 36.4,
    saturation: 96,
    lastUpdate: 'há 6 min'
  },
  {
    id: 7,
    name: 'Helena Souza Pinto',
    age: 68,
    gender: 'F',
    location: { hospital: 'Hospital Central', sector: 'Cardiologia', room: 'Quarto 207', bed: 'A' },
    status: 'normal',
    heartRate: 70,
    temperature: 36.6,
    saturation: 97,
    lastUpdate: 'há 15 min'
  },
  {
    id: 8,
    name: 'Pedro Santos Silva',
    age: 77,
    gender: 'M',
    location: { hospital: 'Hospital Central', sector: 'Geriatria', room: 'Quarto 413', bed: 'B' },
    status: 'attention',
    heartRate: 92,
    temperature: 37.5,
    saturation: 93,
    lastUpdate: 'há 10 min',
    lastEvent: 'Monitoramento intensivo'
  }
];

const mockEvents: Event[] = [
  {
    id: 1,
    type: 'critical',
    title: 'Queda detectada - Paciente fora do leito',
    location: 'Hospital Central → UTI → Quarto 301 → Leito A',
    time: 'há 2 min',
    patient: 'Maria Silva Santos',
    responseTime: '2.1 min',
    resolved: false
  },
  {
    id: 2,
    type: 'warning',
    title: 'Frequência cardíaca elevada',
    location: 'Hospital Central → Cardiologia → Quarto 205 → Leito B',
    time: 'há 5 min',
    patient: 'João Pereira Souza',
    responseTime: '3.2 min',
    resolved: false
  },
  {
    id: 3,
    type: 'info',
    title: 'Chamada de enfermagem',
    location: 'Hospital Central → Geriatria → Quarto 412 → Leito C',
    time: 'há 8 min',
    patient: 'Ana Costa Lima',
    responseTime: '1.5 min',
    resolved: true
  },
  {
    id: 4,
    type: 'warning',
    title: 'Temperatura elevada detectada',
    location: 'Hospital Central → UTI → Quarto 302 → Leito A',
    time: 'há 15 min',
    patient: 'Carlos Mendes Oliveira',
    responseTime: '4.0 min',
    resolved: false
  },
  {
    id: 5,
    type: 'info',
    title: 'Monitoramento iniciado',
    location: 'Hospital Central → Cardiologia → Quarto 206 → Leito A',
    time: 'há 20 min',
    patient: 'Lucia Martins Rocha',
    resolved: true
  }
];

const mockAlerts: Alert[] = [
  { id: 1, type: 'queda', patient: 'Maria Silva Santos', sector: 'UTI', status: 'ativo', time: 'há 2 min', responseTime: 2.1, severity: 'critical' },
  { id: 2, type: 'freq-cardiaca', patient: 'João Pereira Souza', sector: 'Cardiologia', status: 'respondendo', time: 'há 5 min', responseTime: 3.2, severity: 'warning' },
  { id: 3, type: 'temperatura', patient: 'Carlos Mendes Oliveira', sector: 'UTI', status: 'respondendo', time: 'há 15 min', responseTime: 4.0, severity: 'warning' },
  { id: 4, type: 'saturacao', patient: 'Pedro Santos Silva', sector: 'Geriatria', status: 'ativo', time: 'há 10 min', responseTime: 0, severity: 'warning' },
  { id: 5, type: 'saida-leito', patient: 'Ana Costa Lima', sector: 'Geriatria', status: 'resolvido', time: 'há 8 min', responseTime: 1.5, severity: 'warning' }
];

const mockAIInsights: AIInsight[] = [
  {
    id: 1,
    title: 'Padrão de Risco Detectado',
    description: 'Aumento de 45% nos casos de queda em pacientes acima de 75 anos no turno noturno',
    reason: 'Análise de 30 dias identificou correlação entre idade, horário e mobilidade reduzida',
    sector: 'Geriatria e UTI',
    action: 'Recomendar aumento de rondas de enfermagem entre 22h-06h',
    severity: 'critical'
  },
  {
    id: 2,
    title: 'Alerta Preditivo de Capacidade',
    description: 'UTI apresenta tendência de atingir capacidade máxima nas próximas 12h',
    reason: 'Baseado em histórico de admissões e alta taxa de ocupação atual (92%)',
    sector: 'UTI',
    action: 'Preparar leitos alternativos e equipe de apoio',
    severity: 'warning'
  },
  {
    id: 3,
    title: 'Oportunidade de Otimização',
    description: 'Tempo de resposta a alertas 32% acima do padrão no setor de Cardiologia',
    reason: 'Análise comparativa com outros setores e histórico dos últimos 7 dias',
    sector: 'Cardiologia',
    action: 'Revisar escala de enfermagem e distribuição de pacientes',
    severity: 'warning'
  },
  {
    id: 4,
    title: 'Sucesso de Protocolo IA',
    description: 'Redução de 40% em quedas após implementação de alertas preditivos',
    reason: 'Comparação com período anterior à ativação do sistema',
    sector: 'Geral',
    action: 'Expandir protocolo para demais unidades',
    severity: 'info'
  }
];

// Data for charts
const occupationBySectorData = [
  { sector: 'UTI', ocupacao: 92 },
  { sector: 'Cardiologia', ocupacao: 78 },
  { sector: 'Geriatria', ocupacao: 67 },
  { sector: 'Pediatria', ocupacao: 45 }
];

const alerts24hData = [
  { hour: '00h', alerts: 2 },
  { hour: '04h', alerts: 1 },
  { hour: '08h', alerts: 4 },
  { hour: '12h', alerts: 6 },
  { hour: '16h', alerts: 5 },
  { hour: '20h', alerts: 3 },
  { hour: '24h', alerts: 4 }
];

const patientStatusDistribution = [
  { name: 'Estáveis', value: mockPatients.filter(p => p.status === 'normal').length, color: COLORS.success },
  { name: 'Atenção', value: mockPatients.filter(p => p.status === 'attention').length, color: COLORS.warning },
  { name: 'Críticos', value: mockPatients.filter(p => p.status === 'critical').length, color: COLORS.danger }
];

const alertsByTypeData = [
  { type: 'Quedas', count: 8 },
  { type: 'Freq. Cardíaca', count: 12 },
  { type: 'Temperatura', count: 6 },
  { type: 'Saturação', count: 4 },
  { type: 'Saída Leito', count: 5 }
];

const alertsByHourData = [
  { hour: '00-04h', count: 3 },
  { hour: '04-08h', count: 2 },
  { hour: '08-12h', count: 8 },
  { hour: '12-16h', count: 10 },
  { hour: '16-20h', count: 7 },
  { hour: '20-24h', count: 5 }
];

const vitalSignsTrendData = [
  { time: '00h', fc: 72, temp: 36.5, sat: 96 },
  { time: '04h', fc: 70, temp: 36.4, sat: 97 },
  { time: '08h', fc: 75, temp: 36.6, sat: 96 },
  { time: '12h', fc: 78, temp: 36.7, sat: 95 },
  { time: '16h', fc: 76, temp: 36.8, sat: 96 },
  { time: '20h', fc: 74, temp: 36.6, sat: 97 },
  { time: '24h', fc: 73, temp: 36.5, sat: 96 }
];

const bedOccupancyByFloorData = [
  { floor: '1º Andar', ocupados: 8, disponiveis: 2, total: 10 },
  { floor: '2º Andar', ocupados: 6, disponiveis: 4, total: 10 },
  { floor: '3º Andar', ocupados: 4, disponiveis: 2, total: 6 }
];

const availableDashboards: DashboardConfig[] = [
  { id: 'default', name: 'Visão Geral', description: 'Dashboard padrão do CuidAI', isDefault: true, isCustom: false },
  { id: 'uti', name: 'Dashboard UTI', description: 'Personalizado para Unidade de Terapia Intensiva', isDefault: false, isCustom: true },
  { id: 'geriatria', name: 'Dashboard Geriatria', description: 'Foco em pacientes idosos', isDefault: false, isCustom: true },
  { id: 'enfermagem', name: 'Dashboard Enfermagem', description: 'Visão operacional da enfermagem', isDefault: false, isCustom: true }
];

export function DashboardScreen() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'normal' | 'attention' | 'critical'>('all');
  const [currentView, setCurrentView] = useState<DashboardView>('overview');
  const [selectedDashboard, setSelectedDashboard] = useState<string>('default');
  const [showDashboardMenu, setShowDashboardMenu] = useState(false);
  const [showNewDashboardModal, setShowNewDashboardModal] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('all');

  const filteredPatients = selectedFilter === 'all' 
    ? mockPatients 
    : mockPatients.filter(p => p.status === selectedFilter);

  const criticalCount = mockPatients.filter(p => p.status === 'critical').length;
  const attentionCount = mockPatients.filter(p => p.status === 'attention').length;
  const normalCount = mockPatients.filter(p => p.status === 'normal').length;
  const activeAlerts = mockEvents.filter(e => e.type === 'critical' || e.type === 'warning').length;

  const currentDashboardConfig = availableDashboards.find(d => d.id === selectedDashboard);

  const viewTabs = [
    { id: 'overview' as const, label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'realtime' as const, label: 'Tempo Real', icon: Activity },
    { id: 'alerts' as const, label: 'Alertas & Incidentes', icon: Bell },
    { id: 'beds' as const, label: 'Leitos & Ocupação', icon: BedDouble },
    { id: 'clinical' as const, label: 'Indicadores Clínicos', icon: BarChart3 },
    { id: 'ai-insights' as const, label: 'Insights de IA', icon: Lightbulb }
  ];

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Dashboard Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setShowDashboardMenu(!showDashboardMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <LayoutDashboard className="w-5 h-5 text-[#0A7EA4]" />
                <div className="text-left">
                  <p className="text-sm text-gray-800">{currentDashboardConfig?.name}</p>
                  {currentDashboardConfig?.isCustom && (
                    <p className="text-xs text-gray-500">Personalizado</p>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {/* Dashboard Dropdown */}
              {showDashboardMenu && (
                <div className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-lg shadow-lg w-80 z-50">
                  <div className="p-2">
                    <p className="text-xs text-gray-500 px-3 py-2">DASHBOARDS PADRÃO</p>
                    {availableDashboards.filter(d => !d.isCustom).map(dashboard => (
                      <button
                        key={dashboard.id}
                        onClick={() => {
                          setSelectedDashboard(dashboard.id);
                          setShowDashboardMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors ${
                          selectedDashboard === dashboard.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <p className="text-sm text-gray-800">{dashboard.name}</p>
                        <p className="text-xs text-gray-500">{dashboard.description}</p>
                      </button>
                    ))}
                    
                    <div className="border-t border-gray-200 my-2"></div>
                    
                    <p className="text-xs text-gray-500 px-3 py-2">DASHBOARDS CUSTOMIZADOS</p>
                    {availableDashboards.filter(d => d.isCustom).map(dashboard => (
                      <button
                        key={dashboard.id}
                        onClick={() => {
                          setSelectedDashboard(dashboard.id);
                          setShowDashboardMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-start justify-between ${
                          selectedDashboard === dashboard.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div>
                          <p className="text-sm text-gray-800">{dashboard.name}</p>
                          <p className="text-xs text-gray-500">{dashboard.description}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">Custom</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="border-t border-gray-200 p-2">
                    <button
                      onClick={() => {
                        setShowNewDashboardModal(true);
                        setShowDashboardMenu(false);
                      }}
                      className="w-full px-3 py-2 bg-[#0EA5E9] text-white rounded-lg hover:bg-[#0284C7] transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Novo Dashboard
                    </button>
                  </div>
                </div>
              )}
            </div>

            {currentDashboardConfig?.isCustom && (
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Edit className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-700">Editar Dashboard</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Última atualização: há 1 min</span>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {viewTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  currentView === tab.id
                    ? 'bg-[#0EA5E9] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Visão Geral View */}
      {currentView === 'overview' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-8 h-8 text-blue-600" />
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" />
                  +2
                </span>
              </div>
              <p className="text-2xl text-gray-800">{mockPatients.length}</p>
              <p className="text-xs text-gray-600">Pacientes Internados</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <Bell className="w-8 h-8 text-red-600" />
                <span className="text-xs text-red-600">{criticalCount} críticos</span>
              </div>
              <p className="text-2xl text-gray-800">{activeAlerts}</p>
              <p className="text-xs text-gray-600">Alertas Ativos</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <BedDouble className="w-8 h-8 text-purple-600" />
                <span className="text-xs text-gray-600">75%</span>
              </div>
              <p className="text-2xl text-gray-800">18 / 24</p>
              <p className="text-xs text-gray-600">Leitos Ocupados</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <AlertTriangle className="w-8 h-8 text-orange-600" />
              </div>
              <p className="text-2xl text-gray-800">{criticalCount}</p>
              <p className="text-xs text-gray-600">Casos Críticos</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-2xl text-gray-800">Operacional</p>
              <p className="text-xs text-gray-600">Status Geral</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-6">
            {/* Occupação por Setor */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4">Ocupação por Setor</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={occupationBySectorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="sector" stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                  <Bar dataKey="ocupacao" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Alertas 24h */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4">Alertas nas Últimas 24h</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={alerts24hData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="hour" stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="alerts" stroke={COLORS.danger} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Distribuição de Pacientes */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4">Distribuição por Status</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={patientStatusDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {patientStatusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-gray-700">Tempo Médio de Resposta</h3>
                <Clock className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-3xl text-gray-800 mb-1">2.3 min</p>
              <p className="text-sm text-gray-600">Alertas críticos</p>
              <div className="mt-3 flex items-center gap-1 text-xs text-green-700">
                <TrendingUp className="w-3 h-3" />
                <span>15% melhor que meta</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-gray-700">Precisão da IA</h3>
                <Target className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-3xl text-gray-800 mb-1">94.2%</p>
              <p className="text-sm text-gray-600">Últimas 24 horas</p>
              <div className="mt-3 flex items-center gap-1 text-xs text-purple-700">
                <Lightbulb className="w-3 h-3" />
                <span>12 falsos positivos</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-gray-700">Últimos Eventos Críticos</h3>
                <AlertTriangle className="w-5 h-5 text-blue-600" />
              </div>
              <div className="space-y-2">
                {mockEvents.slice(0, 2).map(event => (
                  <div key={event.id} className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${
                      event.type === 'critical' ? 'bg-red-600' : 'bg-yellow-600'
                    }`}></div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-800">{event.title}</p>
                      <p className="text-xs text-gray-500">{event.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Patient List */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-gray-800">Pacientes em Monitoramento</h2>
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#0A7EA4]" />
                  <span className="text-sm text-gray-500">Atualização em tempo real</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    selectedFilter === 'all'
                      ? 'bg-[#0EA5E9] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Todos ({mockPatients.length})
                </button>
                <button
                  onClick={() => setSelectedFilter('critical')}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    selectedFilter === 'critical'
                      ? 'bg-red-500 text-white'
                      : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >
                  Críticos ({criticalCount})
                </button>
                <button
                  onClick={() => setSelectedFilter('attention')}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    selectedFilter === 'attention'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
                  }`}
                >
                  Atenção ({attentionCount})
                </button>
                <button
                  onClick={() => setSelectedFilter('normal')}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    selectedFilter === 'normal'
                      ? 'bg-green-500 text-white'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  Estáveis ({normalCount})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Paciente</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Localização</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">FC</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Temp</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Atualizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPatients.slice(0, 5).map((patient) => (
                    <PatientRow key={patient.id} patient={patient} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tempo Real View */}
      {currentView === 'realtime' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-gray-800 mb-1">Monitoramento em Tempo Real</h2>
              <p className="text-sm text-gray-500">Todos os pacientes ativos com atualização contínua</p>
            </div>
            <div className="flex items-center gap-3">
              <select 
                value={selectedSectorFilter}
                onChange={(e) => setSelectedSectorFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              >
                <option value="all">Todos os setores</option>
                <option value="UTI">UTI</option>
                <option value="Cardiologia">Cardiologia</option>
                <option value="Geriatria">Geriatria</option>
              </select>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-600">Ao vivo</span>
              </div>
            </div>
          </div>

          {/* Real-time Patient Table */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Paciente</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Localização</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Sinais Vitais</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Último Evento</th>
                  <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Última Atualização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mockPatients
                  .filter(p => selectedSectorFilter === 'all' || p.location.sector === selectedSectorFilter)
                  .map(patient => (
                  <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className={`w-3 h-3 rounded-full ${
                        patient.status === 'critical' ? 'bg-red-600 animate-pulse' :
                        patient.status === 'attention' ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}></div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-800">{patient.name}</p>
                      <p className="text-xs text-gray-500">{patient.age} anos • {patient.gender === 'M' ? 'Masculino' : 'Feminino'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-800">{patient.location.sector}</p>
                          <p className="text-xs text-gray-500">{patient.location.room} • Leito {patient.location.bed}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <Heart className="w-3 h-3 text-red-500" />
                          <span className={patient.heartRate > 100 ? 'text-red-600 font-medium' : 'text-gray-600'}>{patient.heartRate} bpm</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Thermometer className="w-3 h-3 text-blue-500" />
                          <span className={patient.temperature > 37.5 ? 'text-red-600 font-medium' : 'text-gray-600'}>{patient.temperature}°C</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Wind className="w-3 h-3 text-cyan-500" />
                          <span className={patient.saturation < 92 ? 'text-red-600 font-medium' : 'text-gray-600'}>{patient.saturation}%</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {patient.lastEvent ? (
                        <span className="text-xs text-gray-700">{patient.lastEvent}</span>
                      ) : (
                        <span className="text-xs text-gray-400">Nenhum evento</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {patient.lastUpdate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alertas & Incidentes View */}
      {currentView === 'alerts' && (
        <div className="space-y-6">
          {/* Alert Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <Bell className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl text-gray-800">{mockAlerts.length}</p>
              <p className="text-xs text-gray-600">Alertas Hoje</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
              <p className="text-2xl text-gray-800">{mockAlerts.filter(a => a.severity === 'critical').length}</p>
              <p className="text-xs text-gray-600">Alertas Críticos</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl text-gray-800">{mockAlerts.filter(a => a.status === 'resolvido').length}</p>
              <p className="text-xs text-gray-600">Incidentes Resolvidos</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <XCircle className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-2xl text-gray-800">12</p>
              <p className="text-xs text-gray-600">Falsos Positivos</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4">Alertas por Tipo</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={alertsByTypeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="type" stroke="#6B7280" style={{ fontSize: '11px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill={COLORS.danger} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4">Alertas por Horário</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={alertsByHourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="hour" stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="count" stroke={COLORS.warning} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Alert List */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-gray-800">Lista Detalhada de Alertas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Paciente</th>
                    <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Setor</th>
                    <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Tempo de Resposta</th>
                    <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Horário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mockAlerts.map(alert => (
                    <tr key={alert.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs ${
                          alert.type === 'queda' ? 'bg-red-100 text-red-700' :
                          alert.type === 'freq-cardiaca' ? 'bg-orange-100 text-orange-700' :
                          alert.type === 'temperatura' ? 'bg-yellow-100 text-yellow-700' :
                          alert.type === 'saturacao' ? 'bg-blue-100 text-blue-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {alert.type.replace('-', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-800">{alert.patient}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{alert.sector}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs ${
                          alert.status === 'ativo' ? 'bg-red-100 text-red-700' :
                          alert.status === 'respondendo' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {alert.responseTime > 0 ? `${alert.responseTime.toFixed(1)} min` : '-'}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">{alert.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Leitos & Ocupação View */}
      {currentView === 'beds' && (
        <div className="space-y-6">
          {/* Bed Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-red-50 to-pink-50 rounded-lg border border-red-100 p-4">
              <BedDouble className="w-8 h-8 text-red-600 mb-2" />
              <p className="text-2xl text-gray-800">18</p>
              <p className="text-xs text-gray-600">Leitos Ocupados</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
              <BedDouble className="w-8 h-8 text-green-600 mb-2" />
              <p className="text-2xl text-gray-800">6</p>
              <p className="text-xs text-gray-600">Leitos Livres</p>
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg border border-gray-200 p-4">
              <BedDouble className="w-8 h-8 text-gray-600 mb-2" />
              <p className="text-2xl text-gray-800">2</p>
              <p className="text-xs text-gray-600">Leitos Bloqueados</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
              <Activity className="w-8 h-8 text-blue-600 mb-2" />
              <p className="text-2xl text-gray-800">2.8</p>
              <p className="text-xs text-gray-600">Taxa de Giro (dias)</p>
            </div>
          </div>

          {/* Ocupação por Andar */}
          <div className="grid grid-cols-3 gap-4">
            {bedOccupancyByFloorData.map((floor, index) => (
              <div key={index} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-gray-800">{floor.floor}</h3>
                  <span className="text-sm text-gray-600">{Math.round((floor.ocupados / floor.total) * 100)}%</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Ocupados</span>
                    <span className="text-red-600">{floor.ocupados}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Disponíveis</span>
                    <span className="text-green-600">{floor.disponiveis}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                    <div 
                      className="bg-[#0EA5E9] h-2 rounded-full" 
                      style={{ width: `${(floor.ocupados / floor.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4">Ocupação por Setor</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={occupationBySectorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="sector" stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                  <Bar dataKey="ocupacao" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4">Tendência de Ocupação (24h)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={alerts24hData.map(d => ({ ...d, ocupacao: 70 + Math.random() * 20 }))}>
                  <defs>
                    <linearGradient id="colorOcupacao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="hour" stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="ocupacao" stroke={COLORS.primary} fillOpacity={1} fill="url(#colorOcupacao)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Indicadores Clínicos View */}
      {currentView === 'clinical' && (
        <div className="space-y-6">
          {/* Clinical Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <Heart className="w-8 h-8 text-red-500" />
                <div>
                  <p className="text-2xl text-gray-800">78</p>
                  <p className="text-xs text-gray-600">Freq. Cardíaca Média</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">bpm • Normal: 60-100</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <Thermometer className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl text-gray-800">36.8°C</p>
                  <p className="text-xs text-gray-600">Temperatura Média</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">Normal: 36.0-37.5°C</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <Wind className="w-8 h-8 text-cyan-500" />
                <div>
                  <p className="text-2xl text-gray-800">96%</p>
                  <p className="text-xs text-gray-600">Saturação Média</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">Normal: {'>'}95%</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="w-8 h-8 text-orange-500" />
                <div>
                  <p className="text-2xl text-gray-800">3</p>
                  <p className="text-xs text-gray-600">Eventos Críticos</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">Últimas 24h</p>
            </div>
          </div>

          {/* Vital Signs Trend */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Evolução de Sinais Vitais (Média)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={vitalSignsTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="time" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                <Legend />
                <Line type="monotone" dataKey="fc" stroke="#EF4444" strokeWidth={2} name="Freq. Cardíaca" />
                <Line type="monotone" dataKey="temp" stroke="#3B82F6" strokeWidth={2} name="Temperatura" />
                <Line type="monotone" dataKey="sat" stroke="#06B6D4" strokeWidth={2} name="Saturação" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* High Risk Patients */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Pacientes de Alto Risco</h3>
            <div className="space-y-3">
              {mockPatients.filter(p => p.status === 'critical' || p.status === 'attention').map(patient => (
                <div key={patient.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      patient.status === 'critical' ? 'bg-red-600' : 'bg-yellow-500'
                    }`}></div>
                    <div>
                      <p className="text-sm text-gray-800">{patient.name}</p>
                      <p className="text-xs text-gray-500">{patient.location.sector} • {patient.location.room}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className={patient.heartRate > 100 ? 'text-red-600' : 'text-gray-600'}>
                      ❤️ {patient.heartRate} bpm
                    </div>
                    <div className={patient.temperature > 37.5 ? 'text-red-600' : 'text-gray-600'}>
                      🌡️ {patient.temperature}°C
                    </div>
                    <div className={patient.saturation < 92 ? 'text-red-600' : 'text-gray-600'}>
                      💨 {patient.saturation}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Insights View */}
      {currentView === 'ai-insights' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] rounded-lg p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Lightbulb className="w-8 h-8" />
              <div>
                <h2 className="text-xl">Insights de IA do CuidAI</h2>
                <p className="text-sm opacity-90">Análise preditiva e recomendações inteligentes baseadas em dados em tempo real</p>
              </div>
            </div>
          </div>

          {/* AI Insight Cards */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Target className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-gray-800">Padrões Detectados</h3>
              </div>
              <p className="text-3xl text-gray-800 mb-2">4</p>
              <p className="text-sm text-gray-600">Últimos 30 dias</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-gray-800">Alertas Preditivos</h3>
              </div>
              <p className="text-3xl text-gray-800 mb-2">2</p>
              <p className="text-sm text-gray-600">Ação recomendada</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Lightbulb className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-gray-800">Sugestões Operacionais</h3>
              </div>
              <p className="text-3xl text-gray-800 mb-2">3</p>
              <p className="text-sm text-gray-600">Oportunidades de melhoria</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="text-gray-800">Riscos Emergentes</h3>
              </div>
              <p className="text-3xl text-gray-800 mb-2">1</p>
              <p className="text-sm text-gray-600">Monitoramento ativo</p>
            </div>
          </div>

          {/* Detailed AI Insights */}
          <div className="space-y-4">
            {mockAIInsights.map(insight => (
              <div key={insight.id} className={`bg-white rounded-lg border-2 p-5 ${
                insight.severity === 'critical' ? 'border-red-200 bg-red-50' :
                insight.severity === 'warning' ? 'border-yellow-200 bg-yellow-50' :
                'border-blue-200 bg-blue-50'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      insight.severity === 'critical' ? 'bg-red-100' :
                      insight.severity === 'warning' ? 'bg-yellow-100' :
                      'bg-blue-100'
                    }`}>
                      <Lightbulb className={`w-5 h-5 ${
                        insight.severity === 'critical' ? 'text-red-600' :
                        insight.severity === 'warning' ? 'text-yellow-600' :
                        'text-blue-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-sm mb-1 ${
                        insight.severity === 'critical' ? 'text-red-800' :
                        insight.severity === 'warning' ? 'text-yellow-800' :
                        'text-blue-800'
                      }`}>
                        {insight.title}
                      </h4>
                      <p className={`text-sm mb-2 ${
                        insight.severity === 'critical' ? 'text-red-700' :
                        insight.severity === 'warning' ? 'text-yellow-700' :
                        'text-blue-700'
                      }`}>
                        {insight.description}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs uppercase ${
                    insight.severity === 'critical' ? 'bg-red-200 text-red-800' :
                    insight.severity === 'warning' ? 'bg-yellow-200 text-yellow-800' :
                    'bg-blue-200 text-blue-800'
                  }`}>
                    {insight.severity === 'critical' ? 'Crítico' : insight.severity === 'warning' ? 'Atenção' : 'Info'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                  <div>
                    <p className={`text-xs mb-1 ${
                      insight.severity === 'critical' ? 'text-red-600' :
                      insight.severity === 'warning' ? 'text-yellow-600' :
                      'text-blue-600'
                    }`}>Motivo</p>
                    <p className={`${
                      insight.severity === 'critical' ? 'text-red-800' :
                      insight.severity === 'warning' ? 'text-yellow-800' :
                      'text-blue-800'
                    }`}>{insight.reason}</p>
                  </div>
                  <div>
                    <p className={`text-xs mb-1 ${
                      insight.severity === 'critical' ? 'text-red-600' :
                      insight.severity === 'warning' ? 'text-yellow-600' :
                      'text-blue-600'
                    }`}>Setor Afetado</p>
                    <p className={`${
                      insight.severity === 'critical' ? 'text-red-800' :
                      insight.severity === 'warning' ? 'text-yellow-800' :
                      'text-blue-800'
                    }`}>{insight.sector}</p>
                  </div>
                  <div>
                    <p className={`text-xs mb-1 ${
                      insight.severity === 'critical' ? 'text-red-600' :
                      insight.severity === 'warning' ? 'text-yellow-600' :
                      'text-blue-600'
                    }`}>Ação Sugerida</p>
                    <p className={`${
                      insight.severity === 'critical' ? 'text-red-800' :
                      insight.severity === 'warning' ? 'text-yellow-800' :
                      'text-blue-800'
                    }`}>{insight.action}</p>
                  </div>
                </div>

                <button className={`text-xs underline ${
                  insight.severity === 'critical' ? 'text-red-700 hover:text-red-800' :
                  insight.severity === 'warning' ? 'text-yellow-700 hover:text-yellow-800' :
                  'text-blue-700 hover:text-blue-800'
                }`}>
                  Ver análise completa →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Chat Button (Fixed) */}
      <button
        onClick={() => setShowAIChat(!showAIChat)}
        className="fixed bottom-8 right-8 bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white rounded-full px-6 py-4 shadow-lg hover:shadow-xl transition-all flex items-center gap-3 z-40"
      >
        <Bot className="w-6 h-6" />
        <div className="text-left">
          <p className="text-sm">IA Ativa</p>
          <p className="text-xs opacity-90">insights disponíveis</p>
        </div>
      </button>

      {/* AI Chat Modal */}
      {showAIChat && (
        <div className="fixed bottom-24 right-8 bg-white rounded-2xl border-2 border-[#0EA5E9] shadow-2xl w-96 z-50">
          <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-6 py-4 flex items-center justify-between rounded-t-2xl">
            <div className="flex items-center gap-3 text-white">
              <Bot className="w-6 h-6" />
              <div>
                <h3 className="text-sm">Assistente IA CuidAI</h3>
                <p className="text-xs opacity-90">Sempre disponível</p>
              </div>
            </div>
            <button
              onClick={() => setShowAIChat(false)}
              className="text-white hover:bg-white/20 rounded-lg p-1"
            >
              ×
            </button>
          </div>
          <div className="p-6 h-96 overflow-y-auto">
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-900">
                  Olá! Sou a IA do CuidAI. Como posso ajudar com os dados do {viewTabs.find(t => t.id === currentView)?.label}?
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button className="text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-sm">
                  💡 Explique os gráficos desta tela
                </button>
                <button className="text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-sm">
                  📊 Quais são os principais riscos agora?
                </button>
                <button className="text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-sm">
                  🎯 Sugestões de ação prioritária
                </button>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Pergunte qualquer coisa..."
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              />
              <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg hover:bg-[#0284C7]">
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Builder */}
      {showNewDashboardModal && (
        <DashboardBuilder onClose={() => setShowNewDashboardModal(false)} />
      )}
    </main>
  );
}
