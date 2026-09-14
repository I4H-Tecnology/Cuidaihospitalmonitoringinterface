import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Info, Loader2, Pill, Plus, ShieldAlert, Trash2, UserPlus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  ApiError, criarPaciente, criarPrescricao, criarRisco, editarPaciente, fetchAmbientes,
} from '../../data/api';
import type { AmbienteResumo, PacienteResumo, RiscoResumo } from '../../data/api';

/**
 * Admissão e edição de paciente (RF05, RF08), com o quadro clínico junto.
 *
 * Desde 13/09/2026 a admissão não é só nome e ambiente: recebe histórico
 * médico, médico responsável, alergias e medicações prescritas, tudo em
 * tabela própria (`paciente`, `risco_paciente`, `prescricao`). O mesmo modal
 * serve para editar a partir do prontuário. Alergias e medicações já
 * registradas são geridas nas abas (inativar, suspender); aqui só se
 * acrescentam novas.
 *
 * O paciente é salvo primeiro; alergias e medicações vêm em seguida, uma a
 * uma. Se alguma falhar, o paciente já existe e a tela diz exatamente o que
 * não entrou, em vez de fingir que tudo foi salvo ou perder o cadastro.
 */

interface Props {
  /** Ausente = cadastro novo. Presente = edicao. */
  paciente?: PacienteResumo;
  aoFechar: () => void;
  aoSalvar: (paciente: PacienteResumo, avisos: string[]) => void;
}

interface NovaAlergia { descricao: string; gravidade: RiscoResumo['gravidade'] }
interface NovaMedicacao { medicamento: string; posologia: string; medico: string }

