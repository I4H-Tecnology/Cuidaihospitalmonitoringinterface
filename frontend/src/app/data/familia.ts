import { API_BASE_URL } from './api';

/**
 * Cliente do portal da família (`/familia`). Separado de `api.ts` de
 * propósito: lá cada chamada leva o token da equipe e um 401 derruba a sessão
 * do profissional. Aqui a sessão é outra (do acompanhante), mora no
 * sessionStorage — fecha a aba, acabou — e nunca encosta na da equipe.
 */

const CHAVE_SESSAO = 'medsignal-familia';

export interface SessaoFamilia {
  token: string;
  expiraEm: string;
}

export interface PainelFamilia {
  acompanhanteNome: string;
  pacienteNome: string;
  ambienteNome: string | null;
  clinicaNome: string;
  expiraEm: string;
  termo: { versao: string; texto: string };
  termoAceito: boolean;
  cameraConectada: boolean;
  videoDisponivel: boolean;
}

export class ErroFamilia extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Endereço que o QR Code abre. O código vai no #, que o navegador não manda ao servidor. */
export function urlDoPortalDaFamilia(codigo: string): string {
  return `${window.location.origin}/familia#c=${encodeURIComponent(codigo)}`;
}

export function lerCodigoDaUrl(): string | null {
  const codigo = new URLSearchParams(window.location.hash.slice(1)).get('c');
  return codigo ? codigo.trim() : null;
}

export function lerSessao(): SessaoFamilia | null {
  try {
    const sessao = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) ?? 'null') as SessaoFamilia | null;
    return sessao && new Date(sessao.expiraEm).getTime() > Date.now() ? sessao : null;
  } catch {
    return null;
  }
}

export function sairDaSessao(): void {
  try {
    sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {
    // nada a limpar
  }
}

async function chamar<T>(caminho: string, opcoes: RequestInit = {}, token?: string): Promise<T> {
  const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    // A API devolve { error } (handler de app/main.py); { detail } é o padrão
    // do FastAPI quando o handler não pega, como no 422 de validação.
    const mensagem = typeof corpo.error === 'string' ? corpo.error : typeof corpo.detail === 'string' ? corpo.detail : null;
    throw new ErroFamilia(mensagem ?? 'Não foi possível falar com a clínica agora.', resposta.status);
  }
  return corpo as T;
}

export async function entrar(codigo: string): Promise<SessaoFamilia> {
  const sessao = await chamar<SessaoFamilia>('/api/familia/entrar', { method: 'POST', body: JSON.stringify({ codigo }) });
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch {
    // sem storage a sessão vale até recarregar
  }
  return sessao;
}

export const buscarPainel = (token: string) => chamar<PainelFamilia>('/api/familia/painel', {}, token);

export const aceitarTermo = (token: string, versao: string) =>
  chamar<{ ok: boolean }>('/api/familia/termo', { method: 'POST', body: JSON.stringify({ versao }) }, token);

/** URL do vídeo com um ingresso de 30 s (a <img> não manda cabeçalho de autorização). */
export async function urlDoVideo(token: string): Promise<string> {
  const { ingresso } = await chamar<{ ingresso: string }>('/api/familia/video/ingresso', { method: 'POST' }, token);
  return `${API_BASE_URL}/api/familia/video?ingresso=${encodeURIComponent(ingresso)}`;
}

/* ---- abas do portal (26/10/2026) ------------------------------------------- */

export interface ExtrasFamilia {
  mensagensNovas: number;
  examesPendentes: number;
  avaliouEm: string | null;
}

export interface MensagemFamilia {
  id: string;
  autor: 'equipe' | 'familia';
  autorNome: string | null;
  texto: string;
  criadoEm: string;
}

export interface ExameFamilia {
  id: string;
  exame: string;
  dataExame: string;
  resultado: string;
  comunicadoEm: string;
  cienciaEm: string | null;
}

export const buscarExtras = (token: string) => chamar<ExtrasFamilia>('/api/familia/extras', {}, token);
export const buscarMensagens = (token: string) => chamar<MensagemFamilia[]>('/api/familia/mensagens', {}, token);
export const enviarMensagemFamilia = (token: string, texto: string) =>
  chamar<{ ok: boolean }>('/api/familia/mensagens', { method: 'POST', body: JSON.stringify({ texto }) }, token);
export const perguntar = (token: string, texto: string) =>
  chamar<{ resposta: string | null; pergunta: string | null }>('/api/familia/duvida', { method: 'POST', body: JSON.stringify({ texto }) }, token);
export const buscarSugestoes = (token: string) => chamar<string[]>('/api/familia/sugestoes', {}, token);
export const buscarExames = (token: string) => chamar<ExameFamilia[]>('/api/familia/exames', {}, token);
export const confirmarExame = (token: string, id: string) =>
  chamar<{ ok: boolean }>(`/api/familia/exames/${id}/ciencia`, { method: 'POST' }, token);
export const avaliar = (token: string, nota: number, comentario?: string) =>
  chamar<{ ok: boolean }>('/api/familia/avaliacao', { method: 'POST', body: JSON.stringify({ nota, comentario }) }, token);
