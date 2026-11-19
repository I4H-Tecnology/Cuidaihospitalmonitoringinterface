import { focarAoAparecer } from '../foco';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Ban, Loader2, Plus, RotateCcw, Search, ShieldAlert, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, criarRisco, fetchPacientes, fetchRiscosDaClinica, inativarRisco } from '../../data/api';
import type { PacienteResumo, RiscoResumo } from '../../data/api';
import { quandoFoi } from '../../data/tempo';

/**
 * Alergias e riscos da clínica inteira, agrupados por paciente, com os
 * graves no topo. É o que a equipe olha antes do plantão; a visão por
 * paciente continua no prontuário dele.
 */

interface Props {
  aoAbrirPaciente: (paciente: PacienteResumo) => void;
}

const GRAVIDADE: Record<RiscoResumo['gravidade'], { rotulo: string; chip: string; peso: number }> = {
  grave: { rotulo: 'Grave', chip: 'bg-red-100 text-red-700', peso: 0 },
  moderada: { rotulo: 'Moderada', chip: 'bg-yellow-100 text-yellow-700', peso: 1 },
  leve: { rotulo: 'Leve', chip: 'bg-green-100 text-green-700', peso: 2 },
};

export function RiscosScreen({ aoAbrirPaciente }: Props) {
  const { tenantId, can } = useAuth();
  const [riscos, setRiscos] = useState<RiscoResumo[]>([]);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [inativando, setInativando] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(false);
  const [pacienteId, setPacienteId] = useState('');
  const [tipo, setTipo] = useState<RiscoResumo['tipo']>('alergia');
  const [descricao, setDescricao] = useState('');
  const [gravidade, setGravidade] = useState<RiscoResumo['gravidade']>('moderada');
  const [salvando, setSalvando] = useState(false);
  const podeRegistrar = can('clinical_logs', 'create');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [r, p] = await Promise.all([fetchRiscosDaClinica(tenantId, true), fetchPacientes(tenantId, true)]);
      setRiscos(r);
      setPacientes(p);
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError && err.status === 403 ? 'Seu perfil não permite ver alergias e riscos.' : 'Não foi possível carregar alergias e riscos.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porId = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);
  const internados = pacientes.filter((p) => p.status === 'internado');

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = riscos.filter((r) =>
      (mostrarInativos || r.ativo)
      && (!termo || (r.pacienteNome ?? '').toLowerCase().includes(termo) || r.descricao.toLowerCase().includes(termo)));
    const mapa = new Map<string, { pacienteId: string; nome: string; itens: RiscoResumo[] }>();
    for (const r of filtrados) {
      const g = mapa.get(r.pacienteId) ?? { pacienteId: r.pacienteId, nome: r.pacienteNome ?? 'Paciente', itens: [] };
      g.itens.push(r);
      mapa.set(r.pacienteId, g);
    }
    const pesoDe = (g: { itens: RiscoResumo[] }) => Math.min(...g.itens.filter((i) => i.ativo).map((i) => GRAVIDADE[i.gravidade].peso), 3);
    return [...mapa.values()]
      .map((g) => ({ ...g, itens: g.itens.sort((a, b) => Number(b.ativo) - Number(a.ativo) || GRAVIDADE[a.gravidade].peso - GRAVIDADE[b.gravidade].peso) }))
      .sort((a, b) => pesoDe(a) - pesoDe(b) || a.nome.localeCompare(b.nome));
  }, [riscos, busca, mostrarInativos]);

  const ativos = riscos.filter((r) => r.ativo);
  const graves = ativos.filter((r) => r.gravidade === 'grave').length;
  const inativos = riscos.length - ativos.length;

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (!pacienteId) return setErro('Escolha o paciente.');
    if (descricao.trim().length < 3) return setErro('Descreva a alergia ou o risco.');
    setSalvando(true);
    setErro(null);
    try {
      await criarRisco({ tenantId, pacienteId, tipo, descricao: descricao.trim(), gravidade });
      setDescricao('');
      setFormulario(false);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível registrar.');
    } finally {
      setSalvando(false);
    }
  };

  const inativar = async (r: RiscoResumo) => {
    if (!tenantId) return;
    if (!window.confirm(`Inativar "${r.descricao}" de ${r.pacienteNome ?? 'paciente'}? O registro continua no histórico.`)) return;
    setInativando(r.id);
    try {
      await inativarRisco(tenantId, r.id);
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível inativar.');
    } finally {
      setInativando(null);
    }
  };

  const campo = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca';

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Alergias e riscos</h1>
          <p className="text-sm text-gray-500">
            {carregando ? 'Carregando…' : `${ativos.length} registro${ativos.length === 1 ? '' : 's'} ativo${ativos.length === 1 ? '' : 's'} em ${grupos.filter((g) => g.itens.some((i) => i.ativo)).length} paciente${grupos.length === 1 ? '' : 's'}${graves > 0 ? ` · ${graves} grave${graves > 1 ? 's' : ''}` : ''}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Paciente ou descrição" className="rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva" />
          </div>
          {inativos > 0 && (
            <button type="button" onClick={() => setMostrarInativos((v) => !v)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {mostrarInativos ? 'Ocultar inativos' : `Mostrar inativos (${inativos})`}
            </button>
          )}
          {podeRegistrar && (
            <button type="button" onClick={() => setFormulario((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover">
              <Plus className="h-4 w-4" /> Registrar
            </button>
          )}
          <button type="button" onClick={carregar} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            <RotateCcw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      {formulario && podeRegistrar && (
        <form onSubmit={registrar} className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-5">
          <div>
            <label htmlFor="riscosscreen-paciente" className="mb-1 block text-xs text-gray-600">Paciente</label>
            <select id="riscosscreen-paciente" value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className={campo}>
              <option value="">Escolha</option>
              {internados.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="riscosscreen-tipo" className="mb-1 block text-xs text-gray-600">Tipo</label>
            <select id="riscosscreen-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as RiscoResumo['tipo'])} className={campo}>
              <option value="alergia">Alergia</option>
              <option value="risco">Risco</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="riscosscreen-descricao" className="mb-1 block text-xs text-gray-600">Descrição</label>
            <input id="riscosscreen-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} className={campo} ref={focarAoAparecer} />
          </div>
          <div>
            <label htmlFor="riscosscreen-gravidade" className="mb-1 block text-xs text-gray-600">Gravidade</label>
            <select id="riscosscreen-gravidade" value={gravidade} onChange={(e) => setGravidade(e.target.value as RiscoResumo['gravidade'])} className={campo}>
              <option value="leve">Leve</option>
              <option value="moderada">Moderada</option>
              <option value="grave">Grave</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 md:col-span-5">
            <button type="button" onClick={() => setFormulario(false)} disabled={salvando} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover disabled:opacity-60">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </button>
          </div>
        </form>
      )}

      {erro && <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4" /> {erro}</p>}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : grupos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          {riscos.length === 0 ? 'Nenhuma alergia ou risco registrado nesta clínica.' : 'Nada corresponde à busca.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {grupos.map((g) => {
            const paciente = porId.get(g.pacienteId);
            const temGrave = g.itens.some((i) => i.ativo && i.gravidade === 'grave' && i.tipo === 'alergia');
            return (
              <section key={g.pacienteId} className={`rounded-lg border bg-white ${temGrave ? 'border-red-300' : 'border-gray-200'}`}>
                <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                  <button type="button" onClick={() => paciente && aoAbrirPaciente(paciente)} className="flex items-center gap-2 text-sm text-gray-800 hover:text-marca-texto">
                    <User className="h-4 w-4 text-gray-400" /> {g.nome}
                    {paciente?.ambienteNome && <span className="text-xs text-gray-400">· {paciente.ambienteNome}</span>}
                  </button>
                  {temGrave && <span className="flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700"><ShieldAlert className="h-3 w-3" /> alergia grave</span>}
                </header>
                <ul className="divide-y divide-gray-100">
                  {g.itens.map((r) => {
                    const gr = GRAVIDADE[r.gravidade];
                    return (
                      <li key={r.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${r.ativo ? '' : 'opacity-60'}`}>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
                            {r.tipo === 'alergia' ? <ShieldAlert className="h-4 w-4 text-red-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                            <span className={r.ativo ? '' : 'line-through'}>{r.descricao}</span>
                            <span className={`rounded px-2 py-0.5 text-xs ${gr.chip}`}>{gr.rotulo}</span>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{r.tipo === 'alergia' ? 'Alergia' : 'Risco'}</span>
                            {!r.ativo && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Inativo</span>}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">{r.autorNome} · {quandoFoi(r.criadoEm)}{r.inativadoEm ? ` · inativado ${quandoFoi(r.inativadoEm)}` : ''}</p>
                        </div>
                        {podeRegistrar && r.ativo && (
                          <button type="button" onClick={() => inativar(r)} disabled={inativando === r.id} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                            {inativando === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />} Inativar
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
