import React, { useState, useCallback } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { 
  Save, Eye, Upload, X, Plus, Grip, Trash2, Settings, 
  Activity, Users, AlertCircle, Bed, TrendingUp, BarChart3, 
  PieChart, LineChart, Table, Zap, Calendar, Heart,
  Target, Clock, Shield, Sparkles, Layout, Grid3x3, MonitorDot,
  Filter, Palette, RefreshCw, ArrowLeft, Download, Copy,
  CheckCircle2, XCircle, AlertTriangle, TrendingDown, Percent
} from 'lucide-react';
import { LineChart as RechartsLine, Line, BarChart, Bar, PieChart as RechartsPie, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Widget types
const WIDGET_TYPES = {
  KPI: 'kpi',
  LINE_CHART: 'line_chart',
  BAR_CHART: 'bar_chart',
  PIE_CHART: 'pie_chart',
  AREA_CHART: 'area_chart',
  TABLE: 'table',
  ALERTS: 'alerts',
  HEATMAP: 'heatmap'
};

// Widget library
const WIDGET_LIBRARY = [
  // KPIs
  {
    id: 'kpi-patients',
    type: WIDGET_TYPES.KPI,
    category: 'KPIs',
    name: 'Total de Pacientes',
    icon: Users,
    defaultConfig: {
      metric: 'Total de Pacientes',
      value: 156,
      change: '+12%',
      trend: 'up',
      color: '#0EA5E9'
    }
  },
  {
    id: 'kpi-alerts',
    type: WIDGET_TYPES.KPI,
    category: 'KPIs',
    name: 'Alertas Ativos',
    icon: AlertCircle,
    defaultConfig: {
      metric: 'Alertas Ativos',
      value: 8,
      change: '-3%',
      trend: 'down',
      color: '#F59E0B'
    }
  },
  {
    id: 'kpi-critical',
    type: WIDGET_TYPES.KPI,
    category: 'KPIs',
    name: 'Casos Críticos',
    icon: AlertTriangle,
    defaultConfig: {
      metric: 'Casos Críticos',
      value: 3,
      change: '0%',
      trend: 'neutral',
      color: '#EF4444'
    }
  },
  {
    id: 'kpi-occupancy',
    type: WIDGET_TYPES.KPI,
    category: 'KPIs',
    name: 'Taxa de Ocupação',
    icon: Bed,
    defaultConfig: {
      metric: 'Taxa de Ocupação',
      value: '78%',
      change: '+5%',
      trend: 'up',
      color: '#10B981'
    }
  },
  // Charts
  {
    id: 'chart-line-24h',
    type: WIDGET_TYPES.LINE_CHART,
    category: 'Gráficos',
    name: 'Tendência 24h',
    icon: LineChart,
    defaultConfig: {
      title: 'Alertas - Últimas 24h',
      period: '24h'
    }
  },
  {
    id: 'chart-bar-sectors',
    type: WIDGET_TYPES.BAR_CHART,
    category: 'Gráficos',
    name: 'Gráfico de Barras',
    icon: BarChart3,
    defaultConfig: {
      title: 'Pacientes por Setor',
      period: 'hoje'
    }
  },
  {
    id: 'chart-pie-status',
    type: WIDGET_TYPES.PIE_CHART,
    category: 'Gráficos',
    name: 'Gráfico de Pizza',
    icon: PieChart,
    defaultConfig: {
      title: 'Distribuição por Status',
      period: 'atual'
    }
  },
  {
    id: 'chart-area-trend',
    type: WIDGET_TYPES.AREA_CHART,
    category: 'Gráficos',
    name: 'Gráfico de Área',
    icon: TrendingUp,
    defaultConfig: {
      title: 'Ocupação - 7 dias',
      period: '7d'
    }
  },
  // Tables
  {
    id: 'table-patients',
    type: WIDGET_TYPES.TABLE,
    category: 'Tabelas',
    name: 'Pacientes em Tempo Real',
    icon: Table,
    defaultConfig: {
      title: 'Pacientes Monitorados',
      refreshRate: 'real-time'
    }
  },
  {
    id: 'table-alerts',
    type: WIDGET_TYPES.TABLE,
    category: 'Tabelas',
    name: 'Tabela de Alertas',
    icon: AlertCircle,
    defaultConfig: {
      title: 'Alertas Recentes',
      refreshRate: '30s'
    }
  },
];

// Mock data for charts
const mockLineData = [
  { time: '00:00', value: 12 },
  { time: '04:00', value: 8 },
  { time: '08:00', value: 15 },
  { time: '12:00', value: 22 },
  { time: '16:00', value: 18 },
  { time: '20:00', value: 14 },
  { time: '24:00', value: 10 }
];

const mockBarData = [
  { sector: 'UTI', value: 45 },
  { sector: 'Enfermaria', value: 78 },
  { sector: 'Emergência', value: 33 },
  { sector: 'Semi-UTI', value: 28 }
];

const mockPieData = [
  { name: 'Normal', value: 125, color: '#10B981' },
  { name: 'Atenção', value: 28, color: '#F59E0B' },
  { name: 'Crítico', value: 3, color: '#EF4444' }
];

const mockAreaData = [
  { day: 'Seg', value: 65 },
  { day: 'Ter', value: 72 },
  { day: 'Qua', value: 68 },
  { day: 'Qui', value: 78 },
  { day: 'Sex', value: 75 },
  { day: 'Sáb', value: 70 },
  { day: 'Dom', value: 65 }
];

const mockPatients = [
  { name: 'Maria Silva', room: '301-A', status: 'Normal', alerts: 0 },
  { name: 'João Santos', room: '205-B', status: 'Atenção', alerts: 2 },
  { name: 'Ana Costa', room: '412-C', status: 'Normal', alerts: 0 },
  { name: 'Carlos Mendes', room: '302-A', status: 'Crítico', alerts: 5 }
];

const mockAlerts = [
  { patient: 'João Santos', type: 'FC Elevada', severity: 'Atenção', time: '2 min' },
  { patient: 'Carlos Mendes', type: 'Queda Detectada', severity: 'Crítico', time: '5 min' },
  { patient: 'Maria Silva', type: 'Rotina', severity: 'Normal', time: '15 min' }
];

// Widget Component
interface WidgetProps {
  widget: any;
  onRemove: () => void;
  onSelect: () => void;
  isSelected: boolean;
}

function Widget({ widget, onRemove, onSelect, isSelected }: WidgetProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'widget',
    item: { id: widget.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  }));

  const renderContent = () => {
    switch (widget.type) {
      case WIDGET_TYPES.KPI:
        return (
          <div className="h-full flex flex-col justify-between p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-1">{widget.config.metric}</p>
                <p className="text-4xl font-bold mb-2" style={{ color: widget.config.color }}>
                  {widget.config.value}
                </p>
                <div className={`inline-flex items-center gap-1 text-sm font-medium ${
                  widget.config.trend === 'up' ? 'text-green-600' : 
                  widget.config.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {widget.config.trend === 'up' && <TrendingUp className="w-4 h-4" />}
                  {widget.config.trend === 'down' && <TrendingDown className="w-4 h-4" />}
                  <span>{widget.config.change}</span>
                </div>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: `${widget.config.color}15` }}>
                <widget.icon className="w-6 h-6" style={{ color: widget.config.color }} />
              </div>
            </div>
          </div>
        );

      case WIDGET_TYPES.LINE_CHART:
        return (
          <div className="h-full flex flex-col p-4">
            <h3 className="font-semibold mb-4">{widget.config.title}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLine data={mockLineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#0EA5E9" strokeWidth={2} />
              </RechartsLine>
            </ResponsiveContainer>
          </div>
        );

      case WIDGET_TYPES.BAR_CHART:
        return (
          <div className="h-full flex flex-col p-4">
            <h3 className="font-semibold mb-4">{widget.config.title}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="sector" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0EA5E9" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case WIDGET_TYPES.PIE_CHART:
        return (
          <div className="h-full flex flex-col p-4">
            <h3 className="font-semibold mb-4">{widget.config.title}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={mockPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {mockPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
        );

      case WIDGET_TYPES.AREA_CHART:
        return (
          <div className="h-full flex flex-col p-4">
            <h3 className="font-semibold mb-4">{widget.config.title}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockAreaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#0EA5E9" fill="#7DD3FC" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );

      case WIDGET_TYPES.TABLE:
        const tableData = widget.config.title.includes('Pacientes') ? mockPatients : mockAlerts;
        return (
          <div className="h-full flex flex-col p-4">
            <h3 className="font-semibold mb-4">{widget.config.title}</h3>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {widget.config.title.includes('Pacientes') ? (
                      <>
                        <th className="text-left p-2 font-medium">Paciente</th>
                        <th className="text-left p-2 font-medium">Leito</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium">Alertas</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left p-2 font-medium">Paciente</th>
                        <th className="text-left p-2 font-medium">Tipo</th>
                        <th className="text-left p-2 font-medium">Severidade</th>
                        <th className="text-left p-2 font-medium">Tempo</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-100">
                      {widget.config.title.includes('Pacientes') ? (
                        <>
                          <td className="p-2">{row.name}</td>
                          <td className="p-2">{row.room}</td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              row.status === 'Normal' ? 'bg-green-100 text-green-700' :
                              row.status === 'Atenção' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="p-2">{row.alerts}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-2">{row.patient}</td>
                          <td className="p-2">{row.type}</td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              row.severity === 'Normal' ? 'bg-green-100 text-green-700' :
                              row.severity === 'Atenção' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {row.severity}
                            </span>
                          </td>
                          <td className="p-2">{row.time}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return <div className="p-4">Widget não implementado</div>;
    }
  };

  return (
    <div
      ref={drag}
      onClick={onSelect}
      className={`bg-white rounded-xl shadow-sm border-2 transition-all cursor-move ${
        isDragging ? 'opacity-50 scale-95' : 'opacity-100'
      } ${isSelected ? 'border-[#0EA5E9] ring-2 ring-[#0EA5E9]/20' : 'border-gray-200 hover:border-gray-300'}`}
      style={{ height: widget.height || '300px' }}
    >
      {/* Widget Header */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="p-1.5 bg-white rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
        >
          <Settings className="w-4 h-4 text-gray-600" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1.5 bg-white rounded-lg shadow-sm hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4 text-red-600" />
        </button>
        <div className="p-1.5 bg-white rounded-lg shadow-sm cursor-grab active:cursor-grabbing">
          <Grip className="w-4 h-4 text-gray-400" />
        </div>
      </div>

      {renderContent()}
    </div>
  );
}

// Drop Zone Component
interface DropZoneProps {
  onDrop: (item: any, position: number) => void;
  position: number;
  children?: React.ReactNode;
}

function DropZone({ onDrop, position, children }: DropZoneProps) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'library-widget',
    drop: (item) => onDrop(item, position),
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  }));

  return (
    <div
      ref={drop}
      className={`min-h-[300px] transition-all ${
        isOver ? 'bg-blue-50 border-2 border-dashed border-[#0EA5E9] rounded-xl' : ''
      }`}
    >
      {children}
    </div>
  );
}

// Library Widget Item
interface LibraryWidgetProps {
  widget: any;
}

function LibraryWidget({ widget }: LibraryWidgetProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'library-widget',
    item: { widgetDef: widget },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  }));

  const Icon = widget.icon;

  return (
    <div
      ref={drag}
      className={`p-3 bg-white rounded-lg border-2 border-gray-200 hover:border-[#0EA5E9] hover:shadow-md transition-all cursor-move ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Icon className="w-5 h-5 text-[#0EA5E9]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{widget.name}</p>
          <p className="text-xs text-gray-500">{widget.category}</p>
        </div>
        <Grip className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </div>
    </div>
  );
}

// Main Dashboard Builder Component
interface DashboardBuilderProps {
  onClose: () => void;
}

export function DashboardBuilder({ onClose }: DashboardBuilderProps) {
  const [dashboardName, setDashboardName] = useState('Novo Dashboard');
  const [selectedProfile, setSelectedProfile] = useState<'admin' | 'enfermagem' | 'medico'>('admin');
  const [widgets, setWidgets] = useState<any[]>([]);
  const [selectedWidget, setSelectedWidget] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const categories = ['Todos', 'KPIs', 'Gráficos', 'Tabelas'];

  const filteredLibrary = selectedCategory === 'Todos' 
    ? WIDGET_LIBRARY 
    : WIDGET_LIBRARY.filter(w => w.category === selectedCategory);

  const handleDrop = useCallback((item: any, position: number) => {
    const newWidget = {
      id: `widget-${Date.now()}`,
      ...item.widgetDef,
      config: { ...item.widgetDef.defaultConfig },
      height: '300px'
    };
    
    const newWidgets = [...widgets];
    newWidgets.splice(position, 0, newWidget);
    setWidgets(newWidgets);
  }, [widgets]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    setWidgets(widgets.filter(w => w.id !== widgetId));
    if (selectedWidget?.id === widgetId) {
      setSelectedWidget(null);
    }
  }, [widgets, selectedWidget]);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    console.log('Dashboard salvo:', { name: dashboardName, profile: selectedProfile, widgets });
  };

  const handleAISuggest = () => {
    setShowAISuggestions(true);
    
    // Conjunto fixo de widgets por perfil. Não há modelo envolvido — é uma
    // tabela, e a tela não deve dizer que é IA.
    const suggestions: { [key: string]: any[] } = {
      admin: [
        WIDGET_LIBRARY.find(w => w.id === 'kpi-patients'),
        WIDGET_LIBRARY.find(w => w.id === 'kpi-occupancy'),
        WIDGET_LIBRARY.find(w => w.id === 'chart-bar-sectors'),
        WIDGET_LIBRARY.find(w => w.id === 'table-alerts')
      ],
      enfermagem: [
        WIDGET_LIBRARY.find(w => w.id === 'kpi-alerts'),
        WIDGET_LIBRARY.find(w => w.id === 'table-patients'),
        WIDGET_LIBRARY.find(w => w.id === 'kpi-critical'),
        WIDGET_LIBRARY.find(w => w.id === 'chart-line-24h')
      ],
      medico: [
        WIDGET_LIBRARY.find(w => w.id === 'kpi-critical'),
        WIDGET_LIBRARY.find(w => w.id === 'table-alerts'),
        WIDGET_LIBRARY.find(w => w.id === 'kpi-alerts'),
        WIDGET_LIBRARY.find(w => w.id === 'chart-pie-status')
      ]
    };

    const suggestedWidgets = suggestions[selectedProfile]
      .filter(Boolean)
      .map((widgetDef, idx) => ({
        id: `widget-ai-${Date.now()}-${idx}`,
        ...widgetDef,
        config: { ...widgetDef!.defaultConfig },
        height: '300px'
      }));

    setWidgets(suggestedWidgets);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-[1800px] max-h-[95vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Layout className="w-6 h-6" />
                  <input
                    type="text"
                    value={dashboardName}
                    onChange={(e) => setDashboardName(e.target.value)}
                    className="bg-transparent text-2xl font-bold border-none outline-none focus:bg-white/10 px-2 py-1 rounded"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-blue-100">Perfil:</span>
                  <select
                    value={selectedProfile}
                    onChange={(e) => setSelectedProfile(e.target.value as any)}
                    className="bg-white/20 text-white text-sm px-3 py-1 rounded-lg border border-white/30 outline-none"
                  >
                    <option value="admin">Administrador</option>
                    <option value="enfermagem">Enfermagem</option>
                    <option value="medico">Médico</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAISuggest}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>Sugerir por perfil</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                <Eye className="w-4 h-4" />
                <span>Visualizar</span>
              </button>
              <button
                onClick={handleSave}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  isSaved 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-white text-[#0EA5E9] hover:bg-blue-50'
                }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Salvo!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Salvar</span>
                  </>
                )}
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
                <Upload className="w-4 h-4" />
                <span>Publicar</span>
              </button>
            </div>
          </div>

          {/* AI Suggestions Banner */}
          {showAISuggestions && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-b border-purple-200 p-4">
              <div className="flex items-start gap-3">
                <Layout className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-purple-900">Sugestão de widgets para {selectedProfile === 'admin' ? 'Administradores' : selectedProfile === 'enfermagem' ? 'Enfermagem' : 'Médicos'}</p>
                  <p className="text-sm text-purple-700 mt-1">
                    {selectedProfile === 'admin' && 'Dashboard executivo com visão geral, métricas de ocupação e análise por setores.'}
                    {selectedProfile === 'enfermagem' && 'Dashboard operacional focado em alertas em tempo real.'}
                    {selectedProfile === 'medico' && 'Dashboard clínico com casos críticos, alertas e análise de riscos.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowAISuggestions(false)}
                  className="p-1 hover:bg-purple-100 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-purple-600" />
                </button>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar - Widget Library */}
            <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-white">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Grid3x3 className="w-5 h-5 text-[#0EA5E9]" />
                  Biblioteca de Widgets
                </h3>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        selectedCategory === cat
                          ? 'bg-[#0EA5E9] text-white shadow-sm'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filteredLibrary.map((widget) => (
                  <LibraryWidget key={widget.id} widget={widget} />
                ))}
              </div>

              <div className="p-4 border-t border-gray-200 bg-white">
                <div className="text-xs text-gray-500 space-y-1">
                  <p className="flex items-center gap-1">
                    <Grip className="w-3 h-3" />
                    Arraste widgets para o canvas
                  </p>
                  <p className="flex items-center gap-1">
                    <Settings className="w-3 h-3" />
                    Clique para configurar
                  </p>
                </div>
              </div>
            </div>

            {/* Center - Canvas */}
            <div className="flex-1 overflow-y-auto bg-[#F8FBFC] p-8">
              {widgets.length === 0 ? (
                <DropZone onDrop={handleDrop} position={0}>
                  <div className="min-h-[600px] border-2 border-dashed border-gray-300 rounded-2xl flex items-center justify-center">
                    <div className="text-center max-w-md">
                      <MonitorDot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-600 mb-2">
                        Canvas Vazio
                      </h3>
                      <p className="text-gray-500 mb-6">
                        Arraste widgets da biblioteca à esquerda ou use a sugestão por perfil
                      </p>
                      <button
                        onClick={handleAISuggest}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white rounded-xl hover:shadow-lg transition-all"
                      >
                        <Sparkles className="w-5 h-5" />
                        <span>Sugerir por perfil</span>
                      </button>
                    </div>
                  </div>
                </DropZone>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {widgets.map((widget, idx) => (
                    <DropZone key={widget.id} onDrop={handleDrop} position={idx}>
                      <Widget
                        widget={widget}
                        onRemove={() => handleRemoveWidget(widget.id)}
                        onSelect={() => setSelectedWidget(widget)}
                        isSelected={selectedWidget?.id === widget.id}
                      />
                    </DropZone>
                  ))}
                  <DropZone onDrop={handleDrop} position={widgets.length}>
                    <div className="min-h-[300px] border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center hover:border-[#0EA5E9] transition-colors">
                      <div className="text-center">
                        <Plus className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Adicionar widget</p>
                      </div>
                    </div>
                  </DropZone>
                </div>
              )}
            </div>

            {/* Right Sidebar - Widget Configuration */}
            <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
              {selectedWidget ? (
                <>
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Settings className="w-5 h-5 text-[#0EA5E9]" />
                        Configurações
                      </h3>
                      <button
                        onClick={() => setSelectedWidget(null)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-500">{selectedWidget.name}</p>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Fonte de Dados */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Fonte de Dados</label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option>Tempo Real</option>
                        <option>Últimas 24h</option>
                        <option>Última semana</option>
                        <option>Último mês</option>
                      </select>
                    </div>

                    {/* Filtros */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        <Filter className="w-4 h-4 inline mr-1" />
                        Filtros
                      </label>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Setor</label>
                          <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            <option>Todos</option>
                            <option>UTI</option>
                            <option>Enfermaria</option>
                            <option>Emergência</option>
                            <option>Semi-UTI</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Andar</label>
                          <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            <option>Todos</option>
                            <option>2º Andar</option>
                            <option>3º Andar</option>
                            <option>4º Andar</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Status</label>
                          <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            <option>Todos</option>
                            <option>Normal</option>
                            <option>Atenção</option>
                            <option>Crítico</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Atualização */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        <RefreshCw className="w-4 h-4 inline mr-1" />
                        Atualização
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option>Tempo Real</option>
                        <option>A cada 10 segundos</option>
                        <option>A cada 30 segundos</option>
                        <option>A cada minuto</option>
                        <option>A cada 5 minutos</option>
                        <option>Manual</option>
                      </select>
                    </div>

                    {/* Visual */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        <Palette className="w-4 h-4 inline mr-1" />
                        Visual
                      </label>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Tamanho</label>
                          <select 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            value={selectedWidget.height}
                            onChange={(e) => {
                              const updated = widgets.map(w => 
                                w.id === selectedWidget.id ? { ...w, height: e.target.value } : w
                              );
                              setWidgets(updated);
                              setSelectedWidget({ ...selectedWidget, height: e.target.value });
                            }}
                          >
                            <option value="200px">Pequeno (200px)</option>
                            <option value="300px">Médio (300px)</option>
                            <option value="400px">Grande (400px)</option>
                            <option value="500px">Extra Grande (500px)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Cor Principal</label>
                          <div className="flex gap-2">
                            {['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'].map((color) => (
                              <button
                                key={color}
                                onClick={() => {
                                  const updated = widgets.map(w => 
                                    w.id === selectedWidget.id 
                                      ? { ...w, config: { ...w.config, color } } 
                                      : w
                                  );
                                  setWidgets(updated);
                                  setSelectedWidget({ ...selectedWidget, config: { ...selectedWidget.config, color } });
                                }}
                                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                                  selectedWidget.config?.color === color 
                                    ? 'border-gray-900 scale-110' 
                                    : 'border-gray-200 hover:scale-105'
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 border-t border-gray-200 space-y-2">
                      <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">
                        <Copy className="w-4 h-4" />
                        Duplicar Widget
                      </button>
                      <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors">
                        <Download className="w-4 h-4" />
                        Exportar Configuração
                      </button>
                      <button 
                        onClick={() => handleRemoveWidget(selectedWidget.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remover Widget
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center max-w-xs">
                    <Settings className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">
                      Selecione um widget no canvas para configurar
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
