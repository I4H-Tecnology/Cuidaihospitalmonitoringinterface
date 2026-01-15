import React, { useState } from 'react';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';

interface Patient {
  id: number;
  name: string;
}

interface VitalSignsTabProps {
  patient: Patient;
}

type Period = '24h' | '48h' | 'all';

export function VitalSignsTab({ patient }: VitalSignsTabProps) {
  const [period, setPeriod] = useState<Period>('24h');

  const vitalSignsData = [
    { time: '08:00', hr: 72, bp: '120/80', temp: 36.5, spo2: 98, glucose: 95 },
    { time: '12:00', hr: 75, bp: '118/78', temp: 36.6, spo2: 97, glucose: 110 },
    { time: '16:00', hr: 70, bp: '122/82', temp: 36.4, spo2: 98, glucose: 105 },
    { time: '20:00', hr: 68, bp: '120/80', temp: 36.5, spo2: 99, glucose: 98 },
  ];

  const vitalTypes = [
    {
      name: 'Frequência Cardíaca',
      key: 'hr' as const,
      unit: 'bpm',
      color: 'from-red-400 to-red-500',
      icon: '❤️',
      normalRange: '60-100',
      current: vitalSignsData[vitalSignsData.length - 1].hr,
      trend: 'stable'
    },
    {
      name: 'Pressão Arterial',
      key: 'bp' as const,
      unit: 'mmHg',
      color: 'from-blue-400 to-blue-500',
      icon: '🩺',
      normalRange: '<120/80',
      current: vitalSignsData[vitalSignsData.length - 1].bp,
      trend: 'stable'
    },
    {
      name: 'Temperatura',
      key: 'temp' as const,
      unit: '°C',
      color: 'from-orange-400 to-orange-500',
      icon: '🌡️',
      normalRange: '36-37.5',
      current: vitalSignsData[vitalSignsData.length - 1].temp,
      trend: 'stable'
    },
    {
      name: 'Saturação O₂',
      key: 'spo2' as const,
      unit: '%',
      color: 'from-cyan-400 to-cyan-500',
      icon: '🫁',
      normalRange: '>95',
      current: vitalSignsData[vitalSignsData.length - 1].spo2,
      trend: 'up'
    },
    {
      name: 'Glicemia',
      key: 'glucose' as const,
      unit: 'mg/dL',
      color: 'from-purple-400 to-purple-500',
      icon: '💉',
      normalRange: '70-100',
      current: vitalSignsData[vitalSignsData.length - 1].glucose,
      trend: 'down'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800 mb-1">Sinais Vitais</h2>
          <p className="text-sm text-gray-500">Monitoramento contínuo</p>
        </div>
        
        {/* Period Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod('24h')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              period === '24h'
                ? 'bg-[#0EA5E9] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Últimas 24h
          </button>
          <button
            onClick={() => setPeriod('48h')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              period === '48h'
                ? 'bg-[#0EA5E9] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Últimas 48h
          </button>
          <button
            onClick={() => setPeriod('all')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              period === 'all'
                ? 'bg-[#0EA5E9] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Toda internação
          </button>
        </div>
      </div>

      {/* Current Vitals Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {vitalTypes.map(vital => (
          <div key={vital.key} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{vital.icon}</span>
              {vital.trend === 'up' && <TrendingUp className="w-5 h-5 text-green-500" />}
              {vital.trend === 'down' && <TrendingDown className="w-5 h-5 text-red-500" />}
              {vital.trend === 'stable' && <Activity className="w-5 h-5 text-gray-400" />}
            </div>
            <p className="text-xs text-gray-500 mb-1">{vital.name}</p>
            <p className="text-2xl text-gray-800 mb-1">{vital.current}</p>
            <p className="text-xs text-gray-400">{vital.unit}</p>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">Normal: {vital.normalRange}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {vitalTypes.map(vital => (
          <div key={vital.key} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{vital.icon}</span>
              <h3 className="text-gray-800">{vital.name}</h3>
            </div>

            {/* Simple Chart */}
            <div className="h-32 flex items-end justify-between gap-2 mb-4">
              {vitalSignsData.map((data, index) => {
                const value = vital.key === 'bp' ? 120 : typeof data[vital.key] === 'number' ? data[vital.key] as number : 0;
                const maxValue = vital.key === 'spo2' ? 100 : vital.key === 'glucose' ? 150 : vital.key === 'bp' ? 140 : vital.key === 'temp' ? 40 : 100;
                const height = (value / maxValue) * 100;
                
                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <div 
                      className={`w-full bg-gradient-to-t ${vital.color} rounded-t`}
                      style={{ height: `${height}%` }}
                    ></div>
                    <span className="text-xs text-gray-400">{data.time}</span>
                  </div>
                );
              })}
            </div>

            {/* Data Table */}
            <div className="border-t border-gray-200 pt-4">
              <div className="grid grid-cols-4 gap-2 text-xs">
                {vitalSignsData.map((data, index) => (
                  <div key={index} className="text-center">
                    <p className="text-gray-500 mb-1">{data.time}</p>
                    <p className="text-gray-800 font-medium">
                      {data[vital.key]} {vital.unit}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* History Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-gray-800">Histórico Detalhado</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Horário</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">FC (bpm)</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">PA (mmHg)</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Temp (°C)</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">SpO₂ (%)</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Glicemia (mg/dL)</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vitalSignsData.map((data, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">{data.time}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{data.hr}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{data.bp}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{data.temp}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{data.spo2}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{data.glucose}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">Enf. Maria Santos</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
