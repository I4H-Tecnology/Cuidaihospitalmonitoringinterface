import type { PacienteResumo } from '../data/api';
import { quandoFoi } from '../data/tempo';

/**
 * Linha da tabela de pacientes do dashboard.
 *
 * Mostra só o que o produto sabe sobre o paciente: onde está, a situação
 * derivada das ocorrências abertas e quando foi a última. Frequência cardíaca
 * e temperatura saíram: o MedSignal não mede sinal vital nenhum, e coluna com
 * número inventado é funcionalidade que o produto não tem mostrada como se
 * tivesse.
 */

const SITUACAO = {
  stable: { label: 'Estável', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  attention: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  critical: { label: 'Crítico', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
} as const;

const TIPO_AMBIENTE: Record<string, string> = {
  quarto: 'Quarto',
  corredor: 'Corredor',
  sala_convivencia: 'Sala de convivência',
  refeitorio: 'Refeitório',
  banheiro: 'Banheiro',
  outro: 'Outro',
};

export function PatientRow({ paciente }: { paciente: PacienteResumo }) {
  const config = SITUACAO[paciente.situacao] ?? SITUACAO.stable;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-4">
        <p className="text-sm text-gray-800 mb-1">{paciente.nome}</p>
        <p className="text-xs text-gray-500">
          {paciente.idade != null ? `${paciente.idade} anos` : 'Idade não informada'}
        </p>
      </td>
      <td className="px-4 py-4">
        <p className="text-sm text-gray-700">{paciente.ambienteNome ?? 'Sem ambiente vinculado'}</p>
        {paciente.ambienteTipo && (
          <p className="text-xs text-gray-500">{TIPO_AMBIENTE[paciente.ambienteTipo] ?? paciente.ambienteTipo}</p>
        )}
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${config.color}`}>
          <span className={`w-2 h-2 rounded-full ${config.dot}`}></span>
          {config.label}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-700">{paciente.ocorrenciasAbertas}</td>
      <td className="px-4 py-4">
        <span className="text-xs text-gray-500">
          {paciente.ultimaOcorrencia ? quandoFoi(paciente.ultimaOcorrencia) : '—'}
        </span>
      </td>
    </tr>
  );
}
