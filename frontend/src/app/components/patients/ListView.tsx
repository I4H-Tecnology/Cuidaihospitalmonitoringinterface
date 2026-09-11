import { useMemo, useState } from 'react';
import { AlertCircle, Eye, Search } from 'lucide-react';
import { descreverAmbiente } from '../../data/api';
import type { PacienteResumo } from '../../data/api';

/**
 * Lista de pacientes em tabela.
 *
 * As colunas antigas -- diagnostico, leito, sexo e um "risco de IA" de tres
 * niveis -- nao existem no DER. O risco era o caso mais grave: um rotulo de IA
 * por paciente, gerado por ninguem, na mesma familia do "97,4% de precisao"
 * que saiu do monitoramento.
 *
 * As colunas de agora sao as que o banco sustenta, e a coluna de risco virou
 * contagem de queda confirmada -- que e medida, nao inferida.
 */

interface Props {
  pacientes: PacienteResumo[];
  aoAbrir?: (paciente: PacienteResumo) => void;
}

const SITUACAO = {
  stable: { rotulo: 'Estável', chip: 'bg-green-100 text-green-700' },
  attention: { rotulo: 'Atenção', chip: 'bg-yellow-100 text-yellow-700' },
  critical: { rotulo: 'Crítico', chip: 'bg-red-100 text-red-700' },
} as const;

type Filtro = 'todos' | 'stable' | 'attention' | 'critical';

function dataBR(iso?: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function ListView({ pacientes, aoAbrir }: Props) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return pacientes.filter((p) => {
      const casaBusca =
        !termo ||
        p.nome.toLowerCase().includes(termo) ||
        (p.ambienteNome ?? '').toLowerCase().includes(termo);
      return casaBusca && (filtro === 'todos' || p.situacao === filtro);
    });
  }, [pacientes, busca, filtro]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou ambiente…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm
                       focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]"
          />
        </div>
        <div className="flex gap-1">
          {([
            ['todos', 'Todos'],
            ['stable', 'Estáveis'],
            ['attention', 'Atenção'],
            ['critical', 'Críticos'],
          ] as [Filtro, string][]).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                filtro === valor
                  ? 'bg-[#0A7EA4] text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="px-6 py-12 text-center text-gray-500">
          {pacientes.length === 0 ? 'Nenhum paciente internado.' : 'Nada neste filtro.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Paciente</th>
                <th className="px-5 py-3">Ambiente</th>
                <th className="px-5 py-3">Internação</th>
                <th className="px-5 py-3">Situação</th>
                <th className="px-5 py-3">Ocorrências</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visiveis.map((p) => {
                const s = SITUACAO[p.situacao];
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <span className="block text-gray-800">{p.nome}</span>
                      {p.idade != null && (
                        <span className="text-xs text-gray-500">{p.idade} anos</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {p.ambienteNome ? (
                        descreverAmbiente(p.ambienteNome, p.ambienteTipo)
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          sem vínculo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600 tabular-nums">
                      {dataBR(p.dataAdmissao)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs ${s.chip}`}>
                        {s.rotulo}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      <span className="tabular-nums">{p.totalOcorrencias}</span>
                      {p.quedasConfirmadas > 0 && (
                        <span className="ml-2 rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          {p.quedasConfirmadas} confirmada(s)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {aoAbrir && (
                        <button
                          type="button"
                          onClick={() => aoAbrir(p)}
                          title="Abrir prontuário"
                          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#0A7EA4]"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
