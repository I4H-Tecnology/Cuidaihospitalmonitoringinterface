import type { Platform, Role } from './authStore';
// navegacao.ts, e não o índice do módulo: o menu precisa só dos nomes das áreas,
// e o módulo inteiro é carregado sob demanda (App.tsx, React.lazy).
import { descricaoDaArea, type AreaFinanceira } from '../../modulos/financeiro/navegacao';
import type { Recurso } from '../../modulos/financeiro/api/tipos';

/** Cada área do módulo financeiro é uma tela do MedSignal: 'financeiro:pagar'. */
export type TelaFinanceira = `financeiro:${AreaFinanceira}`;

export type Screen =
  | 'dashboard'
  | 'operational-overview'
  | 'monitoring'
  | 'alerts'
  | 'pep'
  | 'evolucoes'
  | 'linha-do-tempo'
  | 'riscos'
  | 'patients'
  | 'beds-rooms'
  | 'settings'
  | 'users'
  | 'saude'
  | 'app-paciente'
  | 'compras'
  | 'contratos'
  | 'indicadores-chave'
  | 'alertas-prioritarios'
  | 'internacoes'
  | 'alta-transferencia'
  | 'fluxo-paciente'
  | 'escalas'
  | 'checklists'
  | 'ausencia-quarto'
  | 'agitacao-noturna'
  | 'sensores'
  | 'incidentes'
  | 'linha-eventos'
  | 'score-risco'
  | 'agenda'
  | 'lembretes'
  | 'mensagens'
  | 'chatbot'
  | 'exames'
  | 'historico-atendimento'
  | 'nps'
  | 'campanhas'
  | 'indicadores-clinicos'
  | 'kpis'
  | 'relatorios'
  | 'previsao'
  | 'heatmaps'
  | 'comparativos'
  | 'insights'
  | TelaFinanceira;

export const screenModuleMap: Record<Exclude<Screen, TelaFinanceira>, string> = {
  dashboard: 'dashboard',
  // TODO: Trocar para "operational_overview" quando o backend expor permissões deste módulo.
  'operational-overview': 'dashboard',
  monitoring: 'monitoring',
  alerts: 'alerts',
  pep: 'clinical_logs',
  // Visões da clínica inteira do mesmo prontuário: mesma permissão do PEP.
  evolucoes: 'clinical_logs',
  'linha-do-tempo': 'clinical_logs',
  riscos: 'clinical_logs',
  patients: 'patients',
  'beds-rooms': 'beds',
  settings: 'settings',
  users: 'users',
  // Observabilidade: quem acompanha o monitoramento precisa ver a saúde dele.
  saude: 'monitoring',
  // Acessos da família ao app: a mesma permissão da aba de acompanhantes.
  'app-paciente': 'companions',
  compras: 'purchases',
  contratos: 'contracts',
  // Dashboard
  'indicadores-chave': 'dashboard',
  'alertas-prioritarios': 'alerts',
  // Operacional: internação e movimentação são do cadastro do paciente; escala e checklist, da operação.
  'internacoes': 'patients',
  'alta-transferencia': 'patients',
  'fluxo-paciente': 'patients',
  'escalas': 'operations',
  'checklists': 'operations',
  // Monitoramento: leituras do que as câmeras e sensores registraram. A Escala de Morse é registro clínico.
  'ausencia-quarto': 'monitoring',
  'agitacao-noturna': 'monitoring',
  'sensores': 'monitoring',
  'incidentes': 'monitoring',
  'linha-eventos': 'monitoring',
  'score-risco': 'clinical_logs',
  // CRM Saúde: relacionamento com paciente e família.
  'agenda': 'crm',
  'lembretes': 'crm',
  'mensagens': 'crm',
  'chatbot': 'crm',
  'exames': 'crm',
  'historico-atendimento': 'crm',
  'nps': 'crm',
  'campanhas': 'crm',
  // Inteligência & Analytics: leitura de indicadores, o módulo de relatórios.
  'indicadores-clinicos': 'reports',
  'kpis': 'reports',
  'relatorios': 'reports',
  'previsao': 'reports',
  'heatmaps': 'reports',
  'comparativos': 'reports',
  'insights': 'reports',
};

/**
 * Telas que todo usuário logado abre, qualquer que seja o perfil.
 * Configurações entra porque tem as seções pessoais (minha conta, aparência,
 * notificações): trocar a própria senha não pode depender de ser ADMIN. As
 * seções da clínica e do sistema continuam exigindo `settings`, na tela
 * (SettingsScreen esconde) e na API (que recusa).
 */
