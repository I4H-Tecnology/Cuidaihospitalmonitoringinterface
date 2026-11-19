import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowLeft, Bot, CalendarDays, FileText, HeartHandshake, History, MessageCircle, MessageSquareText, Plus, Send, Smile, Stethoscope,
  Truck, UserRound, Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchPacientes, type PacienteResumo } from '../../data/api';
import {
  criarResposta, editarResposta, enviarMensagem, fetchConversas, fetchHistorico, fetchMensagens, fetchPerguntas, fetchRespostas,
  fetchSatisfacao, registrarSatisfacao, testarPergunta,
  type ItemHistorico, type Mensagem, type RespostaPronta,
} from '../../data/crm';
import { quandoFoi } from '../../data/tempo';
import { useAcao, useDados } from '../../data/useDados';
import { usePacientesInternados } from '../../data/usePacientes';
import type { PropsTela } from '../../telas';
import {
  AbasDeFiltro, Aviso, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, BotaoAtualizar, Busca, CAMPO, CabecalhoTela, Carregando, Etiqueta, Indicador,
  Interruptor, Janela, Painel, ROTULO, SeletorDias, Tela, Vazio,
} from '../settings/ui';

/** CRM Saúde, parte 2: o que envolve a família diretamente. */

const DICA = { backgroundColor: 'var(--grafico-dica)', border: '1px solid var(--grafico-grade)', borderRadius: 8, fontSize: 12 };
const EIXO = { stroke: 'var(--grafico-eixo)', fontSize: 11 };

/* ============================================================================
 * Mensagens
 * ========================================================================== */

