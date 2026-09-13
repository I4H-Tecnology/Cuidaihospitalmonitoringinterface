import type { Platform } from './authStore';

export type Screen =
  | 'dashboard'
  | 'operational-overview'
  | 'monitoring'
  | 'alerts'
  | 'pep'
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
  patients: 'patients',
  'beds-rooms': 'beds',
  settings: 'settings',
  users: 'users',
  // Observabilidade: quem acompanha o monitoramento precisa ver a saúde dele.
  saude: 'monitoring'
};

export const getModuleForScreen = (screen: Screen) => screenModuleMap[screen];

export const defaultPlatform: Platform = 'web';
