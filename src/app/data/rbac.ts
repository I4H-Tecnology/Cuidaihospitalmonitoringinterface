import type { Platform } from './authStore';

export type Screen =
  | 'dashboard'
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
  | 'hr';

export const screenModuleMap: Record<Screen, string> = {
  dashboard: 'dashboard',
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
  hr: 'hr'
};

export const getModuleForScreen = (screen: Screen) => screenModuleMap[screen];

export const defaultPlatform: Platform = 'web';
