import React, { useState } from 'react';
import { FileText, Download, Calendar, Plus, Filter, BedDouble, Activity, Bell, TrendingUp, TrendingDown, AlertTriangle, ChevronRight, BarChart3, PieChart, LineChart, Target, Lightbulb, Clock, Users, CheckCircle, XCircle } from 'lucide-react';

type ReportCategory = 'operational' | 'clinical' | 'ai-alerts';
type ChartType = 'bar' | 'line' | 'pie';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  icon: React.ReactNode;
  value?: string;
  change?: number;
  chartType?: ChartType;
}

const reportCards: ReportCard[] = [
  // Operacionais
  {
    id: 'bed-occupancy',
    title: 'Ocupação de Leitos',
    description: 'Taxa de ocupação por setor e período',
    category: 'operational',
    icon: <BedDouble className="w-6 h-6" />,
    value: '75%',
    change: 5,
    chartType: 'bar'
  },
  {
    id: 'turnover-rate',
    title: 'Taxa de Giro',
    description: 'Rotatividade de leitos no período',
    category: 'operational',
    icon: <TrendingUp className="w-6 h-6" />,
    value: '3.2',
    change: -2,
    chartType: 'line'
  },
  {
    id: 'blocked-beds',
    title: 'Leitos Bloqueados',
    description: 'Leitos indisponíveis e motivos',
    category: 'operational',
    icon: <AlertTriangle className="w-6 h-6" />,
    value: '4',
    change: 0,
    chartType: 'pie'
  },
  {
    id: 'avg-stay',
    title: 'Tempo Médio de Permanência',
    description: 'Dias de internação por setor',
    category: 'operational',
    icon: <Clock className="w-6 h-6" />,
    value: '4.8 dias',
    change: -8,
    chartType: 'bar'
  },
  // Clínicos
  {
    id: 'falls-detected',
    title: 'Quedas Detectadas',
    description: 'Eventos de queda por período',
    category: 'clinical',
    icon: <AlertTriangle className="w-6 h-6" />,
    value: '12',
    change: -15,
    chartType: 'line'
  },
  {
    id: 'bed-exit',
    title: 'Saída de Leito',
    description: 'Alertas de saída não autorizada',
    category: 'clinical',
    icon: <Activity className="w-6 h-6" />,
    value: '28',
    change: 3,
    chartType: 'bar'
  },
  {
    id: 'vital-signs',
    title: 'Sinais Vitais Críticos',
    description: 'Alterações críticas registradas',
    category: 'clinical',
    icon: <Activity className="w-6 h-6" />,
    value: '34',
    change: -10,
    chartType: 'line'
  },
  {
    id: 'events-per-patient',
    title: 'Eventos por Paciente',
    description: 'Média de eventos clínicos',
    category: 'clinical',
    icon: <Users className="w-6 h-6" />,
    value: '2.4',
    change: 5,
    chartType: 'bar'
  },
  // Alertas
  {
    id: 'alerts-by-type',
    title: 'Alertas por Tipo',
    description: 'Distribuição de alertas gerados',
    category: 'ai-alerts',
    icon: <Bell className="w-6 h-6" />,
    value: '156',
    change: 8,
    chartType: 'pie'
  },
];

export function ReportsScreen() {
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | 'all'>('all');
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const categories = [
    { id: 'all' as const, label: 'Todos os Relatórios', count: reportCards.length },
    { id: 'operational' as const, label: 'Operacionais', count: reportCards.filter(r => r.category === 'operational').length },
    { id: 'clinical' as const, label: 'Clínicos', count: reportCards.filter(r => r.category === 'clinical').length },
    { id: 'ai-alerts' as const, label: 'Alertas', count: reportCards.filter(r => r.category === 'ai-alerts').length }
  ];

  const filteredReports = selectedCategory === 'all' 
    ? reportCards 
    : reportCards.filter(r => r.category === selectedCategory);

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-3 h-3" />;
    if (change < 0) return <TrendingDown className="w-3 h-3" />;
    return null;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-500';
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-gray-800 mb-1">Relatórios</h1>
            <p className="text-sm text-gray-500">Análises clínicas, operacionais e estratégicas</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <Calendar className="w-4 h-4" />
              Agendar Relatório
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Plus className="w-4 h-4" />
              Criar Relatório Personalizado
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-700">Filtros Globais</span>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs text-[#0A7EA4] hover:underline"
            >
              {showFilters ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Período</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                  <option>Últimos 7 dias</option>
                  <option>Últimos 15 dias</option>
                  <option>Últimos 30 dias</option>
                  <option>Este mês</option>
                  <option>Mês passado</option>
                  <option>Personalizado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Unidade</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                  <option>Todas</option>
                  <option>Hospital Central</option>
                  <option>Unidade Norte</option>
                  <option>Unidade Sul</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Setor</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                  <option>Todos</option>
                  <option>UTI</option>
                  <option>Cardiologia</option>
                  <option>Geriatria</option>
                  <option>Pediatria</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tipo de Relatório</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]">
                  <option>Todos</option>
                  <option>Operacional</option>
                  <option>Clínico</option>
                  <option>Alertas</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Paciente (opcional)</label>
                <input
                  type="text"
                  placeholder="Buscar paciente..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-[#0EA5E9] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span className="text-sm">{cat.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              selectedCategory === cat.id ? 'bg-white/20' : 'bg-gray-100'
            }`}>
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      <div>
        {/* Report Cards */}
        <div>
          <div className="grid grid-cols-2 gap-4">
            {filteredReports.map(report => (
              <div
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                className={`bg-white rounded-lg border-2 p-5 cursor-pointer transition-all hover:shadow-lg ${
                  selectedReport === report.id ? 'border-[#0EA5E9] shadow-lg' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-3 rounded-lg ${
                    report.category === 'operational' ? 'bg-blue-100 text-blue-600' :
                    report.category === 'clinical' ? 'bg-green-100 text-green-600' :
                    'bg-purple-100 text-purple-600'
                  }`}>
                    {report.icon}
                  </div>
                  {report.chartType && (
                    <div className="text-gray-400">
                      {report.chartType === 'bar' && <BarChart3 className="w-5 h-5" />}
                      {report.chartType === 'line' && <LineChart className="w-5 h-5" />}
                      {report.chartType === 'pie' && <PieChart className="w-5 h-5" />}
                    </div>
                  )}
                </div>

                <h3 className="text-gray-800 mb-2">{report.title}</h3>
                <p className="text-xs text-gray-500 mb-4">{report.description}</p>

                {report.value && (
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl text-gray-800">{report.value}</p>
                      {report.change !== undefined && (
                        <div className={`flex items-center gap-1 text-xs mt-1 ${getChangeColor(report.change)}`}>
                          {getChangeIcon(report.change)}
                          <span>{Math.abs(report.change)}% vs. período anterior</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">Total de Relatórios</span>
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl text-gray-800">{reportCards.length}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">Exportações</span>
                <Download className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-2xl text-gray-800">34</p>
              <p className="text-xs text-gray-500 mt-1">Este mês</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">Agendados</span>
                <Calendar className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl text-gray-800">8</p>
              <p className="text-xs text-gray-500 mt-1">Ativos</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">Personalizados</span>
                <Plus className="w-4 h-4 text-orange-600" />
              </div>
              <p className="text-2xl text-gray-800">3</p>
              <p className="text-xs text-gray-500 mt-1">Criados</p>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
