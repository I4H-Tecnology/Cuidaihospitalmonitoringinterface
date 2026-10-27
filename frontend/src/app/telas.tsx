import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Screen } from './data/rbac';

/**
 * As telas que entraram em 26/10/2026, com título do cabeçalho e o componente
 * carregado sob demanda: quem só usa o monitoramento não baixa o código do
 * CRM. O App consulta este registro em vez de ganhar 28 `if` a mais.
 */

export interface PropsTela {
  onNavigate: (tela: Screen) => void;
}

interface Registro {
  titulo: string;
  subtitulo: string;
  componente: LazyExoticComponent<ComponentType<PropsTela>>;
}

const de = <M extends Record<string, unknown>>(carregar: () => Promise<M>, nome: keyof M & string) =>
  lazy(() => carregar().then((m) => ({ default: m[nome] as ComponentType<PropsTela> })));

const analytics = () => import('./components/telas/Analytics');
const crm = () => import('./components/telas/Crm');
const crm2 = () => import('./components/telas/CrmFamilia');
const monitoramento = () => import('./components/telas/Monitoramento');
const operacional = () => import('./components/telas/Operacional');
const painel = () => import('./components/telas/Painel');

export const TELAS_REGISTRADAS: Partial<Record<Screen, Registro>> = {
  // Dashboard
  'indicadores-chave': { titulo: 'Indicadores-chave', subtitulo: 'A clínica em números, agora', componente: de(painel, 'IndicadoresChaveScreen') },
  'alertas-prioritarios': { titulo: 'Alertas prioritários', subtitulo: 'O que precisa de alguém agora, na ordem certa', componente: de(painel, 'AlertasPrioritariosScreen') },
  // Operacional
  internacoes: { titulo: 'Internações', subtitulo: 'Quem está internado, onde e há quanto tempo', componente: de(operacional, 'InternacoesScreen') },
  'alta-transferencia': { titulo: 'Alta e Transferência', subtitulo: 'Trocar de ambiente ou dar saída, com motivo registrado', componente: de(operacional, 'AltaTransferenciaScreen') },
  'fluxo-paciente': { titulo: 'Fluxo do Paciente', subtitulo: 'Admissões, transferências e saídas ao longo do tempo', componente: de(operacional, 'FluxoPacienteScreen') },
  escalas: { titulo: 'Escalas Assistenciais', subtitulo: 'Quem trabalha em cada turno', componente: de(operacional, 'EscalasScreen') },
  checklists: { titulo: 'Checklists Operacionais', subtitulo: 'Rotinas da equipe, conferidas e registradas', componente: de(operacional, 'ChecklistsScreen') },
  // Monitoramento
  'ausencia-quarto': { titulo: 'Ausência no Quarto', subtitulo: 'Quando o paciente sai e não volta', componente: de(monitoramento, 'AusenciaScreen') },
  'agitacao-noturna': { titulo: 'Agitação Noturna', subtitulo: 'Eventos entre 22h e 6h, por paciente e por noite', componente: de(monitoramento, 'AgitacaoNoturnaScreen') },
  sensores: { titulo: 'Sensores IoT', subtitulo: 'Câmeras e demais dispositivos conectados', componente: de(monitoramento, 'SensoresScreen') },
  'score-risco': { titulo: 'Score de Risco', subtitulo: 'Risco de queda pela Escala de Morse', componente: de(monitoramento, 'ScoreRiscoScreen') },
  incidentes: { titulo: 'Histórico de Incidentes', subtitulo: 'Todas as ocorrências, com desfecho e tempos de resposta', componente: de(monitoramento, 'IncidentesScreen') },
  'linha-eventos': { titulo: 'Linha do Tempo de Eventos', subtitulo: 'Cada ocorrência, passo a passo, em ordem', componente: de(monitoramento, 'LinhaEventosScreen') },
  // CRM
  agenda: { titulo: 'Agenda do Paciente', subtitulo: 'Consultas, exames, terapias e visitas', componente: de(crm, 'AgendaScreen') },
  lembretes: { titulo: 'Lembretes', subtitulo: 'Tarefas com hora marcada, que se repetem sozinhas', componente: de(crm, 'LembretesScreen') },
  mensagens: { titulo: 'Mensagens', subtitulo: 'Conversa com as famílias pelo portal', componente: de(crm2, 'MensagensScreen') },
  chatbot: { titulo: 'Respostas Automáticas', subtitulo: 'O que o portal responde sozinho às dúvidas da família', componente: de(crm2, 'ChatbotScreen') },
  exames: { titulo: 'Comunicação de Exames', subtitulo: 'Resultados comunicados à família, e a quem', componente: de(crm, 'ExamesScreen') },
  'historico-atendimento': { titulo: 'Histórico de Atendimento', subtitulo: 'Tudo o que aconteceu com o paciente e a família', componente: de(crm2, 'HistoricoAtendimentoScreen') },
  nps: { titulo: 'NPS / Satisfação', subtitulo: 'O que as famílias acham do cuidado', componente: de(crm2, 'NpsScreen') },
  campanhas: { titulo: 'Campanhas de Saúde', subtitulo: 'Vacinação, prevenção e quem participou', componente: de(crm, 'CampanhasScreen') },
  // Analytics
  'indicadores-clinicos': { titulo: 'Indicadores Clínicos', subtitulo: 'Taxa de quedas, permanência e perfil de risco', componente: de(analytics, 'IndicadoresClinicosScreen') },
  kpis: { titulo: 'KPIs Assistenciais', subtitulo: 'Tempos de resposta e desfecho das ocorrências', componente: de(analytics, 'KpisScreen') },
  relatorios: { titulo: 'Relatórios Regulatórios', subtitulo: 'Eventos e indicadores para notificação e auditoria', componente: de(analytics, 'RelatoriosScreen') },
  previsao: { titulo: 'Análise Preditiva', subtitulo: 'Tendência e horários de maior risco, por estatística', componente: de(analytics, 'PrevisaoScreen') },
  heatmaps: { titulo: 'Mapa de Calor de Risco', subtitulo: 'Onde e quando as ocorrências se concentram', componente: de(analytics, 'MapaDeCalorScreen') },
  comparativos: { titulo: 'Comparativos por Período', subtitulo: 'Dois períodos lado a lado', componente: de(analytics, 'ComparativosScreen') },
  insights: { titulo: 'Insights Automatizados', subtitulo: 'Verificações diárias que apontam onde agir', componente: de(analytics, 'InsightsScreen') },
};
