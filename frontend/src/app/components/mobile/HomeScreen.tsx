import { AlertCircle, Loader2 } from 'lucide-react';
import type { PacienteResumo } from '../../data/api';
import { PatientCard } from './PatientCard';

interface HomeScreenProps {
  pacientes: PacienteResumo[];
  carregando: boolean;
  erro: string | null;
  onPatientClick: (paciente: PacienteResumo) => void;
}

export function HomeScreen({ pacientes, carregando, erro, onPatientClick }: HomeScreenProps) {
  const criticos = pacientes.filter((p) => p.situacao === 'critical').length;

  return (
    <div className="px-4 py-4 pb-24">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-gray-800">Pacientes</h2>
          <span className="text-sm text-gray-500">
            {carregando ? '…' : `${pacientes.length} internado${pacientes.length === 1 ? '' : 's'}${criticos > 0 ? ` · ${criticos} crítico${criticos > 1 ? 's' : ''}` : ''}`}
          </span>
        </div>

        {erro && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" /> {erro}
          </div>
        )}

        {carregando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando pacientes…
          </div>
        ) : pacientes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Nenhum paciente internado.</p>
        ) : (
          <div className="space-y-3">
            {pacientes.map((paciente) => (
              <PatientCard key={paciente.id} paciente={paciente} onClick={() => onPatientClick(paciente)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
