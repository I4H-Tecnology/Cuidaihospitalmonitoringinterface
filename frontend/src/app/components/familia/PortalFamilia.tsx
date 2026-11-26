import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, HeartPulse, Loader2, LogOut, RefreshCw, ShieldCheck, VideoOff } from 'lucide-react';
import {
  ErroFamilia, aceitarTermo, buscarPainel, entrar, lerCodigoDaUrl, lerSessao, sairDaSessao, urlDoVideo,
  type PainelFamilia, type SessaoFamilia,
} from '../../data/familia';
import { quantoFalta } from '../../data/tempo';
import { AbasDoPortal } from './AbasDoPortal';

/**
 * Portal da família: o que o QR Code do acompanhante abre (`/familia#c=…`).
 *
 * Feito para o celular de quem não conhece o sistema: uma coisa por tela,
 * texto grande, nada de menu. Entrar → aceitar o termo (RN04) → ver a câmera
 * do quarto (RN06). A cada minuto confere se o acesso continua valendo; se a
 * clínica revogou ou deu alta, a tela diz isso e o vídeo some (RN07).
 */

type Etapa =
  | { tipo: 'codigo'; erro?: string }
  | { tipo: 'entrando' }
  | { tipo: 'painel'; sessao: SessaoFamilia; painel: PainelFamilia }
  | { tipo: 'encerrado'; motivo: string };

const INTERVALO_DE_CONFERENCIA_MS = 60_000;

export function PortalFamilia() {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'entrando' });

  const abrirPainel = useCallback(async (sessao: SessaoFamilia) => {
    try {
      setEtapa({ tipo: 'painel', sessao, painel: await buscarPainel(sessao.token) });
    } catch (err) {
      sairDaSessao();
      setEtapa(err instanceof ErroFamilia && err.status === 401
        ? { tipo: 'encerrado', motivo: err.message }
        : { tipo: 'codigo', erro: 'Não foi possível falar com a clínica agora. Tente de novo.' });
    }
  }, []);

  const usarCodigo = useCallback(async (codigo: string) => {
    setEtapa({ tipo: 'entrando' });
    try {
      await abrirPainel(await entrar(codigo));
    } catch (err) {
      setEtapa({ tipo: 'codigo', erro: err instanceof ErroFamilia ? err.message : 'Não foi possível entrar agora.' });
    }
  }, [abrirPainel]);

  useEffect(() => {
    document.title = 'MedSignal — Família';
    const codigo = lerCodigoDaUrl();
    // Tira o código da barra de endereço: não fica no histórico nem aparece
    // num print que o familiar mande para alguém.
    if (codigo) window.history.replaceState(null, '', window.location.pathname);
    const sessao = lerSessao();
    if (codigo) void usarCodigo(codigo);
    else if (sessao) void abrirPainel(sessao);
    else setEtapa({ tipo: 'codigo' });

    // Link do QR colado numa aba que já estava no portal: só o # muda, sem recarregar.
    const aoMudarHash = () => {
      const novo = lerCodigoDaUrl();
      if (!novo) return;
      window.history.replaceState(null, '', window.location.pathname);
      void usarCodigo(novo);
    };
    window.addEventListener('hashchange', aoMudarHash);
    return () => window.removeEventListener('hashchange', aoMudarHash);
  }, [usarCodigo, abrirPainel]);

  const sair = () => {
    sairDaSessao();
    setEtapa({ tipo: 'codigo' });
  };

  return (
    <div className="min-h-screen bg-fundo-app">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-marca to-marca-hover">
              <HeartPulse className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-medium text-marca-texto">MedSignal</p>
              <p className="text-xs text-gray-600">{etapa.tipo === 'painel' ? etapa.painel.clinicaNome : 'Acesso da família'}</p>
            </div>
          </div>
          {etapa.tipo === 'painel' && (
            <button type="button" onClick={sair} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {etapa.tipo === 'entrando' && (
          <p className="flex items-center justify-center gap-2 py-20 text-gray-700">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Abrindo o acesso…
          </p>
        )}
        {etapa.tipo === 'codigo' && <FormularioCodigo erro={etapa.erro} aoEnviar={usarCodigo} />}
        {etapa.tipo === 'encerrado' && <AcessoEncerrado motivo={etapa.motivo} aoTentarOutro={() => setEtapa({ tipo: 'codigo' })} />}
        {etapa.tipo === 'painel' && (
          <Painel
            sessao={etapa.sessao}
            painel={etapa.painel}
            aoAtualizar={(painel) => setEtapa({ tipo: 'painel', sessao: etapa.sessao, painel })}
            aoEncerrar={(motivo) => { sairDaSessao(); setEtapa({ tipo: 'encerrado', motivo }); }}
          />
        )}
      </main>
    </div>
  );
}

function FormularioCodigo({ erro, aoEnviar }: { erro?: string; aoEnviar: (codigo: string) => void }) {
  const [codigo, setCodigo] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (codigo.trim()) aoEnviar(codigo.trim()); }}
      className="rounded-2xl border border-gray-200 bg-white p-6"
    >
      <h1 className="text-xl text-gray-900">Acompanhar um paciente</h1>
      <p className="mt-2 text-base text-gray-700">
        Aponte a câmera do celular para o QR Code que a clínica mostrou. Se preferir, cole aqui o código do acesso.
      </p>
      {erro && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</p>}
      <label htmlFor="codigo-familia" className="mt-5 block text-sm font-medium text-gray-800">Código do acesso</label>
      <input
        id="codigo-familia"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva"
      />
      <button type="submit" disabled={!codigo.trim()} className="mt-4 w-full rounded-lg bg-marca px-4 py-3 text-base text-white hover:bg-marca-hover disabled:opacity-60">
        Entrar
      </button>
      <p className="mt-4 text-sm text-gray-600">O acesso é pessoal, temporário e mostra só a câmera do quarto do paciente.</p>
    </form>
  );
}

