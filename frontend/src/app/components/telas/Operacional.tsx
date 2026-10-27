import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowRightLeft, BedDouble, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, ListChecks, LogOut, Pencil, Plus, Stethoscope,
  UserPlus, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { darAltaPaciente, fetchAmbientes, fetchPacientes, type AmbienteResumo, type PacienteResumo } from '../../data/api';
import {
  FREQUENCIAS, TURNOS, criarModelo, editarModelo, escalar, executarChecklist, fetchEscala, fetchExecucoes, fetchModelos,
  fetchMovimentacoes, tirarDaEscala, transferirPaciente, turnoAtual,
  type Frequencia, type ModeloChecklist, type Turno,
} from '../../data/operacional';
import { formatarDia, quandoFoi } from '../../data/tempo';
import { useAcao, useDados } from '../../data/useDados';
import type { PropsTela } from '../../telas';
import { ModalPaciente } from '../pep/ModalPaciente';
import {
  AbasDeFiltro, Aviso, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, BotaoAtualizar, Busca, CAMPO, CabecalhoTela, Carregando, Etiqueta,
  Indicador, Interruptor, Janela, Painel, ROTULO, Segmentado, SeletorDias, Tela, Vazio,
} from '../settings/ui';

/** Operacional assistencial: internação, movimentação, escala e checklists. */

const DICA = { backgroundColor: 'var(--grafico-dica)', border: '1px solid var(--grafico-grade)', borderRadius: 8, fontSize: 12 };
const EIXO = { stroke: 'var(--grafico-eixo)', fontSize: 11 };
const diaLocal = (d: Date) => d.toLocaleDateString('sv-SE');
const diasInternado = (admissao: string) => Math.max(0, Math.round((Date.now() - new Date(`${admissao}T00:00`).getTime()) / 86400000));

/* ============================================================================
 * Internações
 * ========================================================================== */

