import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Building, AlertCircle, BedDouble, Eye } from 'lucide-react';
import { PatientData } from '../PatientsScreen';

interface StructureViewProps {
  patients: PatientData[];
}

interface FloorData {
  name: string;
  rooms: RoomData[];
}

interface RoomData {
  number: string;
  patients: PatientData[];
}

export function StructureView({ patients }: StructureViewProps) {
  const [expandedFloor, setExpandedFloor] = useState<string | null>(null);
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);

  // Group patients by floor and room
  const floors: FloorData[] = [];
  const floorNames = Array.from(new Set(patients.map(p => p.floor)));
  
  floorNames.forEach(floorName => {
    const floorPatients = patients.filter(p => p.floor === floorName);
    const roomNumbers = Array.from(new Set(floorPatients.map(p => p.room)));
    
    const rooms: RoomData[] = roomNumbers.map(roomNumber => ({
      number: roomNumber,
      patients: floorPatients.filter(p => p.room === roomNumber)
    }));
    
    floors.push({ name: floorName, rooms });
  });

  const toggleFloor = (floorName: string) => {
    setExpandedFloor(expandedFloor === floorName ? null : floorName);
    setExpandedRoom(null);
  };

  const toggleRoom = (roomNumber: string) => {
    setExpandedRoom(expandedRoom === roomNumber ? null : roomNumber);
  };

  const getRoomStatus = (room: RoomData) => {
    const totalBeds = room.patients.length;
    const occupied = room.patients.length;
    
    if (occupied === 0) return { label: 'Vazio', color: 'bg-gray-100 text-gray-700' };
    return { label: 'Ocupado', color: 'bg-green-100 text-green-700' };
  };

  const statusConfig = {
    stable: { label: 'Estável', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    attention: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  };

  const aiRiskConfig = {
    low: { label: 'Baixo', color: 'bg-blue-100 text-blue-700' },
    moderate: { label: 'Moderado', color: 'bg-yellow-100 text-yellow-700' },
    high: { label: 'Alto', color: 'bg-red-100 text-red-700' }
  };

  return (
    <div className="space-y-4">
      {floors.map(floor => {
        const floorPatients = floor.rooms.flatMap(r => r.patients);
        const totalBeds = floorPatients.length;
        const occupiedBeds = floorPatients.length;
        const activeAlerts = floorPatients.reduce((sum, p) => sum + p.activeAlerts, 0);
        const isExpanded = expandedFloor === floor.name;

        return (
          <div key={floor.name} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Floor Header */}
            <button
              onClick={() => toggleFloor(floor.name)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#E8F4F8] rounded-lg flex items-center justify-center">
                  <Building className="w-6 h-6 text-[#0A7EA4]" />
                </div>
                <div className="text-left">
                  <h3 className="text-gray-800 mb-1">{floor.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>🛏️ {occupiedBeds}/{totalBeds} leitos ocupados</span>
                    {activeAlerts > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        {activeAlerts} alertas
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {/* Rooms */}
            {isExpanded && (
              <div className="px-6 pb-4 space-y-3">
                {floor.rooms.map(room => {
                  const roomStatus = getRoomStatus(room);
                  const isRoomExpanded = expandedRoom === room.number;
                  const roomAlerts = room.patients.reduce((sum, p) => sum + p.activeAlerts, 0);

                  return (
                    <div key={room.number} className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                      {/* Room Header */}
                      <button
                        onClick={() => toggleRoom(room.number)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <BedDouble className="w-5 h-5 text-[#0A7EA4]" />
                          <div className="text-left">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-gray-800">{room.number}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${roomStatus.color}`}>
                                {roomStatus.label}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {room.patients.length} paciente(s)
                              {roomAlerts > 0 && ` • ${roomAlerts} alerta(s)`}
                            </p>
                          </div>
                        </div>
                        {isRoomExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </button>

                      {/* Patients in Room */}
                      {isRoomExpanded && (
                        <div className="px-4 pb-3 space-y-2">
                          {room.patients.map(patient => {
                            const status = statusConfig[patient.status];
                            const aiRisk = patient.aiRisk ? aiRiskConfig[patient.aiRisk] : null;

                            return (
                              <div
                                key={patient.id}
                                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <h4 className="text-gray-800">{patient.name}</h4>
                                      <span className={`px-2 py-1 rounded-full text-xs ${status.color} flex items-center gap-1`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                                        {status.label}
                                      </span>
                                      {aiRisk && (
                                        <span className={`px-2 py-1 rounded-full text-xs ${aiRisk.color} flex items-center gap-1`}>
                                          🤖 Risco {aiRisk.label}
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
                                      <span>{patient.age} anos • {patient.gender === 'M' ? 'Masculino' : 'Feminino'}</span>
                                      <span>🛏️ {patient.bed}</span>
                                      <span>📋 {patient.diagnosis}</span>
                                      <span>📅 Internado em {patient.admissionDate}</span>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                      Último evento: {patient.lastEvent}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 ml-4">
                                    {patient.activeAlerts > 0 && (
                                      <span className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        {patient.activeAlerts}
                                      </span>
                                    )}
                                    <button className="px-3 py-1.5 bg-[#E8F4F8] text-[#0A7EA4] rounded-lg text-xs hover:bg-[#D6EEF5] transition-colors flex items-center gap-1">
                                      <Eye className="w-3 h-3" />
                                      Ver PEP
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
