import { describe, expect, it } from 'vitest';
import { AREAS_FINANCEIRO } from '../../modulos/financeiro/navegacao';
import {
  MODULO_DO_RECURSO_FINANCEIRO,
  TELAS_DE_TODOS,
  defaultPlatform,
  ehTelaFinanceira,
  TELAS_DA_RFC,
  getModuleForScreen,
  perfilAbreTela,
  perfilSoDaRfc,
  screenModuleMap,
  type Screen,
} from './rbac';

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
  'app-paciente',
  'compras',
  'contratos',
  'indicadores-chave', 'alertas-prioritarios',
  'internacoes', 'alta-transferencia', 'fluxo-paciente', 'escalas', 'checklists',
  'ausencia-quarto', 'agitacao-noturna', 'sensores', 'incidentes', 'linha-eventos', 'score-risco',
  'agenda', 'lembretes', 'mensagens', 'chatbot', 'exames', 'historico-atendimento', 'nps', 'campanhas',
  'indicadores-clinicos', 'kpis', 'relatorios', 'previsao', 'heatmaps', 'comparativos', 'insights',
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

  it('só compartilha módulo onde é intencional (visão operacional, saúde, grupos do menu)', () => {
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
    // Desde 26/10/2026 os grupos do menu dividem módulo de propósito: as sete
    // telas de Analytics são leituras de 'reports', as oito de CRM são 'crm',
    // e assim por diante. A permissão é por área, não por tela.
    expect(compartilhados.sort()).toEqual([
      'alerts: alertas-prioritarios, alerts',
      'clinical_logs: evolucoes, linha-do-tempo, pep, riscos, score-risco',
      'crm: agenda, campanhas, chatbot, exames, historico-atendimento, lembretes, mensagens, nps',
      'dashboard: dashboard, indicadores-chave, operational-overview',
      'monitoring: agitacao-noturna, ausencia-quarto, incidentes, linha-eventos, monitoring, saude, sensores',
      'operations: checklists, escalas',
      'patients: alta-transferencia, fluxo-paciente, internacoes, patients',
      'reports: comparativos, heatmaps, indicadores-clinicos, insights, kpis, previsao, relatorios',
    ]);
  });

  it('mapeia o PEP para o módulo de registros clínicos', () => {
    // Divergência proposital entre o nome da tela e o nome do módulo:
    // se alguém "arrumar" isso, as permissões salvas param de casar.
    expect(getModuleForScreen('pep')).toBe('clinical_logs');
    expect(getModuleForScreen('beds-rooms')).toBe('beds');
  });

  it('compras e contratos têm módulo próprio; App Paciente usa o dos acompanhantes', () => {
    expect(getModuleForScreen('compras')).toBe('purchases');
    expect(getModuleForScreen('contratos')).toBe('contracts');
    expect(getModuleForScreen('app-paciente')).toBe('companions');
  });

  it('só Configurações abre para qualquer perfil (pelas seções pessoais)', () => {
    expect([...TELAS_DE_TODOS]).toEqual(['settings']);
  });

  it('assume a plataforma web por padrão', () => {
    expect(defaultPlatform).toBe('web');
  });
});

describe('telas por perfil (VISITOR, a banca do TCC)', () => {
  // A mesma lista de módulos que o VISITOR recebe em db/init/02_perfis.sql. Se
  // uma tela da RFC passar a precisar de outro módulo, o banco e esta lista
  // têm de mudar juntos — senão a tela abre vazia ou nem aparece.
  const MODULOS_DO_VISITOR = [
    'alerts', 'beds', 'companions', 'dashboard', 'monitoring',
    'patients', 'reports', 'settings', 'users',
  ];

  it('abre só as telas da RFC', () => {
    const abertas = TELAS.filter((t) => perfilAbreTela('VISITOR', t));
    expect(abertas.sort()).toEqual([...TELAS_DA_RFC].sort());
  });

  it('não abre o que a seção 2.6 da RFC deixa de fora, nem o que veio depois', () => {
    for (const tela of [
      'pep', 'evolucoes', 'score-risco', 'sensores', 'ausencia-quarto', 'linha-eventos',
      'internacoes', 'escalas', 'agenda', 'compras', 'contratos', 'saude',
      'previsao', 'insights', 'indicadores-chave', 'financeiro:pagar', 'financeiro:pessoal',
    ] as Screen[]) {
      expect(perfilAbreTela('VISITOR', tela), tela).toBe(false);
    }
  });

  it('toda tela liberada cai num módulo que o VISITOR recebe no banco', () => {
    const modulos = new Set([...TELAS_DA_RFC].map((t) => getModuleForScreen(t)));
    expect([...modulos].sort()).toEqual([...MODULOS_DO_VISITOR].sort());
  });

  it('reconhece o perfil que só vê o que a RFC especifica', () => {
    // Serve ao que não é tela, como o "Novo dashboard" (protótipo com números
    // de exemplo) e o simulador do app: só os perfis da banca deixam de recebê-lo.
    expect(perfilSoDaRfc('VISITOR')).toBe(true);
    expect(perfilSoDaRfc('TCC')).toBe(true);
    for (const role of ['ADMIN', 'MANAGER', 'NURSE', 'DOCTOR', 'SYSTEM'] as const) {
      expect(perfilSoDaRfc(role), role).toBe(false);
    }
    expect(perfilSoDaRfc(undefined)).toBe(false);
  });

  it('o TCC abre exatamente as mesmas telas do VISITOR', () => {
    // A diferença entre os dois é a escrita, que vem do banco (02_perfis.sql),
    // não o menu.
    const doVisitor = TELAS.filter((t) => perfilAbreTela('VISITOR', t));
    const doTcc = TELAS.filter((t) => perfilAbreTela('TCC', t));
    expect(doTcc).toEqual(doVisitor);
  });

  it('só restringe os perfis da banca: os outros seguem pelo módulo', () => {
    for (const role of ['ADMIN', 'MANAGER', 'NURSE', 'DOCTOR', 'SYSTEM'] as const) {
      expect(perfilAbreTela(role, 'sensores')).toBe(true);
      expect(perfilAbreTela(role, 'financeiro:pagar')).toBe(true);
    }
    expect(perfilAbreTela(undefined, 'compras')).toBe(true);
  });
});

describe('telas do módulo financeiro', () => {
  it('toda área do financeiro tem tela e módulo de permissão', () => {
    for (const area of AREAS_FINANCEIRO) {
      const tela = `financeiro:${area.chave}` as Screen;
      expect(ehTelaFinanceira(tela)).toBe(true);
      expect(['finance', 'payroll', 'finance_admin']).toContain(getModuleForScreen(tela));
    }
  });

  it('separa salário e capital do financeiro do dia a dia', () => {
    // Folha é dado pessoal (LGPD): quem lança conta a pagar não vê salário.
    expect(getModuleForScreen('financeiro:pessoal')).toBe('payroll');
    expect(getModuleForScreen('financeiro:capital')).toBe('finance_admin');
    expect(getModuleForScreen('financeiro:configuracoes')).toBe('finance_admin');
    expect(getModuleForScreen('financeiro:pagar')).toBe('finance');
    expect(getModuleForScreen('financeiro:relatorios')).toBe('finance');
  });

  it('cobre todos os recursos do módulo', () => {
    const recursos = new Set(AREAS_FINANCEIRO.map((a) => a.recurso));
    expect(Object.keys(MODULO_DO_RECURSO_FINANCEIRO).sort()).toEqual([...recursos].sort());
  });
});