export function InternacoesScreen({ onNavigate }: PropsTela) {
  const { can } = useAuth();
  const pacientes = useDados<PacienteResumo[]>((t) => fetchPacientes(t));
  const mov = useDados((t) => fetchMovimentacoes(t, 30));
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<'nome' | 'dias' | 'ambiente'>('dias');
  const [admitindo, setAdmitindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const internados = (pacientes.dados ?? []).filter((p) => p.status === 'internado');
  const visiveis = internados
    .filter((p) => !busca.trim() || `${p.nome} ${p.ambienteNome ?? ''} ${p.medicoResponsavel ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => (ordem === 'dias' ? diasInternado(b.dataAdmissao) - diasInternado(a.dataAdmissao)
      : ordem === 'ambiente' ? (a.ambienteNome ?? '~').localeCompare(b.ambienteNome ?? '~', 'pt-BR', { numeric: true }) : a.nome.localeCompare(b.nome, 'pt-BR')));
  const media = internados.length ? Math.round(internados.reduce((s, p) => s + diasInternado(p.dataAdmissao), 0) / internados.length) : null;
  const admissoes30 = (mov.dados?.movimentacoes ?? []).filter((m) => m.tipo === 'admissao').length;

  return (
    <Tela>
      <CabecalhoTela
        titulo="Internações"
        descricao="Quem está internado, em que ambiente, há quanto tempo e com que pendências."
        acoes={<>
          <BotaoAtualizar carregando={pacientes.carregando} aoClicar={() => { pacientes.recarregar(); mov.recarregar(); }} />
          {can('patients', 'create') && <button type="button" onClick={() => setAdmitindo(true)} className={BOTAO_PRIMARIO}><UserPlus className="h-4 w-4" aria-hidden="true" /> Nova admissão</button>}
        </>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {pacientes.erro && <Aviso tom="erro">{pacientes.erro}</Aviso>}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Internados" valor={internados.length} />
        <Indicador rotulo="Admissões em 30 dias" valor={admissoes30} />
        <Indicador rotulo="Tempo médio internado" valor={media != null ? `${media} d` : '—'} detalhe="dos internados agora" />
        <Indicador rotulo="Sem ambiente" valor={internados.filter((p) => !p.ambienteId).length} tom={internados.some((p) => !p.ambienteId) ? 'atencao' : 'neutro'} detalhe="fora de qualquer câmera" />
      </dl>
      <Painel semPadding>
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar paciente, ambiente ou médico" />
          <Segmentado rotulo="Ordenar por" valor={ordem} aoMudar={setOrdem} opcoes={[{ valor: 'dias', rotulo: 'Mais tempo' }, { valor: 'nome', rotulo: 'Nome' }, { valor: 'ambiente', rotulo: 'Ambiente' }]} />
        </div>
        {!pacientes.dados && pacientes.carregando ? <div className="px-4"><Carregando /></div> : visiveis.length === 0 ? (
          <Vazio icone={BedDouble} titulo={internados.length ? 'Ninguém com essa busca' : 'Nenhum paciente internado'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                <tr><th className="px-4 py-2 font-medium">Paciente</th><th className="px-4 py-2 font-medium">Ambiente</th><th className="px-4 py-2 font-medium">Admissão</th><th className="px-4 py-2 font-medium">Médico responsável</th><th className="px-4 py-2 font-medium">Situação</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visiveis.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-gray-900">{p.nome}{p.idade != null && <span className="block text-xs text-gray-600">{p.idade} anos</span>}</td>
                    <td className="px-4 py-3 text-gray-800">{p.ambienteNome ?? <Etiqueta classe="bg-amber-100 text-amber-800">Sem ambiente</Etiqueta>}</td>
                    <td className="px-4 py-3 text-gray-800">{formatarDia(p.dataAdmissao)}<span className="block text-xs text-gray-600">{diasInternado(p.dataAdmissao)} dia(s)</span></td>
                    <td className="px-4 py-3 text-gray-800">{p.medicoResponsavel ?? '—'}</td>
                    <td className="px-4 py-3">
                      {p.ocorrenciasAbertas > 0 ? <Etiqueta classe="bg-red-100 text-red-700">{p.ocorrenciasAbertas} ocorrência(s) aberta(s)</Etiqueta>
                        : p.quedasConfirmadas > 0 ? <Etiqueta classe="bg-amber-100 text-amber-800">{p.quedasConfirmadas} queda(s) no histórico</Etiqueta>
                        : <Etiqueta classe="bg-green-100 text-green-700">Estável</Etiqueta>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
      {can('clinical_logs', 'view') && <button type="button" onClick={() => onNavigate('pep')} className={BOTAO_SECUNDARIO}><Stethoscope className="h-4 w-4" aria-hidden="true" /> Abrir o prontuário</button>}
      {admitindo && <ModalPaciente aoFechar={() => setAdmitindo(false)} aoSalvar={(p) => { setAdmitindo(false); setAviso(`${p.nome} admitido(a).`); pacientes.recarregar(); mov.recarregar(); }} />}
    </Tela>
  );
}

/* ============================================================================
 * Alta e transferência
 * ========================================================================== */

export function AltaTransferenciaScreen(_: PropsTela) {
  const { can } = useAuth();
  const pacientes = useDados<PacienteResumo[]>((t) => fetchPacientes(t));
  const mov = useDados((t) => fetchMovimentacoes(t, 30));
  const [busca, setBusca] = useState('');
  const [transferindo, setTransferindo] = useState<PacienteResumo | null>(null);
  const [dandoAlta, setDandoAlta] = useState<PacienteResumo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const internados = (pacientes.dados ?? []).filter((p) => p.status === 'internado')
    .filter((p) => !busca.trim() || `${p.nome} ${p.ambienteNome ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const recentes = (mov.dados?.movimentacoes ?? []).filter((m) => m.tipo !== 'admissao').slice(0, 15);
  const pode = can('patients', 'edit');
  const depois = (m: string) => { setAviso(m); pacientes.recarregar(); mov.recarregar(); };

  return (
    <Tela>
      <CabecalhoTela titulo="Alta e Transferência" descricao="Trocar o paciente de ambiente ou dar saída, sempre com motivo. A câmera e o acesso da família acompanham a mudança." acoes={<BotaoAtualizar carregando={pacientes.carregando} aoClicar={() => { pacientes.recarregar(); mov.recarregar(); }} />} />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {pacientes.erro && <Aviso tom="erro">{pacientes.erro}</Aviso>}
      {!pode && <Aviso>Seu perfil vê as movimentações, mas só quem pode editar pacientes transfere ou dá alta.</Aviso>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Painel titulo="Internados" semPadding>
          <div className="border-b border-gray-100 p-4"><Busca valor={busca} aoMudar={setBusca} placeholder="Buscar paciente ou ambiente" /></div>
          {!pacientes.dados && pacientes.carregando ? <div className="px-4"><Carregando /></div> : internados.length === 0 ? <Vazio icone={BedDouble} titulo="Nenhum internado" /> : (
            <ul className="divide-y divide-gray-100">
              {internados.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{p.nome}</p>
                    <p className="text-xs text-gray-600">{p.ambienteNome ?? 'Sem ambiente'} · internado há {diasInternado(p.dataAdmissao)} dia(s){p.ocorrenciasAbertas > 0 && ' · ocorrência em aberto'}</p>
                  </div>
                  {pode && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setTransferindo(p)} className={`${BOTAO_SECUNDARIO} px-3 py-1.5`}><ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Transferir</button>
                      <button type="button" onClick={() => setDandoAlta(p)} className={`${BOTAO_SECUNDARIO} px-3 py-1.5`}><LogOut className="h-4 w-4" aria-hidden="true" /> Saída</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Painel>
        <Painel titulo="Últimas movimentações" descricao="Transferências e saídas dos últimos 30 dias." semPadding>
          {recentes.length === 0 ? <Vazio icone={ArrowRightLeft} titulo="Nenhuma movimentação recente" /> : (
            <ul className="divide-y divide-gray-100">
              {recentes.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <p className="text-sm text-gray-900"><strong className="font-medium">{m.rotulo}</strong> · {m.pacienteNome}</p>
                  <p className="text-xs text-gray-600">{[m.origem, m.destino].filter(Boolean).join(' → ') || '—'} · {quandoFoi(m.dataHora)}{m.usuarioNome && ` · ${m.usuarioNome}`}</p>
                  {m.motivo && <p className="mt-0.5 text-xs text-gray-700">{m.motivo}</p>}
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>
      {transferindo && <JanelaTransferir paciente={transferindo} aoFechar={() => setTransferindo(null)} aoFeito={(m) => { setTransferindo(null); depois(m); }} />}
      {dandoAlta && <JanelaSaida paciente={dandoAlta} aoFechar={() => setDandoAlta(null)} aoFeito={(m) => { setDandoAlta(null); depois(m); }} />}
    </Tela>
  );
}

function JanelaTransferir({ paciente, aoFechar, aoFeito }: { paciente: PacienteResumo; aoFechar: () => void; aoFeito: (m: string) => void }) {
  const { tenantId } = useAuth();
  const ambientes = useDados<AmbienteResumo[]>((t) => fetchAmbientes(t));
  const { enviando, erro, setErro, executar } = useAcao();
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const opcoes = (ambientes.dados ?? []).filter((a) => a.id !== paciente.ambienteId);
  const escolhido = opcoes.find((a) => a.id === destino);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destino) return setErro('Escolha o ambiente de destino.');
    if (motivo.trim().length < 3) return setErro('Informe o motivo.');
    if (!tenantId) return;
    if (await executar(() => transferirPaciente(tenantId, paciente.id, destino, motivo.trim()))) aoFeito(`${paciente.nome} transferido(a) para ${escolhido?.nome}.`);
  };
  return (
    <Janela titulo={`Transferir ${paciente.nome}`} descricao={`Hoje em: ${paciente.ambienteNome ?? 'nenhum ambiente'}`} aoFechar={aoFechar} bloqueada={enviando} rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-transferir" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Transferindo…' : 'Transferir'}</button>
    </>}>
      <form id="form-transferir" onSubmit={enviar} noValidate className="space-y-4">
        <label className="block"><span className={ROTULO}>Destino *</span>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className={CAMPO}>
            <option value="">Escolha o ambiente</option>
            {opcoes.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.pacienteNome ? ` (ocupado: ${a.pacienteNome})` : ' (livre)'}{a.cameras === 0 ? ' · sem câmera' : ''}</option>)}
          </select>
        </label>
        {escolhido?.cameras === 0 && <Aviso>Esse ambiente não tem câmera: quedas ali não serão detectadas.</Aviso>}
        {escolhido?.pacienteNome && <Aviso>{escolhido.pacienteNome} já está nesse ambiente. Confirme que é um quarto compartilhado.</Aviso>}
        <label className="block"><span className={ROTULO}>Motivo *</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ex.: Mais perto do posto de enfermagem" className={CAMPO} /></label>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

function JanelaSaida({ paciente, aoFechar, aoFeito }: { paciente: PacienteResumo; aoFechar: () => void; aoFeito: (m: string) => void }) {
  const { tenantId } = useAuth();
  const { enviando, erro, executar } = useAcao();
  const [motivo, setMotivo] = useState<'alta' | 'transferido'>('alta');
  const [observacao, setObservacao] = useState('');
  const confirmar = async () => {
    if (!tenantId) return;
    const r = await executar(() => darAltaPaciente(tenantId, paciente.id, motivo, observacao.trim() || undefined));
    if (r) aoFeito(`Saída de ${paciente.nome} registrada${r.acessosRevogados ? `; ${r.acessosRevogados} acesso(s) da família encerrado(s)` : ''}.`);
  };
  return (
    <Janela titulo={`Saída de ${paciente.nome}`} aoFechar={aoFechar} bloqueada={enviando} rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="button" onClick={confirmar} disabled={enviando} className={BOTAO_PERIGO}>{enviando ? 'Registrando…' : 'Confirmar saída'}</button>
    </>}>
      <div className="space-y-4">
        <Segmentado rotulo="Tipo de saída" valor={motivo} aoMudar={setMotivo} opcoes={[{ valor: 'alta', rotulo: 'Alta' }, { valor: 'transferido', rotulo: 'Transferência para outro serviço' }]} />
        <p className="text-sm text-gray-700">O paciente sai da lista de internados e os acessos da família ao vídeo são encerrados na hora. O prontuário continua guardado.</p>
        {paciente.ocorrenciasAbertas > 0 && <Aviso tom="erro">Há ocorrência em aberto para este paciente. Encerre o atendimento antes; o sistema recusa a saída até lá.</Aviso>}
        <label className="block"><span className={ROTULO}>Observação</span><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={500} className={CAMPO} /></label>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Janela>
  );
}

/* ============================================================================
 * Fluxo do paciente
 * ========================================================================== */

export function FluxoPacienteScreen(_: PropsTela) {
  const [dias, setDias] = useState(30);
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchMovimentacoes(t, dias), [dias]);
  const movs = dados?.movimentacoes ?? [];
  const conta = (t: string) => movs.filter((m) => m.tipo === t).length;
  const saidas = conta('alta') + conta('transferencia_externa');
  const serie = useMemo(() => {
    const hoje = new Date();
    return Array.from({ length: dias }, (_, k) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1 - k));
      const doDia = movs.filter((m) => diaLocal(new Date(m.dataHora)) === diaLocal(d));
      return {
        dia: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        admissoes: doDia.filter((m) => m.tipo === 'admissao').length,
        transferencias: doDia.filter((m) => m.tipo === 'transferencia').length,
        saidas: doDia.filter((m) => m.tipo === 'alta' || m.tipo === 'transferencia_externa').length,
      };
    });
  }, [movs, dias]);
  const quartos = (dados?.censo ?? []).filter((c) => c.tipo === 'quarto');
  const ocupados = quartos.filter((q) => q.pacientes > 0).length;

  return (
    <Tela>
      <CabecalhoTela titulo="Fluxo do Paciente" descricao="Entradas, trocas de ambiente e saídas ao longo do tempo, e como a clínica está ocupada agora." acoes={<><SeletorDias valor={dias} aoMudar={setDias} opcoes={[7, 30, 90]} /><BotaoAtualizar carregando={carregando} aoClicar={recarregar} /></>} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando ? <Carregando /> : dados && (
        <>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Indicador rotulo="Admissões" valor={conta('admissao')} />
            <Indicador rotulo="Transferências internas" valor={conta('transferencia')} />
            <Indicador rotulo="Saídas" valor={saidas} detalhe="altas e transferências externas" />
            <Indicador rotulo="Saldo" valor={`${conta('admissao') - saidas >= 0 ? '+' : ''}${conta('admissao') - saidas}`} detalhe="admissões − saídas" />
            <Indicador rotulo="Quartos ocupados" valor={`${ocupados}/${quartos.length}`} detalhe={quartos.length ? `${Math.round((100 * ocupados) / quartos.length)}% de ocupação` : undefined} />
          </dl>
          <Painel titulo="Movimentação por dia">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" vertical={false} />
                  <XAxis dataKey="dia" {...EIXO} interval="preserveStartEnd" />
                  <YAxis {...EIXO} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={DICA} />
                  {/* Legenda na cor do texto, não da série: a cor da série como texto não passava no contraste. */}
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: 'var(--grafico-eixo)' }}>{v}</span>} />
                  <Bar dataKey="admissoes" name="Admissões" stackId="a" fill="#15803d" />
                  <Bar dataKey="transferencias" name="Transferências" stackId="a" fill="#2563eb" />
                  <Bar dataKey="saidas" name="Saídas" stackId="a" fill="#a16207" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Painel>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Painel titulo="Ocupação agora" descricao={dados.semAmbiente ? `${dados.semAmbiente} internado(s) sem ambiente.` : undefined}>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {dados.censo.map((c) => (
                  <li key={c.ambienteId} className={`rounded-lg border px-3 py-2 ${c.pacientes ? 'border-marca bg-marca-suave' : 'border-gray-200'}`}>
                    <p className="truncate text-sm text-gray-900">{c.nome}</p>
                    <p className="text-xs text-gray-600">{c.pacientes ? `${c.pacientes} paciente(s)` : 'livre'}</p>
                  </li>
                ))}
              </ul>
            </Painel>
            <Painel titulo="Movimentações" semPadding>
              {movs.length === 0 ? <Vazio icone={ArrowRightLeft} titulo="Nenhuma movimentação no período" /> : (
                <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
                  {movs.map((m) => (
                    <li key={m.id} className="px-5 py-2.5">
                      <p className="text-sm text-gray-900"><strong className="font-medium">{m.rotulo}</strong> · {m.pacienteNome}</p>
                      <p className="text-xs text-gray-600">{[m.origem, m.destino].filter(Boolean).join(' → ') || '—'} · {new Date(m.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          </div>
        </>
      )}
    </Tela>
  );
}

/* ============================================================================
 * Escalas
 * ========================================================================== */

const inicioDaSemana = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

export function EscalasScreen(_: PropsTela) {
  const { tenantId, user, can } = useAuth();
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()));
  const dias = Array.from({ length: 7 }, (_, k) => new Date(semana.getFullYear(), semana.getMonth(), semana.getDate() + k));
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchEscala(t, diaLocal(dias[0]), diaLocal(dias[6])), [semana.getTime()]);
  const { executar, erro: erroAcao } = useAcao();
  const [adicionando, setAdicionando] = useState<{ data: string; turno: Turno } | null>(null);
  const edita = can('operations', 'edit');
  const hoje = diaLocal(new Date());
  const doTurno = (data: string, turno: Turno) => (dados?.turnos ?? []).filter((t) => t.data === data && t.turno === turno);
  const meus = (dados?.turnos ?? []).filter((t) => t.usuarioId === user?.id);
  const descobertos = dias.flatMap((d) => (Object.keys(TURNOS) as Turno[]).filter((t) => doTurno(diaLocal(d), t).length === 0)).length;
  // Semana sem nenhum turno é escala por montar, não 21 alarmes: o vermelho fica para o buraco numa escala que existe.
  const semanaVazia = !!dados && dados.turnos.length === 0;

  return (
    <Tela>
      <CabecalhoTela titulo="Escalas Assistenciais" descricao="Quem está em cada turno da semana. Turno sem ninguém aparece em vermelho." acoes={<BotaoAtualizar carregando={carregando} aoClicar={recarregar} />} />
      {(erro || erroAcao) && <Aviso tom="erro">{erro ?? erroAcao}</Aviso>}
      {semanaVazia && <Aviso>{edita ? 'Nenhum turno montado para esta semana. Use o + de cada célula para escalar alguém.' : 'A escala desta semana ainda não foi montada.'}</Aviso>}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Indicador rotulo="Turnos descobertos na semana" valor={semanaVazia ? '—' : descobertos} tom={descobertos && !semanaVazia ? 'critico' : 'neutro'} detalhe={semanaVazia ? 'escala ainda não montada' : 'de 21'} />
        <Indicador rotulo="Meus turnos na semana" valor={meus.length} detalhe={meus.map((t) => `${formatarDia(t.data).slice(0, 5)} ${TURNOS[t.turno].rotulo}`).join(', ') || undefined} />
        <Indicador rotulo="Profissionais escalados" valor={new Set((dados?.turnos ?? []).map((t) => t.usuarioId)).size} detalhe={`de ${dados?.equipe.length ?? 0} na equipe`} />
      </dl>
      <Painel>
        <div className="mb-4 flex items-center gap-2">
          <button type="button" onClick={() => setSemana(new Date(semana.getFullYear(), semana.getMonth(), semana.getDate() - 7))} className={`${BOTAO_SECUNDARIO} px-2`} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setSemana(inicioDaSemana(new Date()))} className={`${BOTAO_SECUNDARIO} px-3`}>Esta semana</button>
          <button type="button" onClick={() => setSemana(new Date(semana.getFullYear(), semana.getMonth(), semana.getDate() + 7))} className={`${BOTAO_SECUNDARIO} px-2`} aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></button>
          <p className="ml-2 text-sm font-medium text-gray-900">{dias[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {dias[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
        </div>
        {!dados && carregando ? <Carregando /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] table-fixed border-separate" style={{ borderSpacing: 4 }}>
              <thead>
                <tr>
                  <th className="w-28" />
                  {dias.map((d) => (
                    <th key={d.toISOString()} scope="col" className={`text-center text-xs font-medium ${diaLocal(d) === hoje ? 'text-marca-texto' : 'text-gray-600'}`}>
                      {d.toLocaleDateString('pt-BR', { weekday: 'short' })}<span className="block text-sm text-gray-900">{d.getDate()}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(TURNOS) as Turno[]).map((turno) => (
                  <tr key={turno}>
                    <th scope="row" className="text-left align-top text-sm font-medium text-gray-900">{TURNOS[turno].rotulo}<span className="block text-xs font-normal text-gray-600">{TURNOS[turno].horario}</span></th>
                    {dias.map((d) => {
                      const data = diaLocal(d);
                      const pessoas = doTurno(data, turno);
                      return (
                        <td key={data} className={`h-24 rounded-lg border p-1.5 align-top ${pessoas.length ? 'border-gray-200' : semanaVazia ? 'border-dashed border-gray-300' : 'border-red-200 bg-red-50'}`}>
                          <ul className="space-y-1">
                            {pessoas.map((p) => (
                              <li key={p.id} className={`flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-xs ${p.usuarioId === user?.id ? 'bg-marca text-white' : 'bg-gray-100 text-gray-800'}`}>
                                <span className="truncate" title={`${p.usuarioNome}${p.funcao ? ` · ${p.funcao}` : ''}`}>{p.usuarioNome.split(' ')[0]}{p.funcao && ` · ${p.funcao}`}</span>
                                {edita && (
                                  <button type="button" onClick={async () => { if (tenantId && await executar(() => tirarDaEscala(tenantId, p.id))) recarregar(); }} aria-label={`Tirar ${p.usuarioNome} do turno`} className="shrink-0 rounded opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
                                )}
                              </li>
                            ))}
                          </ul>
                          {edita && <button type="button" onClick={() => setAdicionando({ data, turno })} className="mt-1 flex w-full items-center justify-center rounded py-0.5 text-xs text-gray-600 hover:bg-gray-100" aria-label={`Escalar em ${formatarDia(data)}, ${TURNOS[turno].rotulo}`}><Plus className="h-3 w-3" /></button>}
                          {!pessoas.length && !edita && !semanaVazia && <p className="text-center text-xs text-red-700">descoberto</p>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
      {adicionando && dados && (
        <JanelaEscalar data={adicionando.data} turno={adicionando.turno} equipe={dados.equipe} jaEscalados={doTurno(adicionando.data, adicionando.turno).map((t) => t.usuarioId)}
          aoFechar={() => setAdicionando(null)} aoSalvar={() => { setAdicionando(null); recarregar(); }} />
      )}
    </Tela>
  );
}

function JanelaEscalar({ data, turno, equipe, jaEscalados, aoFechar, aoSalvar }: {
  data: string; turno: Turno; equipe: { id: string; nome: string; perfil: string }[]; jaEscalados: string[]; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { tenantId } = useAuth();
  const { enviando, erro, setErro, executar } = useAcao();
  const [usuarioId, setUsuarioId] = useState('');
  const [funcao, setFuncao] = useState('');
  const livres = equipe.filter((u) => !jaEscalados.includes(u.id));
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioId) return setErro('Escolha o profissional.');
    if (!tenantId) return;
    if (await executar(() => escalar(tenantId, { usuarioId, data, turno, funcao: funcao.trim() || undefined }))) aoSalvar();
  };
  return (
    <Janela titulo="Escalar profissional" descricao={`${formatarDia(data)} · ${TURNOS[turno].rotulo} (${TURNOS[turno].horario})`} aoFechar={aoFechar} bloqueada={enviando} rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-escala" disabled={enviando} className={BOTAO_PRIMARIO}>Escalar</button>
    </>}>
      <form id="form-escala" onSubmit={enviar} noValidate className="space-y-4">
        <label className="block"><span className={ROTULO}>Profissional *</span>
          <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={CAMPO}>
            <option value="">Escolha</option>{livres.map((u) => <option key={u.id} value={u.id}>{u.nome} · {u.perfil}</option>)}
          </select>
        </label>
        <label className="block"><span className={ROTULO}>Função no turno</span><input value={funcao} onChange={(e) => setFuncao(e.target.value)} maxLength={60} placeholder="Ex.: Enfermeira líder" className={CAMPO} /></label>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

/* ============================================================================
 * Checklists operacionais
 * ========================================================================== */

type AbaChecklist = 'executar' | 'historico' | 'modelos';

export function ChecklistsScreen(_: PropsTela) {
  const { can } = useAuth();
  const modelos = useDados((t) => fetchModelos(t));
  const execucoes = useDados((t) => fetchExecucoes(t, 7));
  const [aba, setAba] = useState<AbaChecklist>('executar');
  const [executando, setExecutando] = useState<ModeloChecklist | null>(null);
  const [editando, setEditando] = useState<ModeloChecklist | 'novo' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ativos = (modelos.dados ?? []).filter((m) => m.ativo);
  const hojeFeitos = (execucoes.dados ?? []).filter((e) => diaLocal(new Date(e.concluidoEm)) === diaLocal(new Date())).length;
  const pendenteNoTurno = (m: ModeloChecklist) => m.frequencia === 'turno'
    && !(execucoes.dados ?? []).some((e) => e.modeloId === m.id && e.turno === turnoAtual() && diaLocal(new Date(e.concluidoEm)) === diaLocal(new Date()));

  return (
    <Tela>
      <CabecalhoTela
        titulo="Checklists Operacionais"
        descricao="Rotinas que não podem ser esquecidas: passagem de plantão, ronda, conferência das câmeras. Cada execução fica registrada."
        acoes={<>
          <BotaoAtualizar carregando={modelos.carregando} aoClicar={() => { modelos.recarregar(); execucoes.recarregar(); }} />
          {can('operations', 'edit') && <button type="button" onClick={() => setEditando('novo')} className={BOTAO_PRIMARIO}><Plus className="h-4 w-4" aria-hidden="true" /> Novo checklist</button>}
        </>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {(modelos.erro || execucoes.erro) && <Aviso tom="erro">{modelos.erro ?? execucoes.erro}</Aviso>}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Indicador rotulo="Pendentes neste turno" valor={ativos.filter(pendenteNoTurno).length} tom={ativos.some(pendenteNoTurno) ? 'atencao' : 'neutro'} detalhe={`turno da ${TURNOS[turnoAtual()].rotulo.toLowerCase()}`} />
        <Indicador rotulo="Executados hoje" valor={hojeFeitos} />
        <Indicador rotulo="Checklists ativos" valor={ativos.length} />
      </dl>
      <AbasDeFiltro rotulo="Seção" valor={aba} aoMudar={setAba} opcoes={[
        { valor: 'executar', rotulo: 'Executar', contagem: ativos.length },
        { valor: 'historico', rotulo: 'Histórico (7 dias)', contagem: execucoes.dados?.length ?? 0 },
        { valor: 'modelos', rotulo: 'Todos os checklists', contagem: modelos.dados?.length ?? 0 },
      ]} />

      {aba === 'executar' && (!modelos.dados ? <Carregando /> : ativos.length === 0 ? (
        <Painel><Vazio icone={ListChecks} titulo="Nenhum checklist ativo" texto="Comece pela passagem de plantão: o que precisa ser conferido e dito em toda troca de turno." /></Painel>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ativos.map((m) => (
            <li key={m.id} className={`flex flex-col rounded-xl border bg-white p-5 ${pendenteNoTurno(m) ? 'border-amber-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-marca-suave text-marca-texto"><ClipboardList className="h-5 w-5" aria-hidden="true" /></span>
                {pendenteNoTurno(m) ? <Etiqueta classe="bg-amber-100 text-amber-800">Pendente neste turno</Etiqueta> : <Etiqueta classe="bg-gray-100 text-gray-700">{FREQUENCIAS[m.frequencia]}</Etiqueta>}
              </div>
              <p className="mt-3 text-sm font-medium text-gray-900">{m.titulo}</p>
              <p className="text-xs text-gray-600">{m.itens.length} itens · {m.ultimaExecucaoEm ? `última vez ${quandoFoi(m.ultimaExecucaoEm)}` : 'nunca executado'}</p>
              {can('operations', 'create') && <button type="button" onClick={() => setExecutando(m)} className={`${BOTAO_PRIMARIO} mt-4`}>Executar agora</button>}
            </li>
          ))}
        </ul>
      ))}

      {aba === 'historico' && (
        <Painel semPadding>
          {!execucoes.dados ? <div className="px-4"><Carregando /></div> : execucoes.dados.length === 0 ? <Vazio icone={CheckCircle2} titulo="Nenhuma execução nos últimos 7 dias" /> : (
            <ul className="divide-y divide-gray-100">
              {execucoes.dados.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900">{e.titulo}</span>
                        <span className="block text-xs text-gray-600">{e.usuarioNome} · {TURNOS[e.turno].rotulo} · {new Date(e.concluidoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </span>
                      <Etiqueta classe={e.itensFeitos === e.itensTotal ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}>{e.itensFeitos}/{e.itensTotal} feitos</Etiqueta>
                    </summary>
                    <ul className="mt-2 space-y-1 pl-1">
                      {e.respostas.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          {r.feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" aria-label="feito" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-label="não feito" />}
                          <span className="text-gray-800">{r.item}{r.observacao && <span className="block text-xs text-gray-600">{r.observacao}</span>}</span>
                        </li>
                      ))}
                    </ul>
                    {e.observacao && <p className="mt-2 text-sm text-gray-700">{e.observacao}</p>}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Painel>
      )}

      {aba === 'modelos' && (
        <Painel semPadding>
          {!modelos.dados ? <div className="px-4"><Carregando /></div> : modelos.dados.length === 0 ? <Vazio icone={ListChecks} titulo="Nenhum checklist cadastrado" /> : (
            <ul className="divide-y divide-gray-100">
              {modelos.dados.map((m) => (
                <li key={m.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${m.ativo ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{m.titulo}{!m.ativo && ' (desativado)'}</p>
                    <p className="text-xs text-gray-600">{FREQUENCIAS[m.frequencia]} · {m.itens.length} itens · {m.execucoes7d} execução(ões) em 7 dias</p>
                  </div>
                  {can('operations', 'edit') && <button type="button" onClick={() => setEditando(m)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar</button>}
                </li>
              ))}
            </ul>
          )}
        </Painel>
      )}

      {executando && <ExecutarChecklist modelo={executando} aoFechar={() => setExecutando(null)} aoConcluir={(f, t) => { setExecutando(null); setAviso(`Checklist registrado: ${f} de ${t} itens feitos.`); modelos.recarregar(); execucoes.recarregar(); }} />}
      {editando && <FormularioChecklist modelo={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} aoSalvar={(m) => { setEditando(null); setAviso(m); modelos.recarregar(); }} />}
    </Tela>
  );
}

function ExecutarChecklist({ modelo, aoFechar, aoConcluir }: { modelo: ModeloChecklist; aoFechar: () => void; aoConcluir: (feitos: number, total: number) => void }) {
  const { tenantId } = useAuth();
  const { enviando, erro, executar } = useAcao();
  const [turno, setTurno] = useState<Turno>(turnoAtual());
  const [feitos, setFeitos] = useState<boolean[]>(() => modelo.itens.map(() => false));
  const [obs, setObs] = useState<string[]>(() => modelo.itens.map(() => ''));
  const [observacao, setObservacao] = useState('');
  const total = feitos.filter(Boolean).length;
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const r = await executar(() => executarChecklist(tenantId, {
      modeloId: modelo.id, turno, observacao: observacao.trim() || undefined,
      respostas: modelo.itens.map((item, i) => ({ item, feito: feitos[i], observacao: obs[i].trim() || null })),
    }));
    if (r) aoConcluir(r.itensFeitos, r.itensTotal);
  };
  return (
    <Janela titulo={modelo.titulo} descricao={modelo.descricao ?? undefined} aoFechar={aoFechar} bloqueada={enviando} largura="max-w-2xl" rodape={<>
      <span className="mr-auto text-sm text-gray-700">{total} de {modelo.itens.length} feitos</span>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-exec" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Registrando…' : 'Concluir checklist'}</button>
    </>}>
      <form id="form-exec" onSubmit={enviar} noValidate className="space-y-4">
        <Segmentado rotulo="Turno" valor={turno} aoMudar={setTurno} opcoes={(Object.keys(TURNOS) as Turno[]).map((t) => ({ valor: t, rotulo: TURNOS[t].rotulo }))} />
        <ul className="space-y-2">
          {modelo.itens.map((item, i) => (
            <li key={i} className={`rounded-lg border p-3 ${feitos[i] ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-900">
                <input type="checkbox" checked={feitos[i]} onChange={(e) => setFeitos(feitos.map((f, k) => (k === i ? e.target.checked : f)))} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--marca)]" />
                {item}
              </label>
              {!feitos[i] && (
                <input value={obs[i]} onChange={(e) => setObs(obs.map((o, k) => (k === i ? e.target.value : o)))} maxLength={300} placeholder="Por que não foi feito? (opcional)" aria-label={`Observação sobre: ${item}`} className={`${CAMPO} mt-2`} />
              )}
            </li>
          ))}
        </ul>
        <label className="block"><span className={ROTULO}>Observação geral</span><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={1000} className={CAMPO} /></label>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

function FormularioChecklist({ modelo, aoFechar, aoSalvar }: { modelo: ModeloChecklist | null; aoFechar: () => void; aoSalvar: (m: string) => void }) {
  const { tenantId } = useAuth();
  const { enviando, erro, setErro, executar } = useAcao();
  const [f, setF] = useState({
    titulo: modelo?.titulo ?? '', descricao: modelo?.descricao ?? '', itens: modelo?.itens.join('\n') ?? '',
    frequencia: modelo?.frequencia ?? ('turno' as Frequencia), ativo: modelo?.ativo ?? true,
  });
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const itens = f.itens.split('\n').map((i) => i.trim()).filter(Boolean);
    if (f.titulo.trim().length < 3) return setErro('Dê um nome ao checklist.');
    if (itens.length === 0) return setErro('Escreva pelo menos um item, um por linha.');
    if (!tenantId) return;
    const dados = { titulo: f.titulo.trim(), descricao: f.descricao.trim() || null, itens, frequencia: f.frequencia, ativo: f.ativo };
    if (await executar(() => (modelo ? editarModelo(tenantId, modelo.id, dados) : criarModelo(tenantId, dados)))) aoSalvar(modelo ? 'Checklist atualizado.' : 'Checklist criado.');
  };
  return (
    <Janela titulo={modelo ? 'Editar checklist' : 'Novo checklist'} aoFechar={aoFechar} bloqueada={enviando} largura="max-w-2xl" rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-modelo" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Salvando…' : 'Salvar'}</button>
    </>}>
      <form id="form-modelo" onSubmit={enviar} noValidate className="space-y-4">
        <label className="block"><span className={ROTULO}>Nome *</span><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={120} placeholder="Ex.: Passagem de plantão" className={CAMPO} /></label>
        <label className="block"><span className={ROTULO}>Para que serve</span><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} maxLength={500} className={CAMPO} /></label>
        <label className="block"><span className={ROTULO}>Itens * (um por linha)</span>
          <textarea value={f.itens} onChange={(e) => setF({ ...f, itens: e.target.value })} rows={8} placeholder={'Conferir grades das camas\nCâmeras de todos os quartos com sinal\nPacientes de risco alto com cadeira higiênica'} className={CAMPO} />
        </label>
        <label className="block"><span className={ROTULO}>Frequência</span>
          <select value={f.frequencia} onChange={(e) => setF({ ...f, frequencia: e.target.value as Frequencia })} className={CAMPO}>{Object.entries(FREQUENCIAS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
        </label>
        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
          <span className="text-sm text-gray-900">Ativo</span>
          <Interruptor rotulo="Ativo" ligado={f.ativo} aoMudar={(v) => setF({ ...f, ativo: v })} />
        </div>
        {modelo && <p className="text-xs text-gray-600">Mudar os itens não altera execuções já registradas.</p>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

