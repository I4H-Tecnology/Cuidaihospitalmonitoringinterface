import React from 'react';
import { Info } from 'lucide-react';
import { PatientCard } from './PatientCard';

import type { MobilePatient as Patient } from './types';

interface HomeScreenProps {
  patients: Patient[];
  onPatientClick: (patient: Patient) => void;
}

export function HomeScreen({ patients, onPatientClick }: HomeScreenProps) {
  return (
    <div className="px-4 py-4 pb-24">
      {/* Info Card */}
      <div className="bg-[#E8F4F8] border border-[#7DD3FC] rounded-lg p-4 mb-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#0A7EA4] mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-[#0A7EA4] mb-1">Mantenha os dados atualizados</h3>
          <p className="text-sm text-gray-600">
            Certifique-se de que as informações dos pacientes estejam sempre corretas e atualizadas.
          </p>
        </div>
      </div>

      {/* Patients List */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-gray-800">Pacientes</h2>
          <span className="text-sm text-gray-500">{patients.length} total</span>
        </div>

        <div className="space-y-3">
          {patients.map(patient => (
            <PatientCard
              key={patient.id}
              {...patient}
              onClick={() => onPatientClick(patient)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
