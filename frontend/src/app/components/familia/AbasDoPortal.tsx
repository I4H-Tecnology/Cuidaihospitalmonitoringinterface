import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileText, HelpCircle, MessageCircle, Send, Star, Video } from 'lucide-react';
import {
  ErroFamilia, avaliar, buscarExames, buscarExtras, buscarMensagens, buscarSugestoes, confirmarExame, enviarMensagemFamilia, perguntar,
  type ExameFamilia, type ExtrasFamilia, type MensagemFamilia, type SessaoFamilia,
} from '../../data/familia';

/**
 * Abas do portal da família depois do termo aceito: câmera, mensagens com a
 * equipe, dúvidas (respostas prontas da clínica), exames comunicados e a
 * avaliação. Texto grande e uma coisa por aba: quem usa é o familiar no
 * celular, muitas vezes idoso também.
 */

type Aba = 'camera' | 'mensagens' | 'duvidas' | 'exames' | 'avaliar';

export function AbasDoPortal({ sessao, camera }: { sessao: SessaoFamilia; camera: React.ReactNode }) {
  const [aba, setAba] = useState<Aba>('camera');
  const [extras, setExtras] = useState<ExtrasFamilia | null>(null);
  const atualizarExtras = useCallback(() => { buscarExtras(sessao.token).then(setExtras).catch(() => undefined); }, [sessao.token]);
  useEffect(() => {
    atualizarExtras();
    const id = window.setInterval(atualizarExtras, 30_000);
    return () => window.clearInterval(id);
  }, [atualizarExtras]);

  const abas: { id: Aba; rotulo: string; Icone: typeof Video; contagem?: number }[] = [
    { id: 'camera', rotulo: 'Câmera', Icone: Video },
    { id: 'mensagens', rotulo: 'Mensagens', Icone: MessageCircle, contagem: extras?.mensagensNovas },
    { id: 'duvidas', rotulo: 'Dúvidas', Icone: HelpCircle },
    { id: 'exames', rotulo: 'Exames', Icone: FileText, contagem: extras?.examesPendentes },
    { id: 'avaliar', rotulo: 'Avaliar', Icone: Star },
  ];

  return (
    <div className="space-y-4">
      <nav aria-label="Seções do portal" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {abas.map(({ id, rotulo, Icone, contagem }) => (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => setAba(id)}
                aria-current={aba === id ? 'page' : undefined}
                className={`relative flex w-full min-w-[4.5rem] flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-xs ${aba === id ? 'bg-marca text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Icone className="h-5 w-5" aria-hidden="true" />
                {rotulo}
                {!!contagem && <span className="absolute right-1.5 top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{contagem}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {aba === 'camera' && camera}
      {aba === 'mensagens' && <Mensagens sessao={sessao} aoLer={atualizarExtras} />}
      {aba === 'duvidas' && <Duvidas sessao={sessao} aoIrParaMensagens={() => setAba('mensagens')} />}
      {aba === 'exames' && <Exames sessao={sessao} aoConfirmar={atualizarExtras} />}
      {aba === 'avaliar' && <Avaliar sessao={sessao} jaAvaliouEm={extras?.avaliouEm ?? null} aoAvaliar={atualizarExtras} />}
    </div>
  );
}

const caixa = 'rounded-2xl border border-gray-200 bg-white p-5';
const erroCaixa = 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800';

function Mensagens({ sessao, aoLer }: { sessao: SessaoFamilia; aoLer: () => void }) {
  const [lista, setLista] = useState<MensagemFamilia[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const carregar = useCallback(async () => {
    try { setLista(await buscarMensagens(sessao.token)); aoLer(); } catch { /* a próxima volta tenta de novo */ }
  }, [sessao.token, aoLer]);
  useEffect(() => { carregar(); const id = window.setInterval(carregar, 20_000); return () => window.clearInterval(id); }, [carregar]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [lista?.length]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setErro(null);
    try { await enviarMensagemFamilia(sessao.token, texto.trim()); setTexto(''); await carregar(); }
    catch (err) { setErro(err instanceof ErroFamilia ? err.message : 'Não foi possível enviar.'); }
    finally { setEnviando(false); }
  };

  return (
    <div className={caixa}>
      <h2 className="text-lg text-gray-900">Fale com a equipe</h2>
      <p className="mt-1 text-sm text-gray-600">A equipe responde assim que puder. Para urgência, ligue para a clínica.</p>
      <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto" aria-live="polite">
        {lista === null && <p className="text-sm text-gray-600">Carregando…</p>}
        {lista?.length === 0 && <p className="text-sm text-gray-600">Nenhuma mensagem ainda.</p>}
        {lista?.map((m) => (
          <div key={m.id} className={`flex ${m.autor === 'familia' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-base ${m.autor === 'familia' ? 'rounded-br-sm bg-marca text-white' : 'rounded-bl-sm bg-gray-100 text-gray-900'}`}>
              <p className="whitespace-pre-line break-words">{m.texto}</p>
              <p className={`mt-1 text-xs ${m.autor === 'familia' ? 'text-white/80' : 'text-gray-600'}`}>{m.autor === 'equipe' ? `${m.autorNome ?? 'Equipe'} · ` : ''}{new Date(m.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <form onSubmit={enviar} className="mt-4 flex items-end gap-2">
        <label className="flex-1"><span className="sr-only">Sua mensagem</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} placeholder="Escreva sua mensagem" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-marca-viva" />
        </label>
        <button type="submit" disabled={enviando || !texto.trim()} className="flex h-12 w-12 items-center justify-center rounded-lg bg-marca text-white hover:bg-marca-hover disabled:opacity-60" aria-label="Enviar"><Send className="h-5 w-5" /></button>
      </form>
      {erro && <p role="alert" className={`mt-3 ${erroCaixa}`}>{erro}</p>}
    </div>
  );
}

function Duvidas({ sessao, aoIrParaMensagens }: { sessao: SessaoFamilia; aoIrParaMensagens: () => void }) {
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [conversa, setConversa] = useState<{ pergunta: string; resposta: string | null }[]>([]);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { buscarSugestoes(sessao.token).then(setSugestoes).catch(() => undefined); }, [sessao.token]);

  const perguntarAgora = async (q: string) => {
    if (!q.trim()) return;
    setEnviando(true);
    try {
      const r = await perguntar(sessao.token, q.trim());
      setConversa((c) => [...c, { pergunta: q.trim(), resposta: r.resposta }]);
      setTexto('');
    } catch {
      setConversa((c) => [...c, { pergunta: q.trim(), resposta: null }]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={caixa}>
      <h2 className="text-lg text-gray-900">Dúvidas frequentes</h2>
      <p className="mt-1 text-sm text-gray-600">Respostas que a clínica preparou. Se não achar a sua, mande uma mensagem para a equipe.</p>
      {sugestoes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sugestoes.map((s) => <button key={s} type="button" onClick={() => perguntarAgora(s)} className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">{s}</button>)}
        </div>
      )}
      <div className="mt-4 space-y-4" aria-live="polite">
        {conversa.map((c, i) => (
          <div key={i} className="space-y-2">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-marca px-4 py-2.5 text-base text-white">{c.pergunta}</p>
            {c.resposta ? (
              <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-base text-gray-900">{c.resposta}</p>
            ) : (
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5 text-base text-gray-900">
                Não encontrei uma resposta pronta para isso.{' '}
                <button type="button" onClick={aoIrParaMensagens} className="font-medium text-marca-texto underline">Pergunte à equipe</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); perguntarAgora(texto); }} className="mt-4 flex gap-2">
        <label className="flex-1"><span className="sr-only">Sua dúvida</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="Ex.: qual o horário de visita?" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-marca-viva" />
        </label>
        <button type="submit" disabled={enviando || !texto.trim()} className="rounded-lg bg-marca px-4 text-base text-white hover:bg-marca-hover disabled:opacity-60">Perguntar</button>
      </form>
    </div>
  );
}

function Exames({ sessao, aoConfirmar }: { sessao: SessaoFamilia; aoConfirmar: () => void }) {
  const [lista, setLista] = useState<ExameFamilia[] | null>(null);
  const carregar = useCallback(() => { buscarExames(sessao.token).then(setLista).catch(() => setLista([])); }, [sessao.token]);
  useEffect(() => { carregar(); }, [carregar]);
  return (
    <div className={caixa}>
      <h2 className="text-lg text-gray-900">Resultados de exames</h2>
      <p className="mt-1 text-sm text-gray-600">Os que a equipe enviou para você por aqui. Dúvida sobre um resultado: mande uma mensagem.</p>
      <ul className="mt-4 space-y-3">
        {lista === null && <li className="text-sm text-gray-600">Carregando…</li>}
        {lista?.length === 0 && <li className="text-sm text-gray-600">Nenhum resultado enviado ainda.</li>}
        {lista?.map((e) => (
          <li key={e.id} className="rounded-xl border border-gray-200 p-4">
            <p className="text-base font-medium text-gray-900">{e.exame}</p>
            <p className="text-sm text-gray-600">Exame de {e.dataExame.split('-').reverse().join('/')}</p>
            <p className="mt-2 whitespace-pre-line text-base text-gray-800">{e.resultado}</p>
            {e.cienciaEm ? (
              <p className="mt-3 flex items-center gap-1 text-sm text-green-700"><Check className="h-4 w-4" aria-hidden="true" /> Você confirmou a leitura</p>
            ) : (
              <button type="button" onClick={async () => { await confirmarExame(sessao.token, e.id).catch(() => undefined); carregar(); aoConfirmar(); }} className="mt-3 w-full rounded-lg bg-marca px-4 py-2.5 text-base text-white hover:bg-marca-hover">Li e entendi</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Avaliar({ sessao, jaAvaliouEm, aoAvaliar }: { sessao: SessaoFamilia; jaAvaliouEm: string | null; aoAvaliar: () => void }) {
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [estado, setEstado] = useState<'aberto' | 'enviando' | 'feito'>('aberto');
  const [erro, setErro] = useState<string | null>(null);
  const recente = jaAvaliouEm && Date.now() - new Date(jaAvaliouEm).getTime() < 7 * 86400000;

  if (estado === 'feito' || recente) {
    return (
      <div className={`${caixa} text-center`}>
        <Star className="mx-auto h-10 w-10 text-marca-texto" aria-hidden="true" />
        <p className="mt-3 text-lg text-gray-900">Obrigado pela avaliação!</p>
        <p className="mt-1 text-sm text-gray-600">Ela ajuda a clínica a cuidar melhor. Você pode avaliar de novo daqui a uma semana.</p>
      </div>
    );
  }

  return (
    <form
      className={caixa}
      onSubmit={async (e) => {
        e.preventDefault();
        if (nota == null) return;
        setEstado('enviando');
        setErro(null);
        try { await avaliar(sessao.token, nota, comentario.trim() || undefined); setEstado('feito'); aoAvaliar(); }
        catch (err) { setErro(err instanceof ErroFamilia ? err.message : 'Não foi possível enviar.'); setEstado('aberto'); }
      }}
    >
      <h2 className="text-lg text-gray-900">Como está sendo o cuidado?</h2>
      <fieldset className="mt-4">
        <legend className="text-base text-gray-800">De 0 a 10, o quanto você recomendaria esta clínica a um amigo ou parente?</legend>
        <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-11" role="radiogroup">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" role="radio" aria-checked={nota === n} onClick={() => setNota(n)}
              className={`h-12 rounded-lg border text-base ${nota === n ? 'border-marca bg-marca text-white' : 'border-gray-300 text-gray-900 hover:bg-gray-50'}`}>{n}</button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-600"><span>Nada provável</span><span>Muito provável</span></div>
      </fieldset>
      <label className="mt-4 block"><span className="text-base text-gray-800">Quer contar o porquê? (opcional)</span>
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} maxLength={1000} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-marca-viva" />
      </label>
      {erro && <p role="alert" className={`mt-3 ${erroCaixa}`}>{erro}</p>}
      <button type="submit" disabled={nota == null || estado === 'enviando'} className="mt-4 w-full rounded-lg bg-marca px-4 py-3 text-base text-white hover:bg-marca-hover disabled:opacity-60">
        {estado === 'enviando' ? 'Enviando…' : 'Enviar avaliação'}
      </button>
    </form>
  );
}
