import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, fetchEvolucoesDaClinica, fetchOcorrencias, fetchPacientes } from '../../data/api';
import type { EvolucaoResumo, OcorrenciaResumo, PacienteResumo } from '../../data/api';
import { LinhaDoTempoLista, montarLinhaDoTempo } from '../pep/LinhaDoTempo';

/**
 * Linha do tempo da clínica inteira: ocorrências detectadas, evoluções
 * registradas, admissões e altas de todos os pacientes, em ordem. Mesma
 * montagem e mesma lista da aba do prontuário; aqui cada item diz de quem é.
 */

interface Props {
  aoAbrirPaciente: (paciente: PacienteResumo) => void;
}

type Filtro = 'tudo' | 'ocorrencia' | 'evolucao' | 'marcos';

export function LinhaDoTempoScreen({ aoAbrirPaciente }: Props) {
  const { tenantId } = useAuth();
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaResumo[]>([]);
  const [evolucoes, setEvolucoes] = useState<EvolucaoResumo[]>([]);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [pacienteId, setPacienteId] = useState('');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [o, p] = await Promise.all([fetchOcorrencias(tenantId, 200), fetchPacientes(tenantId, true)]);
      setOcorrencias(o);
      setPacientes(p);
      // Evoluções exigem clinical_logs; sem permissão, a linha fica só com
      // ocorrências e marcos, e a tela diz isso.
      try {
        setEvolucoes(await fetchEvolucoesDaClinica(tenantId));
        setErro(null);
      } catch (err) {
        setEvolucoes([]);
        setErro(err instanceof ApiError && err.status === 403 ? 'Seu perfil não permite ver evoluções; a linha mostra só ocorrências e marcos.' : 'Não foi possível carregar as evoluções.');
      }
    } catch {
      setErro('Não foi possível carregar a linha do tempo.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const eventos = useMemo(() => {
    const pac = pacienteId ? pacientes.filter((p) => p.id === pacienteId) : pacientes;
    const oc = pacienteId ? ocorrencias.filter((o) => o.pacienteId === pacienteId) : ocorrencias;
    const ev = pacienteId ? evolucoes.filter((e) => e.pacienteId === pacienteId) : evolucoes;
    const todos = montarLinhaDoTempo(pac, oc, ev);
    if (filtro === 'tudo') return todos;
    if (filtro === 'marcos') return todos.filter((e) => e.tipo === 'admissao' || e.tipo === 'alta');
    return todos.filter((e) => e.tipo === filtro);
  }, [pacientes, ocorrencias, evolucoes, pacienteId, filtro]);

  const abrirPorNome = (nome: string) => {
    const p = pacientes.find((x) => x.nome === nome);
    if (p) aoAbrirPaciente(p);
  };

  const botoes: { id: Filtro; rotulo: string }[] = [
    { id: 'tudo', rotulo: 'Tudo' },
    { id: 'ocorrencia', rotulo: 'Ocorrências' },
    { id: 'evolucao', rotulo: 'Evoluções' },
    { id: 'marcos', rotulo: 'Admissões e altas' },
  ];

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Linha do tempo clínica</h1>
          <p className="text-sm text-gray-500">
            {carregando ? 'Carregando…' : `${ocorrencias.length} ocorrência${ocorrencias.length === 1 ? '' : 's'} · ${evolucoes.length} evolução${evolucoes.length === 1 ? '' : 'ões'} · ${pacientes.length} paciente${pacientes.length === 1 ? '' : 's'} (internados e com alta).`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva">
            <option value="">Todos os pacientes</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}{p.status !== 'internado' ? ` (${p.status})` : ''}</option>
            ))}
          </select>
          {botoes.map((b) => (
            <button key={b.id} type="button" onClick={() => setFiltro(b.id)} className={`px-3 py-2 rounded-lg text-sm transition-colors ${filtro === b.id ? 'bg-marca text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              {b.rotulo}
            </button>
          ))}
          <button type="button" onClick={carregar} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            <RotateCcw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertCircle className="w-4 h-4" /> {erro}</p>
      )}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : eventos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          Nada para mostrar neste filtro.
        </div>
      ) : (
        <LinhaDoTempoLista eventos={eventos} mostrarPaciente aoAbrirPaciente={abrirPorNome} />
      )}
    </main>
  );
}
