import React, { useState } from 'react';
import { FileText, Pill, Activity, AlertTriangle, Beaker, UserCheck, Clock, Filter, ThumbsUp, ThumbsDown, Lightbulb, Stethoscope } from 'lucide-react';
import { AvisoForaDoMVP, BotaoIndisponivel } from '../ForaDoMVP';

interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'evolution' | 'medication' | 'vital-signs' | 'ai-alert' | 'exam' | 'procedure' | 'ai-suggestion';
  title: string;
  description: string;
  professional?: string;
  origin: 'manual' | 'automatic' | 'ai';
  status?: 'new' | 'verified' | 'resolved' | 'false-positive';
  aiConfidence?: number;
  aiExplanation?: string;
  feedbackGiven?: boolean;
}

const mockTimelineEvents: TimelineEvent[] = [
  {
    id: '1',
    timestamp: new Date(2024, 11, 21, 14, 30),
    type: 'evolution',
    title: 'Evolução Médica',
    description: 'Paciente estável, sem queixas. Mantém sinais vitais dentro dos parâmetros normais. Segue em observação.',
    professional: 'Dr. Carlos Alberto Silva - CRM 12345-SP',
    origin: 'manual'
  },
  {
    id: '2',
    timestamp: new Date(2024, 11, 21, 13, 45),
    type: 'ai-suggestion',
    title: '🤖 Sugestão Inteligente: Revisar Prescrição',
    description: 'Padrão de glicemia elevada detectado nos últimos 3 dias (média: 145 mg/dL). Considerar ajuste na dose de insulina.',
    origin: 'ai',
    aiConfidence: 85,
    aiExplanation: 'Baseado em: Histórico de 72h de glicemia, padrão horário pós-prandial, ausência de ajuste recente.',
    feedbackGiven: false
  },
  {
    id: '3',
    timestamp: new Date(2024, 11, 21, 12, 30),
    type: 'ai-alert',
    title: 'Alerta IA: Possível saída do leito',
    description: 'Sistema detectou movimento atípico e tentativa de saída do leito sem auxílio.',
    origin: 'ai',
    status: 'verified',
    aiConfidence: 92,
    professional: 'Verificado por: Enf. Ana Paula'
  },
  {
    id: '4',
    timestamp: new Date(2024, 11, 21, 12, 0),
    type: 'medication',
    title: 'Medicação Administrada',
    description: 'Omeprazol 40mg - Via oral',
    professional: 'Enf. Maria Santos',
    origin: 'manual'
  },
  {
    id: '5',
    timestamp: new Date(2024, 11, 21, 10, 15),
    type: 'vital-signs',
    title: 'Sinais Vitais Aferidos',
    description: 'PA: 120/80 mmHg | FC: 72 bpm | T: 36.5°C | SpO₂: 98% | Glicemia: 145 mg/dL',
    professional: 'Enf. João Costa',
    origin: 'manual'
  },
  {
    id: '6',
    timestamp: new Date(2024, 11, 21, 9, 0),
    type: 'exam',
    title: 'Coleta de Exame',
    description: 'Hemograma completo coletado - Aguardando resultado',
    professional: 'Téc. Roberto Lima',
    origin: 'manual'
  },
  {
    id: '7',
    timestamp: new Date(2024, 11, 21, 8, 0),
    type: 'evolution',
    title: 'Evolução de Enfermagem',
    description: 'Paciente alimentou-se bem no café da manhã. Deambulando com auxílio. Diurese e evacuação presentes.',
    professional: 'Enf. Ana Paula Rocha',
    origin: 'manual'
  },
  {
    id: '8',
    timestamp: new Date(2024, 11, 21, 6, 30),
    type: 'vital-signs',
    title: 'Sinais Vitais Aferidos',
    description: 'PA: 125/82 mmHg | FC: 68 bpm | T: 36.3°C | SpO₂: 97%',
    professional: 'Enf. Marcos Silva',
    origin: 'automatic'
  },
  {
    id: '9',
    timestamp: new Date(2024, 11, 20, 22, 0),
    type: 'medication',
    title: 'Medicação Administrada',
    description: 'Losartana 50mg + Atenolol 25mg - Via oral',
    professional: 'Enf. Lucia Martins',
    origin: 'manual'
  },
  {
    id: '10',
    timestamp: new Date(2024, 11, 20, 20, 15),
    type: 'procedure',
    title: 'Procedimento Realizado',
    description: 'Troca de acesso venoso periférico - MSE - Calibre 20G',
    professional: 'Enf. Pedro Santos',
    origin: 'manual'
  }
];

