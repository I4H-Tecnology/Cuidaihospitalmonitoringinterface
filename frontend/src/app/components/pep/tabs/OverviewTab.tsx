import React from 'react';
import { Activity, Thermometer, Heart, Droplet, User, AlertTriangle, CheckCircle } from 'lucide-react';

interface Patient {
  id: number;
  name: string;
}

interface OverviewTabProps {
  patient: Patient;
}

export function OverviewTab({ patient }: OverviewTabProps) {
  const vitalSigns = [
    { 
      icon: <Activity className="w-5 h-5" />, 
      label: 'Frequência Cardíaca', 
      value: '72', 
      unit: 'bpm',
      status: 'normal',
      color: 'from-green-400 to-green-500'
    },
    { 
      icon: <Heart className="w-5 h-5" />, 
      label: 'Pressão Arterial', 
      value: '120/80', 
      unit: 'mmHg',
      status: 'normal',
      color: 'from-blue-400 to-blue-500'
    },
    { 
      icon: <Thermometer className="w-5 h-5" />, 
      label: 'Temperatura', 
      value: '36.5', 
      unit: '°C',
      status: 'normal',
      color: 'from-orange-400 to-orange-500'
    },
    { 
      icon: <Droplet className="w-5 h-5" />, 
      label: 'Saturação O₂', 
      value: '98', 
      unit: '%',
      status: 'normal',
      color: 'from-cyan-400 to-cyan-500'
    },
    { 
      icon: <Droplet className="w-5 h-5" />, 
      label: 'Glicemia', 
      value: '95', 
      unit: 'mg/dL',
      status: 'normal',
      color: 'from-purple-400 to-purple-500'
    }
  ];

  const recentEvents = [
    { time: '14:30', type: 'Evolução médica', professional: 'Dr. Carlos Silva', description: 'Paciente estável, sem queixas' },
    { time: '12:00', type: 'Medicação', professional: 'Enf. Maria Santos', description: 'Omeprazol 40mg administrado' },
    { time: '10:15', type: 'Sinais vitais', professional: 'Enf. João Costa', description: 'PA: 120/80 | FC: 72 | T: 36.5°C' },
    { time: '08:00', type: 'Evolução enfermagem', professional: 'Enf. Ana Paula', description: 'Paciente alimentou-se bem, deambulando' }
  ];

  return (
    <div className="space-y-6">
      {/* Clinical Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Diagnosis */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h3 className="text-gray-800 mb-3 flex items-center gap-2">
            <span className="text-lg">🩺</span>
            Diagnóstico Principal
          </h3>
          <p className="text-sm text-gray-700 mb-3">
            Hipertensão Arterial Sistêmica (CID I10)
          </p>
          <p className="text-xs text-gray-500">
            Diagnóstico secundário: Diabetes Mellitus Tipo 2 (CID E11)
          </p>
        </div>

        {/* Responsible Doctor */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h3 className="text-gray-800 mb-3 flex items-center gap-2">
            <User className="w-5 h-5 text-[#0A7EA4]" />
            Médico Responsável
          </h3>
          <p className="text-sm text-gray-700 mb-1">Dr. Carlos Alberto Silva</p>
          <p className="text-xs text-gray-500">CRM: 12345-SP</p>
          <p className="text-xs text-gray-500">Cardiologia</p>
        </div>

        {/* Allergies */}
        <div className="bg-red-50 rounded-lg border border-red-200 p-5 shadow-sm">
          <h3 className="text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Alergias
          </h3>
          <div className="space-y-2">
            <div className="px-3 py-2 bg-red-100 text-red-700 rounded text-sm">
              Penicilina
            </div>
            <div className="px-3 py-2 bg-red-100 text-red-700 rounded text-sm">
              Dipirona
            </div>
          </div>
        </div>
      </div>

      {/* Vital Signs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-gray-800">Sinais Vitais Atuais</h2>
          <span className="text-xs text-gray-500">Última atualização: há 2 horas</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {vitalSigns.map((vital, index) => (
            <div key={index} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${vital.color} rounded-lg flex items-center justify-center text-white`}>
                  {vital.icon}
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-xs text-gray-500 mb-1">{vital.label}</p>
              <p className="text-2xl text-gray-800">{vital.value}</p>
              <p className="text-xs text-gray-400">{vital.unit}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI Monitoring Status */}
      <div className="bg-gradient-to-r from-[#E8F4F8] to-[#F0F9FF] rounded-lg border border-[#7DD3FC] p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-[#0EA5E9]" />
            </div>
            <div>
              <h3 className="text-gray-800 mb-1 flex items-center gap-2">
                Monitoramento por IA
                <span className="px-2 py-1 bg-green-500 text-white text-xs rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                  Ativo
                </span>
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                Câmera: CAM-UTI-101A | Última detecção: há 5 min
              </p>
              <p className="text-xs text-gray-500">
                Sistema detectando: Movimento, Posição no leito, Sinais de queda, Comportamento de risco
              </p>
            </div>
          </div>
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            Configurar
          </button>
        </div>
      </div>

      {/* Recent Clinical Events */}
      <div>
        <h2 className="text-gray-800 mb-4">Últimos Eventos Clínicos</h2>
        
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {recentEvents.map((event, index) => (
            <div key={index} className="px-5 py-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-sm font-medium text-[#0A7EA4]">{event.type}</span>
                    <span className="text-xs text-gray-400">{event.time}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">{event.description}</p>
                  <p className="text-xs text-gray-500">👤 {event.professional}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="w-full mt-4 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Ver histórico completo
        </button>
      </div>
    </div>
  );
}
