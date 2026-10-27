import { request } from './api';

/** Inteligência & Analytics e eventos de monitoramento (backend/app/rotas/analytics.py). */

const q = (params: Record<string, string | number | boolean | undefined | null>) =>
  '?' + Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

export interface ResumoTempo {
  n: number;
  /** Segundos. */
  mediana: number | null;
  media: number | null;
  p90: number | null;
}

export interface Metricas {
  inicio: string;
  fim: string;
  total: number;
  porStatus: Record<'pendente' | 'em_atendimento' | 'encerrada' | 'falso_positivo' | 'queda_confirmada', number>;
  porTipo: Record<'queda' | 'perda_verticalidade' | 'permanencia_solo' | 'ausencia_prolongada', number>;
  porTurno: Partial<Record<'manha' | 'tarde' | 'noite', number>>;
  porDia: { dia: string; total: number }[];
  tempoCiencia: ResumoTempo;
  tempoAtendimento: ResumoTempo;
  tempoEncerramento: ResumoTempo;
  cienciaEm5Min: number | null;
  quedasConfirmadas: number;
  falsosPositivos: number;
  taxaFalsoPositivo: number | null;
  encerradas: number;
  pacientesDia?: number;
  evolucoes?: number;
  taxaQuedas1000?: number | null;
}

export const fetchKpis = (tenantId: string, dias: number) =>
  request<{ atual: Metricas; anterior: Metricas }>(`/api/analytics/kpis${q({ tenantId, dias })}`);

export const fetchComparativo = (tenantId: string, a: [string, string], b: [string, string]) =>
  request<{ a: Metricas; b: Metricas }>(`/api/analytics/comparativo${q({ tenantId, inicioA: a[0], fimA: a[1], inicioB: b[0], fimB: b[1] })}`);

export interface MapaDeCalor {
  inicio: string;
  fim: string;
  total: number;
  ambientes: { id: string; nome: string; horas: number[]; total: number }[];
  /** [segunda..domingo][0..23] */
  diasDaSemana: number[][];
}

export const fetchMapaDeCalor = (tenantId: string, dias: number, incluirFalsos: boolean) =>
  request<MapaDeCalor>(`/api/analytics/mapa-de-calor${q({ tenantId, dias, incluirFalsos })}`);

export interface Previsao {
  semanas: { inicio: string; total: number }[];
  semanaAtual: number;
  inclinacaoPorSemana: number;
  previsaoProximaSemana: number;
  semanasComDados: number;
  mediaPorHoraEDia: number[][];
  picos: { diaDaSemana: number; hora: number; mediaSemanal: number }[];
  ambientes: { nome: string; mediaSemanal: number }[];
}

export const fetchPrevisao = (tenantId: string) => request<Previsao>(`/api/analytics/previsao${q({ tenantId })}`);

export interface IndicadoresClinicos {
  inicio: string;
  fim: string;
  pacientesDia: number;
  internados: number;
  admissoes: number;
  saidas: number;
  permanenciaMediaDias: number | null;
  idadeMedia: number | null;
  idosos80: number;
  quedasConfirmadas: number;
  taxaQuedas1000: number | null;
  pacientesComOcorrencia: number;
  alergiaGrave: number;
  riscoGrave: number;
  polifarmacia: number;
  morseAlto: number;
  morseModerado: number;
  semMorse: number;
  semEvolucao3d: number;
}

export const fetchIndicadoresClinicos = (tenantId: string, dias: number) =>
  request<IndicadoresClinicos>(`/api/analytics/indicadores-clinicos${q({ tenantId, dias })}`);

export interface Achado {
  nivel: 'critico' | 'atencao' | 'info' | 'positivo';
  categoria: string;
  titulo: string;
  detalhe: string;
  /** Tela onde agir (id de Screen), quando há uma. */
  tela: string | null;
}

export const fetchInsights = (tenantId: string) =>
  request<{ geradoEm: string; achados: Achado[] }>(`/api/analytics/insights${q({ tenantId })}`);

export interface EventoMonitoramento {
  id: string;
  dataHora: string;
  tipo: 'queda' | 'perda_verticalidade' | 'permanencia_solo' | 'ausencia_prolongada';
  status: 'pendente' | 'em_atendimento' | 'encerrada' | 'falso_positivo' | 'queda_confirmada';
  ambienteId: string;
  ambienteNome: string;
  pacienteId: string | null;
  pacienteNome: string | null;
  idade: number | null;
  cienciaEm: string | null;
  cienciaPor: string | null;
  segundosAteCiencia: number | null;
  atendimentoEm: string | null;
  atendidoPor: string | null;
  segundosAteAtendimento: number | null;
  encerradaEm: string | null;
  segundosAteEncerramento: number | null;
  observacao: string | null;
  turno: 'manha' | 'tarde' | 'noite';
}

export const fetchEventos = (
  tenantId: string,
  filtros: { dias?: number; inicio?: string; fim?: string; tipo?: string; status?: string; ambienteId?: string; noturno?: boolean },
) => request<{ inicio: string; fim: string; total: number; eventos: EventoMonitoramento[] }>(`/api/monitoramento/eventos${q({ tenantId, ...filtros })}`);

export interface RelatorioQuedas {
  inicio: string;
  fim: string;
  clinicaNome: string;
  pacientesDia: number;
  quedasConfirmadas: number;
  taxaQuedas1000: number | null;
  ocorrencias: number;
  falsosPositivos: number;
  tempoCiencia: ResumoTempo;
  eventos: EventoMonitoramento[];
}

export const fetchRelatorioQuedas = (tenantId: string, inicio: string, fim: string) =>
  request<RelatorioQuedas>(`/api/relatorios/quedas${q({ tenantId, inicio, fim })}`);

/* ---- textos comuns às telas ------------------------------------------------- */

export const ROTULO_TIPO: Record<EventoMonitoramento['tipo'], string> = {
  queda: 'Queda', perda_verticalidade: 'Perda de verticalidade', permanencia_solo: 'Permanência no chão', ausencia_prolongada: 'Ausência prolongada',
};

export const ROTULO_STATUS: Record<EventoMonitoramento['status'], { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'Aguardando ciência', classe: 'bg-red-100 text-red-700' },
  em_atendimento: { rotulo: 'Em atendimento', classe: 'bg-blue-100 text-blue-700' },
  encerrada: { rotulo: 'Encerrada', classe: 'bg-gray-100 text-gray-700' },
  falso_positivo: { rotulo: 'Falso positivo', classe: 'bg-gray-100 text-gray-700' },
  queda_confirmada: { rotulo: 'Queda confirmada', classe: 'bg-amber-100 text-amber-800' },
};

export const ROTULO_TURNO: Record<'manha' | 'tarde' | 'noite', string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };

export const DIAS_DA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** "2 min 30 s", "1 h 05 min". Nulo vira traço. */
export function formatarDuracaoCurta(segundos: number | null | undefined): string {
  if (segundos == null) return '—';
  if (segundos < 60) return `${Math.round(segundos)} s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `${min} min${segundos % 60 >= 1 && min < 10 ? ` ${Math.round(segundos % 60)} s` : ''}`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Variação percentual entre dois números, ou null quando não dá para comparar. */
export function variacao(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** CSV com ponto e vírgula (o Excel em português abre direto) e BOM para os acentos. */
export function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number | null | undefined)[][]): void {
  const celula = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const conteudo = [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
