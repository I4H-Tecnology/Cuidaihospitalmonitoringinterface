import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText, Loader2, RotateCcw, Search, Send, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, criarEvolucao, fetchEvolucoesDaClinica, fetchPacientes } from '../../data/api';
import type { EvolucaoResumo, PacienteResumo } from '../../data/api';
import { quandoFoi } from '../../data/tempo';

/**
 * Evoluções clínicas da clínica inteira: tudo o que a equipe registrou,
 * de todos os pacientes, mais recente primeiro. É a visão de quem passa o
 * plantão; a visão por paciente continua no prontuário dele.
 *
 * Registrar daqui exige escolher o paciente: evolução sem paciente não existe.
 */

interface Props {
  aoAbrirPaciente: (paciente: PacienteResumo) => void;
}

function dataHoraBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function EvolucoesScreen({ aoAbrirPaciente }: Props) {
  const { tenantId, can } = useAuth();
  const [evolucoes, setEvolucoes] = useState<EvolucaoResumo[]>([]);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [pacienteId, setPacienteId] = useState('');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const podeRegistrar = can('clinical_logs', 'create');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [e, p] = await Promise.all([fetchEvolucoesDaClinica(tenantId), fetchPacientes(tenantId, true)]);
      setEvolucoes(e);
      setPacientes(p);
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError && err.status === 403 ? 'Seu perfil não permite ver as evoluções.' : 'Não foi possível carregar as evoluções.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const internados = pacientes.filter((p) => p.status === 'internado');
  const porId = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return evolucoes;
    return evolucoes.filter((e) =>
      (e.pacienteNome ?? '').toLowerCase().includes(termo)
      || e.autorNome.toLowerCase().includes(termo)
      || e.texto.toLowerCase().includes(termo));
  }, [evolucoes, busca]);

  const registrar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!tenantId) return;
    if (!pacienteId) return setErro('Escolha o paciente da evolução.');
    if (texto.trim().length < 3) return setErro('Escreva a evolução antes de registrar.');
    setSalvando(true);
    setErro(null);
    try {
      await criarEvolucao({ tenantId, pacienteId, texto: texto.trim() });
      setTexto('');
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível registrar a evolução.');
    } finally {
      setSalvando(false);
    }
  };

  const abrir = (e: EvolucaoResumo) => {
    const p = porId.get(e.pacienteId);
    if (p) aoAbrirPaciente(p);
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Evoluções clínicas</h1>
          <p className="text-sm text-gray-500">
            {carregando ? 'Carregando…' : `${evolucoes.length} evolução${evolucoes.length === 1 ? '' : 'ões'} registrada${evolucoes.length === 1 ? '' : 's'} nesta clínica. Registro não se edita nem se apaga.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Paciente, autor ou texto" className="rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva" />
          </div>
          <button type="button" onClick={carregar} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            <RotateCcw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4" /> {erro}</p>
      )}

      {podeRegistrar && (
        <form onSubmit={registrar} className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label htmlFor="evolucoesscreen-paciente" className="mb-1 block text-xs text-gray-600">Paciente</label>
              <select id="evolucoesscreen-paciente" value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca">
                <option value="">Escolha o paciente</option>
                {internados.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}{p.ambienteNome ? ` · ${p.ambienteNome}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label htmlFor="evolucoesscreen-nova-evolucao" className="mb-1 block text-xs text-gray-600">Nova evolução</label>
              <textarea id="evolucoesscreen-nova-evolucao" value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={4000} placeholder="O que foi observado, feito ou orientado." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca" />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover disabled:opacity-60">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Adicionar evolução
            </button>
          </div>
        </form>
      )}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          {evolucoes.length === 0 ? 'Nenhuma evolução registrada nesta clínica.' : 'Nada corresponde à busca.'}
        </div>
      ) : (
        <ol className="space-y-3">
          {visiveis.map((e) => (
            <li key={e.id} className="rounded-lg border border-gray-200 border-l-4 border-l-marca-viva bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-marca-texto" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => abrir(e)} className="text-sm text-marca-texto hover:underline">
                      {e.pacienteNome ?? 'Paciente'}
                    </button>
                    <span className="text-xs text-gray-400">→ abre o prontuário</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{e.texto}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {e.autorNome}</span>
                    <span title={dataHoraBR(e.dataHora)}>{quandoFoi(e.dataHora)}</span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
