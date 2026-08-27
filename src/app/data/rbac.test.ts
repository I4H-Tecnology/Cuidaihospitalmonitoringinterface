import { describe, expect, it } from 'vitest';
import { defaultPlatform, getModuleForScreen, screenModuleMap, type Screen } from './rbac';

// Toda tela que o App consegue renderizar precisa de um módulo correspondente,
// senão o RBAC deixa passar (ou barra) por omissão em vez de por regra.
const TELAS: Screen[] = [
  'dashboard',
  'monitoring',
  'alerts',
  'pep',
  'patients',
  'beds-rooms',
  'scheduling',
  'reports',
  'settings',
  'users',
  'hospital-management',
  'financial',
  'inventory',
  'hr',
];

describe('mapa de telas para módulos de permissão', () => {
  it('cobre todas as telas conhecidas', () => {
    expect(Object.keys(screenModuleMap).sort()).toEqual([...TELAS].sort());
  });

  it.each(TELAS)('resolve um módulo não vazio para "%s"', (tela) => {
    const modulo = getModuleForScreen(tela);
    expect(modulo).toBeTruthy();
    expect(typeof modulo).toBe('string');
  });

  it('não repete o mesmo módulo em telas diferentes', () => {
    const modulos = Object.values(screenModuleMap);
    expect(new Set(modulos).size).toBe(modulos.length);
  });

  it('mapeia o PEP para o módulo de registros clínicos', () => {
    // Divergência proposital entre o nome da tela e o nome do módulo:
    // se alguém "arrumar" isso, as permissões salvas param de casar.
    expect(getModuleForScreen('pep')).toBe('clinical_logs');
    expect(getModuleForScreen('beds-rooms')).toBe('beds');
    expect(getModuleForScreen('scheduling')).toBe('appointments');
  });

  it('assume a plataforma web por padrão', () => {
    expect(defaultPlatform).toBe('web');
  });
});