export function MensagensScreen(_: PropsTela) {
  const { tenantId, can } = useAuth();
  const conversas = useDados((t) => fetchConversas(t), [], 30_000);
  const [aberta, setAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const lista = (conversas.dados ?? []).filter((c) => !busca.trim() || `${c.pacienteNome} ${c.ambienteNome ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const atual = conversas.dados?.find((c) => c.pacienteId === aberta) ?? null;
  const naoLidas = (conversas.dados ?? []).reduce((s, c) => s + c.naoLidas, 0);

  return (
    <Tela>
      <CabecalhoTela
        titulo="Mensagens"
        descricao="Conversa com as famílias que têm acesso ao portal. Responder rápido é o que mais pesa na satisfação delas."
        acoes={<BotaoAtualizar carregando={conversas.carregando} aoClicar={conversas.recarregar} />}
      />
      {conversas.erro && <Aviso tom="erro">{conversas.erro}</Aviso>}
      <div className="grid min-h-[32rem] grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className={`flex flex-col border-gray-200 lg:border-r ${aberta ? 'hidden lg:flex' : 'flex'}`} aria-label="Conversas">
          <div className="border-b border-gray-100 p-3">
            <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar paciente" />
            {naoLidas > 0 && <p className="mt-2 text-xs text-gray-700">{naoLidas} mensagem(ns) nova(s) da família</p>}
          </div>
          {!conversas.dados && conversas.carregando ? <div className="px-3"><Carregando /></div> : lista.length === 0 ? (
            <Vazio icone={MessageCircle} titulo="Nenhuma conversa" texto="Aparecem aqui os pacientes com acesso da família ativo ou com mensagens trocadas." />
          ) : (
            <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
              {lista.map((c) => (
                <li key={c.pacienteId}>
                  <button
                    type="button"
                    onClick={() => setAberta(c.pacienteId)}
                    aria-current={c.pacienteId === aberta ? 'true' : undefined}
                    className={`w-full px-4 py-3 text-left transition-colors ${c.pacienteId === aberta ? 'bg-marca-suave' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-sm ${c.naoLidas ? 'font-semibold text-gray-900' : 'text-gray-900'}`}>{c.pacienteNome}</p>
                      {c.naoLidas > 0 ? <span className="rounded-full bg-marca px-1.5 text-xs text-white">{c.naoLidas}</span> : c.ultimaEm && <span className="shrink-0 text-xs text-gray-600">{quandoFoi(c.ultimaEm)}</span>}
                    </div>
                    <p className="truncate text-xs text-gray-600">
                      {c.ultimaTexto ? `${c.ultimaAutor === 'equipe' ? 'Equipe: ' : ''}${c.ultimaTexto}` : `${c.acompanhantesAtivos} familiar(es) com acesso · sem mensagens`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className={`flex min-h-[32rem] flex-col ${aberta ? 'flex' : 'hidden lg:flex'}`}>
          {atual && tenantId ? (
            <Conversa
              key={atual.pacienteId}
              pacienteId={atual.pacienteId}
              titulo={atual.pacienteNome}
              subtitulo={`${atual.ambienteNome ?? 'Sem quarto'} · ${atual.acompanhantesAtivos} familiar(es) com acesso`}
              podeEscrever={can('crm', 'create')}
              aoVoltar={() => setAberta(null)}
              aoMudar={conversas.recarregar}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center"><Vazio icone={MessageSquareText} titulo="Escolha uma conversa" texto="As mensagens da família chegam pelo portal; a resposta aparece para ela na hora em que entrar." /></div>
          )}
        </section>
      </div>
    </Tela>
  );
}

function Conversa({ pacienteId, titulo, subtitulo, podeEscrever, aoVoltar, aoMudar }: {
  pacienteId: string; titulo: string; subtitulo: string; podeEscrever: boolean; aoVoltar: () => void; aoMudar: () => void;
}) {
  const { tenantId } = useAuth();
  const { dados, erro, setDados } = useDados((t) => fetchMensagens(t, pacienteId), [pacienteId], 15_000);
  const [texto, setTexto] = useState('');
  const { enviando, erro: erroEnvio, executar } = useAcao();
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [dados?.length]);
  // Abrir a conversa marca as mensagens da família como lidas: a lista atualiza o contador.
  useEffect(() => { if (dados) aoMudar(); }, [dados === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!texto.trim() || !tenantId) return;
    const nova = await executar(() => enviarMensagem(tenantId, pacienteId, texto.trim()));
    if (nova) {
      setDados((lista: Mensagem[] | null) => [...(lista ?? []), nova]);
      setTexto('');
      aoMudar();
    }
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <button type="button" onClick={aoVoltar} className="rounded-lg p-1 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="Voltar às conversas"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{titulo}</p>
          <p className="truncate text-xs text-gray-600">{subtitulo}</p>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-4" aria-live="polite">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {dados?.length === 0 && <p className="py-8 text-center text-sm text-gray-600">Nenhuma mensagem ainda. Uma boa primeira mensagem: como o paciente passou o dia.</p>}
        {dados?.map((m) => (
          <div key={m.id} className={`flex ${m.autor === 'equipe' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.autor === 'equipe' ? 'rounded-br-sm bg-marca text-white' : 'rounded-bl-sm border border-gray-200 bg-white text-gray-900'}`}>
              <p className="whitespace-pre-line break-words">{m.texto}</p>
              <p className={`mt-1 text-[11px] ${m.autor === 'equipe' ? 'text-white/80' : 'text-gray-600'}`}>
                {m.autorNome ?? (m.autor === 'familia' ? 'Família' : 'Equipe')} · {new Date(m.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {m.autor === 'equipe' && (m.lidaEm ? ' · lida' : ' · enviada')}
              </p>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>
      {podeEscrever ? (
        <form onSubmit={enviar} className="border-t border-gray-100 p-3">
          {erroEnvio && <div className="mb-2"><Aviso tom="erro">{erroEnvio}</Aviso></div>}
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="sr-only">Mensagem para a família</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
                rows={2}
                maxLength={2000}
                placeholder="Escreva para a família. Enter envia, Shift+Enter quebra a linha."
                className={CAMPO}
              />
            </label>
            <button type="submit" disabled={enviando || !texto.trim()} className={BOTAO_PRIMARIO} aria-label="Enviar"><Send className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <p className="mt-1 text-xs text-gray-600">Não envie diagnóstico por aqui sem o médico: para resultado de exame, use Comunicação de Exames.</p>
        </form>
      ) : <p className="border-t border-gray-100 p-3 text-xs text-gray-600">Seu perfil pode ler, mas não responder.</p>}
    </>
  );
}

/* ============================================================================
 * Respostas automáticas (o "chatbot" do portal)
 * ========================================================================== */

type AbaChatbot = 'respostas' | 'perguntas' | 'testar';

export function ChatbotScreen(_: PropsTela) {
  const { can } = useAuth();
  const [aba, setAba] = useState<AbaChatbot>('respostas');
  const respostas = useDados((t) => fetchRespostas(t));
  const perguntas = useDados((t) => fetchPerguntas(t));
  const [editando, setEditando] = useState<RespostaPronta | 'nova' | { pergunta: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const semResposta = (perguntas.dados ?? []).filter((p) => !p.respondidaCom);

  return (
    <Tela>
      <CabecalhoTela
        titulo="Respostas Automáticas"
        descricao="Perguntas frequentes que o portal da família responde sozinho, por palavra-chave. Não é IA: responde só o que a clínica escreveu aqui."
        acoes={can('crm', 'edit') && <button type="button" onClick={() => setEditando('nova')} className={BOTAO_PRIMARIO}><Plus className="h-4 w-4" aria-hidden="true" /> Nova resposta</button>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Respostas ativas" valor={(respostas.dados ?? []).filter((r) => r.ativa).length} />
        <Indicador rotulo="Vezes usadas" valor={(respostas.dados ?? []).reduce((s, r) => s + r.usos, 0)} />
        <Indicador rotulo="Perguntas recebidas" valor={perguntas.dados?.length ?? 0} detalhe="últimas 100" />
        <Indicador rotulo="Sem resposta" valor={semResposta.length} tom={semResposta.length ? 'atencao' : 'neutro'} detalhe="viram mensagem para a equipe" />
      </dl>
      <AbasDeFiltro rotulo="Seção" valor={aba} aoMudar={setAba} opcoes={[
        { valor: 'respostas', rotulo: 'Respostas', contagem: respostas.dados?.length ?? 0 },
        { valor: 'perguntas', rotulo: 'Perguntas das famílias', contagem: semResposta.length },
        { valor: 'testar', rotulo: 'Testar' },
      ]} />

      {aba === 'respostas' && (
        respostas.erro ? <Aviso tom="erro">{respostas.erro}</Aviso> : !respostas.dados ? <Carregando /> : respostas.dados.length === 0 ? (
          <Painel><Vazio icone={Bot} titulo="Nenhuma resposta cadastrada" texto="Comece pelas dúvidas que o telefone mais recebe: horário de visita, o que levar, como falar com o médico." /></Painel>
        ) : (
          <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {respostas.dados.map((r) => (
              <li key={r.id} className={`rounded-xl border bg-white p-5 ${r.ativa ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-80'}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">{r.pergunta}</p>
                  {!r.ativa && <Etiqueta classe="bg-gray-100 text-gray-700">Desativada</Etiqueta>}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{r.resposta}</p>
                <div className="mt-3 flex flex-wrap gap-1">{r.palavrasChave.map((p) => <Etiqueta key={p} classe="bg-gray-100 text-gray-700">{p}</Etiqueta>)}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                  <span>Usada {r.usos} vez(es)</span>
                  {can('crm', 'edit') && <button type="button" onClick={() => setEditando(r)} className="text-sm text-marca-texto hover:underline">Editar</button>}
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {aba === 'perguntas' && (
        <Painel semPadding>
          {!perguntas.dados ? <div className="px-4"><Carregando /></div> : perguntas.dados.length === 0 ? (
            <Vazio icone={MessageCircle} titulo="Nenhuma pergunta recebida ainda" texto="As dúvidas que as famílias digitam no portal aparecem aqui." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {perguntas.dados.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">“{p.texto}”</p>
                    <p className="text-xs text-gray-600">{quandoFoi(p.criadoEm)} · {p.respondidaCom ? `respondida com: ${p.respondidaCom}` : 'ficou sem resposta'}</p>
                  </div>
                  {!p.respondidaCom && can('crm', 'edit') && (
                    <button type="button" onClick={() => setEditando({ pergunta: p.texto })} className={`${BOTAO_SECUNDARIO} px-3 py-1.5`}>Criar resposta</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Painel>
      )}

      {aba === 'testar' && <TestarResposta />}

      {editando && (
        <FormularioResposta
          resposta={typeof editando === 'object' && 'id' in editando ? editando : null}
          perguntaInicial={typeof editando === 'object' && !('id' in editando) ? editando.pergunta : ''}
          aoFechar={() => setEditando(null)}
          aoSalvar={(m) => { setEditando(null); setAviso(m); void respostas.recarregar(); }}
        />
      )}
    </Tela>
  );
}

function TestarResposta() {
  const { tenantId } = useAuth();
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<{ resposta: string | null; pergunta: string | null } | null>(null);
  const { enviando, erro, executar } = useAcao();
  return (
    <Painel titulo="Como a família veria" descricao="Digite uma pergunta como a família escreveria. Nada é registrado.">
      <form onSubmit={async (e) => { e.preventDefault(); if (tenantId && texto.trim()) setResultado((await executar(() => testarPergunta(tenantId, texto.trim()))) ?? null); }} className="flex gap-2">
        <label className="flex-1"><span className="sr-only">Pergunta de teste</span><input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: que horas posso visitar?" className={CAMPO} /></label>
        <button type="submit" disabled={enviando || !texto.trim()} className={BOTAO_PRIMARIO}>Testar</button>
      </form>
      {erro && <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div>}
      {resultado && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          {resultado.resposta ? (
            <>
              <p className="text-xs text-gray-600">Responderia com “{resultado.pergunta}”:</p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-900">{resultado.resposta}</p>
            </>
          ) : <p className="text-sm text-gray-700">Nenhuma resposta casa com essa pergunta. A família veria a sugestão de mandar mensagem para a equipe.</p>}
        </div>
      )}
    </Painel>
  );
}

function FormularioResposta({ resposta, perguntaInicial, aoFechar, aoSalvar }: {
  resposta: RespostaPronta | null; perguntaInicial: string; aoFechar: () => void; aoSalvar: (m: string) => void;
}) {
  const { tenantId } = useAuth();
  const { enviando, erro, setErro, executar } = useAcao();
  const [f, setF] = useState({
    pergunta: resposta?.pergunta ?? perguntaInicial,
    palavras: resposta?.palavrasChave.join(', ') ?? '',
    resposta: resposta?.resposta ?? '',
    ativa: resposta?.ativa ?? true,
  });
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const palavras = f.palavras.split(',').map((p) => p.trim()).filter(Boolean);
    if (f.pergunta.trim().length < 3) return setErro('Escreva a pergunta como a família faria.');
    if (palavras.length === 0) return setErro('Informe pelo menos uma palavra-chave.');
    if (f.resposta.trim().length < 3) return setErro('Escreva a resposta.');
    if (!tenantId) return;
    const dados = { pergunta: f.pergunta.trim(), palavrasChave: palavras, resposta: f.resposta.trim(), ativa: f.ativa };
    const ok = await executar(() => (resposta ? editarResposta(tenantId, resposta.id, dados) : criarResposta(tenantId, dados)));
    if (ok) aoSalvar(resposta ? 'Resposta atualizada.' : 'Resposta criada. O portal já usa.');
  };
  return (
    <Janela titulo={resposta ? 'Editar resposta' : 'Nova resposta'} aoFechar={aoFechar} bloqueada={enviando} largura="max-w-2xl" rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-resposta" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Salvando…' : 'Salvar'}</button>
    </>}>
      <form id="form-resposta" onSubmit={enviar} noValidate className="space-y-4">
        <label className="block"><span className={ROTULO}>Pergunta *</span><input value={f.pergunta} onChange={(e) => setF({ ...f, pergunta: e.target.value })} maxLength={200} placeholder="Ex.: Qual o horário de visita?" className={CAMPO} /></label>
        <label className="block"><span className={ROTULO}>Palavras-chave *</span>
          <input value={f.palavras} onChange={(e) => setF({ ...f, palavras: e.target.value })} placeholder="visita, visitar, horário" className={CAMPO} />
          <span className="mt-1 block text-xs text-gray-600">Separadas por vírgula. Acento e maiúscula não importam. Ganha a resposta com mais palavras presentes na pergunta.</span>
        </label>
        <label className="block"><span className={ROTULO}>Resposta *</span><textarea value={f.resposta} onChange={(e) => setF({ ...f, resposta: e.target.value })} rows={4} maxLength={2000} className={CAMPO} /></label>
        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
          <span className="text-sm text-gray-900">Ativa no portal</span>
          <Interruptor rotulo="Ativa no portal" ligado={f.ativa} aoMudar={(v) => setF({ ...f, ativa: v })} />
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

/* ============================================================================
 * Histórico de atendimento
 * ========================================================================== */

const ICONE_HISTORICO: Record<ItemHistorico['tipo'], { Icone: typeof History; cor: string; rotulo: string }> = {
  mensagem: { Icone: MessageCircle, cor: 'bg-blue-100 text-blue-700', rotulo: 'Mensagens' },
  exame: { Icone: FileText, cor: 'bg-purple-100 text-purple-700', rotulo: 'Exames' },
  agenda: { Icone: CalendarDays, cor: 'bg-sky-100 text-sky-700', rotulo: 'Agenda' },
  satisfacao: { Icone: Smile, cor: 'bg-green-100 text-green-700', rotulo: 'Avaliações' },
  familia: { Icone: Users, cor: 'bg-amber-100 text-amber-800', rotulo: 'Acesso da família' },
  movimentacao: { Icone: Truck, cor: 'bg-gray-100 text-gray-700', rotulo: 'Movimentação' },
  ocorrencia: { Icone: Stethoscope, cor: 'bg-red-100 text-red-700', rotulo: 'Ocorrências' },
};

export function HistoricoAtendimentoScreen(_: PropsTela) {
  const { dados: pacientes } = useDados<PacienteResumo[]>((t) => fetchPacientes(t, true));
  const [pacienteId, setPacienteId] = useState('');
  const [busca, setBusca] = useState('');
  const [tipos, setTipos] = useState<Set<ItemHistorico['tipo']>>(new Set());
  const historico = useDados((t) => (pacienteId ? fetchHistorico(t, pacienteId) : Promise.resolve([] as ItemHistorico[])), [pacienteId]);
  const filtrados = (pacientes ?? []).filter((p) => !busca.trim() || p.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const itens = (historico.dados ?? []).filter((i) => tipos.size === 0 || tipos.has(i.tipo));
  const porDia = useMemo(() => {
    const grupos: { dia: string; itens: ItemHistorico[] }[] = [];
    for (const i of itens) {
      const dia = i.quando ? new Date(i.quando).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sem data';
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dia === dia) ultimo.itens.push(i); else grupos.push({ dia, itens: [i] });
    }
    return grupos;
  }, [itens]);
  const paciente = pacientes?.find((p) => p.id === pacienteId);

  return (
    <Tela>
      <CabecalhoTela titulo="Histórico de Atendimento" descricao="Tudo o que aconteceu com o paciente e a família, num lugar só: mensagens, exames, agenda, acessos, movimentações e ocorrências." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-gray-200 bg-white" aria-label="Pacientes">
          <div className="border-b border-gray-100 p-3"><Busca valor={busca} aoMudar={setBusca} placeholder="Buscar paciente" /></div>
          <ul className="max-h-[32rem] divide-y divide-gray-100 overflow-y-auto">
            {filtrados.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setPacienteId(p.id)} aria-current={p.id === pacienteId ? 'true' : undefined}
                  className={`w-full px-4 py-2.5 text-left text-sm ${p.id === pacienteId ? 'bg-marca-suave font-medium text-marca-texto' : 'text-gray-800 hover:bg-gray-50'}`}>
                  {p.nome}
                  <span className="block text-xs font-normal text-gray-600">{p.status === 'internado' ? p.ambienteNome ?? 'Internado' : 'Alta'}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="space-y-4">
          {!pacienteId ? (
            <Painel><Vazio icone={History} titulo="Escolha um paciente" texto="O histórico junta o que está espalhado pelas telas de CRM, prontuário e monitoramento." /></Painel>
          ) : (
            <>
              <Painel>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-sm font-medium text-gray-900"><UserRound className="mr-1 inline h-4 w-4" aria-hidden="true" />{paciente?.nome}</p>
                  {(Object.keys(ICONE_HISTORICO) as ItemHistorico['tipo'][]).map((t) => {
                    const ativo = tipos.has(t);
                    return (
                      <button key={t} type="button" aria-pressed={ativo}
                        onClick={() => { const n = new Set(tipos); if (ativo) n.delete(t); else n.add(t); setTipos(n); }}
                        className={`rounded-full border px-2.5 py-1 text-xs ${ativo ? 'border-marca bg-marca-suave text-marca-texto' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                        {ICONE_HISTORICO[t].rotulo}
                      </button>
                    );
                  })}
                </div>
              </Painel>
              {historico.erro && <Aviso tom="erro">{historico.erro}</Aviso>}
              {historico.carregando && !historico.dados?.length ? <Carregando /> : itens.length === 0 ? (
                <Painel><Vazio icone={History} titulo="Nada registrado" texto={tipos.size ? 'Nenhum item desses tipos.' : 'Ainda não há interações registradas para este paciente.'} /></Painel>
              ) : porDia.map((g) => (
                <section key={g.dia}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{g.dia}</h2>
                  <ol className="space-y-2">
                    {g.itens.map((i, k) => {
                      const { Icone, cor } = ICONE_HISTORICO[i.tipo];
                      return (
                        <li key={k} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cor}`}><Icone className="h-4 w-4" aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900">{i.titulo}</p>
                            {i.detalhe && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-gray-700">{i.detalhe}</p>}
                            <p className="mt-0.5 text-xs text-gray-600">{i.quando ? new Date(i.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}{i.quem && ` · ${i.quem}`}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </Tela>
  );
}

/* ============================================================================
 * NPS / Satisfação
 * ========================================================================== */

const corDaNota = (n: number) => (n >= 9 ? '#15803d' : n >= 7 ? '#a16207' : '#c81e1e');

export function NpsScreen(_: PropsTela) {
  const { can } = useAuth();
  const [dias, setDias] = useState(90);
  const { dados: s, carregando, erro, recarregar } = useDados((t) => fetchSatisfacao(t, dias), [dias]);
  const [registrar, setRegistrar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const faixa = s?.nps == null ? null : s.nps >= 75 ? 'Excelência' : s.nps >= 50 ? 'Qualidade' : s.nps >= 0 ? 'Aperfeiçoamento' : 'Crítica';

  return (
    <Tela>
      <CabecalhoTela
        titulo="NPS / Satisfação"
        descricao="De 0 a 10, o quanto as famílias recomendariam a clínica. Vem do portal ou é registrado pela equipe."
        acoes={<>
          <SeletorDias valor={dias} aoMudar={setDias} opcoes={[90, 180, 365]} />
          {can('crm', 'create') && <button type="button" onClick={() => setRegistrar(true)} className={BOTAO_PRIMARIO}><Plus className="h-4 w-4" aria-hidden="true" /> Registrar resposta</button>}
        </>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!s && carregando && <Carregando />}
      {s && (s.total === 0 ? (
        <Painel><Vazio icone={HeartHandshake} titulo="Nenhuma resposta no período" texto="As famílias avaliam pelo portal; respostas por telefone ou formulário em papel podem ser registradas aqui." /></Painel>
      ) : (
        <>
          {s.total < 10 && <Aviso>Só {s.total} resposta(s): o NPS ainda oscila muito. Ele fica estável a partir de umas 30.</Aviso>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-600">NPS</p>
              <p className="mt-1 text-5xl text-gray-900">{s.nps}</p>
              <p className="text-sm text-gray-700">Zona de {faixa}</p>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`${s.promotores} promotores, ${s.neutros} neutros, ${s.detratores} detratores`}>
                <div style={{ width: `${(100 * s.promotores) / s.total}%`, backgroundColor: '#15803d' }} />
                <div style={{ width: `${(100 * s.neutros) / s.total}%`, backgroundColor: '#a16207' }} />
                <div style={{ width: `${(100 * s.detratores) / s.total}%`, backgroundColor: '#c81e1e' }} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div><dt className="text-gray-600">Promotores (9–10)</dt><dd className="text-base text-gray-900">{s.promotores}</dd></div>
                <div><dt className="text-gray-600">Neutros (7–8)</dt><dd className="text-base text-gray-900">{s.neutros}</dd></div>
                <div><dt className="text-gray-600">Detratores (0–6)</dt><dd className="text-base text-gray-900">{s.detratores}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-gray-600">NPS = % promotores − % detratores. {s.total} resposta(s).</p>
            </div>
            <Painel titulo="Distribuição das notas">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.distribuicao.map((n, nota) => ({ nota: String(nota), n }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" vertical={false} />
                    <XAxis dataKey="nota" {...EIXO} />
                    <YAxis {...EIXO} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={DICA} formatter={(v) => [v, 'respostas']} />
                    <Bar dataKey="n" radius={[4, 4, 0, 0]}>{s.distribuicao.map((_, nota) => <Cell key={nota} fill={corDaNota(nota)} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Painel>
          </div>
          {s.porMes.length > 1 && (
            <Painel titulo="NPS por mês">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={s.porMes.map((m) => ({ ...m, rotulo: m.mes.split('-').reverse().join('/') }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" vertical={false} />
                    <XAxis dataKey="rotulo" {...EIXO} />
                    <YAxis {...EIXO} domain={[-100, 100]} width={36} />
                    <Tooltip contentStyle={DICA} formatter={(v, _n, item) => [`${v} (${(item.payload as { total: number }).total} resp.)`, 'NPS']} />
                    <Line dataKey="nps" stroke="var(--marca-viva)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Painel>
          )}
          <Painel titulo="O que disseram" semPadding>
            <ul className="divide-y divide-gray-100">
              {s.respostas.map((r) => (
                <li key={r.id} className="flex gap-4 px-5 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white" style={{ backgroundColor: corDaNota(r.nota) }}>{r.nota}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{r.comentario ?? <span className="text-gray-600">Sem comentário</span>}</p>
                    <p className="text-xs text-gray-600">
                      {r.acompanhanteNome ?? (r.registradoPorNome ? `registrado por ${r.registradoPorNome}` : 'Família')}{r.pacienteNome && ` · ${r.pacienteNome}`} · {r.canal} · {quandoFoi(r.criadoEm)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Painel>
        </>
      ))}
      {registrar && <RegistrarResposta aoFechar={() => setRegistrar(false)} aoSalvar={() => { setRegistrar(false); setAviso('Resposta registrada.'); void recarregar(); }} />}
    </Tela>
  );
}

function RegistrarResposta({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: () => void }) {
  const { tenantId } = useAuth();
  const pacientes = usePacientesInternados();
  const { enviando, erro, setErro, executar } = useAcao();
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [canal, setCanal] = useState<'telefone' | 'presencial' | 'formulario'>('telefone');
  const [pacienteId, setPacienteId] = useState('');
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nota == null) return setErro('Escolha a nota.');
    if (!tenantId) return;
    if (await executar(() => registrarSatisfacao(tenantId, { nota, comentario: comentario.trim() || undefined, canal, pacienteId: pacienteId || undefined }))) aoSalvar();
  };
  return (
    <Janela titulo="Registrar resposta de satisfação" descricao="Para respostas colhidas por telefone, pessoalmente ou em formulário de papel." aoFechar={aoFechar} bloqueada={enviando} rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-nps" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Salvando…' : 'Registrar'}</button>
    </>}>
      <form id="form-nps" onSubmit={enviar} noValidate className="space-y-4">
        <fieldset>
          <legend className={ROTULO}>De 0 a 10, o quanto recomendaria a clínica? *</legend>
          <div className="grid grid-cols-11 gap-1" role="radiogroup">
            {Array.from({ length: 11 }, (_, n) => (
              <button key={n} type="button" role="radio" aria-checked={nota === n} onClick={() => setNota(n)}
                className={`rounded-lg border py-2 text-sm ${nota === n ? 'border-transparent text-white' : 'border-gray-300 text-gray-800 hover:bg-gray-50'}`}
                style={nota === n ? { backgroundColor: corDaNota(n) } : undefined}>{n}</button>
            ))}
          </div>
        </fieldset>
        <label className="block"><span className={ROTULO}>Comentário</span><textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} maxLength={1000} className={CAMPO} /></label>
        <div className="grid grid-cols-2 gap-4">
          <label><span className={ROTULO}>Canal</span>
            <select value={canal} onChange={(e) => setCanal(e.target.value as typeof canal)} className={CAMPO}>
              <option value="telefone">Telefone</option><option value="presencial">Presencial</option><option value="formulario">Formulário</option>
            </select>
          </label>
          <label><span className={ROTULO}>Paciente</span>
            <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className={CAMPO}>
              <option value="">Não informar</option>{pacientes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}
