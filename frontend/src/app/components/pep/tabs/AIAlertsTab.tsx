import React from 'react';
import { Camera, AlertTriangle, CheckCircle, Eye, User } from 'lucide-react';
import { AISuggestionCard } from '../AISuggestionCard';

interface Patient {
  id: number;
  name: string;
}

interface AIAlertsTabProps {
  patient: Patient;
}

interface AISuggestion {
  level: 'low' | 'moderate' | 'high';
  suggestions: string[];
  analysisBase: string[];
}

interface AIAlert {
  id: number;
  type: 'fall' | 'exit' | 'absence' | 'risk' | 'recognition';
  dateTime: string;
  camera: string;
  confidence: number;
  action: string;
  professional: string;
  status: 'detected' | 'verified' | 'false-positive' | 'resolved';
  aiSuggestion?: AISuggestion;
}

const mockAIAlerts: AIAlert[] = [
  {
    id: 1,
    type: 'exit',
    dateTime: '21/12/2024 10:15',
    camera: 'CAM-UTI-101A',
    confidence: 97.2,
    action: 'Enfermagem acionada e paciente foi auxiliado a retornar ao leito',
    professional: 'Enf. Maria Santos',
    status: 'resolved',
    aiSuggestion: {
      level: 'moderate',
      suggestions: [
        'Avaliar reforço de vigilância no período matutino',
        'Considerar verificação de recorrência nas próximas 24 horas',
        'Pode ser útil revisar necessidade de contenção mecânica suave'
      ],
      analysisBase: [
        '3 eventos semelhantes de saída de leito nas últimas 48h',
        'Padrão recorrente no período entre 10h-11h',
        'Paciente em pós-operatório de 3 dias'
      ]
    }
  },
  {
    id: 2,
    type: 'risk',
    dateTime: '21/12/2024 06:30',
    camera: 'CAM-UTI-101A',
    confidence: 72.1,
    action: 'Monitoramento intensificado, falso positivo confirmado',
    professional: 'Enf. João Costa',
    status: 'false-positive',
    aiSuggestion: {
      level: 'low',
      suggestions: [
        'Avaliar ajuste de sensibilidade do sensor para este leito',
        'Observar se movimentações normais estão gerando alertas falsos',
        'Pode indicar necessidade de recalibração da câmera'
      ],
      analysisBase: [
        '2 falsos positivos nas últimas 12 horas',
        'Movimentações normais do paciente interpretadas como risco',
        'Iluminação do ambiente pode estar interferindo'
      ]
    }
  },
  {
    id: 3,
    type: 'recognition',
    dateTime: '20/12/2024 22:00',
    camera: 'CAM-UTI-101A',
    confidence: 99.8,
    action: 'Identidade do paciente confirmada automaticamente',
    professional: 'Sistema',
    status: 'verified',
    aiSuggestion: {
      level: 'low',
      suggestions: [
        'Reconhecimento facial funcionando adequadamente',
        'Observação: sistema mantém alta precisão mesmo em baixa luminosidade',
        'Nenhuma ação adicional necessária no momento'
      ],
      analysisBase: [
        'Precisão de reconhecimento acima de 99% nas últimas 24h',
        'Sistema validado com sucesso em 15 verificações',
        'Condições de iluminação noturna adequadas'
      ]
    }
  },
  {
    id: 4,
    type: 'absence',
    dateTime: '20/12/2024 15:45',
    camera: 'CAM-UTI-101A',
    confidence: 95.5,
    action: 'Paciente retornou do procedimento, ausência justificada',
    professional: 'Enf. Ana Paula',
    status: 'verified',
    aiSuggestion: {
      level: 'moderate',
      suggestions: [
        'Avaliar registro de saídas para procedimentos no sistema',
        'Considerar vincular agenda de procedimentos ao monitoramento',
        'Pode ser útil criar protocolo de notificação prévia de ausências programadas'
      ],
      analysisBase: [
        'Ausência programada não registrada no sistema',
        'Alerta gerado por falta de informação prévia',
        'Padrão recorrente em dias de procedimentos'
      ]
    }
  }
];

