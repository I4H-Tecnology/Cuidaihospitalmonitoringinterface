/**
 * Tempo relativo, em português, para listas e feeds.
 *
 * Existia copiado dentro da central de alertas e do sino de notificações,
 * cada um com a sua variação. Uma função só: o mesmo instante aparece igual
 * em qualquer tela.
 */
export function quandoFoi(iso: string, agora: number = Date.now()): string {
  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) return '—';
  const min = Math.floor((agora - instante) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h atrás` : `${Math.floor(h / 24)}d atrás`;
}

/** Horas completas desde `iso`; null quando a data não é válida. */
export function horasDesde(iso: string, agora: number = Date.now()): number | null {
  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) return null;
  return Math.floor((agora - instante) / 3600000);
}

/** Quanto falta até `iso`, para prazos: "em 40 min", "em 5h", "em 3 dias". */
export function quantoFalta(iso: string, agora: number = Date.now()): string {
  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) return '—';
  const min = Math.ceil((instante - agora) / 60000);
  if (min <= 0) return 'vencido';
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `em ${h}h`;
  return `em ${Math.floor(h / 24)} dias`;
}

/**
 * "25/10/2026" a partir de "2026-10-25". Data sem hora não passa por `Date`:
 * `new Date('2026-10-25')` é meia-noite UTC, que em Brasília ainda é dia 24.
 */
export function formatarDia(dia: string | null | undefined): string {
  if (!dia) return '—';
  const [a, m, d] = dia.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
}

/** Dias inteiros de hoje (relógio local) até a data "AAAA-MM-DD"; negativo se já passou. */
export function diasAte(dia: string, agora: Date = new Date()): number {
  const [a, m, d] = dia.slice(0, 10).split('-').map(Number);
  const alvo = Date.UTC(a, m - 1, d);
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((alvo - hoje) / 86400000);
}

/**
 * A mais recente de uma lista de datas ISO. Compara o INSTANTE, não o texto:
 * ordenar as strings com sort() só acerta se todas tiverem o mesmo formato e o
 * mesmo fuso ("2026-11-19T12:00:00+02:00" é anterior a "2026-11-19T11:00:00Z",
 * mas vem depois dela como texto). Datas inválidas são ignoradas.
 */
export function maisRecente(datas: string[]): string | undefined {
  let melhor: string | undefined;
  let melhorMs = -Infinity;
  for (const d of datas) {
    const ms = Date.parse(d);
    if (!Number.isNaN(ms) && ms > melhorMs) {
      melhorMs = ms;
      melhor = d;
    }
  }
  return melhor;
}
