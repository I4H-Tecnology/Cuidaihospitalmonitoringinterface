import React from 'react';
import { ArrowLeft, Activity, Thermometer, Heart, Clock, AlertTriangle, Phone } from 'lucide-react';

interface PatientDetailScreenProps {
  patient: {
    name: string;
    age: number;
    room: string;
    bed: string;
    status: 'normal' | 'attention' | 'critical';
    heartRate: number;
    temperature: number;
    bloodPressure: string;
  };
  onBack: () => void;
}

export function PatientDetailScreen({ patient, onBack }: PatientDetailScreenProps) {
  const statusConfig = {
    normal: { bg: 'bg-green-100', text: 'text-green-700', label: 'Normal' },
    attention: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Atenção' },
    critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Crítico' }
  };

  const config = statusConfig[patient.status];

  const events = [
    { id: 1, type: 'info', title: 'Sinais vitais verificados', time: 'há 5 min' },
    { id: 2, type: 'warning', title: 'Frequência cardíaca elevada', time: 'há 15 min' },
    { id: 3, type: 'info', title: 'Medicação administrada', time: 'há 1 hora' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FBFC] pb-20">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#7DD3FC] to-[#0EA5E9] px-4 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-white">Detalhes do Paciente</h1>
        </div>
      </header>

      <div className="px-4 py-4">
        {/* Patient Info Card */}
        <div className="bg-white rounded-lg p-5 mb-4 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-3">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-full flex items-center justify-center">
                <span className="text-white text-xl">{patient.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
              </div>
              <div>
                <h2 className="text-gray-800 mb-1">{patient.name}</h2>
                <p className="text-sm text-gray-500 mb-2">{patient.age} anos</p>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>{patient.room}</span>
                  <span>•</span>
                  <span>Leito {patient.bed}</span>
                </div>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm ${config.bg} ${config.text}`}>
              {config.label}
            </span>
          </div>
        </div>

        {/* Vital Signs */}
        <div className="mb-4">
          <h3 className="text-gray-800 mb-3 px-1">Sinais Vitais</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-l-[#0EA5E9]">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-[#0A7EA4]" />
                <span className="text-xs text-gray-500">Freq. Cardíaca</span>
              </div>
              <p className="text-2xl text-gray-800">{patient.heartRate}</p>
              <p className="text-xs text-gray-400">bpm</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-l-[#0EA5E9]">
              <div className="flex items-center gap-2 mb-2">
                <Thermometer className="w-5 h-5 text-[#0A7EA4]" />
                <span className="text-xs text-gray-500">Temperatura</span>
              </div>
              <p className="text-2xl text-gray-800">{patient.temperature}</p>
              <p className="text-xs text-gray-400">°C</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-l-[#0EA5E9]">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-5 h-5 text-[#0A7EA4]" />
                <span className="text-xs text-gray-500">Pressão Arterial</span>
              </div>
              <p className="text-2xl text-gray-800">{patient.bloodPressure}</p>
              <p className="text-xs text-gray-400">mmHg</p>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-l-green-500">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-green-600" />
                <span className="text-xs text-gray-500">Última Verificação</span>
              </div>
              <p className="text-sm text-gray-800">Há 5 min</p>
              <p className="text-xs text-gray-400">15:45</p>
            </div>
          </div>
        </div>

        {/* Recent Events */}
        <div className="mb-4">
          <h3 className="text-gray-800 mb-3 px-1">Eventos Recentes</h3>
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {events.map(event => (
              <div key={event.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-2 ${event.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'}`}></div>
                    <div>
                      <p className="text-sm text-gray-800">{event.title}</p>
                      <p className="text-xs text-gray-400 mt-1">{event.time}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button className="bg-[#0A7EA4] text-white rounded-lg py-3 px-4 flex items-center justify-center gap-2 active:scale-98 transition-transform">
            <AlertTriangle className="w-5 h-5" />
            <span>Acionar Ajuda</span>
          </button>
          <button className="bg-white border border-gray-200 text-gray-700 rounded-lg py-3 px-4 flex items-center justify-center gap-2 active:scale-98 transition-transform">
            <Phone className="w-5 h-5" />
            <span>Contatar</span>
          </button>
        </div>

        <button className="w-full bg-white border border-gray-200 text-gray-700 rounded-lg py-3 px-4 mt-3 active:scale-98 transition-transform">
          Ver Histórico Completo
        </button>
      </div>
    </div>
  );
}
