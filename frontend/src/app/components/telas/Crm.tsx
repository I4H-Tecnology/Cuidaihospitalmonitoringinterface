import React, { useMemo, useState } from 'react';
import {
  BellRing, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, Megaphone, Plus, Repeat, Syringe, UserRound, Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  CANAIS, RECORRENCIAS, STATUS_AGENDA, TIPOS_AGENDA, TIPOS_CAMPANHA, comunicarExame, concluirLembrete, criarAgendamento, criarCampanha,
  criarLembrete, desativarLembrete, editarAgendamento, encerrarCampanha, fetchAgenda, fetchCampanhas, fetchExames, fetchLembretes,
  registrarParticipantes,
  type Agendamento, type Campanha, type CanalExame, type Lembrete, type Recorrencia, type StatusAgenda, type TipoAgenda, type TipoCampanha,
} from '../../data/crm';
import { formatarDia, quandoFoi, quantoFalta } from '../../data/tempo';
import { useAcao, useDados } from '../../data/useDados';
import { usePacientesInternados } from '../../data/usePacientes';
import type { PropsTela } from '../../telas';
import {
  AbasDeFiltro, Aviso, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, BotaoAtualizar, Busca, CAMPO, CabecalhoTela, Carregando, Dado,
  Etiqueta, Indicador, Janela, Painel, ROTULO, Tela, Vazio,
} from '../settings/ui';

/**
 * CRM Saúde, parte 1: agenda do paciente, lembretes, comunicação de exames e
 * campanhas. Mensagens, respostas automáticas, histórico e NPS ficam em
 * CrmFamilia.tsx.
 */

const diaLocal = (d: Date) => d.toLocaleDateString('sv-SE');
const horaLocal = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/** Data e hora do formulário (horário local) para ISO com fuso. */
const paraIso = (dia: string, hora: string) => new Date(`${dia}T${hora || '00:00'}`).toISOString();

function SeletorPaciente({ valor, aoMudar, rotulo = 'Paciente *', opcional = false, textoVazio }: { valor: string; aoMudar: (v: string) => void; rotulo?: string; opcional?: boolean; textoVazio?: string }) {
  const pacientes = usePacientesInternados();
  return (
    <label className="block"><span className={ROTULO}>{rotulo}</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={CAMPO}>
        <option value="">{textoVazio ?? (opcional ? 'Nenhum (tarefa geral)' : 'Escolha o paciente')}</option>
        {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.ambienteNome ? ` · ${p.ambienteNome}` : ''}</option>)}
      </select>
    </label>
  );
}

/* ============================================================================
 * Agenda do paciente
 * ========================================================================== */

const inicioDaSemana = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

