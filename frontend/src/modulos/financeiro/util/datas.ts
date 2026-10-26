/**
 * Datas: a API usa AAAA-MM-DD; a tela, DD/MM/AAAA. Nada aqui passa por
 * `new Date('2026-09-15')`, que o navegador lê como meia-noite UTC — no
 * Brasil isso vira 14/09 às 21h e a data "volta um dia".
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [a, m, d || 1];
}

/** '2026-09-15' -> '15/09/2026' */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = partes(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}

/** '2026-09-15T13:02:11Z' -> '15/09/2026 10:02' (hora local) */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** '2026-09-01' ou '2026-09' -> 'set/2026' */
export function formatarCompetencia(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m] = partes(iso.length === 7 ? `${iso}-01` : iso);
  return `${MESES[m - 1]}/${a}`;
}

/** Hoje no fuso do navegador, em AAAA-MM-DD. */
export function hojeISO(agora: Date = new Date()): string {
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${m}-${d}`;
}

export function competenciaDe(iso: string): string {
  return iso.slice(0, 7);
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso);
  return hojeISO(new Date(a, m - 1, d + dias));
}

export function somarMeses(competencia: string, meses: number): string {
  const [a, m] = partes(`${competencia.slice(0, 7)}-01`);
  const data = new Date(a, m - 1 + meses, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function inicioDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function fimDoMes(iso: string): string {
  const [a, m] = partes(iso);
  return hojeISO(new Date(a, m, 0));
}

/** Dias entre duas datas ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  const [a1, m1, d1] = partes(a);
  const [a2, m2, d2] = partes(b);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}
