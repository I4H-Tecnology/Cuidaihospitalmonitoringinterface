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
