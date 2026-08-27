import React from 'react';
import { Users, AlertTriangle, DoorOpen, ChevronRight } from 'lucide-react';

export function RoomsScreen() {
  const stats = [
    {
      icon: <Users className="w-5 h-5" />,
      label: 'Pacientes internados',
      value: '253',
      change: '+ 5%',
      changePositive: true
    },
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      label: 'Alertas ativos',
      value: '11',
      change: '+ 0%',
      changePositive: false
    },
    {
      icon: <DoorOpen className="w-5 h-5" />,
      label: 'Quartos Ocupados',
      value: '41/54',
      change: '',
      changePositive: null
    }
  ];

  const floors = [
    {
      name: '1º Andar',
      occupied: '24/27',
      alerts: 5,
      color: 'from-[#BAE6FD] to-[#7DD3FC]'
    },
    {
      name: '2º Andar',
      occupied: '8/15',
      alerts: 0,
      color: 'from-[#7DD3FC] to-[#0EA5E9]'
    },
    {
      name: '3º Andar',
      occupied: '9/12',
      alerts: 2,
      color: 'from-[#0EA5E9] to-[#0284C7]'
    }
  ];

  const rooms = [
    { number: '1AQ101', status: 'occupied', alerts: 1 },
    { number: '1AQ102', status: 'empty', alerts: 2 },
    { number: '1AQ103', status: 'empty', alerts: 1 }
  ];

  return (
    <div className="px-4 py-4 pb-24">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-3 mb-5">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#E8F4F8] rounded-lg flex items-center justify-center text-[#0A7EA4]">
                  {stat.icon}
                </div>
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl text-gray-800">{stat.value}</p>
                </div>
              </div>
              {stat.change && (
                <span className={`text-sm ${stat.changePositive ? 'text-green-600' : 'text-gray-500'}`}>
                  {stat.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floors Section */}
      <div className="mb-5">
        <h2 className="text-gray-800 mb-3">Andares</h2>
        
        {/* Visual 3D Floors */}
        <div className="bg-white rounded-lg p-5 mb-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 space-y-3">
              {floors.map((floor, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{floor.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Ocupados: {floor.occupied}</span>
                    <span>•</span>
                    <span>Alertas: {floor.alerts}</span>
                  </div>
                  {index < floors.length - 1 && <div className="h-3"></div>}
                </div>
              ))}
            </div>
            
            {/* 3D Visual Representation */}
            <div className="relative ml-4">
              {floors.map((floor, index) => (
                <div
                  key={index}
                  className={`w-32 h-16 rounded-lg bg-gradient-to-br ${floor.color} shadow-lg mb-2 flex items-center justify-center text-white text-xs`}
                  style={{ 
                    transform: `perspective(400px) rotateX(15deg) translateY(${index * -8}px)`,
                    zIndex: floors.length - index
                  }}
                >
                  {floor.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Rooms List */}
      <div>
        <div className="grid grid-cols-3 gap-3 mb-3 px-2">
          <h3 className="text-gray-800">Quartos</h3>
          <h3 className="text-gray-800 text-center">Status</h3>
          <h3 className="text-gray-800 text-center">Alertas</h3>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          {rooms.map((room, index) => (
            <div
              key={index}
              className="grid grid-cols-3 gap-3 px-4 py-4 border-b border-gray-100 last:border-b-0 items-center"
            >
              <span className="text-gray-800">{room.number}</span>
              <div className="flex items-center justify-center gap-2">
                <div className={`w-2 h-2 rounded-full ${room.status === 'occupied' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span className="text-sm text-gray-600">
                  {room.status === 'occupied' ? 'Ocupado' : 'Vazio'}
                </span>
              </div>
              <span className="text-sm text-gray-800 text-center">
                Alertas: {room.alerts}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
