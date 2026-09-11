import type { Platform } from './authStore';

export type Screen =
  | 'dashboard'
  | 'operational-overview'
  | 'monitoring'
  | 'alerts'
  | 'pep'
  | 'patients'
  | 'beds-rooms'
  | 'scheduling'
  | 'reports'
  | 'settings'
  | 'users'
  | 'hospital-management'
  | 'financial'
  | 'inventory'
  | 'hr'
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
  scheduling: 'appointments',
  reports: 'reports',
  settings: 'settings',
  users: 'users',
  'hospital-management': 'hospital_management',
  financial: 'financial',
  inventory: 'inventory',
  hr: 'hr',
  // Observabilidade: quem acompanha o monitoramento precisa ver a saúde dele.
  saude: 'monitoring'
};

export const getModuleForScreen = (screen: Screen) => screenModuleMap[screen];

export const defaultPlatform: Platform = 'web';
