import { useMemo } from 'react';
import type { EvolucaoResumo, OcorrenciaResumo, PacienteResumo } from '../../../data/api';
import { LinhaDoTempoLista, montarLinhaDoTempo } from '../LinhaDoTempo';

/**
 * Linha do tempo de um paciente, dentro do prontuário. A tela da clínica
 * (menu Assistencial) usa a mesma montagem e a mesma lista, para todos.
 */

interface Props {
  paciente: PacienteResumo;
  ocorrencias: OcorrenciaResumo[];
  evolucoes: EvolucaoResumo[];
  carregando: boolean;
}

export function ClinicalTimelineTab({ paciente, ocorrencias, evolucoes, carregando }: Props) {
  const eventos = useMemo(
    () => montarLinhaDoTempo([paciente], ocorrencias, evolucoes),
    [paciente, ocorrencias, evolucoes],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-gray-800">Linha do tempo clínica</h2>
        <p className="text-sm text-gray-500">
          Ocorrências detectadas, evoluções registradas e os marcos de admissão e alta, em ordem.
          {!carregando && ` ${ocorrencias.length} ocorrência${ocorrencias.length === 1 ? '' : 's'} · ${evolucoes.length} evolução${evolucoes.length === 1 ? '' : 'ões'}.`}
        </p>
      </div>
      {carregando ? <p className="text-sm text-gray-500">Carregando…</p> : <LinhaDoTempoLista eventos={eventos} />}
    </div>
  );
}