export function ModalPaciente({ paciente, aoFechar, aoSalvar }: Props) {
  const { tenantId, can } = useAuth();
  const editando = Boolean(paciente);
  const podeClinico = can('clinical_logs', 'create');

  const [nome, setNome] = useState(paciente?.nome ?? '');
  const [nascimento, setNascimento] = useState(paciente?.dataNascimento ?? '');
  const [ambienteId, setAmbienteId] = useState(paciente?.ambienteId ?? '');
  const [medicoResponsavel, setMedicoResponsavel] = useState(paciente?.medicoResponsavel ?? '');
  const [historico, setHistorico] = useState(paciente?.historicoMedico ?? '');
  const [alergias, setAlergias] = useState<NovaAlergia[]>([]);
  const [medicacoes, setMedicacoes] = useState<NovaMedicacao[]>([]);
  const [ambientes, setAmbientes] = useState<AmbienteResumo[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    let vivo = true;
    fetchAmbientes(tenantId)
      .then((d) => vivo && setAmbientes(d))
      .catch(() => vivo && setErro('Não foi possível carregar os ambientes.'));
    return () => { vivo = false; };
  }, [tenantId]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvando) aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    primeiro.current?.focus();
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, salvando]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (nome.trim().length < 3) return setErro('Informe o nome do paciente.');
    const alergiasValidas = alergias.filter((a) => a.descricao.trim().length >= 3);
    const medicacoesValidas = medicacoes.filter((m) => m.medicamento.trim().length >= 2);
    if (alergias.length !== alergiasValidas.length) return setErro('Há alergia sem descrição; preencha ou remova a linha.');
    if (medicacoes.length !== medicacoesValidas.length) return setErro('Há medicação sem nome; preencha ou remova a linha.');

    setSalvando(true);
    const avisos: string[] = [];
    try {
      const dados = {
        tenantId: tenantId!,
        nome: nome.trim(),
        dataNascimento: nascimento || null,
        ambienteId: ambienteId || null,
        medicoResponsavel: medicoResponsavel.trim(),
        historicoMedico: historico.trim(),
      };
      const salvo = paciente
        ? await editarPaciente(paciente.id, dados)
        : await criarPaciente(dados);

      for (const a of alergiasValidas) {
        try {
          await criarRisco({ tenantId: tenantId!, pacienteId: salvo.id, tipo: 'alergia', descricao: a.descricao.trim(), gravidade: a.gravidade });
        } catch (err) {
          avisos.push(`Alergia "${a.descricao}" não registrada: ${err instanceof ApiError ? err.message : 'erro'}`);
        }
      }
      for (const m of medicacoesValidas) {
        try {
          await criarPrescricao({
            tenantId: tenantId!, pacienteId: salvo.id, medicamento: m.medicamento.trim(),
            posologia: m.posologia.trim() || undefined,
            medicoPrescritor: (m.medico.trim() || medicoResponsavel.trim()) || undefined,
          });
        } catch (err) {
          avisos.push(`Medicação "${m.medicamento}" não registrada: ${err instanceof ApiError ? err.message : 'erro'}`);
        }
      }
      aoSalvar(salvo, avisos);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar o paciente.');
      setSalvando(false);
    }
  };

  const escolhido = ambientes.find((a) => a.id === ambienteId);
  const campo = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]';
  const campoPequeno = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !salvando) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-paciente"
    >
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E8F4F8]">
              <UserPlus className="h-5 w-5 text-[#0A7EA4]" />
            </div>
            <div>
              <h2 id="titulo-paciente" className="text-gray-800">
                {editando ? 'Editar paciente' : 'Admitir paciente'}
              </h2>
              <p className="text-sm text-gray-500">
                {editando ? paciente!.nome : 'Cadastro, quadro clínico, alergias e medicações'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="nome-paciente" className="mb-1.5 block text-sm text-gray-700">
                  Nome completo <span className="text-red-500">*</span>
                </label>
                <input id="nome-paciente" ref={primeiro} type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Nome do paciente" className={campo} />
              </div>
              <div>
                <label htmlFor="nascimento" className="mb-1.5 block text-sm text-gray-700">Data de nascimento</label>
                <input id="nascimento" type="date" value={nascimento ?? ''} onChange={(e) => setNascimento(e.target.value)} max={new Date().toISOString().slice(0, 10)} className={campo} />
                <p className="mt-1.5 text-xs text-gray-500">Usada só para calcular a idade. Sem ela, a idade não aparece.</p>
              </div>
              <div>
                <label htmlFor="ambiente-paciente" className="mb-1.5 block text-sm text-gray-700">Ambiente monitorado</label>
                <select id="ambiente-paciente" value={ambienteId ?? ''} onChange={(e) => setAmbienteId(e.target.value)} className={campo}>
                  <option value="">Sem ambiente vinculado</option>
                  {ambientes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                      {a.cameras > 0 ? ` · ${a.cameras} câmera(s)` : ' · sem câmera'}
                      {a.pacienteNome && a.id !== paciente?.ambienteId ? ` · ocupado por ${a.pacienteNome}` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-500">
                  {escolhido
                    ? escolhido.cameras > 0
                      ? `As quedas detectadas em ${escolhido.nome} serão atribuídas a este paciente.`
                      : `${escolhido.nome} ainda não tem câmera; nada será detectado até cadastrar uma.`
                    : 'Sem ambiente, as ocorrências detectadas não terão a quem ser atribuídas.'}
                </p>
              </div>
              <div>
                <label htmlFor="medico-responsavel" className="mb-1.5 block text-sm text-gray-700">Médico responsável</label>
                <input id="medico-responsavel" type="text" value={medicoResponsavel} onChange={(e) => setMedicoResponsavel(e.target.value)} maxLength={120} placeholder="Nome e CRM" className={campo} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="historico-medico" className="mb-1.5 block text-sm text-gray-700">Histórico médico</label>
                <textarea id="historico-medico" value={historico} onChange={(e) => setHistorico(e.target.value)} rows={3} maxLength={4000} placeholder="Diagnósticos, cirurgias, condições relevantes para o cuidado." className={campo} />
              </div>
            </section>

            {podeClinico ? (
              <>
                <ListaEditavel
                  titulo={editando ? 'Novas alergias' : 'Alergias'}
                  icone={<ShieldAlert className="h-4 w-4 text-red-600" />}
                  dica={editando ? 'As já registradas ficam na aba Alergias & Riscos, onde podem ser inativadas.' : 'Cada alergia vira um registro próprio, com gravidade.'}
                  vazio="Nenhuma alergia informada."
                  rotuloAdicionar="Adicionar alergia"
                  itens={alergias}
                  aoAdicionar={() => setAlergias((l) => [...l, { descricao: '', gravidade: 'moderada' }])}
                  aoRemover={(i) => setAlergias((l) => l.filter((_, k) => k !== i))}
                  renderizar={(a, i) => (
                    <>
                      <input value={a.descricao} onChange={(e) => setAlergias((l) => l.map((x, k) => (k === i ? { ...x, descricao: e.target.value } : x)))} maxLength={300} placeholder="Ex.: dipirona" className={`${campoPequeno} md:col-span-3`} />
                      <select value={a.gravidade} onChange={(e) => setAlergias((l) => l.map((x, k) => (k === i ? { ...x, gravidade: e.target.value as RiscoResumo['gravidade'] } : x)))} className={campoPequeno}>
                        <option value="leve">Leve</option>
                        <option value="moderada">Moderada</option>
                        <option value="grave">Grave</option>
                      </select>
                    </>
                  )}
                />
                <ListaEditavel
                  titulo={editando ? 'Novas medicações' : 'Medicações prescritas'}
                  icone={<Pill className="h-4 w-4 text-[#0A7EA4]" />}
                  dica={editando ? 'As já registradas ficam na aba Medicações, onde podem ser suspensas.' : 'Medicamento, posologia e quem receitou. Sem médico, assume o responsável.'}
                  vazio="Nenhuma medicação informada."
                  rotuloAdicionar="Adicionar medicação"
                  itens={medicacoes}
                  aoAdicionar={() => setMedicacoes((l) => [...l, { medicamento: '', posologia: '', medico: '' }])}
                  aoRemover={(i) => setMedicacoes((l) => l.filter((_, k) => k !== i))}
                  renderizar={(m, i) => (
                    <>
                      <input value={m.medicamento} onChange={(e) => setMedicacoes((l) => l.map((x, k) => (k === i ? { ...x, medicamento: e.target.value } : x)))} maxLength={120} placeholder="Medicamento" className={campoPequeno} />
                      <input value={m.posologia} onChange={(e) => setMedicacoes((l) => l.map((x, k) => (k === i ? { ...x, posologia: e.target.value } : x)))} maxLength={200} placeholder="Posologia" className={`${campoPequeno} md:col-span-2`} />
                      <input value={m.medico} onChange={(e) => setMedicacoes((l) => l.map((x, k) => (k === i ? { ...x, medico: e.target.value } : x)))} maxLength={120} placeholder="Médico que receitou" className={campoPequeno} />
                    </>
                  )}
                />
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <p className="text-xs text-gray-600">
                  Seu perfil cadastra o paciente, mas não registra alergias nem medicações; quem faz isso é a equipe assistencial, nas abas do prontuário.
                </p>
              </div>
            )}

            {erro && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-sm text-red-700">{erro}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
            <button type="button" onClick={aoFechar} disabled={salvando} className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-[#0A7EA4] px-5 py-2.5 text-sm text-white hover:bg-[#0EA5E9] disabled:opacity-60 disabled:cursor-not-allowed">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Admitir paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ListaEditavel<T>({
  titulo, icone, dica, vazio, rotuloAdicionar, itens, aoAdicionar, aoRemover, renderizar,
}: {
  titulo: string; icone: React.ReactNode; dica: string; vazio: string; rotuloAdicionar: string;
  itens: T[]; aoAdicionar: () => void; aoRemover: (i: number) => void;
  renderizar: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-800">{icone} {titulo}</div>
        <button type="button" onClick={aoAdicionar} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
          <Plus className="h-3 w-3" /> {rotuloAdicionar}
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">{dica}</p>
      {itens.length === 0 ? (
        <p className="text-xs text-gray-400">{vazio}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((item, i) => (
            <li key={i} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_auto]">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">{renderizar(item, i)}</div>
              <button type="button" onClick={() => aoRemover(i)} aria-label="Remover linha" className="justify-self-end rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
