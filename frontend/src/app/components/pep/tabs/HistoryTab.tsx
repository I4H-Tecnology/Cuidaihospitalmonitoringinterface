import React, { useState } from 'react';
import { Filter, Clock, Activity, FileText, Pill, TestTube, AlertCircle, User, Stethoscope, ArrowRightLeft, Scissors, CheckCircle, XCircle, AlertTriangle, Eye, ThumbsUp, ThumbsDown } from 'lucide-react';

interface Patient {
  id: number;
  name: string;
}

interface HistoryTabProps {
  patient: Patient;
}

type EventType = 'all' | 'medical-evolution' | 'nursing-evolution' | 'medication' | 'exam' | 'ai-alert' | 'vital-signs' | 'bed-transfer' | 'procedure';

interface HistoryEvent {
  id: number;
  type: 'medical-evolution' | 'nursing-evolution' | 'medication' | 'exam' | 'ai-alert' | 'vital-signs' | 'bed-transfer' | 'procedure';
  dateTime: string;
  timestamp: Date;
  title: string;
  description: string;
  professional: string;
  details?: string;
  origin: 'manual' | 'automatic' | 'ai';
  // AI specific fields
  aiConfidence?: number;
  aiStatus?: 'new' | 'verified' | 'resolved' | 'false-positive';
  aiAction?: string;
}