export function AgendaScreen(_: PropsTela) {
  const { can } = useAuth();
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()));
  const [paciente, setPaciente] = useState('');
  const [aberto, setAberto] = useState<Agendamento | null>(null);
  const [novo, setNovo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const fim = new Date(semana.getFullYear(), semana.getMonth(), semana.getDate() + 7);
  const { dados, carregando, erro, recarregar } = useDados(
    (t) => fetchAgenda(t, semana.toISOString(), fim.toISOString(), paciente || undefined),
    [semana.getTime(), paciente],
  );
  const dias = Array.from({ length: 7 }, (_, k) => new Date(semana.getFullYear(), semana.getMonth(), semana.getDate() + k));
  const hoje = diaLocal(new Date());
  const porDia = (d: Date) => (dados ?? []).filter((a) => diaLocal(new Date(a.inicio)) === diaLocal(d));
  const pendentesHoje = (dados ?? []).filter((a) => diaLocal(new Date(a.inicio)) === hoje && a.status === 'agendado').length;

  return (
    <Tela>
      <CabecalhoTela
        titulo="Agenda do Paciente"
        descricao="Consultas, exames, terapias e visitas da semana. Marque o que foi realizado para o histórico ficar certo."
        acoes={<>
          <BotaoAtualizar carregando={carregando} aoClicar={recarregar} />
          {can('crm', 'create') && <button type="button" onClick={() => setNovo(hoje)} className={BOTAO_PRIMARIO}><Plus className="h-4 w-4" aria-hidden="true" /> Agendar</button>}
        </>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <Painel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSemana(new Date(semana.getFullYear(), semana.getMonth(), semana.getDate() - 7))} className={`${BOTAO_SECUNDARIO} px-2`} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setSemana(inicioDaSemana(new Date()))} className={`${BOTAO_SECUNDARIO} px-3`}>Hoje</button>
            <button type="button" onClick={() => setSemana(new Date(semana.getFullYear(), semana.getMonth(), semana.getDate() + 7))} className={`${BOTAO_SECUNDARIO} px-2`} aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></button>
            <p className="ml-2 text-sm font-medium text-gray-900">{dias[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {dias[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
          <div className="lg:ml-auto lg:w-72"><SeletorPaciente valor={paciente} aoMudar={setPaciente} rotulo="Filtrar por paciente" opcional textoVazio="Todos os pacientes" /></div>
        </div>
        {pendentesHoje > 0 && <p className="mt-3 text-sm text-gray-700"><Clock className="mr-1 inline h-4 w-4" aria-hidden="true" />{pendentesHoje} compromisso(s) hoje ainda sem registro de realização.</p>}
      </Painel>

      {!dados && carregando ? <Carregando /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {dias.map((d) => {
            const itens = porDia(d);
            const ehHoje = diaLocal(d) === hoje;
            return (
              <section key={d.toISOString()} className={`min-h-[8rem] rounded-xl border bg-white p-2 ${ehHoje ? 'border-marca' : 'border-gray-200'}`} aria-label={d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })}>
                <header className="mb-2 flex items-center justify-between px-1">
                  <span className={`text-xs uppercase tracking-wide ${ehHoje ? 'font-semibold text-marca-texto' : 'text-gray-600'}`}>{d.toLocaleDateString('pt-BR', { weekday: 'short' })} {d.getDate()}</span>
                  {can('crm', 'create') && <button type="button" onClick={() => setNovo(diaLocal(d))} className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label={`Agendar em ${d.toLocaleDateString('pt-BR')}`}><Plus className="h-3.5 w-3.5" /></button>}
                </header>
                <ul className="space-y-1.5">
                  {itens.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => setAberto(a)} className={`w-full rounded-lg border-l-4 bg-gray-50 px-2 py-1.5 text-left hover:bg-gray-100 ${a.status === 'agendado' ? 'border-l-marca-viva' : a.status === 'realizado' ? 'border-l-green-600' : 'border-l-gray-400'}`}>
                        <p className="text-xs text-gray-600">{horaLocal(a.inicio)} · {TIPOS_AGENDA[a.tipo]}</p>
                        <p className={`truncate text-sm ${a.status === 'cancelado' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{a.titulo}</p>
                        <p className="truncate text-xs text-gray-700">{a.pacienteNome}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {dados && dados.length === 0 && <p className="text-center text-sm text-gray-600">Nenhum compromisso nesta semana.</p>}

      {aberto && <DetalheAgendamento agendamento={aberto} aoFechar={() => setAberto(null)} aoMudar={(m) => { setAberto(null); setAviso(m); recarregar(); }} />}
      {novo && <NovoAgendamento dia={novo} pacienteInicial={paciente} aoFechar={() => setNovo(null)} aoCriar={() => { setNovo(null); setAviso('Compromisso agendado.'); recarregar(); }} />}
    </Tela>
  );
}

function DetalheAgendamento({ agendamento: a, aoFechar, aoMudar }: { agendamento: Agendamento; aoFechar: () => void; aoMudar: (m: string) => void }) {
  const { tenantId, can } = useAuth();
  const { enviando, erro, executar } = useAcao();
  const mudar = async (status: StatusAgenda, mensagem: string) => {
    if (!tenantId) return;
    if (await executar(() => editarAgendamento(tenantId, a.id, { status }))) aoMudar(mensagem);
  };
  const podeMudar = can('crm', 'edit');
  return (
    <Janela
      titulo={a.titulo}
      descricao={`${TIPOS_AGENDA[a.tipo]} · ${a.pacienteNome}`}
      aoFechar={aoFechar}
      bloqueada={enviando}
      rodape={podeMudar && a.status === 'agendado' ? (
        <>
          <button type="button" disabled={enviando} onClick={() => mudar('cancelado', 'Compromisso cancelado.')} className={`${BOTAO_SECUNDARIO} mr-auto text-red-700`}>Cancelar</button>
          <button type="button" disabled={enviando} onClick={() => mudar('faltou', 'Registrado: não compareceu.')} className={BOTAO_SECUNDARIO}>Não compareceu</button>
          <button type="button" disabled={enviando} onClick={() => mudar('realizado', 'Registrado como realizado.')} className={BOTAO_PRIMARIO}>Realizado</button>
        </>
      ) : podeMudar ? (
        <button type="button" disabled={enviando} onClick={() => mudar('agendado', 'Compromisso voltou para agendado.')} className={BOTAO_SECUNDARIO}>Voltar para agendado</button>
      ) : undefined}
    >
      <div className="space-y-4">
        <Etiqueta classe={STATUS_AGENDA[a.status].classe}>{STATUS_AGENDA[a.status].rotulo}</Etiqueta>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dado rotulo="Quando">{new Date(a.inicio).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}{a.fim && ` até ${horaLocal(a.fim)}`}</Dado>
          <Dado rotulo="Paciente">{a.pacienteNome}{a.ambienteNome && <span className="block text-xs text-gray-600">{a.ambienteNome}</span>}</Dado>
          <Dado rotulo="Local">{a.local ?? '—'}</Dado>
          <Dado rotulo="Profissional">{a.profissional ?? '—'}</Dado>
        </dl>
        {a.observacao && <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{a.observacao}</p>}
        {a.criadoPorNome && <p className="text-xs text-gray-600">Agendado por {a.criadoPorNome}.</p>}
      </div>
    </Janela>
  );
}

function NovoAgendamento({ dia, pacienteInicial, aoFechar, aoCriar }: { dia: string; pacienteInicial: string; aoFechar: () => void; aoCriar: () => void }) {
  const { tenantId } = useAuth();
  const { enviando, erro, setErro, executar } = useAcao();
  const [f, setF] = useState({ pacienteId: pacienteInicial, tipo: 'consulta' as TipoAgenda, titulo: '', dia, inicio: '09:00', fim: '', local: '', profissional: '', observacao: '' });
  const muda = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.pacienteId) return setErro('Escolha o paciente.');
    if (f.titulo.trim().length < 3) return setErro('Descreva o compromisso (ex.: "Consulta com o cardiologista").');
    if (f.fim && f.fim <= f.inicio) return setErro('O horário de fim tem de ser depois do início.');
    if (!tenantId) return;
    const ok = await executar(() => criarAgendamento(tenantId, {
      pacienteId: f.pacienteId, tipo: f.tipo, titulo: f.titulo.trim(), inicio: paraIso(f.dia, f.inicio), fim: f.fim ? paraIso(f.dia, f.fim) : null,
      local: f.local.trim() || null, profissional: f.profissional.trim() || null, observacao: f.observacao.trim() || null,
    }));
    if (ok) aoCriar();
  };

  return (
    <Janela titulo="Novo compromisso" aoFechar={aoFechar} bloqueada={enviando} largura="max-w-2xl" rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-agenda" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Salvando…' : 'Agendar'}</button>
    </>}>
      <form id="form-agenda" onSubmit={enviar} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><SeletorPaciente valor={f.pacienteId} aoMudar={(v) => setF({ ...f, pacienteId: v })} /></div>
        <label><span className={ROTULO}>Tipo *</span>
          <select value={f.tipo} onChange={muda('tipo')} className={CAMPO}>{Object.entries(TIPOS_AGENDA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
        </label>
        <label><span className={ROTULO}>Data *</span><input type="date" value={f.dia} onChange={muda('dia')} className={CAMPO} /></label>
        <label className="sm:col-span-2"><span className={ROTULO}>O quê *</span><input value={f.titulo} onChange={muda('titulo')} maxLength={160} placeholder="Ex.: Fisioterapia motora" className={CAMPO} /></label>
        <label><span className={ROTULO}>Início *</span><input type="time" value={f.inicio} onChange={muda('inicio')} className={CAMPO} /></label>
        <label><span className={ROTULO}>Fim</span><input type="time" value={f.fim} onChange={muda('fim')} className={CAMPO} /></label>
        <label><span className={ROTULO}>Local</span><input value={f.local} onChange={muda('local')} maxLength={120} placeholder="Ex.: Sala de fisioterapia" className={CAMPO} /></label>
        <label><span className={ROTULO}>Profissional</span><input value={f.profissional} onChange={muda('profissional')} maxLength={120} className={CAMPO} /></label>
        <label className="sm:col-span-2"><span className={ROTULO}>Observação</span><textarea value={f.observacao} onChange={muda('observacao')} rows={2} maxLength={1000} className={CAMPO} /></label>
        {erro && <div className="sm:col-span-2"><Aviso tom="erro">{erro}</Aviso></div>}
      </form>
    </Janela>
  );
}

/* ============================================================================
 * Lembretes
 * ========================================================================== */

type GrupoLembrete = 'atrasados' | 'hoje' | 'semana' | 'depois';

function grupoDe(l: Lembrete): GrupoLembrete {
  const quando = new Date(l.proximaEm);
  const agora = new Date();
  if (quando < agora) return 'atrasados';
  if (diaLocal(quando) === diaLocal(agora)) return 'hoje';
  return quando.getTime() - agora.getTime() < 7 * 86400000 ? 'semana' : 'depois';
}

const GRUPOS: Record<GrupoLembrete, string> = { atrasados: 'Atrasados', hoje: 'Hoje', semana: 'Próximos 7 dias', depois: 'Mais adiante' };

export function LembretesScreen(_: PropsTela) {
  const { tenantId, can } = useAuth();
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchLembretes(t), [], 60_000);
  const { executar, erro: erroAcao } = useAcao();
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const ativos = (dados ?? []).filter((l) => l.ativo);
  const concluidos = (dados ?? []).filter((l) => !l.ativo);
  const grupos = (Object.keys(GRUPOS) as GrupoLembrete[]).map((g) => ({ g, itens: ativos.filter((l) => grupoDe(l) === g) }));
  const atrasados = grupos[0].itens.length;

  const concluir = async (l: Lembrete) => {
    if (!tenantId) return;
    const r = await executar(() => concluirLembrete(tenantId, l.id));
    if (r) { setAviso(l.recorrencia === 'nenhuma' ? `"${l.titulo}" concluído.` : `"${l.titulo}" concluído. Próximo: ${new Date(r.proximaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`); recarregar(); }
  };
  const desativar = async (l: Lembrete) => {
    if (!tenantId) return;
    if (await executar(() => desativarLembrete(tenantId, l.id))) { setAviso(`"${l.titulo}" desativado.`); recarregar(); }
  };

  return (
    <Tela>
      <CabecalhoTela
        titulo="Lembretes"
        descricao="Tarefas com hora marcada. Os recorrentes voltam sozinhos para a próxima data quando alguém conclui."
        acoes={<>
          <BotaoAtualizar carregando={carregando} aoClicar={recarregar} />
          {can('crm', 'create') && <button type="button" onClick={() => setNovo(true)} className={BOTAO_PRIMARIO}><Plus className="h-4 w-4" aria-hidden="true" /> Novo lembrete</button>}
        </>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {(erro || erroAcao) && <Aviso tom="erro">{erro ?? erroAcao}</Aviso>}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Atrasados" valor={atrasados} tom={atrasados ? 'critico' : 'neutro'} />
        <Indicador rotulo="Para hoje" valor={grupos[1].itens.length} />
        <Indicador rotulo="Próximos 7 dias" valor={grupos[2].itens.length} />
        <Indicador rotulo="Recorrentes ativos" valor={ativos.filter((l) => l.recorrencia !== 'nenhuma').length} />
      </dl>

      {!dados && carregando ? <Carregando /> : ativos.length === 0 ? (
        <Painel><Vazio icone={BellRing} titulo="Nenhum lembrete ativo" texto="Crie lembretes para rotinas como troca de curativo, reavaliação de risco ou ligação para a família." /></Painel>
      ) : grupos.filter((x) => x.itens.length).map(({ g, itens }) => (
        <Painel key={g} titulo={`${GRUPOS[g]} (${itens.length})`} semPadding>
          <ul className="divide-y divide-gray-100">
            {itens.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{l.titulo}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                    <span className={g === 'atrasados' ? 'font-medium text-red-700' : ''}>
                      <Clock className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                      {new Date(l.proximaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{g === 'atrasados' ? ` (${quandoFoi(l.proximaEm)})` : ` (${quantoFalta(l.proximaEm)})`}
                    </span>
                    {l.recorrencia !== 'nenhuma' && <span><Repeat className="mr-0.5 inline h-3 w-3" aria-hidden="true" />{RECORRENCIAS[l.recorrencia]}</span>}
                    {l.pacienteNome && <span><UserRound className="mr-0.5 inline h-3 w-3" aria-hidden="true" />{l.pacienteNome}</span>}
                  </p>
                  {l.descricao && <p className="mt-1 text-sm text-gray-700">{l.descricao}</p>}
                  {l.ultimaConclusaoEm && <p className="mt-1 text-xs text-gray-600">Última vez: {l.ultimaConclusaoPor}, {quandoFoi(l.ultimaConclusaoEm)}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {can('crm', 'edit') && <button type="button" onClick={() => desativar(l)} className="rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Desativar</button>}
                  {can('crm', 'create') && <button type="button" onClick={() => concluir(l)} className={`${BOTAO_PRIMARIO} px-3 py-1.5`}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Concluir</button>}
                </div>
              </li>
            ))}
          </ul>
        </Painel>
      ))}

      {concluidos.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white px-5 py-3">
          <summary className="cursor-pointer text-sm text-gray-700">Concluídos e desativados nos últimos 30 dias ({concluidos.length})</summary>
          <ul className="mt-3 space-y-1 text-sm text-gray-600">
            {concluidos.map((l) => <li key={l.id}>{l.titulo}{l.ultimaConclusaoEm && ` — ${l.ultimaConclusaoPor}, ${quandoFoi(l.ultimaConclusaoEm)}`}</li>)}
          </ul>
        </details>
      )}

      {novo && <NovoLembrete aoFechar={() => setNovo(false)} aoCriar={() => { setNovo(false); setAviso('Lembrete criado.'); recarregar(); }} />}
    </Tela>
  );
}

function NovoLembrete({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: () => void }) {
  const { tenantId } = useAuth();
  const { enviando, erro, setErro, executar } = useAcao();
  const agora = new Date(Date.now() + 3600000);
  const [f, setF] = useState({ titulo: '', descricao: '', pacienteId: '', dia: diaLocal(agora), hora: `${String(agora.getHours()).padStart(2, '0')}:00`, recorrencia: 'nenhuma' as Recorrencia });
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.titulo.trim().length < 3) return setErro('Descreva a tarefa.');
    if (!tenantId) return;
    const ok = await executar(() => criarLembrete(tenantId, {
      titulo: f.titulo.trim(), descricao: f.descricao.trim() || undefined, pacienteId: f.pacienteId || undefined,
      proximaEm: paraIso(f.dia, f.hora), recorrencia: f.recorrencia,
    }));
    if (ok) aoCriar();
  };
  return (
    <Janela titulo="Novo lembrete" aoFechar={aoFechar} bloqueada={enviando} rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-lembrete" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Salvando…' : 'Criar lembrete'}</button>
    </>}>
      <form id="form-lembrete" onSubmit={enviar} noValidate className="space-y-4">
        <label className="block"><span className={ROTULO}>Tarefa *</span><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={160} placeholder="Ex.: Reavaliar risco de queda (Morse)" className={CAMPO} /></label>
        <SeletorPaciente valor={f.pacienteId} aoMudar={(v) => setF({ ...f, pacienteId: v })} rotulo="Paciente" opcional />
        <div className="grid grid-cols-2 gap-4">
          <label><span className={ROTULO}>Data *</span><input type="date" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} className={CAMPO} /></label>
          <label><span className={ROTULO}>Hora *</span><input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} className={CAMPO} /></label>
        </div>
        <label className="block"><span className={ROTULO}>Repetir</span>
          <select value={f.recorrencia} onChange={(e) => setF({ ...f, recorrencia: e.target.value as Recorrencia })} className={CAMPO}>
            {Object.entries(RECORRENCIAS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <label className="block"><span className={ROTULO}>Detalhes</span><textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} rows={2} maxLength={1000} className={CAMPO} /></label>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

/* ============================================================================
 * Comunicação de exames
 * ========================================================================== */

export function ExamesScreen(_: PropsTela) {
  const { can } = useAuth();
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchExames(t));
  const [filtro, setFiltro] = useState<'todos' | 'pendentes'>('todos');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const pendentes = (dados ?? []).filter((e) => !e.cienciaEm);
  const visiveis = (filtro === 'pendentes' ? pendentes : dados ?? [])
    .filter((e) => !busca.trim() || `${e.pacienteNome} ${e.exame} ${e.destinatario}`.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <Tela>
      <CabecalhoTela
        titulo="Comunicação de Exames"
        descricao="Registro de cada resultado comunicado à família: o quê, a quem, por qual canal. Pelo portal, a família confirma que viu."
        acoes={<>
          <BotaoAtualizar carregando={carregando} aoClicar={recarregar} />
          {can('crm', 'create') && <button type="button" onClick={() => setNovo(true)} className={BOTAO_PRIMARIO}><Plus className="h-4 w-4" aria-hidden="true" /> Comunicar exame</button>}
        </>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Painel semPadding>
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center">
          <AbasDeFiltro rotulo="Filtrar" valor={filtro} aoMudar={setFiltro} opcoes={[
            { valor: 'todos', rotulo: 'Todos', contagem: dados?.length ?? 0 }, { valor: 'pendentes', rotulo: 'Aguardando ciência no portal', contagem: pendentes.length },
          ]} />
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar paciente, exame ou destinatário" />
        </div>
        {!dados && carregando ? <div className="px-4"><Carregando /></div> : visiveis.length === 0 ? (
          <Vazio icone={FileText} titulo={dados?.length ? 'Nada com esse filtro' : 'Nenhum exame comunicado ainda'} texto="Registrar a comunicação protege a equipe: fica dito o que foi informado, a quem e quando." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {visiveis.map((e) => (
              <li key={e.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.exame} <span className="font-normal text-gray-600">· {formatarDia(e.dataExame)}</span></p>
                    <p className="text-xs text-gray-600">{e.pacienteNome} · para {e.destinatario} · {CANAIS[e.canal]} · por {e.autorNome}, {quandoFoi(e.comunicadoEm)}</p>
                  </div>
                  {e.cienciaEm
                    ? <Etiqueta classe="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />{e.canal === 'portal' ? `Família confirmou ${quandoFoi(e.cienciaEm)}` : 'Comunicado'}</Etiqueta>
                    : <Etiqueta classe="bg-amber-100 text-amber-800">Aguardando a família no portal</Etiqueta>}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-gray-800">{e.resultado}</p>
                {e.observacao && <p className="mt-1 text-xs text-gray-600">{e.observacao}</p>}
              </li>
            ))}
          </ul>
        )}
      </Painel>
      {novo && <NovoExame aoFechar={() => setNovo(false)} aoCriar={(canal) => { setNovo(false); setAviso(canal === 'portal' ? 'Exame enviado ao portal. A família verá na próxima vez que entrar.' : 'Comunicação registrada.'); recarregar(); }} />}
    </Tela>
  );
}

function NovoExame({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (canal: CanalExame) => void }) {
  const { tenantId } = useAuth();
  const { enviando, erro, setErro, executar } = useAcao();
  const [f, setF] = useState({ pacienteId: '', exame: '', dataExame: diaLocal(new Date()), resultado: '', destinatario: '', canal: 'telefone' as CanalExame, observacao: '' });
  const muda = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.pacienteId) return setErro('Escolha o paciente.');
    if (f.exame.trim().length < 2 || f.resultado.trim().length < 3 || f.destinatario.trim().length < 2) return setErro('Preencha exame, resultado e a quem foi comunicado.');
    if (!tenantId) return;
    if (await executar(() => comunicarExame(tenantId, { ...f, exame: f.exame.trim(), resultado: f.resultado.trim(), destinatario: f.destinatario.trim(), observacao: f.observacao.trim() || undefined }))) aoCriar(f.canal);
  };
  return (
    <Janela titulo="Comunicar resultado de exame" aoFechar={aoFechar} bloqueada={enviando} largura="max-w-2xl" rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-exame" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Salvando…' : f.canal === 'portal' ? 'Enviar ao portal' : 'Registrar comunicação'}</button>
    </>}>
      <form id="form-exame" onSubmit={enviar} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><SeletorPaciente valor={f.pacienteId} aoMudar={(v) => setF({ ...f, pacienteId: v })} /></div>
        <label><span className={ROTULO}>Exame *</span><input value={f.exame} onChange={muda('exame')} maxLength={160} placeholder="Ex.: Hemograma completo" className={CAMPO} /></label>
        <label><span className={ROTULO}>Data do exame *</span><input type="date" value={f.dataExame} onChange={muda('dataExame')} className={CAMPO} /></label>
        <label className="sm:col-span-2"><span className={ROTULO}>Resultado, em palavras simples *</span>
          <textarea value={f.resultado} onChange={muda('resultado')} rows={3} maxLength={2000} placeholder="O que foi explicado à família." className={CAMPO} />
        </label>
        <label><span className={ROTULO}>Comunicado a *</span><input value={f.destinatario} onChange={muda('destinatario')} maxLength={120} placeholder="Nome e parentesco" className={CAMPO} /></label>
        <label><span className={ROTULO}>Canal *</span>
          <select value={f.canal} onChange={muda('canal')} className={CAMPO}>{Object.entries(CANAIS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
        </label>
        {f.canal === 'portal' && <div className="sm:col-span-2"><Aviso>A família vê o resultado no portal e confirma a leitura. Só quem tem acesso ativo ao paciente verá.</Aviso></div>}
        <label className="sm:col-span-2"><span className={ROTULO}>Observação interna</span><input value={f.observacao} onChange={muda('observacao')} maxLength={500} className={CAMPO} /></label>
        {erro && <div className="sm:col-span-2"><Aviso tom="erro">{erro}</Aviso></div>}
      </form>
    </Janela>
  );
}

/* ============================================================================
 * Campanhas de saúde
 * ========================================================================== */

function situacaoCampanha(c: Campanha): { rotulo: string; classe: string } {
  const hoje = diaLocal(new Date());
  if (c.encerradaEm) return { rotulo: 'Encerrada', classe: 'bg-gray-100 text-gray-700' };
  if (c.inicio > hoje) return { rotulo: 'Começa em breve', classe: 'bg-blue-100 text-blue-700' };
  if (c.fim < hoje) return { rotulo: 'Prazo terminou', classe: 'bg-amber-100 text-amber-800' };
  return { rotulo: 'Em andamento', classe: 'bg-green-100 text-green-700' };
}

export function CampanhasScreen(_: PropsTela) {
  const { can } = useAuth();
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchCampanhas(t));
  const [aberta, setAberta] = useState<Campanha | null>(null);
  const [nova, setNova] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const ativas = (dados ?? []).filter((c) => !c.encerradaEm);

  return (
    <Tela>
      <CabecalhoTela
        titulo="Campanhas de Saúde"
        descricao="Vacinação, prevenção de quedas, rastreamentos: quem participou e quanto falta para a meta."
        acoes={<>
          <BotaoAtualizar carregando={carregando} aoClicar={recarregar} />
          {can('crm', 'edit') && <button type="button" onClick={() => setNova(true)} className={BOTAO_PRIMARIO}><Plus className="h-4 w-4" aria-hidden="true" /> Nova campanha</button>}
        </>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando ? <Carregando /> : (dados ?? []).length === 0 ? (
        <Painel><Vazio icone={Megaphone} titulo="Nenhuma campanha ainda" texto="Ex.: vacinação contra gripe, semana de prevenção de quedas, rastreamento de diabetes." /></Painel>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {(dados ?? []).map((c) => {
            const s = situacaoCampanha(c);
            const progresso = c.metaParticipantes ? Math.min(100, (100 * c.participantes.length) / c.metaParticipantes) : null;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setAberta(c)} className="flex h-full w-full flex-col rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-marca-suave text-marca-texto">{c.tipo === 'vacinacao' ? <Syringe className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}</span>
                    <Etiqueta classe={s.classe}>{s.rotulo}</Etiqueta>
                  </div>
                  <p className="mt-3 text-sm font-medium text-gray-900">{c.titulo}</p>
                  <p className="text-xs text-gray-600">{TIPOS_CAMPANHA[c.tipo]} · {formatarDia(c.inicio)} a {formatarDia(c.fim)}</p>
                  <div className="mt-auto pt-4">
                    <p className="flex justify-between text-sm"><span className="text-gray-700"><Users className="mr-1 inline h-4 w-4" aria-hidden="true" />{c.participantes.length} participante(s)</span>{c.metaParticipantes && <span className="text-gray-600">meta {c.metaParticipantes}</span>}</p>
                    {progresso != null && <div className="mt-2 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-marca" style={{ width: `${progresso}%` }} /></div>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {ativas.length > 0 && <p className="text-xs text-gray-600">{ativas.length} campanha(s) ativa(s). Encerre a campanha quando terminar: ela sai da lista de ativas e o resultado fica guardado.</p>}
      {aberta && <DetalheCampanha campanha={aberta} aoFechar={() => setAberta(null)} aoMudar={(c, m) => { setAberta(c); setAviso(m); recarregar(); }} />}
      {nova && <NovaCampanha aoFechar={() => setNova(false)} aoCriar={(c) => { setNova(false); setAviso(`Campanha "${c.titulo}" criada.`); recarregar(); setAberta(c); }} />}
    </Tela>
  );
}

function DetalheCampanha({ campanha: c, aoFechar, aoMudar }: { campanha: Campanha; aoFechar: () => void; aoMudar: (c: Campanha, m: string) => void }) {
  const { tenantId, can } = useAuth();
  const pacientes = usePacientesInternados();
  const { enviando, erro, executar } = useAcao();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const ja = useMemo(() => new Set(c.participantes.map((p) => p.pacienteId)), [c]);
  const faltam = pacientes.filter((p) => !ja.has(p.id));

  const registrar = async () => {
    if (!tenantId || marcados.size === 0) return;
    const r = await executar(() => registrarParticipantes(tenantId, c.id, [...marcados]));
    if (r) { setMarcados(new Set()); aoMudar(r, `${marcados.size} participante(s) registrado(s).`); }
  };
  const encerrar = async () => {
    if (!tenantId) return;
    const r = await executar(() => encerrarCampanha(tenantId, c.id));
    if (r) aoMudar(r, 'Campanha encerrada.');
  };

  return (
    <Janela titulo={c.titulo} descricao={`${TIPOS_CAMPANHA[c.tipo]} · ${formatarDia(c.inicio)} a ${formatarDia(c.fim)}`} aoFechar={aoFechar} bloqueada={enviando} largura="max-w-2xl"
      rodape={!c.encerradaEm && (can('crm', 'create') || can('crm', 'edit')) ? <>
        {can('crm', 'edit') && <button type="button" onClick={encerrar} disabled={enviando} className={`${BOTAO_SECUNDARIO} mr-auto`}>Encerrar campanha</button>}
        {can('crm', 'create') && <button type="button" onClick={registrar} disabled={enviando || marcados.size === 0} className={BOTAO_PRIMARIO}>Registrar {marcados.size || ''} participante(s)</button>}
      </> : undefined}>
      <div className="space-y-5">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {c.descricao && <p className="whitespace-pre-line text-sm text-gray-800">{c.descricao}</p>}
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Participaram ({c.participantes.length}{c.metaParticipantes ? ` de ${c.metaParticipantes}` : ''})</p>
          {c.participantes.length === 0 ? <p className="text-sm text-gray-600">Ninguém registrado ainda.</p> : (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {c.participantes.map((p) => <li key={p.pacienteId} className="flex justify-between gap-3"><span className="text-gray-900">{p.pacienteNome}</span><span className="text-xs text-gray-600">{p.registradoPorNome}, {quandoFoi(p.registradoEm)}</span></li>)}
            </ul>
          )}
        </div>
        {!c.encerradaEm && can('crm', 'create') && (
          <fieldset>
            <legend className="mb-2 text-xs uppercase tracking-wide text-gray-500">Marcar quem participou</legend>
            {faltam.length === 0 ? <p className="text-sm text-gray-600">Todos os internados já constam.</p> : (
              <ul className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {faltam.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50">
                      <input type="checkbox" checked={marcados.has(p.id)} onChange={(e) => { const n = new Set(marcados); if (e.target.checked) n.add(p.id); else n.delete(p.id); setMarcados(n); }} className="h-4 w-4 accent-[var(--marca)]" />
                      {p.nome}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}
      </div>
    </Janela>
  );
}

function NovaCampanha({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (c: Campanha) => void }) {
  const { tenantId } = useAuth();
  const { enviando, erro, setErro, executar } = useAcao();
  const hoje = new Date();
  const [f, setF] = useState({ titulo: '', descricao: '', tipo: 'vacinacao' as TipoCampanha, inicio: diaLocal(hoje), fim: diaLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30)), meta: '' });
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.titulo.trim().length < 3) return setErro('Dê um nome à campanha.');
    if (f.fim < f.inicio) return setErro('O fim não pode ser antes do início.');
    if (!tenantId) return;
    const r = await executar(() => criarCampanha(tenantId, { titulo: f.titulo.trim(), descricao: f.descricao.trim() || undefined, tipo: f.tipo, inicio: f.inicio, fim: f.fim, metaParticipantes: f.meta ? Number(f.meta) : null }));
    if (r) aoCriar(r);
  };
  return (
    <Janela titulo="Nova campanha" aoFechar={aoFechar} bloqueada={enviando} rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-campanha" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Salvando…' : 'Criar campanha'}</button>
    </>}>
      <form id="form-campanha" onSubmit={enviar} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={ROTULO}>Nome *</span><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={160} placeholder="Ex.: Vacinação contra gripe 2026" className={CAMPO} /></label>
        <label><span className={ROTULO}>Tipo *</span><select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoCampanha })} className={CAMPO}>{Object.entries(TIPOS_CAMPANHA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
        <label><span className={ROTULO}>Meta de participantes</span><input type="number" min={1} value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} className={CAMPO} /></label>
        <label><span className={ROTULO}>Início *</span><input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className={CAMPO} /></label>
        <label><span className={ROTULO}>Fim *</span><input type="date" value={f.fim} min={f.inicio} onChange={(e) => setF({ ...f, fim: e.target.value })} className={CAMPO} /></label>
        <label className="sm:col-span-2"><span className={ROTULO}>Descrição</span><textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} rows={3} maxLength={2000} className={CAMPO} /></label>
        {erro && <div className="sm:col-span-2"><Aviso tom="erro">{erro}</Aviso></div>}
      </form>
    </Janela>
  );
}