function AcessoEncerrado({ motivo, aoTentarOutro }: { motivo: string; aoTentarOutro: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
      <VideoOff className="mx-auto h-10 w-10 text-gray-500" aria-hidden="true" />
      <h1 className="mt-3 text-xl text-gray-900">Acesso encerrado</h1>
      <p className="mt-2 text-base text-gray-700">{motivo}</p>
      <p className="mt-2 text-sm text-gray-600">O acesso termina no prazo combinado, na alta do paciente ou quando a clínica encerra. Para continuar, peça um novo QR Code à equipe.</p>
      <button type="button" onClick={aoTentarOutro} className="mt-5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50">
        Usar outro código
      </button>
    </div>
  );
}

function Painel({ sessao, painel, aoAtualizar, aoEncerrar }: {
  sessao: SessaoFamilia; painel: PainelFamilia;
  aoAtualizar: (p: PainelFamilia) => void; aoEncerrar: (motivo: string) => void;
}) {
  // Confere o acesso de tempos em tempos: revogação e alta valem na hora.
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        aoAtualizar(await buscarPainel(sessao.token));
      } catch (err) {
        if (err instanceof ErroFamilia && err.status === 401) aoEncerrar(err.message);
      }
    }, INTERVALO_DE_CONFERENCIA_MS);
    return () => window.clearInterval(id);
  }, [sessao.token, aoAtualizar, aoEncerrar]);

  if (!painel.termoAceito) {
    return <Termo sessao={sessao} painel={painel} aoAceitar={async () => aoAtualizar(await buscarPainel(sessao.token))} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl text-gray-900">{painel.pacienteNome}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700">
          <span>{painel.ambienteNome ?? 'Quarto não informado'}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> Acesso vence {quantoFalta(painel.expiraEm)}</span>
        </p>
      </div>
      <AbasDoPortal
        sessao={sessao}
        camera={(
          <>
            <Video sessao={sessao} disponivel={painel.videoDisponivel} conectada={painel.cameraConectada} />
            <p className="flex items-start gap-2 text-sm text-gray-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Não grave nem compartilhe as imagens. Em caso de queda, a equipe já é avisada pelo sistema na hora.
            </p>
          </>
        )}
      />
    </div>
  );
}

function Termo({ sessao, painel, aoAceitar }: { sessao: SessaoFamilia; painel: PainelFamilia; aoAceitar: () => Promise<void> }) {
  const [concordo, setConcordo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aceitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await aceitarTermo(sessao.token, painel.termo.versao);
      await aoAceitar();
    } catch (err) {
      setErro(err instanceof ErroFamilia ? err.message : 'Não foi possível registrar o aceite.');
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={aceitar} className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-600">Olá, {painel.acompanhanteNome}.</p>
      <h1 className="mt-1 text-xl text-gray-900">Termo de confidencialidade</h1>
      <p className="mt-2 text-base text-gray-700">Antes de ver a câmera de {painel.pacienteNome}, leia e aceite:</p>
      <div className="mt-4 whitespace-pre-line rounded-lg bg-gray-50 p-4 text-sm leading-relaxed text-gray-800">{painel.termo.texto}</div>
      <label className="mt-5 flex items-start gap-3 text-base text-gray-900">
        <input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--marca)]" />
        Li e concordo com o termo.
      </label>
      {erro && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</p>}
      <button type="submit" disabled={!concordo || enviando} className="mt-5 w-full rounded-lg bg-marca px-4 py-3 text-base text-white hover:bg-marca-hover disabled:opacity-60">
        {enviando ? 'Registrando…' : 'Aceitar e ver a câmera'}
      </button>
      <p className="mt-3 text-xs text-gray-600">Versão {painel.termo.versao}. O aceite fica registrado com data, hora e endereço de rede.</p>
    </form>
  );
}

function Video({ sessao, disponivel, conectada }: { sessao: SessaoFamilia; disponivel: boolean; conectada: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const pedindo = useRef(false);

  const abrir = useCallback(async () => {
    if (pedindo.current) return;
    pedindo.current = true;
    setFalhou(false);
    try {
      setSrc(await urlDoVideo(sessao.token));
    } catch {
      setFalhou(true);
    } finally {
      pedindo.current = false;
    }
  }, [sessao.token]);

  useEffect(() => {
    if (disponivel) void abrir();
    else setSrc(null);
  }, [disponivel, abrir]);

  if (!disponivel) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl bg-gray-900 px-6 text-center">
        <VideoOff className="h-8 w-8 text-white/50" aria-hidden="true" />
        <p className="text-base text-white/90">{conectada ? 'O vídeo deste quarto não está disponível agora.' : 'A câmera do quarto está desligada ou sem sinal.'}</p>
        <p className="text-sm text-white/60">A tela tenta de novo sozinha a cada minuto.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gray-900">
      {src && !falhou ? (
        <img
          src={src}
          alt="Vídeo ao vivo do quarto do paciente"
          className="aspect-video w-full object-contain"
          onError={() => setFalhou(true)}
        />
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center">
          {falhou ? (
            <>
              <p className="text-base text-white/90">O vídeo caiu.</p>
              <button type="button" onClick={abrir} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar de novo
              </button>
            </>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-label="Carregando vídeo" />
          )}
        </div>
      )}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
        <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> Ao vivo
      </span>
    </div>
  );
}
