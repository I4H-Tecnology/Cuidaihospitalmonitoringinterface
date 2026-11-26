import { ehTelaFinanceira, type Screen } from './rbac';

/**
 * Em que grupo do menu cada tela mora, para a trilha do cabeçalho
 * ("Monitoramento › Linha do Tempo de Eventos"). A ordem e os nomes seguem o
 * menu lateral; tela nova entra aqui junto com o item do menu.
 */
const GRUPOS: Record<string, Screen[]> = {
  Dashboard: ['dashboard', 'operational-overview', 'indicadores-chave', 'alertas-prioritarios'],
  Assistencial: ['pep', 'patients', 'evolucoes', 'linha-do-tempo', 'riscos'],
  Operacional: ['beds-rooms', 'internacoes', 'alta-transferencia', 'fluxo-paciente', 'escalas', 'checklists'],
  Monitoramento: ['monitoring', 'alerts', 'ausencia-quarto', 'agitacao-noturna', 'sensores', 'score-risco', 'incidentes', 'linha-eventos'],
  'Relacionamento (CRM)': ['agenda', 'lembretes', 'mensagens', 'chatbot', 'exames', 'historico-atendimento', 'nps', 'campanhas'],
  'Inteligência & Analytics': ['indicadores-clinicos', 'kpis', 'relatorios', 'previsao', 'heatmaps', 'comparativos', 'insights'],
  Administração: ['compras', 'contratos'],
  Sistema: ['users', 'settings', 'saude'],
};

const GRUPO_DA_TELA = new Map<Screen, string>(Object.entries(GRUPOS).flatMap(([grupo, telas]) => telas.map((t) => [t, grupo] as const)));

export function grupoDaTela(tela: Screen): string | null {
  if (ehTelaFinanceira(tela)) return 'Administração › Financeiro';
  return GRUPO_DA_TELA.get(tela) ?? null;
}
