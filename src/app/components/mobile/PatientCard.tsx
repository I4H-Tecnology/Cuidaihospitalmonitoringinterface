import React from 'react';
import { Activity, MapPin, Clock, ChevronRight } from 'lucide-react';

interface PatientCardProps {
  name: string;
  age: number;
  room: string;
  bed: string;
  status: 'normal' | 'attention' | 'critical';
  lastUpdate: string;
  heartRate: number;
  onClick?: () => void;
}

export function PatientCard({ 
  name, 
  age, 
  room, 
  bed, 
  status, 
  lastUpdate, 
  heartRate,
  onClick 
}: PatientCardProps) {
  const statusConfig = {
    normal: {
      bg: 'bg-green-50',
      border: 'border-l-green-500',
      badge: 'bg-green-100 text-green-700',
      dot: 'bg-green-500',
      label: 'Normal'
    },
    attention: {
      bg: 'bg-yellow-50',
      border: 'border-l-yellow-500',
      badge: 'bg-yellow-100 text-yellow-700',
      dot: 'bg-yellow-500',
      label: 'Atenção'
    },
    critical: {
      bg: 'bg-red-50',
      border: 'border-l-red-500',
      badge: 'bg-red-100 text-red-700',
      dot: 'bg-red-500',
      label: 'Crítico'
    }
  };

  const config = statusConfig[status];

  return (
    <div 
      onClick={onClick}
      className={`${config.bg} ${config.border} border-l-4 rounded-lg p-4 mb-3 active:scale-98 transition-transform cursor-pointer`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-full flex items-center justify-center">
            <span className="text-white">{name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
          </div>
          <div>
            <h3 className="text-gray-800">{name}</h3>
            <p className="text-sm text-gray-500">{age} anos</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#0A7EA4]" />
          <span className="text-sm text-gray-600">{room} • Leito {bed}</span>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs ${config.badge}`}>
          {config.label}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#0A7EA4]" />
          <span className="text-sm text-gray-700">{heartRate} bpm</span>
        </div>
        <div className="flex items-center gap-1 text-gray-400 text-xs">
          <Clock className="w-3 h-3" />
          <span>{lastUpdate}</span>
        </div>
      </div>
    </div>
  );
}
