import { fetchPacientes, type PacienteResumo } from './api';
import { useDados } from './useDados';

/** Pacientes internados, para os seletores das telas (agenda, exames, campanhas…). */
export function usePacientesInternados() {
  const { dados } = useDados<PacienteResumo[]>((t) => fetchPacientes(t));
  return (dados ?? []).filter((p) => p.status === 'internado').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