const mockHistory: HistoryEvent[] = [
  {
    id: 1,
    type: 'medical-evolution',
    dateTime: '21/12/2024 14:30',
    timestamp: new Date(2024, 11, 21, 14, 30),
    title: 'Evolução Médica',
    description: 'Paciente evoluindo satisfatoriamente. Mantém-se hemodinamicamente estável, eupneico, afebril. Ausculta cardíaca: ritmo cardíaco regular em 2 tempos, bulhas normofonéticas, sem sopros.',
    professional: 'Dr. Carlos Alberto Silva',
    details: 'Cardiologia - CRM 12345-SP',
    origin: 'manual'
  },
  {
    id: 2,
    type: 'ai-alert',
    dateTime: '21/12/2024 13:45',
    timestamp: new Date(2024, 11, 21, 13, 45),
    title: 'Alerta: Tentativa de Saída do Leito',
    description: 'Sistema detectou paciente tentando sair do leito sem auxílio. Movimento de membros inferiores e elevação do tronco identificados.',
    professional: 'Sistema MedSignal',
    details: 'Câmera: CAM-UTI-101A',
    origin: 'ai',
    aiConfidence: 94,
    aiStatus: 'verified',
    aiAction: 'Enfermagem acionada. Paciente auxiliado e retornou ao leito com segurança.'
  },
  {
    id: 3,
    type: 'medication',
    dateTime: '21/12/2024 12:00',
    timestamp: new Date(2024, 11, 21, 12, 0),
    title: 'Medicação Administrada',
    description: 'Omeprazol 40mg - Via Oral',
    professional: 'Enf. Maria Santos',
    details: 'COREN 54321-SP',
    origin: 'manual'
  },
  {
    id: 4,
    type: 'vital-signs',
    dateTime: '21/12/2024 12:00',
    timestamp: new Date(2024, 11, 21, 12, 0),
    title: 'Sinais Vitais Aferidos',
    description: 'PA: 120/80 mmHg | FC: 72 bpm | Temp: 36.5°C | SpO₂: 98% | Glicemia: 95 mg/dL',
    professional: 'Enf. Maria Santos',
    details: 'Aferição manual',
    origin: 'manual'
  },
  {
    id: 5,
    type: 'procedure',
    dateTime: '21/12/2024 11:00',
    timestamp: new Date(2024, 11, 21, 11, 0),
    title: 'Procedimento: Troca de Curativo',
    description: 'Troca de curativo em acesso venoso periférico - MSE. Sem sinais flogísticos. Mantido acesso pérvio.',
    professional: 'Enf. Ana Paula Costa',
    details: 'COREN 11223-SP',
    origin: 'manual'
  },
  {
    id: 6,
    type: 'exam',
    dateTime: '21/12/2024 10:30',
    timestamp: new Date(2024, 11, 21, 10, 30),
    title: 'Resultado de Exame',
    description: 'Raio-X de Tórax - Campos pulmonares limpos, sem infiltrados. Silhueta cardíaca preservada.',
    professional: 'Dr. Pedro Oliveira',
    details: 'Radiologia - CRM 98765-SP',
    origin: 'automatic'
  },
  {
    id: 7,
    type: 'ai-alert',
    dateTime: '21/12/2024 10:15',
    timestamp: new Date(2024, 11, 21, 10, 15),
    title: 'Alerta: Padrão de Movimento Atípico',
    description: 'Detectado padrão de agitação psicomotora. Paciente apresentou movimentos repetitivos de membros superiores.',
    professional: 'Sistema MedSignal',
    details: 'Câmera: CAM-UTI-101A',
    origin: 'ai',
    aiConfidence: 87,
    aiStatus: 'resolved',
    aiAction: 'Equipe verificou. Paciente estava ajustando posição no leito. Sem intercorrências.'
  },
  {
    id: 8,
    type: 'nursing-evolution',
    dateTime: '21/12/2024 08:00',
    timestamp: new Date(2024, 11, 21, 8, 0),
    title: 'Evolução de Enfermagem',
    description: 'Paciente consciente, orientado, colaborativo. Alimentou-se bem no café da manhã (80% da dieta). Deambulando com auxílio. Eliminações vesicais e intestinais presentes.',
    professional: 'Enf. Ana Paula Costa',
    details: 'COREN 11223-SP',
    origin: 'manual'
  },
  {
    id: 9,
    type: 'medication',
    dateTime: '21/12/2024 08:10',
    timestamp: new Date(2024, 11, 21, 8, 10),
    title: 'Medicação Administrada',
    description: 'Losartana Potássica 50mg + Atenolol 25mg - Via Oral',
    professional: 'Enf. Maria Santos',
    details: 'COREN 54321-SP',
    origin: 'manual'
  },
  {
    id: 10,
    type: 'vital-signs',
    dateTime: '21/12/2024 08:00',
    timestamp: new Date(2024, 11, 21, 8, 0),
    title: 'Sinais Vitais Aferidos',
    description: 'PA: 125/82 mmHg | FC: 68 bpm | Temp: 36.3°C | SpO₂: 97%',
    professional: 'Enf. João Costa',
    details: 'Aferição automática',
    origin: 'automatic'
  },
  {
    id: 11,
    type: 'exam',
    dateTime: '21/12/2024 07:30',
    timestamp: new Date(2024, 11, 21, 7, 30),
    title: 'Coleta de Exame',
    description: 'Hemograma completo coletado - Aguardando resultado do laboratório',
    professional: 'Téc. Roberto Lima',
    details: 'Técnico de Laboratório',
    origin: 'manual'
  },
  {
    id: 12,
    type: 'bed-transfer',
    dateTime: '20/12/2024 18:30',
    timestamp: new Date(2024, 11, 20, 18, 30),
    title: 'Transferência de Leito',
    description: 'Paciente transferido de UTI 102B para UTI 101A. Transferência sem intercorrências.',
    professional: 'Enf. João Costa',
    details: 'Motivo: Reorganização de leitos | Responsável médico: Dr. Carlos Silva',
    origin: 'manual'
  },
  {
    id: 13,
    type: 'ai-alert',
    dateTime: '20/12/2024 16:45',
    timestamp: new Date(2024, 11, 20, 16, 45),
    title: 'Alerta: Risco de Queda',
    description: 'Sistema detectou paciente próximo à borda do leito em posição de risco. Probabilidade de queda elevada.',
    professional: 'Sistema MedSignal',
    details: 'Câmera: CAM-UTI-102B',
    origin: 'ai',
    aiConfidence: 91,
    aiStatus: 'verified',
    aiAction: 'Enfermagem interveio imediatamente. Grades do leito elevadas. Paciente orientado.'
  },
  {
    id: 14,
    type: 'medical-evolution',
    dateTime: '20/12/2024 16:00',
    timestamp: new Date(2024, 11, 20, 16, 0),
    title: 'Admissão Hospitalar',
    description: 'Paciente admitido para tratamento de Hipertensão Arterial Sistêmica descompensada. Iniciado protocolo de estabilização hemodinâmica.',
    professional: 'Dr. Carlos Alberto Silva',
    details: 'Cardiologia - CRM 12345-SP | Internação via Pronto Socorro',
    origin: 'manual'
  }
];