export function ClinicalTimelineTab() {
  const [filterType, setFilterType] = useState<'all' | 'clinical' | 'ai'>('all');
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const typeConfig = {
    'evolution': {
      icon: <FileText className="w-5 h-5" />,
      color: 'bg-blue-500',
      label: 'Evolução',
      borderColor: 'border-blue-200',
      bgColor: 'bg-blue-50'
    },
    'medication': {
      icon: <Pill className="w-5 h-5" />,
      color: 'bg-purple-500',
      label: 'Medicação',
      borderColor: 'border-purple-200',
      bgColor: 'bg-purple-50'
    },
    'vital-signs': {
      icon: <Activity className="w-5 h-5" />,
      color: 'bg-green-500',
      label: 'Sinais Vitais',
      borderColor: 'border-green-200',
      bgColor: 'bg-green-50'
    },
    'ai-alert': {
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'bg-red-500',
      label: 'Alerta IA',
      borderColor: 'border-red-200',
      bgColor: 'bg-red-50'
    },
    'exam': {
      icon: <Beaker className="w-5 h-5" />,
      color: 'bg-cyan-500',
      label: 'Exame',
      borderColor: 'border-cyan-200',
      bgColor: 'bg-cyan-50'
    },
    'procedure': {
      icon: <UserCheck className="w-5 h-5" />,
      color: 'bg-orange-500',
      label: 'Procedimento',
      borderColor: 'border-orange-200',
      bgColor: 'bg-orange-50'
    },
    'ai-suggestion': {
      icon: <Lightbulb className="w-5 h-5" />,
      color: 'bg-yellow-500',
      label: 'Sugestão IA',
      borderColor: 'border-yellow-200',
      bgColor: 'bg-yellow-50'
    }
  };

  const originBadgeConfig = {
    manual: { label: 'Manual', color: 'bg-gray-100 text-gray-700' },
    automatic: { label: 'Automático', color: 'bg-blue-100 text-blue-700' },
    ai: { label: 'IA', color: 'bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white' }
  };

  const statusConfig = {
    new: { label: 'Novo', color: 'bg-blue-100 text-blue-700' },
    verified: { label: 'Verificado', color: 'bg-green-100 text-green-700' },
    resolved: { label: 'Resolvido', color: 'bg-gray-100 text-gray-700' },
    'false-positive': { label: 'Falso Positivo', color: 'bg-orange-100 text-orange-700' }
  };

  const filteredEvents = mockTimelineEvents.filter(event => {
    if (filterType === 'all') return true;
    if (filterType === 'clinical') return event.origin === 'manual';
    if (filterType === 'ai') return event.origin === 'ai';
    return true;
  });

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleFeedback = (eventId: string, positive: boolean) => {
    console.log(`Feedback ${positive ? 'positivo' : 'negativo'} para evento ${eventId}`);
    // In real implementation, send feedback to backend
  };

  return (
    <>
      <AvisoForaDoMVP oque={'A linha do tempo clínica'} />
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800 mb-1">Timeline Clínica Unificada</h2>
          <p className="text-sm text-gray-500">
            Histórico completo de eventos assistenciais, medicações e alertas inteligentes
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filterType === 'all'
                  ? 'bg-white text-[#0A7EA4] shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterType('clinical')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filterType === 'clinical'
                  ? 'bg-white text-[#0A7EA4] shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Clínicos
            </button>
            <button
              onClick={() => setFilterType('ai')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filterType === 'ai'
                  ? 'bg-white text-[#0A7EA4] shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              IA
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical Line */}
        <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-gray-200"></div>

        {/* Events */}
        <div className="space-y-6">
          {filteredEvents.map((event, index) => {
            const config = typeConfig[event.type];
            const isAI = event.origin === 'ai';

            return (
              <div key={event.id} className="relative flex gap-4">
                {/* Icon */}
                <div className={`relative z-10 w-12 h-12 ${config.color} rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-lg`}>
                  {config.icon}
                </div>

                {/* Content */}
                <div className={`flex-1 bg-white border ${config.borderColor} rounded-lg p-4 shadow-sm hover:shadow-md transition-all`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-gray-800">{event.title}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${originBadgeConfig[event.origin].color}`}>
                          {originBadgeConfig[event.origin].label}
                        </span>
                        {event.status && (
                          <span className={`px-2 py-0.5 rounded-full text-xs ${statusConfig[event.status].color}`}>
                            {statusConfig[event.status].label}
                          </span>
                        )}
                        {event.aiConfidence && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                            {event.aiConfidence}% confiança
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(event.timestamp)} às {formatTime(event.timestamp)}
                        </span>
                        {event.professional && (
                          <span>👤 {event.professional}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-700 mb-3">
                    {event.description}
                  </p>

                  {/* AI Explanation */}
                  {event.aiExplanation && (
                    <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-3 mb-3`}>
                      <p className="text-xs text-gray-700">
                        <strong>📊 Base da análise:</strong> {event.aiExplanation}
                      </p>
                    </div>
                  )}

                  {/* AI Suggestion Feedback */}
                  {event.type === 'ai-suggestion' && !event.feedbackGiven && (
                    <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-600 flex-1">Esta sugestão foi útil?</p>
                      <button
                        onClick={() => handleFeedback(event.id, true)}
                        className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs hover:bg-green-100 transition-colors flex items-center gap-1"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        Útil
                      </button>
                      <button
                        onClick={() => handleFeedback(event.id, false)}
                        className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs hover:bg-red-100 transition-colors flex items-center gap-1"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        Não útil
                      </button>
                    </div>
                  )}

                  {/* Disclaimer for AI */}
                  {isAI && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 italic">
                        💡 Esta informação é assistiva e não substitui avaliação clínica profissional.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load More */}
      <button
                    disabled
                    title="Ação indisponível: este módulo é demonstração da visão de produto (RFC, seção 2.6)" className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
        Carregar eventos anteriores
      </button>
    </div>
    </>
  );
}