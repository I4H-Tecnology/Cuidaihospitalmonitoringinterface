import React from 'react';
import { Plus, User, Clock, FileText } from 'lucide-react';
import { AvisoForaDoMVP, BotaoIndisponivel } from '../ForaDoMVP';

interface Evolution {
  id: number;
  date: string;
  time: string;
  type: 'medical' | 'nursing' | 'multiprofessional';
  professional: string;
  role: string;
  content: string;
}

const mockEvolutions: Evolution[] = [
  {
    id: 1,
    date: '21/12/2024',
    time: '14:30',
    type: 'medical',
    professional: 'Dr. Carlos Alberto Silva',
    role: 'Cardiologista - CRM 12345-SP',
    content: 'Paciente evoluindo satisfatoriamente. Mantém-se hemodinamicamente estável, eupneico, afebril. Ausculta cardíaca: ritmo cardíaco regular em 2 tempos, bulhas normofonéticas, sem sopros. Ausculta pulmonar: murmúrio vesicular presente bilateralmente, sem ruídos adventícios. Abdome flácido, indolor, ruídos hidroaéreos presentes. Extremidades: sem edema, pulsos periféricos palpáveis e simétricos.\n\nConduta: Manter medicações em uso. Solicitar ecocardiograma de controle. Reavaliar em 24h.'
  },
  {
    id: 2,
    date: '21/12/2024',
    time: '12:00',
    type: 'nursing',
    professional: 'Enf. Maria Santos',
    role: 'Enfermeira - COREN 54321-SP',
    content: 'Paciente consciente, orientado, colaborativo. Sinais vitais estáveis: PA 120/80 mmHg, FC 72 bpm, Tax 36.5°C, SpO2 98% em ar ambiente. Glicemia capilar: 95 mg/dL.\n\nAceitou dieta hipossódica via oral em 80%. Eliminações vesicais e intestinais presentes e sem alterações. Deambulando com auxílio, sem queixas álgicas. Higiene corporal realizada no leito. Pele íntegra, hidratada, sem lesões. Acesso venoso periférico em MSE, pérvio, sem sinais flogísticos.\n\nMedicações administradas conforme prescrição médica.'
  },
  {
    id: 3,
    date: '21/12/2024',
    time: '10:00',
    type: 'multiprofessional',
    professional: 'Fisioterapeuta Ana Paula Costa',
    role: 'Fisioterapia - CREFITO 98765-SP',
    content: 'Atendimento fisioterapêutico realizado. Paciente colaborativo durante a sessão.\n\nRealizados exercícios de fisioterapia respiratória: exercícios de expansão pulmonar, manobras de higiene brônquica. Ausência de secreções. SpO2 mantida em 98%.\n\nFisioterapia motora: treino de marcha, exercícios de fortalecimento de MMII. Paciente deambulou 50 metros com supervisão, sem intercorrências.\n\nOrientações: continuar deambulação assistida 3x ao dia. Retorno amanhã.'
  },
  {
    id: 4,
    date: '20/12/2024',
    time: '20:00',
    type: 'nursing',
    professional: 'Enf. João Costa',
    role: 'Enfermeiro - COREN 11223-SP',
    content: 'Plantão noturno. Paciente mantém-se estável, dormindo tranquilamente na maior parte do período. Sinais vitais verificados às 20h, 00h e 04h, todos dentro dos padrões de normalidade.\n\nMedicações noturnas administradas conforme prescrição. Paciente deambulou ao banheiro 2x durante a noite sem intercorrências. Sem queixas.\n\nPassagem de plantão: paciente estável, sem intercorrências no período.'
  }
];

export function EvolutionsTab() {
  const typeConfig = {
    medical: { label: 'Evolução Médica', color: 'bg-blue-100 text-blue-700', icon: '🩺' },
    nursing: { label: 'Evolução de Enfermagem', color: 'bg-green-100 text-green-700', icon: '👨‍⚕️' },
    multiprofessional: { label: 'Evolução Multiprofissional', color: 'bg-purple-100 text-purple-700', icon: '👥' }
  };

  return (
    <>
      <AvisoForaDoMVP oque={'Evoluções clínicas'} />
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800 mb-1">Evoluções Clínicas</h2>
          <p className="text-sm text-gray-500">{mockEvolutions.length} registros encontrados</p>
        </div>
        <BotaoIndisponivel motivo="Evoluções clínicas está fora do MVP (RFC, seção 2.6)">Nova Evolução</BotaoIndisponivel>
      </div>

      {/* Evolutions Timeline */}
      <div className="space-y-4">
        {mockEvolutions.map((evolution, index) => {
          const config = typeConfig[evolution.type];
          
          return (
            <div key={evolution.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{config.icon}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-3 py-1 rounded-full text-xs ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="text-sm text-gray-600 flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {evolution.date} às {evolution.time}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <User className="w-4 h-4" />
                        <span>{evolution.professional}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-xs text-gray-500">{evolution.role}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    disabled
                    title="Ação indisponível: este módulo é demonstração da visão de produto (RFC, seção 2.6)" className="text-gray-400 hover:text-gray-600 transition-colors">
                    <FileText className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-5 py-4">
                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                  {evolution.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More */}
      <button
                    disabled
                    title="Ação indisponível: este módulo é demonstração da visão de produto (RFC, seção 2.6)" className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
        Carregar mais evoluções antigas
      </button>
    </div>
    </>
  );
}
