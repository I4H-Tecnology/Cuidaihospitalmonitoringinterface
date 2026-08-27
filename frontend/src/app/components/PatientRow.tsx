import React from 'react';
import { Activity, Thermometer } from 'lucide-react';

interface Location {
  hospital: string;
  sector: string;
  room: string;
  bed: string;
}

interface PatientRowProps {
  patient: {
    id: number;
    name: string;
    age: number;
    gender: 'M' | 'F';
    location: Location;
    status: 'normal' | 'attention' | 'critical';
    heartRate: number;
    temperature: number;
    lastUpdate: string;
  };
}

export function PatientRow({ patient }: PatientRowProps) {
  const statusConfig = {
    normal: { label: 'Normal', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    attention: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  };

  const config = statusConfig[patient.status];

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-4">
        <div>
          <p className="text-sm text-gray-800 mb-1">{patient.name}</p>
          <p className="text-xs text-gray-500">{patient.age} anos • {patient.gender === 'M' ? 'Masculino' : 'Feminino'}</p>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="text-sm text-gray-700">{patient.location.sector}</p>
        <p className="text-xs text-gray-500">{patient.location.room} → Leito {patient.location.bed}</p>
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${config.color}`}>
          <span className={`w-2 h-2 rounded-full ${config.dot}`}></span>
          {config.label}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1 text-sm text-gray-700">
          <Activity className="w-4 h-4" />
          <span>{patient.heartRate} bpm</span>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1 text-sm text-gray-700">
          <Thermometer className="w-4 h-4" />
          <span>{patient.temperature}°C</span>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="text-xs text-gray-500">{patient.lastUpdate}</span>
      </td>
    </tr>
  );
}