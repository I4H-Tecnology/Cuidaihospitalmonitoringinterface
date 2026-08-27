import React, { useState } from 'react';
import { AlertTriangle, Clock, MapPin } from 'lucide-react';

interface Alert {
  id: number;
  type: 'critical' | 'warning' | 'info';
  title: string;
  patient: string;
  location: string;
  time: string;
}

const mockAlerts: Alert[] = [
  {
    id: 1,
    type: 'critical',
    title: 'Queda detectada - Paciente fora do leito',
    patient: 'Maria Silva Santos',
    location: 'UTI → Quarto 301 → Leito A',
    time: 'há 2 min'
  },
  {
    id: 2,
    type: 'warning',
    title: 'Frequência cardíaca elevada',
    patient: 'João Pereira Souza',
    location: 'Cardiologia → Quarto 205 → Leito B',
    time: 'há 5 min'
  },
  {
    id: 3,
    type: 'info',
    title: 'Chamada de enfermagem',
    patient: 'Ana Costa Lima',
    location: 'Geriatria → Quarto 412 → Leito C',
    time: 'há 8 min'
  },
  {
    id: 4,
    type: 'warning',
    title: 'Temperatura elevada detectada',
    patient: 'Carlos Mendes Oliveira',
    location: 'UTI → Quarto 302 → Leito A',
    time: 'há 15 min'
  },
  {
    id: 5,
    type: 'critical',
    title: 'Saturação de O2 abaixo do normal',
    patient: 'Roberto Alves Ferreira',
    location: 'UTI → Quarto 303 → Leito B',
    time: 'há 20 min'
  },
  {
    id: 6,
    type: 'info',
    title: 'Monitoramento iniciado',
    patient: 'Lucia Martins Rocha',
    location: 'Cardiologia → Quarto 206 → Leito A',
    time: 'há 25 min'
  }
];

export function AlertsScreen() {
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const filteredAlerts = filter === 'all' 
    ? mockAlerts 
    : mockAlerts.filter(a => a.type === filter);

  const alertConfig = {
    critical: {
      bg: 'bg-red-50',
      border: 'border-l-red-500',
      icon: 'text-red-500',
      badge: 'bg-red-100 text-red-700',
      label: 'Crítico'
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-l-yellow-500',
      icon: 'text-yellow-500',
      badge: 'bg-yellow-100 text-yellow-700',
      label: 'Atenção'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-l-[#0EA5E9]',
      icon: 'text-[#0EA5E9]',
      badge: 'bg-blue-100 text-blue-700',
      label: 'Normal'
    }
  };

  const criticalCount = mockAlerts.filter(a => a.type === 'critical').length;
  const warningCount = mockAlerts.filter(a => a.type === 'warning').length;
  const infoCount = mockAlerts.filter(a => a.type === 'info').length;

  return (
    <div className="px-4 py-4 pb-24">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-gray-800 mb-1">Alertas em Tempo Real</h2>
        <p className="text-sm text-gray-500">{mockAlerts.length} alertas ativos</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
            filter === 'all'
              ? 'bg-[#0A7EA4] text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          Todos ({mockAlerts.length})
        </button>
        <button
          onClick={() => setFilter('critical')}
          className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
            filter === 'critical'
              ? 'bg-red-500 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          Críticos ({criticalCount})
        </button>
        <button
          onClick={() => setFilter('warning')}
          className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
            filter === 'warning'
              ? 'bg-yellow-500 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          Atenção ({warningCount})
        </button>
        <button
          onClick={() => setFilter('info')}
          className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
            filter === 'info'
              ? 'bg-[#0EA5E9] text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          Normais ({infoCount})
        </button>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.map(alert => {
          const config = alertConfig[alert.type];
          return (
            <div
              key={alert.id}
              className={`${config.bg} ${config.border} border-l-4 rounded-lg p-4 active:scale-98 transition-transform shadow-sm`}
            >
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle className={`w-5 h-5 ${config.icon} mt-0.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <h4 className="text-gray-800 mb-1">{alert.title}</h4>
                  <p className="text-sm text-gray-700 mb-1">{alert.patient}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${config.badge} whitespace-nowrap`}>
                  {config.label}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-gray-600">
                  <MapPin className="w-4 h-4" />
                  <span className="text-xs">{alert.location}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs">{alert.time}</span>
                </div>
              </div>

              {alert.type === 'critical' && (
                <button className="w-full bg-red-500 text-white rounded-lg py-2.5 mt-3 text-sm active:scale-98 transition-transform shadow-sm">
                  Atender Agora
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}