export const TELAS_DE_TODOS: ReadonlySet<Screen> = new Set<Screen>(['settings']);

/**
 * As telas que a RFC especifica (RF03 a RF08, RF15 a RF30). É o que o VISITOR
 * (banca só lendo) abre, e nada além disso. O TCC (banca operando) abre estas
 * e mais a Saúde do Sistema: ver TELAS_DO_TCC.
 *
 * A permissão do backend é por módulo, e vários módulos da RFC abrigam telas
 * que vieram depois dela (Sensores IoT e Ausência no Quarto moram em
 * `monitoring`, os analytics em `reports`). Sem este filtro, liberar o módulo
 * liberaria a tela junto. Ele só ESCONDE a tela: o que protege o dado é a
 * permissão do módulo, na API.
 *
 *   dashboard, monitoring, alerts ... RF09 a RF24, RF30
 *   incidentes ...................... RF21, RF22 (histórico de ocorrências)
 *   patients, beds-rooms ............ RF05 a RF08
 *   app-paciente .................... RF25 a RF28 (acesso do acompanhante)
 *   users, settings ................. RF03, RF04, RF06, RF07, RF29
 *   relatorios, kpis ................ gestor "consulta relatórios" e
 *                                     "acompanha indicadores" (RFC 1.4)
 *
 * Ficam de fora o que a seção 2.6 exclui (financeiro, prontuário, sensores
 * IoT, gestão hospitalar ampla) e o que nasceu depois da entrega (CRM,
 * operações, compras, contratos, os demais analytics).
 */
export const TELAS_DA_RFC: ReadonlySet<Screen> = new Set<Screen>([
  'dashboard',
  'monitoring',
  'alerts',
  'incidentes',
  'patients',
  'beds-rooms',
  'app-paciente',
  'users',
  'settings',
  'relatorios',
  'kpis',
]);

/**
 * O que o TCC abre: as telas da RFC e a Saúde do Sistema. A Saúde não é
 * requisito da RFC; é o monitoramento do núcleo comum de engenharia do
 * Playbook, que a banca avalia operando o sistema. Ela só LÊ o estado da API,
 * do banco e do serviço de visão, pelo módulo `monitoring`, que o TCC já
 * recebe no banco (02_perfis.sql): nenhuma permissão nova.
 */
export const TELAS_DO_TCC: ReadonlySet<Screen> = new Set<Screen>([...TELAS_DA_RFC, 'saude']);

/** Perfis que abrem só um conjunto de telas. Perfil fora daqui vale o que o módulo diz. */
const TELAS_DO_PERFIL: Partial<Record<Role, ReadonlySet<Screen>>> = {
  VISITOR: TELAS_DA_RFC,
  TCC: TELAS_DO_TCC,
};

/**
 * O perfil é da banca (VISITOR ou TCC)? Os dois enxergam o escopo da RFC (o TCC
 * também a Saúde do Sistema). Serve para o que não é tela, como o "Novo
 * dashboard": um editor de protótipo, com números de exemplo, que não está na
 * RFC, e o simulador do app.
 */
export const perfilSoDaRfc = (role: Role | undefined): boolean =>
  role === 'VISITOR' || role === 'TCC';

/** O perfil pode abrir esta tela, além da permissão do módulo? */
export const perfilAbreTela = (role: Role | undefined, screen: Screen): boolean => {
  const permitidas = role ? TELAS_DO_PERFIL[role] : undefined;
  return !permitidas || permitidas.has(screen);
};

/**
 * Recurso do financeiro -> módulo do RBAC do MedSignal. O MESMO mapa do
 * backend (backend/app/integracao_financeiro.py): lá ele decide o que a API
 * aceita; aqui, só o que o menu mostra.
 */
export const MODULO_DO_RECURSO_FINANCEIRO: Record<Recurso, string> = {
  operacao: 'finance',
  cadastros: 'finance',
  planejamento: 'finance',
  relatorios: 'finance',
  pessoal: 'payroll',
  capital: 'finance_admin',
  configuracoes: 'finance_admin',
};

export const ehTelaFinanceira = (screen: Screen): screen is TelaFinanceira => screen.startsWith('financeiro:');

export const areaDaTela = (screen: TelaFinanceira): AreaFinanceira => screen.slice('financeiro:'.length) as AreaFinanceira;

export const getModuleForScreen = (screen: Screen) =>
  ehTelaFinanceira(screen)
    ? MODULO_DO_RECURSO_FINANCEIRO[descricaoDaArea(areaDaTela(screen)).recurso]
    : screenModuleMap[screen];

export const defaultPlatform: Platform = 'web';
