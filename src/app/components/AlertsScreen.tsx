import React, { useState } from 'react';
import { Search, Volume2, Filter, MoreVertical, MapPin, User, BedDouble, Clock, MessageSquare, Phone } from 'lucide-react';

interface Alert {
  id: number;
  type: 'critical' | 'warning' | 'attending' | 'resolved';
  title: string;
  description: string;
  patient: string;
  location: string;
  bed: string;
  sector: string;
  time: string;
  attendedBy?: string;
  responseTime?: string;
}

const mockAlerts: Alert[] = [
  {
    id: 1,
    type: 'critical',
    title: 'Queda Detectada',
    description: 'Movimento de queda identificado pela IA com 98.5% de confiança',
    patient: 'João P.',
    location: 'Leito 101-B',
    bed: '101-B',
    sector: 'UTI',
    time: '5 min atrás'
  },
  {
    id: 2,
    type: 'warning',
    title: 'Saída de Leito Não Autorizada',
    description: 'Paciente detectado fora do leito por mais de 3 minutos',
    patient: 'Maria S.',
    location: 'Leito 101-A',
    bed: '101-A',
    sector: 'UTI',
    time: '8 min atrás',
    attendedBy: 'Enf. Carla',
    responseTime: 'Tempo de resposta: 2 min'
  },
  {
    id: 3,
    type: 'warning',
    title: 'Chamada de Enfermagem',
    description: 'Solicitação de assistência no tablet do paciente',
    patient: 'Ana L.',
    location: 'Leito 102-B',
    bed: '102-B',
    sector: 'UTI',
    time: '12 min atrás',
    attendedBy: 'Enf. Roberto',
    responseTime: 'Tempo de resposta: 3 min'
  },
  {
    id: 4,
    type: 'attending',
    title: 'Medicação Pendente',
    description: 'Horário de administração de Omeprazol 40mg próximo',
    patient: 'Carlos M.',
    location: 'Leito 201-A',
    bed: '201-A',
    sector: 'Enfermaria',
    time: '15 min atrás'
  }
];

export function AlertsScreen() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'critical' | 'warning' | 'attending' | 'resolved'>('all');

  const filteredAlerts = mockAlerts.filter(alert => {
    const matchesSearch = alert.patient.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || alert.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const stats = [
    { label: 'Total Hoje', value: 6, color: 'border-gray-300' },
    { label: 'Críticos Ativos', value: 1, color: 'border-red-500' },
    { label: 'Alertas', value: 2, color: 'border-yellow-500' },
    { label: 'Em Atendimento', value: 2, color: 'border-blue-500' },
    { label: 'Resolvidos', value: 2, color: 'border-green-500' }
  ];

  const getAlertStyles = (type: string) => {
    switch (type) {
      case 'critical':
        return { bg: 'bg-red-50', border: 'border-l-red-500', badge: 'bg-red-500 text-white', label: 'Crítico' };
      case 'warning':
        return { bg: 'bg-yellow-50', border: 'border-l-yellow-500', badge: 'bg-yellow-500 text-white', label: 'Alerta' };
      case 'attending':
        return { bg: 'bg-blue-50', border: 'border-l-blue-500', badge: 'bg-blue-500 text-white', label: 'Em atendimento' };
      case 'resolved':
        return { bg: 'bg-green-50', border: 'border-l-green-500', badge: 'bg-green-500 text-white', label: 'Resolvido' };
      default:
        return { bg: 'bg-gray-50', border: 'border-l-gray-500', badge: 'bg-gray-500 text-white', label: 'Info' };
    }
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Central de Alertas</h1>
          <p className="text-sm text-gray-500">Monitoramento em tempo real de alertas clínicos</p>
        </div>
        <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Som Ativo
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {stats.map((stat, index) => (
          <div key={index} className={`bg-white rounded-lg border-l-4 ${stat.color} p-4 shadow-sm`}>
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className="text-3xl text-gray-800">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por paciente, leito ou tipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Tipo
            </button>
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Status
            </button>
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Setor
            </button>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {filteredAlerts.map(alert => {
          const styles = getAlertStyles(alert.type);
          
          return (
            <div
              key={alert.id}
              className={`${styles.bg} ${styles.border} border-l-4 bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow`}
            >
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      {alert.type === 'critical' ? '⚠️' : alert.type === 'warning' ? '⚡' : alert.type === 'attending' ? '🔵' : '✅'}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-gray-800">{alert.title}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs ${styles.badge}`}>
                          {styles.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{alert.description}</p>
                      
                      {/* Patient Info */}
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span>{alert.patient}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <BedDouble className="w-4 h-4" />
                          <span>{alert.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          <span>{alert.sector}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-sm text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span>{alert.time}</span>
                    </div>
                    <button className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors">
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    {alert.attendedBy ? (
                      <div className="text-sm text-gray-600">
                        <span className="text-gray-500">Atendido por:</span> <span className="text-gray-800">{alert.attendedBy}</span>
                        {alert.responseTime && <span className="text-gray-400 ml-2">• {alert.responseTime}</span>}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Aguardando atendimento</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {alert.type === 'critical' && !alert.attendedBy && (
                      <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
                        Iniciar Atendimento
                      </button>
                    )}
                    <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Ligar
                    </button>
                    <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
