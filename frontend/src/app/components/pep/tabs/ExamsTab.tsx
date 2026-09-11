import React from 'react';
import { Plus, FileText, Upload, Download, Eye, AlertCircle } from 'lucide-react';
import { AvisoForaDoMVP, BotaoIndisponivel } from '../ForaDoMVP';

interface Exam {
  id: number;
  name: string;
  type: 'lab' | 'image' | 'other';
  requestDate: string;
  requestedBy: string;
  status: 'requested' | 'collected' | 'available' | 'critical';
  result?: string;
  resultDate?: string;
}

const mockExams: Exam[] = [
  {
    id: 1,
    name: 'Hemograma Completo',
    type: 'lab',
    requestDate: '21/12/2024 08:00',
    requestedBy: 'Dr. Carlos Silva',
    status: 'available',
    result: 'Resultado normal. Hemoglobina: 14.2 g/dL | Leucócitos: 7.500/mm³ | Plaquetas: 250.000/mm³',
    resultDate: '21/12/2024 14:30'
  },
  {
    id: 2,
    name: 'Glicemia de Jejum',
    type: 'lab',
    requestDate: '21/12/2024 08:00',
    requestedBy: 'Dr. Carlos Silva',
    status: 'available',
    result: '95 mg/dL (Normal)',
    resultDate: '21/12/2024 12:00'
  },
  {
    id: 3,
    name: 'Ureia e Creatinina',
    type: 'lab',
    requestDate: '21/12/2024 08:00',
    requestedBy: 'Dr. Carlos Silva',
    status: 'available',
    result: 'Ureia: 35 mg/dL | Creatinina: 0.9 mg/dL (Função renal normal)',
    resultDate: '21/12/2024 14:30'
  },
  {
    id: 4,
    name: 'Ecocardiograma',
    type: 'image',
    requestDate: '21/12/2024 14:30',
    requestedBy: 'Dr. Carlos Silva',
    status: 'requested',
  },
  {
    id: 5,
    name: 'Raio-X de Tórax',
    type: 'image',
    requestDate: '20/12/2024 16:00',
    requestedBy: 'Dr. Carlos Silva',
    status: 'available',
    result: 'Campos pulmonares limpos. Área cardíaca dentro dos limites da normalidade. Sem sinais de derrame pleural.',
    resultDate: '21/12/2024 10:00'
  },
  {
    id: 6,
    name: 'Troponina',
    type: 'lab',
    requestDate: '20/12/2024 20:00',
    requestedBy: 'Dr. Carlos Silva',
    status: 'collected'
  }
];

export function ExamsTab() {
  const statusConfig = {
    requested: { 
      label: 'Solicitado', 
      color: 'bg-gray-100 text-gray-700',
      icon: '📋'
    },
    collected: { 
      label: 'Coletado', 
      color: 'bg-blue-100 text-blue-700',
      icon: '🧪'
    },
    available: { 
      label: 'Disponível', 
      color: 'bg-green-100 text-green-700',
      icon: '✅'
    },
    critical: { 
      label: 'Resultado Crítico', 
      color: 'bg-red-100 text-red-700',
      icon: '⚠️'
    }
  };

  const typeConfig = {
    lab: { label: 'Laboratorial', icon: '🧪' },
    image: { label: 'Imagem', icon: '📷' },
    other: { label: 'Outro', icon: '📄' }
  };

  const requested = mockExams.filter(e => e.status === 'requested').length;
  const collected = mockExams.filter(e => e.status === 'collected').length;
  const available = mockExams.filter(e => e.status === 'available').length;
  const critical = mockExams.filter(e => e.status === 'critical').length;

  return (
    <>
      <AvisoForaDoMVP oque={'Solicitação e laudo de exames'} />
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800 mb-1">Exames Complementares</h2>
          <p className="text-sm text-gray-500">{mockExams.length} exames registrados</p>
        </div>
        <BotaoIndisponivel motivo="Solicitação e laudo de exames está fora do MVP (RFC, seção 2.6)">Solicitar Exame</BotaoIndisponivel>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border-l-4 border-l-gray-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Solicitados</p>
          <p className="text-3xl text-gray-800">{requested}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-blue-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Coletados</p>
          <p className="text-3xl text-gray-800">{collected}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-green-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Disponíveis</p>
          <p className="text-3xl text-gray-800">{available}</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-red-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Críticos</p>
          <p className="text-3xl text-gray-800">{critical}</p>
        </div>
      </div>

      {/* Exams List */}
      <div className="space-y-3">
        {mockExams.map(exam => {
          const statusStyle = statusConfig[exam.status];
          const typeStyle = typeConfig[exam.type];
          
          return (
            <div key={exam.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              {/* Exam Header */}
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">{statusStyle.icon}</span>
                      <h3 className="text-gray-800">{exam.name}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs ${statusStyle.color}`}>
                        {statusStyle.label}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        {typeStyle.icon} {typeStyle.label}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>📅 Solicitado em: {exam.requestDate}</p>
                      <p>👨‍⚕️ Solicitado por: {exam.requestedBy}</p>
                      {exam.resultDate && (
                        <p>✅ Resultado disponível em: {exam.resultDate}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {exam.status === 'available' && (
                      <>
                        <button
                    disabled className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Visualizar">
                          <Eye className="w-5 h-5 text-gray-600" />
                        </button>
                        <button
                    disabled className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Baixar">
                          <Download className="w-5 h-5 text-gray-600" />
                        </button>
                      </>
                    )}
                    {exam.status === 'requested' && exam.type === 'image' && (
                      <button
                    disabled className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Upload de Resultado">
                        <Upload className="w-5 h-5 text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Result */}
              {exam.result && (
                <div className="px-5 py-4">
                  <div className="flex items-start gap-2">
                    <FileText className="w-5 h-5 text-[#0A7EA4] flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 mb-1">Resultado:</p>
                      <p className="text-sm text-gray-700">{exam.result}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
