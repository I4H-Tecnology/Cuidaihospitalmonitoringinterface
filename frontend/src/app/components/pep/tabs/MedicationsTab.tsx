import { focarAoAparecer } from '../../foco';
import { useState } from 'react';
import { AlertCircle, Ban, Loader2, Pill, Plus, Stethoscope, User } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { ApiError, criarPrescricao, inativarPrescricao } from '../../../data/api';
import type { PacienteResumo, PrescricaoResumo } from '../../../data/api';
import { quandoFoi } from '../../../data/tempo';

/**
 * Medicações do paciente: o que foi prescrito, por quem, e como tomar.
 * Dado real desde 13/09/2026. Prescrição se suspende, não se edita nem apaga.
 */

interface Props {
  paciente: PacienteResumo;
  prescricoes: PrescricaoResumo[];
  carregando: boolean;
  aoMudar: () => Promise<void>;
}

export function MedicationsTab({ paciente, prescricoes, carregando, aoMudar }: Props) {
  const { tenantId, can } = useAuth();
  const podeRegistrar = can('clinical_logs', 'create');
  const [formulario, setFormulario] = useState(false);
  const [medicamento, setMedicamento] = useState('');
  const [posologia, setPosologia] = useState('');
  const [medico, setMedico] = useState(paciente.medicoResponsavel ?? '');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [inativando, setInativando] = useState<string | null>(null);
  const [mostrarSuspensas, setMostrarSuspensas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ativas = prescricoes.filter((p) => p.ativo);
  const suspensas = prescricoes.filter((p) => !p.ativo);
  const visiveis = mostrarSuspensas ? prescricoes : ativas;

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (medicamento.trim().length < 2) return setErro('Informe o medicamento.');
    setSalvando(true);
    setErro(null);
    try {
      await criarPrescricao({ tenantId, pacienteId: paciente.id, medicamento: medicamento.trim(), posologia: posologia.trim() || undefined, medicoPrescritor: medico.trim() || undefined, observacao: observacao.trim() || undefined });
      setMedicamento(''); setPosologia(''); setObservacao('');
      setFormulario(false);
      await aoMudar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível registrar a prescrição.');
    } finally {
      setSalvando(false);
    }
  };

  const suspender = async (p: PrescricaoResumo) => {
    if (!tenantId) return;
    if (!window.confirm(`Suspender ${p.medicamento}? O registro continua no histórico, marcado como suspenso.`)) return;
    setInativando(p.id);
    try {
      await inativarPrescricao(tenantId, p.id);
      await aoMudar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível suspender.');
    } finally {
      setInativando(null);
    }
  };

  const campo = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-gray-800">Medicações</h2>
          <p className="text-sm text-gray-500">
            Prescrições em uso por {paciente.nome}.
            {paciente.medicoResponsavel && ` Médico responsável: ${paciente.medicoResponsavel}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {suspensas.length > 0 && (
            <button type="button" onClick={() => setMostrarSuspensas((v) => !v)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {mostrarSuspensas ? 'Ocultar suspensas' : `Mostrar suspensas (${suspensas.length})`}
            </button>
          )}
          {podeRegistrar && (
            <button type="button" onClick={() => setFormulario((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover">
              <Plus className="h-4 w-4" /> Nova prescrição
            </button>
          )}
        </div>
      </div>

      {formulario && podeRegistrar && (
        <form onSubmit={registrar} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-3">
          <div>
            <label htmlFor="medicationstab-medicamento" className="mb-1 block text-xs text-gray-600">Medicamento *</label>
            <input id="medicationstab-medicamento" value={medicamento} onChange={(e) => setMedicamento(e.target.value)} maxLength={120} placeholder="Ex.: losartana 50 mg" className={campo} ref={focarAoAparecer} />
          </div>
          <div>
            <label htmlFor="medicationstab-posologia" className="mb-1 block text-xs text-gray-600">Posologia</label>
            <input id="medicationstab-posologia" value={posologia} onChange={(e) => setPosologia(e.target.value)} maxLength={200} placeholder="Ex.: 1 comprimido, 2x ao dia" className={campo} />
          </div>
          <div>
            <label htmlFor="medicationstab-medico-que-receitou" className="mb-1 block text-xs text-gray-600">Médico que receitou</label>
            <input id="medicationstab-medico-que-receitou" value={medico} onChange={(e) => setMedico(e.target.value)} maxLength={120} placeholder="Nome e CRM" className={campo} />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="medicationstab-observacao" className="mb-1 block text-xs text-gray-600">Observação</label>
            <input id="medicationstab-observacao" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} placeholder="Ex.: após as refeições; suspender se pressão abaixo de 10" className={campo} />
          </div>
          <div className="flex items-center justify-end gap-2 md:col-span-3">
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
          Nenhuma prescrição registrada.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {visiveis.map((p) => (
            <li key={p.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${p.ativo ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
                  <Pill className="h-4 w-4 text-marca-texto" />
                  <span className={p.ativo ? '' : 'line-through'}>{p.medicamento}</span>
                  {p.posologia && <span className="text-gray-600">· {p.posologia}</span>}
                  {!p.ativo && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Suspensa</span>}
                </p>
                {p.observacao && <p className="mt-1 text-sm text-gray-600">{p.observacao}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  {p.medicoPrescritor && <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" /> {p.medicoPrescritor}</span>}
                  <span className="flex items-center gap-1"><User className="h-3 w-3" /> registrado por {p.autorNome}</span>
                  <span>{quandoFoi(p.criadoEm)}</span>
                  {p.inativadoEm && <span>suspensa {quandoFoi(p.inativadoEm)}</span>}
                </p>
              </div>
              {podeRegistrar && p.ativo && (
                <button type="button" onClick={() => suspender(p)} disabled={inativando === p.id} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                  {inativando === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />} Suspender
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
