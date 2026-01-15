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

interface AIInsight {
  id: number;
  type: 'pattern' | 'recommendation' | 'alert';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
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
  // Alertas & IA
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
  {
    id: 'false-positives',
    title: 'Falsos Positivos',
    description: 'Taxa de alertas incorretos',
    category: 'ai-alerts',
    icon: <XCircle className="w-6 h-6" />,
    value: '5.8%',
    change: -12,
    chartType: 'line'
  },
  {
    id: 'ai-accuracy',
    title: 'Precisão da IA',
    description: 'Acurácia dos modelos',
    category: 'ai-alerts',
    icon: <Target className="w-6 h-6" />,
    value: '94.2%',
    change: 2,
    chartType: 'line'
  },
  {
    id: 'ai-suggestions',
    title: 'Sugestões da IA Aplicadas',
    description: 'Recomendações implementadas',
    category: 'ai-alerts',
    icon: <Lightbulb className="w-6 h-6" />,
    value: '67%',
    change: 15,
    chartType: 'bar'
  }
];

const aiInsights: AIInsight[] = [
  {
    id: 1,
    type: 'pattern',
    title: 'Padrão Detectado: Pico de Alertas Noturno',
    description: 'Identificado aumento de 35% em alertas de saída de leito entre 02h-05h. Sugestão: reforçar equipe noturna.',
    priority: 'high'
  },
  {
    id: 2,
    type: 'recommendation',
    title: 'Recomendação: Otimização de Leitos UTI',
    description: 'Taxa de ocupação da UTI está 12% acima da meta. Considere abertura de 2 leitos adicionais.',
    priority: 'medium'
  },
  {
    id: 3,
    type: 'alert',
    title: 'Alertas Recorrentes: Paciente Maria Silva',
    description: '8 alertas de saída de leito nos últimos 3 dias. Paciente pode necessitar avaliação de contenção.',
    priority: 'high'
  },
  {
    id: 4,
    type: 'pattern',
    title: 'Padrão: Redução de Quedas pós-Treinamento',
    description: 'Após treinamento da equipe (15/12), quedas reduziram 18%. Manter protocolo atual.',
    priority: 'low'
  },
  {
    id: 5,
    type: 'recommendation',
    title: 'Recomendação: Calibração de Sensores',
    description: 'Detectado aumento de 8% em falsos positivos no setor Geriatria. Recalibração recomendada.',
    priority: 'medium'
  }
];

export function ReportsScreen() {
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | 'all'>('all');
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const categories = [
    { id: 'all' as const, label: 'Todos os Relatórios', count: reportCards.length },
    { id: 'operational' as const, label: 'Operacionais', count: reportCards.filter(r => r.category === 'operational').length },
    { id: 'clinical' as const, label: 'Clínicos', count: reportCards.filter(r => r.category === 'clinical').length },
    { id: 'ai-alerts' as const, label: 'Alertas & IA', count: reportCards.filter(r => r.category === 'ai-alerts').length }
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

  const insightTypeConfig = {
    pattern: { icon: <BarChart3 className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700', label: 'Padrão' },
    recommendation: { icon: <Lightbulb className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700', label: 'Recomendação' },
    alert: { icon: <Bell className="w-4 h-4" />, color: 'bg-orange-100 text-orange-700', label: 'Alerta' }
  };

  const priorityConfig = {
    high: { color: 'border-l-red-500', dot: 'bg-red-500' },
    medium: { color: 'border-l-yellow-500', dot: 'bg-yellow-500' },
    low: { color: 'border-l-green-500', dot: 'bg-green-500' }
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
                  <option>Alertas & IA</option>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Report Cards */}
        <div className="lg:col-span-2">
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

        {/* Sidebar - AI Insights */}
        <div className="lg:col-span-1">
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-5 py-4">
              <div className="flex items-center gap-2 text-white mb-1">
                <Lightbulb className="w-5 h-5" />
                <h3 className="text-white">Insights da IA</h3>
              </div>
              <p className="text-xs text-white/80">Análises automáticas e recomendações</p>
            </div>

            <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
              {aiInsights.map(insight => {
                const typeConfig = insightTypeConfig[insight.type];
                const priorityStyle = priorityConfig[insight.priority];

                return (
                  <div
                    key={insight.id}
                    className={`bg-white rounded-lg border-l-4 ${priorityStyle.color} p-4 shadow-sm hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${typeConfig.color}`}>
                        {typeConfig.icon}
                        {typeConfig.label}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${priorityStyle.dot}`}></span>
                    </div>
                    <h4 className="text-sm text-gray-800 mb-2">{insight.title}</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">{insight.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-purple-200 p-4 bg-white">
              <button className="w-full px-4 py-2 bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white rounded-lg text-sm hover:shadow-lg transition-shadow">
                Ver Todos os Insights →
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm text-gray-700 mb-3">Legenda de Prioridade</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="text-xs text-gray-600">Alta - Ação imediata recomendada</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="text-xs text-gray-600">Média - Revisar em breve</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-xs text-gray-600">Baixa - Informativo</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
