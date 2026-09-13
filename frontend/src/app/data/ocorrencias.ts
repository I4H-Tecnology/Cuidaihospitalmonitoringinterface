import type { OcorrenciaResumo } from './api';

/**
 * Leituras derivadas das ocorrências, compartilhadas por dashboard, sino de
 * notificações e app da enfermagem.
 *
 * Tudo aqui é cálculo sobre o que a API devolveu. Nada é estimado: onde a base
 * for pequena demais para um gráfico dizer algo, quem chama mostra "sem
 * dados", não um número de enfeite.
 */

export const ROTULO_EVENTO: Record<string, string> = {
  queda: 'Queda',
  permanencia_solo: 'Permanência no chão',
  perda_verticalidade: 'Perda de verticalidade',
  ausencia_prolongada: 'Ausência prolongada',
};

export const ROTULO_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  em_atendimento: 'Em atendimento',
  encerrada: 'Encerrada',
  falso_positivo: 'Falso positivo',
  queda_confirmada: 'Queda confirmada',
};

export type Gravidade = 'critical' | 'warning' | 'info';

export function rotuloDoEvento(tipoEvento: string): string {
  return ROTULO_EVENTO[tipoEvento] ?? tipoEvento;
}

export function estaAberta(o: OcorrenciaResumo): boolean {
  return o.status === 'pendente' || o.status === 'em_atendimento';
}

/**
 * Gravidade visual de uma ocorrência: pendente é crítica (ninguém deu
 * ciência ainda), em atendimento é atenção, encerrada é informativa.
 */
export function gravidadeDe(o: OcorrenciaResumo): Gravidade {
  if (o.status === 'pendente') return 'critical';
  if (o.status === 'em_atendimento') return 'warning';
  return 'info';
}

/** Ocorrências cujo instante está dentro das últimas `horas`. */
export function nasUltimasHoras(
  ocorrencias: OcorrenciaResumo[],
  horas: number,
  agora: number = Date.now(),
): OcorrenciaResumo[] {
  const limite = agora - horas * 3600000;
  return ocorrencias.filter((o) => new Date(o.dataHora).getTime() >= limite);
}

/** Contagem por tipo de evento, ordenada da mais frequente para a menos. */
export function porTipo(ocorrencias: OcorrenciaResumo[]): { tipo: string; total: number }[] {
  const contagem = new Map<string, number>();
  for (const o of ocorrencias) {
    contagem.set(o.tipoEvento, (contagem.get(o.tipoEvento) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([tipo, total]) => ({ tipo: rotuloDoEvento(tipo), total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Contagem por hora do dia nas últimas 24 h, com as 24 horas presentes (zero
 * onde não houve nada), da mais antiga para a mais recente.
 */
export function porHoraNasUltimas24h(
  ocorrencias: OcorrenciaResumo[],
  agora: number = Date.now(),
): { hora: string; total: number }[] {
  const inicio = new Date(agora);
  inicio.setMinutes(0, 0, 0);
  const faixas: { hora: string; total: number; inicio: number }[] = [];
  for (let i = 23; i >= 0; i -= 1) {
    const t = inicio.getTime() - i * 3600000;
    faixas.push({ hora: `${String(new Date(t).getHours()).padStart(2, '0')}h`, total: 0, inicio: t });
  }
  for (const o of ocorrencias) {
    const t = new Date(o.dataHora).getTime();
    const faixa = faixas.find((f) => t >= f.inicio && t < f.inicio + 3600000);
    if (faixa) faixa.total += 1;
  }
  return faixas.map(({ hora, total }) => ({ hora, total }));
}
