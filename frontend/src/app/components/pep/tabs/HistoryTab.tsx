import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Filter, Info, MinusCircle, XCircle } from 'lucide-react';
import type { OcorrenciaResumo, PacienteResumo } from '../../../data/api';

/**
 * Historico completo do paciente (RF21, RF22).
 *
 * A versao anterior tinha 420 linhas de eventos clinicos fixos -- cirurgias,
 * prescricoes e transferencias que nunca aconteceram. Nada disso existe no
 * DER. O historico que o sistema realmente possui e o de ocorrencias
 * detectadas, e e ele que esta aqui, com os filtros que o RF22 pede.
 */

interface Props {
  paciente: PacienteResumo;
  ocorrencias: OcorrenciaResumo[];
}

const ROTULO_EVENTO: Record<string, string> = {
  queda: 'Queda',
  permanencia_solo: 'Permanência no chão',
  perda_verticalidade: 'Perda de verticalidade',
  ausencia_prolongada: 'Ausência prolongada',
};

const APARENCIA: Record<
  string,
  { rotulo: string; chip: string; barra: string; icone: typeof AlertTriangle; cor: string }
> = {
  pendente: {
    rotulo: 'Pendente', chip: 'bg-red-100 text-red-700', barra: 'border-l-red-500',
    icone: AlertTriangle, cor: 'text-red-600',
  },
  em_atendimento: {
    rotulo: 'Em atendimento', chip: 'bg-blue-100 text-blue-700', barra: 'border-l-blue-500',
    icone: AlertTriangle, cor: 'text-blue-600',
  },
  queda_confirmada: {
    rotulo: 'Queda confirmada', chip: 'bg-red-100 text-red-800', barra: 'border-l-red-700',
    icone: XCircle, cor: 'text-red-700',
  },
  falso_positivo: {
    rotulo: 'Falso positivo', chip: 'bg-gray-100 text-gray-600', barra: 'border-l-gray-400',
    icone: MinusCircle, cor: 'text-gray-500',
  },
  encerrada: {
    rotulo: 'Encerrada', chip: 'bg-green-100 text-green-700', barra: 'border-l-green-500',
    icone: CheckCircle, cor: 'text-green-600',
  },
};

type Filtro = 'todos' | 'abertas' | 'queda_confirmada' | 'falso_positivo';

function dataHoraBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function HistoryTab({ paciente, ocorrencias }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const visiveis = useMemo(() => {
    if (filtro === 'todos') return ocorrencias;
    if (filtro === 'abertas') {
      return ocorrencias.filter(
        (o) => o.status === 'pendente' || o.status === 'em_atendimento'
      );
    }
    return ocorrencias.filter((o) => o.status === filtro);
  }, [ocorrencias, filtro]);

  const contar = (f: Filtro) => {
    if (f === 'todos') return ocorrencias.length;
    if (f === 'abertas') {
      return ocorrencias.filter((o) => o.status === 'pendente' || o.status === 'em_atendimento').length;
    }
    return ocorrencias.filter((o) => o.status === f).length;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-gray-800">Histórico de ocorrências</h2>
          <p className="text-sm text-gray-500">
            {paciente.nome}
            {paciente.ambienteNome && ` · ${paciente.ambienteNome}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Filter className="mr-1 h-4 w-4 text-gray-400" />
          {([
            ['todos', 'Todas'],
            ['abertas', 'Em aberto'],
            ['queda_confirmada', 'Quedas confirmadas'],
            ['falso_positivo', 'Falsos positivos'],
          ] as [Filtro, string][]).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filtro === valor
                  ? 'bg-[#0A7EA4] text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {texto} ({contar(valor)})
            </button>
          ))}
        </div>
      </div>

      {ocorrencias.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <CheckCircle className="mx-auto mb-3 h-8 w-8 text-green-500" />
          <p className="text-gray-700">Nenhuma ocorrência no histórico.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Este paciente não teve queda detectada desde a internação em{' '}
            {paciente.dataAdmissao.split('-').reverse().join('/')}.
          </p>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-gray-700">Nada neste filtro.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {visiveis.map((o) => {
            const a = APARENCIA[o.status] ?? APARENCIA.encerrada;
            const Icone = a.icone;
            return (
              <li
                key={o.id}
                className={`bg-white border border-gray-200 ${a.barra} border-l-4 rounded-lg p-4 shadow-sm`}
              >
                <div className="flex items-start gap-3">
                  <Icone className={`mt-0.5 h-5 w-5 shrink-0 ${a.cor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-gray-800">
                        {ROTULO_EVENTO[o.tipoEvento] ?? o.tipoEvento}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs ${a.chip}`}>{a.rotulo}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {dataHoraBR(o.dataHora)}
                      {o.ambienteNome && ` · ${o.ambienteNome}`}
                      {o.cameraIdentificador && ` · ${o.cameraIdentificador}`}
                    </p>
                    {o.observacao && (
                      <p className="mt-2 rounded bg-gray-50 px-3 py-2 text-sm text-gray-600">
                        {o.observacao}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                      {o.confianca != null && (
                        // "escore", nao "confianca do modelo": e a pontuacao da
                        // camada de regras, coisa diferente da precisao aferida.
                        <span>escore da detecção {o.confianca.toFixed(2)}</span>
                      )}
                      {o.encerradaEm && <span>encerrada em {dataHoraBR(o.encerradaEm)}</span>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-600">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          O histórico cobre as ocorrências detectadas pelo serviço de visão. Evoluções,
          prescrições e exames estão fora do MVP (RFC, seção 2.6).
        </span>
      </p>
    </div>
  );
}
