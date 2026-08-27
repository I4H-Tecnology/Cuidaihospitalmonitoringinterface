import React from 'react';
import { TrendingUp, TrendingDown, Activity, AlertCircle, Users, BedDouble } from 'lucide-react';

export function ReportsScreen() {
  const stats = [
    { 
      label: 'Alertas Hoje', 
      value: '24', 
      change: '+8%',
      trend: 'up',
      icon: <AlertCircle className="w-5 h-5" />
    },
    { 
      label: 'Pacientes Críticos', 
      value: '3', 
      change: '-2',
      trend: 'down',
      icon: <Activity className="w-5 h-5" />
    },
    { 
      label: 'Total Monitorados', 
      value: '253', 
      change: '+5',
      trend: 'up',
      icon: <Users className="w-5 h-5" />
    },
    { 
      label: 'Quartos Ocupados', 
      value: '41/54', 
      change: '76%',
      trend: 'neutral',
      icon: <BedDouble className="w-5 h-5" />
    }
  ];

  const recentActivity = [
    { time: '14:30', event: 'Alerta crítico resolvido', patient: 'Maria Silva Santos' },
    { time: '13:15', event: 'Nova admissão', patient: 'Pedro Costa Alves' },
    { time: '12:00', event: 'Alta médica', patient: 'Fernanda Lima' },
    { time: '11:45', event: 'Transferência de setor', patient: 'João Pereira Souza' },
    { time: '11:20', event: 'Sinais vitais atualizados', patient: 'Ana Costa Lima' }
  ];

  return (
    <div className="px-4 py-4 pb-24">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-gray-800 mb-1">Relatórios do Dia</h2>
        <p className="text-sm text-gray-500">Atualizado em tempo real • {new Date().toLocaleDateString('pt-BR')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-[#E8F4F8] rounded-lg flex items-center justify-center text-[#0A7EA4]">
                {stat.icon}
              </div>
              {stat.trend !== 'neutral' && (
                <div className={`flex items-center gap-1 ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                  {stat.trend === 'up' ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span className="text-xs">{stat.change}</span>
                </div>
              )}
            </div>
            <p className="text-2xl text-gray-800 mb-1">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 mb-4">
        <h3 className="text-gray-800 mb-3">Alertas nas Últimas 8 Horas</h3>
        <div className="flex items-end justify-between h-32 gap-2">
          {[4, 2, 6, 8, 3, 5, 7, 4].map((height, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div 
                className="w-full bg-gradient-to-t from-[#0EA5E9] to-[#7DD3FC] rounded-t relative group"
                style={{ height: `${height * 12}%` }}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  {height}
                </span>
              </div>
              <span className="text-xs text-gray-400">{8 + index}h</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-gray-800">Atividade Recente</h3>
        </div>
        {recentActivity.map((activity, index) => (
          <div key={index} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-800 mb-1">{activity.event}</p>
                <p className="text-xs text-gray-500">{activity.patient}</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap ml-3">{activity.time}</span>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full bg-[#0EA5E9] text-white rounded-lg py-3 active:scale-98 transition-transform shadow-sm">
        Gerar Relatório Completo
      </button>
    </div>
  );
}