import { useState } from 'react';
import { AlertCircle, AlertTriangle, Ban, Loader2, Plus, ShieldAlert, User } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { ApiError, criarRisco, inativarRisco } from '../../../data/api';
import type { PacienteResumo, RiscoResumo } from '../../../data/api';
import { quandoFoi } from '../../../data/tempo';

/**
 * Alergias e riscos do paciente, com dado real desde 13/09/2026.
 *
 * Registra-se e inativa-se; não se edita nem se apaga. Alergia grave ativa
 * também aparece no cabeçalho do prontuário, onde ninguém deixa de ver.
 */

interface Props {
  paciente: PacienteResumo;
  riscos: RiscoResumo[];
  carregando: boolean;
  aoMudar: () => Promise<void>;
}

const GRAVIDADE: Record<RiscoResumo['gravidade'], { rotulo: string; chip: string }> = {
  leve: { rotulo: 'Leve', chip: 'bg-green-100 text-green-700' },
  moderada: { rotulo: 'Moderada', chip: 'bg-yellow-100 text-yellow-700' },
  grave: { rotulo: 'Grave', chip: 'bg-red-100 text-red-700' },
};

export function AllergiesTab({ paciente, riscos, carregando, aoMudar }: Props) {
  const { tenantId, can } = useAuth();
  const podeRegistrar = can('clinical_logs', 'create');
  const [formulario, setFormulario] = useState(false);
  const [tipo, setTipo] = useState<RiscoResumo['tipo']>('alergia');
  const [descricao, setDescricao] = useState('');
  const [gravidade, setGravidade] = useState<RiscoResumo['gravidade']>('moderada');
  const [salvando, setSalvando] = useState(false);
  const [inativando, setInativando] = useState<string | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = mostrarInativos ? riscos : riscos.filter((r) => r.ativo);
  const alergias = visiveis.filter((r) => r.tipo === 'alergia');
  const outros = visiveis.filter((r) => r.tipo === 'risco');
  const inativos = riscos.filter((r) => !r.ativo).length;

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (descricao.trim().length < 3) return setErro('Descreva a alergia ou o risco.');
    setSalvando(true);
    setErro(null);
    try {
      await criarRisco({ tenantId, pacienteId: paciente.id, tipo, descricao: descricao.trim(), gravidade });
      setDescricao('');
      setFormulario(false);
      await aoMudar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível registrar.');
    } finally {
      setSalvando(false);
    }
  };

  const inativar = async (r: RiscoResumo) => {
    if (!tenantId) return;
    if (!window.confirm(`Inativar "${r.descricao}"? O registro continua no histórico, marcado como inativo.`)) return;
    setInativando(r.id);
    try {
      await inativarRisco(tenantId, r.id);
      await aoMudar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível inativar.');
    } finally {
      setInativando(null);
    }
  };

  const campo = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-gray-800">Alergias e riscos</h2>
          <p className="text-sm text-gray-500">
            O que a equipe precisa saber antes de agir com {paciente.nome}. Registros são inativados, nunca apagados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inativos > 0 && (
            <button type="button" onClick={() => setMostrarInativos((v) => !v)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {mostrarInativos ? 'Ocultar inativos' : `Mostrar inativos (${inativos})`}
            </button>
          )}
          {podeRegistrar && (
            <button type="button" onClick={() => setFormulario((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover">
              <Plus className="h-4 w-4" /> Registrar
            </button>
          )}
        </div>
      </div>

      {formulario && podeRegistrar && (
        <form onSubmit={registrar} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-gray-600">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as RiscoResumo['tipo'])} className={campo}>
              <option value="alergia">Alergia</option>
              <option value="risco">Risco</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">Descrição</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} placeholder={tipo === 'alergia' ? 'Ex.: dipirona' : 'Ex.: risco de queda ao levantar à noite'} className={campo} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Gravidade</label>
            <select value={gravidade} onChange={(e) => setGravidade(e.target.value as RiscoResumo['gravidade'])} className={campo}>
              <option value="leve">Leve</option>
              <option value="moderada">Moderada</option>
              <option value="grave">Grave</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 md:col-span-4">
            <button type="button" onClick={() => setFormulario(false)} disabled={salvando} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover disabled:opacity-60">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </button>
          </div>
        </form>
      )}

      {erro && <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" /> {erro}</p>}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          Nenhuma alergia ou risco registrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Grupo titulo="Alergias" icone={<ShieldAlert className="h-4 w-4 text-red-600" />} itens={alergias} inativando={inativando} podeInativar={podeRegistrar} aoInativar={inativar} vazio="Nenhuma alergia registrada." />
          <Grupo titulo="Riscos" icone={<AlertTriangle className="h-4 w-4 text-amber-600" />} itens={outros} inativando={inativando} podeInativar={podeRegistrar} aoInativar={inativar} vazio="Nenhum risco registrado." />
        </div>
      )}
    </div>
  );
}

function Grupo({
  titulo, icone, itens, inativando, podeInativar, aoInativar, vazio,
}: {
  titulo: string; icone: React.ReactNode; itens: RiscoResumo[]; inativando: string | null;
  podeInativar: boolean; aoInativar: (r: RiscoResumo) => void; vazio: string;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        {icone}
        <h3 className="text-sm text-gray-800">{titulo}</h3>
        <span className="text-xs text-gray-400">({itens.length})</span>
      </header>
      {itens.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">{vazio}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {itens.map((r) => {
            const g = GRAVIDADE[r.gravidade];
            return (
              <li key={r.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${r.ativo ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
                    <span className={r.ativo ? '' : 'line-through'}>{r.descricao}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${g.chip}`}>{g.rotulo}</span>
                    {!r.ativo && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Inativo</span>}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {r.autorNome}</span>
                    <span>{quandoFoi(r.criadoEm)}</span>
                    {r.inativadoEm && <span>inativado {quandoFoi(r.inativadoEm)}</span>}
                  </p>
                </div>
                {podeInativar && r.ativo && (
                  <button type="button" onClick={() => aoInativar(r)} disabled={inativando === r.id} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                    {inativando === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />} Inativar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