export function AIAlertsTab({ patient }: AIAlertsTabProps) {
  const typeConfig = {
    fall: { 
      label: 'Queda Detectada', 
      color: 'bg-red-50 border-l-red-500',
      badge: 'bg-red-100 text-red-700',
      icon: '⚠️'
    },
    exit: { 
      label: 'Saída de Leito', 
      color: 'bg-yellow-50 border-l-yellow-500',
      badge: 'bg-yellow-100 text-yellow-700',
      icon: '🚶'
    },
    absence: { 
      label: 'Ausência Prolongada', 
      color: 'bg-orange-50 border-l-orange-500',
      badge: 'bg-orange-100 text-orange-700',
      icon: '⏰'
    },
    risk: { 
      label: 'Comportamento de Risco', 
      color: 'bg-purple-50 border-l-purple-500',
      badge: 'bg-purple-100 text-purple-700',
      icon: '⚡'
    },
    recognition: { 
      label: 'Reconhecimento Facial', 
      color: 'bg-blue-50 border-l-blue-500',
      badge: 'bg-blue-100 text-blue-700',
      icon: '👤'
    }
  };

  const statusConfig = {
    detected: { label: 'Detectado', color: 'bg-yellow-500 text-white' },
    verified: { label: 'Verificado', color: 'bg-green-500 text-white' },
    'false-positive': { label: 'Falso Positivo', color: 'bg-gray-500 text-white' },
    resolved: { label: 'Resolvido', color: 'bg-blue-500 text-white' }
  };

  const stats = [
    { label: 'Total de Detecções', value: mockAIAlerts.length, color: 'border-gray-300' },
    { label: 'Resolvidos', value: mockAIAlerts.filter(a => a.status === 'resolved').length, color: 'border-blue-500' },
    { label: 'Verificados', value: mockAIAlerts.filter(a => a.status === 'verified').length, color: 'border-green-500' },
    { label: 'Falsos Positivos', value: mockAIAlerts.filter(a => a.status === 'false-positive').length, color: 'border-gray-500' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-gray-800 mb-1">Alertas e Detecções por IA</h2>
        <p className="text-sm text-gray-500">Monitoramento inteligente via câmeras e sensores</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className={`bg-white rounded-lg border-l-4 ${stat.color} p-4 shadow-sm`}>
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className="text-3xl text-gray-800">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* AI Monitoring Info */}
      <div className="bg-gradient-to-r from-[#E8F4F8] to-[#F0F9FF] rounded-lg border border-[#7DD3FC] p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
            <Camera className="w-6 h-6 text-[#0EA5E9]" />
          </div>
          <div className="flex-1">
            <h3 className="text-gray-800 mb-2 flex items-center gap-2">
              Status do Monitoramento IA
              <span className="px-3 py-1 bg-green-500 text-white text-xs rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                Ativo
              </span>
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">Câmera Principal</p>
                <p className="text-gray-800">CAM-UTI-101A</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Precisão Média</p>
                <p className="text-gray-800">94.6%</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Última Detecção</p>
                <p className="text-gray-800">há 5 minutos</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Detectando: Movimento • Posição • Quedas • Saída de leito • Comportamento de risco</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {mockAIAlerts.map(alert => {
          const typeStyle = typeConfig[alert.type];
          const statusStyle = statusConfig[alert.status];
          
          return (
            <div key={alert.id} className={`bg-white rounded-lg border-l-4 ${typeStyle.color} shadow-sm overflow-hidden`}>
              <div className="px-5 py-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="text-2xl">{typeStyle.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-3 py-1 rounded-full text-xs ${typeStyle.badge}`}>
                          {typeStyle.label}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs ${statusStyle.color}`}>
                          {statusStyle.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">📅 {alert.dateTime}</p>
                      <p className="text-sm text-gray-600 mb-1">📹 {alert.camera}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${alert.confidence}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-green-600 font-medium">
                          {alert.confidence}% confiança
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Taken */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <div className="flex items-start gap-2">
                    <User className="w-5 h-5 text-[#0A7EA4] flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 mb-1">Ação Realizada:</p>
                      <p className="text-sm text-gray-700 mb-2">{alert.action}</p>
                      <p className="text-xs text-gray-500">👤 {alert.professional}</p>
                    </div>
                  </div>
                </div>

                {/* AI Suggestions */}
                {alert.aiSuggestion && (
                  <div className="mt-4">
                    <AISuggestionCard suggestion={alert.aiSuggestion} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More */}
      <button className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
        Carregar mais detecções antigas
      </button>
    </div>
  );
}