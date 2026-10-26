import { useState } from 'react';
import { AlertTriangle, Clock, Loader2, MapPin } from 'lucide-react';
import type { OcorrenciaResumo } from '../../data/api';
import { ROTULO_STATUS, estaAberta, gravidadeDe, rotuloDoEvento } from '../../data/ocorrencias';
import { quandoFoi } from '../../data/tempo';

/**
 * Alertas no app da enfermagem: as mesmas ocorrências da central web, pelo
 * mesmo `useAlertas`. O botão "Iniciar atendimento" chama a API de verdade
 * (`iniciarAtendimento`), quando o perfil permite; senão, não aparece.
 */

interface Props {
  ocorrencias: OcorrenciaResumo[];
  carregando: boolean;
  erro: string | null;
  podeAtender: boolean;
  ocupado: string | null;
  aoAtender: (id: string) => void;
}

type Filtro = 'abertas' | 'pendente' | 'em_atendimento' | 'todas';

const ESTILO = {
  critical: { bg: 'bg-red-50', border: 'border-l-red-500', icon: 'text-red-500', badge: 'bg-red-100 text-red-700' },
  warning: { bg: 'bg-yellow-50', border: 'border-l-yellow-500', icon: 'text-yellow-500', badge: 'bg-yellow-100 text-yellow-700' },
  info: { bg: 'bg-white', border: 'border-l-gray-300', icon: 'text-gray-400', badge: 'bg-gray-100 text-gray-600' },
} as const;

export function AlertsScreen({ ocorrencias, carregando, erro, podeAtender, ocupado, aoAtender }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('abertas');

  const abertas = ocorrencias.filter(estaAberta);
  const pendentes = ocorrencias.filter((o) => o.status === 'pendente');
  const emAtendimento = ocorrencias.filter((o) => o.status === 'em_atendimento');

  const visiveis =
    filtro === 'todas' ? ocorrencias
      : filtro === 'abertas' ? abertas
        : filtro === 'pendente' ? pendentes
          : emAtendimento;

  const botoes: { id: Filtro; rotulo: string; ativo: string }[] = [
    { id: 'abertas', rotulo: `Abertas (${abertas.length})`, ativo: 'bg-marca text-white shadow-sm' },
    { id: 'pendente', rotulo: `Sem ciência (${pendentes.length})`, ativo: 'bg-red-500 text-white shadow-sm' },
    { id: 'em_atendimento', rotulo: `Em atendimento (${emAtendimento.length})`, ativo: 'bg-yellow-400 text-yellow-950 shadow-sm' },
    { id: 'todas', rotulo: `Todas (${ocorrencias.length})`, ativo: 'bg-gray-700 text-white shadow-sm' },
  ];

  return (
    <div className="px-4 py-4 pb-24">
      <div className="mb-4">
        <h2 className="text-gray-800 mb-1">Alertas</h2>
        <p className="text-sm text-gray-500">
          {carregando ? 'Carregando…' : `${abertas.length} ocorrência${abertas.length === 1 ? '' : 's'} aberta${abertas.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {botoes.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setFiltro(b.id)}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${filtro === b.id ? b.ativo : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            {b.rotulo}
          </button>
        ))}
      </div>

      {erro && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {carregando ? (
        <p className="flex items-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
      ) : visiveis.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          {ocorrencias.length === 0 ? 'Nenhuma ocorrência registrada.' : 'Nada neste filtro.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visiveis.map((o) => {
            const estilo = ESTILO[gravidadeDe(o)];
            return (
              <div key={o.id} className={`${estilo.bg} ${estilo.border} border-l-4 rounded-lg p-4 shadow-sm`}>
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className={`w-5 h-5 ${estilo.icon} mt-0.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-gray-800 mb-1">{rotuloDoEvento(o.tipoEvento)}</h4>
                    <p className="text-sm text-gray-700 mb-1">{o.pacienteNome ?? 'Paciente não identificado'}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${estilo.badge} whitespace-nowrap`}>
                    {ROTULO_STATUS[o.status] ?? o.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-gray-600">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs">{o.ambienteNome}{o.cameraIdentificador ? ` · ${o.cameraIdentificador}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span className="text-xs">{quandoFoi(o.dataHora)}</span>
                  </div>
                </div>

                {podeAtender && o.status === 'pendente' && (
                  <button
                    type="button"
                    disabled={ocupado === o.id}
                    onClick={() => aoAtender(o.id)}
                    className="w-full bg-red-500 text-white rounded-lg py-2.5 mt-3 text-sm active:scale-98 transition-transform shadow-sm disabled:opacity-60"
                  >
                    {ocupado === o.id ? 'Registrando…' : 'Iniciar atendimento'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