export function HistoryTab({ patient }: HistoryTabProps) {
  const [filter, setFilter] = useState<EventType>('all');

  const typeConfig = {
    'medical-evolution': { 
      label: 'Evolução Médica', 
      color: 'bg-blue-50 border-l-blue-500 text-blue-700',
      icon: <FileText className="w-5 h-5" />,
      badge: 'bg-blue-100'
    },
    'nursing-evolution': { 
      label: 'Evolução de Enfermagem', 
      color: 'bg-green-50 border-l-green-500 text-green-700',
      icon: <User className="w-5 h-5" />,
      badge: 'bg-green-100'
    },
    medication: { 
      label: 'Medicação', 
      color: 'bg-purple-50 border-l-purple-500 text-purple-700',
      icon: <Pill className="w-5 h-5" />,
      badge: 'bg-purple-100'
    },
    exam: { 
      label: 'Exame', 
      color: 'bg-orange-50 border-l-orange-500 text-orange-700',
      icon: <TestTube className="w-5 h-5" />,
      badge: 'bg-orange-100'
    },
    'ai-alert': { 
      label: 'Alerta IA', 
      color: 'bg-cyan-50 border-l-cyan-500 text-cyan-700',
      icon: <AlertCircle className="w-5 h-5" />,
      badge: 'bg-cyan-100'
    },
    'vital-signs': { 
      label: 'Sinais Vitais', 
      color: 'bg-pink-50 border-l-pink-500 text-pink-700',
      icon: <Activity className="w-5 h-5" />,
      badge: 'bg-pink-100'
    },
    'bed-transfer': { 
      label: 'Transferência de Leito', 
      color: 'bg-gray-50 border-l-gray-500 text-gray-700',
      icon: <ArrowRightLeft className="w-5 h-5" />,
      badge: 'bg-gray-100'
    },
    procedure: { 
      label: 'Procedimento', 
      color: 'bg-red-50 border-l-red-500 text-red-700',
      icon: <Scissors className="w-5 h-5" />,
      badge: 'bg-red-100'
    }
  };

  const filteredHistory = filter === 'all' 
    ? mockHistory 
    : mockHistory.filter(event => event.type === filter);

  const originBadgeConfig = {
    manual: { label: 'Manual', color: 'bg-gray-100 text-gray-600', icon: <User className="w-3 h-3" /> },
    automatic: { label: 'Automático', color: 'bg-blue-100 text-blue-600', icon: <Activity className="w-3 h-3" /> },
    ai: { label: 'IA', color: 'bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white', icon: <AlertCircle className="w-3 h-3" /> }
  };

  const aiStatusConfig = {
    new: { label: 'Novo', color: 'bg-blue-100 text-blue-700', icon: <AlertCircle className="w-3 h-3" /> },
    verified: { label: 'Verificado', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
    resolved: { label: 'Resolvido', color: 'bg-gray-100 text-gray-700', icon: <CheckCircle className="w-3 h-3" /> },
    'false-positive': { label: 'Falso Positivo', color: 'bg-orange-100 text-orange-700', icon: <XCircle className="w-3 h-3" /> }
  };

  const filterOptions: { value: EventType; label: string; count: number }[] = [
    { value: 'all', label: 'Todos', count: mockHistory.length },
    { value: 'medical-evolution', label: 'Evolução Médica', count: mockHistory.filter(e => e.type === 'medical-evolution').length },
    { value: 'nursing-evolution', label: 'Evolução de Enfermagem', count: mockHistory.filter(e => e.type === 'nursing-evolution').length },
    { value: 'medication', label: 'Medicação', count: mockHistory.filter(e => e.type === 'medication').length },
    { value: 'exam', label: 'Exames', count: mockHistory.filter(e => e.type === 'exam').length },
    { value: 'ai-alert', label: 'Alertas IA', count: mockHistory.filter(e => e.type === 'ai-alert').length },
    { value: 'vital-signs', label: 'Sinais Vitais', count: mockHistory.filter(e => e.type === 'vital-signs').length },
    { value: 'bed-transfer', label: 'Transferência de Leito', count: mockHistory.filter(e => e.type === 'bed-transfer').length },
    { value: 'procedure', label: 'Procedimentos', count: mockHistory.filter(e => e.type === 'procedure').length }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800 mb-1">Histórico Completo</h2>
          <p className="text-sm text-gray-500">Linha do tempo unificada de todos os eventos</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-600">Filtrar por tipo:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === option.value
                  ? 'bg-[#0EA5E9] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline Line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        {/* Events */}
        <div className="space-y-4">
          {filteredHistory.map((event, index) => {
            const config = typeConfig[event.type];
            
            return (
              <div key={event.id} className="relative pl-16">
                {/* Timeline Dot */}
                <div className="absolute left-4 top-4 w-5 h-5 bg-white border-4 border-[#0EA5E9] rounded-full z-10"></div>

                {/* Event Card */}
                <div className={`bg-white rounded-lg border-l-4 ${config.color} shadow-sm overflow-hidden`}>
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 ${config.badge} rounded-lg`}>
                          {config.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-3 py-1 rounded-full text-xs ${config.badge} ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-sm text-gray-500 flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {event.dateTime}
                            </span>
                          </div>
                          <h4 className="text-gray-800 mb-2">{event.title}</h4>
                          <p className="text-sm text-gray-700 mb-2">{event.description}</p>
                          
                          {/* Professional Info */}
                          <div className="text-sm text-gray-600">
                            <p className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {event.professional}
                            </p>
                            {event.details && (
                              <p className="text-xs text-gray-500 mt-1 ml-5">{event.details}</p>
                            )}
                          </div>

                          {/* Origin Badge */}
                          <div className="flex items-center gap-2 mt-3">
                            <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${originBadgeConfig[event.origin].color}`}>
                              {originBadgeConfig[event.origin].icon}
                              {originBadgeConfig[event.origin].label}
                            </span>
                            
                            {/* AI Confidence */}
                            {event.aiConfidence && (
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                                🎯 Confiança: {event.aiConfidence}%
                              </span>
                            )}
                            
                            {/* AI Status */}
                            {event.aiStatus && (
                              <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${aiStatusConfig[event.aiStatus].color}`}>
                                {aiStatusConfig[event.aiStatus].icon}
                                {aiStatusConfig[event.aiStatus].label}
                              </span>
                            )}
                          </div>

                          {/* AI Action Taken */}
                          {event.aiAction && (
                            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                              <p className="text-xs text-green-800">
                                <strong>✅ Ação realizada pela equipe:</strong>
                              </p>
                              <p className="text-xs text-green-700 mt-1">
                                {event.aiAction}
                              </p>
                            </div>
                          )}

                          {/* AI Event Highlight */}
                          {event.origin === 'ai' && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs text-gray-500 italic flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Evento detectado por inteligência artificial
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load More */}
      <button className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
        Carregar eventos mais antigos
      </button>
    </div>
  );
}