import React from 'react';
import { MessageSquare, Clock, ChevronRight } from 'lucide-react';

interface Message {
  id: number;
  title: string;
  lastMessage: string;
  time: string;
  unread: number;
  type: 'nursing' | 'caregiver' | 'alert';
}

const mockMessages: Message[] = [
  {
    id: 1,
    title: 'Equipe de Enfermagem',
    lastMessage: 'Paciente do quarto 301 necessita atenção',
    time: 'há 5 min',
    unread: 3,
    type: 'nursing'
  },
  {
    id: 2,
    title: 'Cuidadores - Turno Manhã',
    lastMessage: 'Relatório de sinais vitais atualizado',
    time: 'há 15 min',
    unread: 0,
    type: 'caregiver'
  },
  {
    id: 3,
    title: 'Alertas Automáticos',
    lastMessage: 'Frequência cardíaca elevada - João Pereira',
    time: 'há 20 min',
    unread: 5,
    type: 'alert'
  },
  {
    id: 4,
    title: 'Equipe Médica - UTI',
    lastMessage: 'Rounds médicos finalizados',
    time: 'há 1 hora',
    unread: 0,
    type: 'nursing'
  },
  {
    id: 5,
    title: 'Cuidadores - Turno Tarde',
    lastMessage: 'Medicação administrada conforme protocolo',
    time: 'há 2 horas',
    unread: 1,
    type: 'caregiver'
  }
];

export function MessagesScreen() {
  const getIconColor = (type: string) => {
    switch (type) {
      case 'nursing':
        return 'bg-[#E8F4F8] text-[#0A7EA4]';
      case 'caregiver':
        return 'bg-green-100 text-green-600';
      case 'alert':
        return 'bg-yellow-100 text-yellow-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="px-4 py-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-800">Mensagens</h2>
        <span className="text-sm text-gray-500">
          {mockMessages.filter(m => m.unread > 0).length} não lidas
        </span>
      </div>

      <div className="space-y-3">
        {mockMessages.map(message => (
          <div
            key={message.id}
            className={`bg-white rounded-lg p-4 shadow-sm border ${
              message.unread > 0 ? 'border-[#7DD3FC]' : 'border-gray-100'
            } active:scale-98 transition-transform cursor-pointer`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${getIconColor(message.type)}`}>
                <MessageSquare className="w-5 h-5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-gray-800 truncate">{message.title}</h3>
                  {message.unread > 0 && (
                    <span className="w-6 h-6 bg-[#0EA5E9] text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 ml-2">
                      {message.unread}
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 truncate mb-2">
                  {message.lastMessage}
                </p>
                
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>{message.time}</span>
                </div>
              </div>
              
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-3" />
            </div>
          </div>
        ))}
      </div>

      <button className="w-full bg-white border border-gray-200 text-gray-700 rounded-lg py-3 mt-4 active:scale-98 transition-transform">
        Ver todas as mensagens
      </button>
    </div>
  );
}
