import { describe, expect, it } from 'vitest';
import { defaultPlatform, getModuleForScreen, screenModuleMap, type Screen } from './rbac';

// Toda tela que o App consegue renderizar precisa de um módulo correspondente,
// senão o RBAC deixa passar (ou barra) por omissão em vez de por regra.
const TELAS: Screen[] = [
  'dashboard',
  'operational-overview',
  'monitoring',
  'alerts',
  'pep',
  'evolucoes',
  'linha-do-tempo',
  'riscos',
  'patients',
  'beds-rooms',
  'settings',
  'users',
  'saude',
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

  it('só permite um módulo compartilhado: o apelido documentado da visão operacional', () => {
    // 'operational-overview' aponta para 'dashboard' de propósito, porque o
    // backend ainda não expõe permissão própria para esse módulo — há um TODO
    // no rbac.ts registrando isso. 'saude' (observabilidade) aponta para
    // 'monitoring': é uma leitura do estado do monitoramento, e quem pode ver
    // o monitoramento pode ver se ele está de pé. Qualquer OUTRA duplicata é
    // engano: duas telas dividindo módulo significa que uma delas não é
    // controlável sozinha.
    const modulos = Object.entries(screenModuleMap);
    const contagem = new Map<string, string[]>();
    for (const [tela, modulo] of modulos) {
      contagem.set(modulo, [...(contagem.get(modulo) ?? []), tela]);
    }

    const compartilhados = [...contagem.entries()]
      .filter(([, telas]) => telas.length > 1)
      .map(([modulo, telas]) => `${modulo}: ${telas.sort().join(', ')}`);

    // 'clinical_logs' cobre o PEP e as três visões da clínica do mesmo
    // prontuário (evoluções, linha do tempo, alergias e riscos): quem pode ler
    // o prontuário de um paciente pode ler o de todos da clínica.
    expect(compartilhados).toEqual([
      'dashboard: dashboard, operational-overview',
      'monitoring: monitoring, saude',
      'clinical_logs: evolucoes, linha-do-tempo, pep, riscos',
    ]);
  });

  it('mapeia o PEP para o módulo de registros clínicos', () => {
    // Divergência proposital entre o nome da tela e o nome do módulo:
    // se alguém "arrumar" isso, as permissões salvas param de casar.
    expect(getModuleForScreen('pep')).toBe('clinical_logs');
    expect(getModuleForScreen('beds-rooms')).toBe('beds');
  });

  it('assume a plataforma web por padrão', () => {
    expect(defaultPlatform).toBe('web');
  });
});
