/**
 * Cliente do serviço de visão (porta 8001) e a leitura do estado da captura.
 *
 * O serviço expõe dois JSONs sem autenticação na rede local: `/estado` (quem
 * está em cena, a cada quadro) e `/health` (diagnóstico). O que este módulo
 * acrescenta é a interpretação: distinguir "o serviço caiu" de "o serviço
 * está no ar mas a câmera caiu" — problemas diferentes, soluções diferentes,
 * e quem opera precisa saber qual é (RF30, RN15, RNF17).
 */

export const VISAO_URL: string = import.meta.env.VITE_VISAO_URL || 'http://localhost:8001';

export type EstadoDaFonte = 'iniciando' | 'capturando' | 'reconectando' | 'parado';

export interface Captura {
  estado: EstadoDaFonte;
  tentativa: number;
  proxima_tentativa_em_s: number | null;
  ultimo_quadro_ha_s: number | null;
  reconexoes: number;
  quedas_da_fonte: number;
  erro: string | null;
}

export interface ClipesVisao {
  ativo: boolean;
  motivo?: string;
  pasta?: string;
  clipes_em_disco?: number;
  bytes_em_disco?: number;
  gravando_agora?: number;
  gravados_desde_o_boot?: number;
  ultimo_clipe?: string | null;
  retencao_horas?: number;
  ultimo_expurgo?: string | null;
  ultimo_expurgo_removeu?: number;
  ultimo_erro?: string | null;
}

export interface PublicacaoVisao {
  ativo: boolean;
  motivo?: string;
  camera?: string | null;
  registradas?: number;
  duplicadas?: number;
  aguardando_em_disco?: number;
  ultimo_ping?: number | null;
  pingando?: boolean;
  pings_suprimidos?: number;
  ultimo_erro?: string | null;
}

export interface SaudeVisao {
  status: 'ok' | 'degradado' | 'iniciando' | 'parado';
  versao: string;
  erro: string | null;
  fonte: string;
  modo_teste: boolean;
  estado_da_fonte: EstadoDaFonte;
  captura: Captura;
  fps_real: number | null;
  fps_alvo: number;
  latencia_media_ms: number | null;
  latencia_p95_ms: number | null;
  latencia_max_ms: number | null;
  quadros_processados: number;
  uptime_s: number | null;
  ocorrencias: number;
  clipes: ClipesVisao;
  publicacao: PublicacaoVisao;
}

export type Diagnostico =
  | { tipo: 'servico-fora' }
  | { tipo: 'camera-fora'; tentativa: number; proximaEmS: number | null; erro: string | null }
  | { tipo: 'iniciando' }
  | { tipo: 'parado' }
  | { tipo: 'ok' };

/**
 * O que a tela deve dizer, a partir do que se sabe.
 *
 * `servicoNoAr` é null enquanto a primeira consulta não voltou; false quando
 * o navegador não alcançou a porta 8001. `captura` é o bloco que o `/estado`
 * devolve — ausente em versões antigas do serviço, e aí o melhor palpite é
 * "ok", que era o único estado que existia.
 */
export function diagnosticarCaptura(
  servicoNoAr: boolean | null,
  captura?: Captura | null,
): Diagnostico {
  if (servicoNoAr === false) return { tipo: 'servico-fora' };
  if (servicoNoAr === null) return { tipo: 'iniciando' };
  if (!captura) return { tipo: 'ok' };
  switch (captura.estado) {
    case 'reconectando':
      return {
        tipo: 'camera-fora',
        tentativa: captura.tentativa,
        proximaEmS: captura.proxima_tentativa_em_s,
        erro: captura.erro,
      };
    case 'iniciando':
      return { tipo: 'iniciando' };
    case 'parado':
      return { tipo: 'parado' };
    default:
      return { tipo: 'ok' };
  }
}

export function formatarDuracao(segundos: number | null | undefined): string {
  if (segundos == null || Number.isNaN(segundos)) return '—';
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  if (h < 24) return `${h}h ${String(resto).padStart(2, '0')}min`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatarBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `/health` do serviço de visão; null quando a porta não responde. */
export async function fetchSaudeVisao(): Promise<SaudeVisao | null> {
  try {
    const resposta = await fetch(`${VISAO_URL}/health`, { cache: 'no-store' });
    if (!resposta.ok) return null;
    return (await resposta.json()) as SaudeVisao;
  } catch {
    return null;
  }
}
