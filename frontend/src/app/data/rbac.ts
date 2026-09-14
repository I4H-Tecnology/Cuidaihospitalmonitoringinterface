import type { Platform } from './authStore';

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
  | 'saude';

export const screenModuleMap: Record<Screen, string> = {
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
  saude: 'monitoring'
};

export const getModuleForScreen = (screen: Screen) => screenModuleMap[screen];

export const defaultPlatform: Platform = 'web';
