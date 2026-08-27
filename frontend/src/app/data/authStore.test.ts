import { describe, expect, it } from 'vitest';
import {
  addAccessLog,
  addUser,
  buildUserAvatar,
  clearFailedAttempts,
  deleteUser,
  getPermissions,
  getSecurityPolicy,
  getSystemDefaultPassword,
  getTenantData,
  hashPassword,
  isPasswordExpired,
  isPasswordStrong,
  isTenantActive,
  isUserLocked,
  listAccessLogs,
  listUsers,
  registerFailedAttempt,
  seedTenant,
  updateSecurityPolicy,
  updateUser,
  verifyPassword,
  type SecurityPolicy,
  type UserRecord,
} from './authStore';

const TENANT = 'hospital-teste';

const policy = (overrides: Partial<SecurityPolicy> = {}): SecurityPolicy => ({
  requireStrongPassword: true,
  minPasswordLength: 8,
  passwordExpiryDays: 90,
  maxFailedAttempts: 3,
  lockoutMinutes: 30,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  disallowPersonalData: true,
  blockedPasswords: [],
  forcePasswordChangeOnFirstAccess: true,
  adminResetPasswordTtlHours: 24,
  idleTimeoutMinutes: 30,
  twoFactorEnabled: false,
  ...overrides,
});

const makeUser = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: 'user-1',
  tenantId: TENANT,
  name: 'Ana Paula Souza',
  email: 'ana@hospital.com',
  login: 'ana.souza',
  passwordHash: hashPassword('Senha@123'),
  role: 'NURSE',
  status: 'active',
  platforms: ['web'],
  unit: 'UTI',
  createdAt: new Date().toISOString(),
  failedAttempts: 0,
  ...overrides,
});

const days = (n: number) => n * 24 * 60 * 60 * 1000;

describe('política de senha', () => {
  it('exige comprimento mínimo, maiúscula, minúscula, número e caractere especial', () => {
    expect(isPasswordStrong('Senha@123', policy())).toBe(true);

    expect(isPasswordStrong('Se@1', policy())).toBe(false); // curta
    expect(isPasswordStrong('senha@123', policy())).toBe(false); // sem maiúscula
    expect(isPasswordStrong('SENHA@123', policy())).toBe(false); // sem minúscula
    expect(isPasswordStrong('Senha@abc', policy())).toBe(false); // sem número
    expect(isPasswordStrong('Senha1234', policy())).toBe(false); // sem especial
  });

  it('permite desligar cada exigência individualmente', () => {
    // O dev tornou cada requisito um flag próprio, em vez de um bloco fixo.
    expect(isPasswordStrong('Senha1234', policy({ requireSpecialChar: false }))).toBe(true);
    expect(isPasswordStrong('senha@123', policy({ requireUppercase: false }))).toBe(true);
    expect(isPasswordStrong('SENHA@123', policy({ requireLowercase: false }))).toBe(true);
    expect(isPasswordStrong('Senha@abc', policy({ requireNumber: false }))).toBe(true);
  });

  it('recusa senha que está na blocklist, mesmo atendendo os demais critérios', () => {
    const comBlocklist = policy({ blockedPasswords: ['Senha@123'] });
    expect(isPasswordStrong('Senha@123', comBlocklist)).toBe(false);
    expect(isPasswordStrong('Outra@456', comBlocklist)).toBe(true);
  });

  it('respeita o comprimento mínimo configurado pelo tenant', () => {
    expect(isPasswordStrong('Ab@12345678', policy({ minPasswordLength: 12 }))).toBe(false);
    expect(isPasswordStrong('Ab@123456789', policy({ minPasswordLength: 12 }))).toBe(true);
  });

  it('aceita qualquer senha quando a exigência está desligada', () => {
    expect(isPasswordStrong('123', policy({ requireStrongPassword: false }))).toBe(true);
  });
});

describe('expiração de senha', () => {
  it('não expira quando o usuário nunca trocou a senha', () => {
    expect(isPasswordExpired(makeUser({ passwordChangedAt: undefined }), policy())).toBe(false);
  });

  it('não expira dentro da janela da política', () => {
    const user = makeUser({ passwordChangedAt: new Date(Date.now() - days(89)).toISOString() });
    expect(isPasswordExpired(user, policy())).toBe(false);
  });

  it('expira depois da janela da política', () => {
    const user = makeUser({ passwordChangedAt: new Date(Date.now() - days(91)).toISOString() });
    expect(isPasswordExpired(user, policy())).toBe(true);
  });

  it('nunca expira quando a política zera o prazo', () => {
    const user = makeUser({ passwordChangedAt: new Date(Date.now() - days(3650)).toISOString() });
    expect(isPasswordExpired(user, policy({ passwordExpiryDays: 0 }))).toBe(false);
  });
});

describe('bloqueio por tentativas falhas (janela deslizante)', () => {
  // O dev trocou a contagem cumulativa por uma janela: tentativa que chega
  // depois de `lockoutMinutes` da primeira reinicia o contador. Sem informar
  // failedAttemptWindowStartedAt, toda tentativa vale como a primeira.
  const dentroDaJanela = () => new Date(Date.now() - 60 * 1000).toISOString();

  it('conta a tentativa sem bloquear antes do limite', () => {
    seedTenantWithUser();
    const updated = registerFailedAttempt(TENANT, makeUser(), policy());

    expect(updated.failedAttempts).toBe(1);
    expect(updated.status).toBe('active');
    expect(updated.lockedUntil).toBeUndefined();
  });

  it('abre a janela na primeira tentativa', () => {
    seedTenantWithUser();
    const updated = registerFailedAttempt(TENANT, makeUser(), policy());

    expect(updated.failedAttemptWindowStartedAt).toBeTruthy();
  });

  it('acumula tentativas que caem dentro da janela', () => {
    seedTenantWithUser();
    const updated = registerFailedAttempt(
      TENANT,
      makeUser({ failedAttempts: 1, failedAttemptWindowStartedAt: dentroDaJanela() }),
      policy(),
    );

    expect(updated.failedAttempts).toBe(2);
    expect(updated.status).toBe('active');
  });

  it('reinicia a contagem quando a janela já expirou', () => {
    seedTenantWithUser();
    const janelaVelha = new Date(Date.now() - 31 * 60 * 1000).toISOString(); // > lockoutMinutes
    const updated = registerFailedAttempt(
      TENANT,
      makeUser({ failedAttempts: 2, failedAttemptWindowStartedAt: janelaVelha }),
      policy(),
    );

    expect(updated.failedAttempts).toBe(1);
    expect(updated.status).toBe('active');
  });

  it('bloqueia o usuário ao atingir o número máximo dentro da janela', () => {
    seedTenantWithUser();
    const updated = registerFailedAttempt(
      TENANT,
      makeUser({ failedAttempts: 2, failedAttemptWindowStartedAt: dentroDaJanela() }),
      policy(),
    );

    expect(updated.failedAttempts).toBe(3);
    expect(updated.status).toBe('blocked');
    expect(updated.lockedUntil).toBeDefined();
    expect(isUserLocked(updated)).toBe(true);
  });

  it('considera o usuário liberado depois que o prazo de bloqueio passa', () => {
    const expirado = makeUser({ lockedUntil: new Date(Date.now() - 1000).toISOString() });
    expect(isUserLocked(expirado)).toBe(false);
  });

  it('persiste o bloqueio no tenant, não só no objeto devolvido', () => {
    seedTenantWithUser();
    registerFailedAttempt(
      TENANT,
      makeUser({ failedAttempts: 2, failedAttemptWindowStartedAt: dentroDaJanela() }),
      policy(),
    );

    const persistido = listUsers(TENANT).find((u) => u.id === 'user-1');
    expect(persistido?.status).toBe('blocked');
  });

  it('zera contador e janela ao liberar o usuário', () => {
    seedTenantWithUser();
    const bloqueado = registerFailedAttempt(
      TENANT,
      makeUser({ failedAttempts: 2, failedAttemptWindowStartedAt: dentroDaJanela() }),
      policy(),
    );
    const liberado = clearFailedAttempts(TENANT, bloqueado);

    expect(liberado.failedAttempts).toBe(0);
    expect(liberado.lockedUntil).toBeUndefined();
    expect(liberado.failedAttemptWindowStartedAt).toBeUndefined();
  });

  // BUG CONHECIDO — este teste documenta o comportamento atual, não o desejado.
  // clearFailedAttempts limpa contador, janela e prazo, mas deixa
  // status='blocked'. O usuário fica permanentemente bloqueado mesmo depois de
  // o lockout expirar. Ao corrigir, troque a asserção para 'active'.
  it('BUG: não devolve o status para active ao liberar o usuário', () => {
    seedTenantWithUser();
    const bloqueado = registerFailedAttempt(
      TENANT,
      makeUser({ failedAttempts: 2, failedAttemptWindowStartedAt: dentroDaJanela() }),
      policy(),
    );
    const liberado = clearFailedAttempts(TENANT, bloqueado);

    expect(bloqueado.status).toBe('blocked');
    expect(liberado.status).toBe('blocked');
  });
});

describe('CRUD de usuários por tenant', () => {
  it('cria o tenant com o usuário de sistema no primeiro acesso', () => {
    const users = listUsers(TENANT);

    expect(users).toHaveLength(1);
    expect(users[0].role).toBe('SYSTEM');
    expect(users[0].isSystemUser).toBe(true);
    expect(isTenantActive(TENANT)).toBe(true);
  });

  it('adiciona e lista usuários', () => {
    addUser(TENANT, makeUser());

    expect(listUsers(TENANT).map((u) => u.login)).toContain('ana.souza');
  });

  it('atualiza apenas o usuário correspondente ao id', () => {
    addUser(TENANT, makeUser());
    addUser(TENANT, makeUser({ id: 'user-2', login: 'bruno.lima', name: 'Bruno Lima' }));

    updateUser(TENANT, makeUser({ unit: 'Emergência' }));

    const users = listUsers(TENANT);
    expect(users.find((u) => u.id === 'user-1')?.unit).toBe('Emergência');
    expect(users.find((u) => u.id === 'user-2')?.unit).toBe('UTI');
  });

  it('remove um usuário comum', () => {
    addUser(TENANT, makeUser());

    expect(deleteUser(TENANT, 'user-1')).toBe(true);
    expect(listUsers(TENANT).find((u) => u.id === 'user-1')).toBeUndefined();
  });

  it('recusa remover o usuário de sistema', () => {
    const sistema = listUsers(TENANT).find((u) => u.isSystemUser)!;

    expect(deleteUser(TENANT, sistema.id)).toBe(false);
    expect(listUsers(TENANT).find((u) => u.id === sistema.id)).toBeDefined();
  });

  it('isola os dados entre tenants diferentes', () => {
    addUser(TENANT, makeUser());

    expect(listUsers('outro-hospital').map((u) => u.login)).not.toContain('ana.souza');
  });
});

describe('trilha de auditoria', () => {
  it('registra o acesso com tenant, id e data preenchidos', () => {
    addAccessLog(TENANT, { user_id: 'user-1', action: 'LOGIN', status: 'SUCESSO' } as never);

    const [log] = listAccessLogs(TENANT);
    expect(log.tenant_id).toBe(TENANT);
    expect(log.id).toBeTruthy();
    expect(log.created_at).toBeTruthy();
  });

  it('mantém o log mais recente no topo', () => {
    addAccessLog(TENANT, { action: 'LOGIN', status: 'SUCESSO' } as never);
    addAccessLog(TENANT, { action: 'LOGOUT', status: 'SUCESSO' } as never);

    expect(listAccessLogs(TENANT)[0].action).toBe('LOGOUT');
  });
});

describe('política de segurança e permissões', () => {
  it('devolve a política padrão para um tenant novo', () => {
    // O dev afrouxou o número de tentativas (3 -> 5) e encurtou o bloqueio
    // (30 -> 5 min), além de desligar a expiração de senha por padrão.
    const padrao = getSecurityPolicy(TENANT);
    expect(padrao.maxFailedAttempts).toBe(5);
    expect(padrao.lockoutMinutes).toBe(5);
    expect(padrao.passwordExpiryDays).toBe(0);
    expect(padrao.forcePasswordChangeOnFirstAccess).toBe(true);
    expect(padrao.blockedPasswords.length).toBeGreaterThan(0);
  });

  it('persiste a política alterada', () => {
    updateSecurityPolicy(TENANT, policy({ maxFailedAttempts: 5, twoFactorEnabled: true }));

    const salva = getSecurityPolicy(TENANT);
    expect(salva.maxFailedAttempts).toBe(5);
    expect(salva.twoFactorEnabled).toBe(true);
  });

  it('gera permissões padrão sob demanda para um papel ainda não configurado', () => {
    const permissoes = getPermissions(TENANT, 'DOCTOR');

    expect(Array.isArray(permissoes)).toBe(true);
    expect(permissoes.length).toBeGreaterThan(0);
    expect(permissoes[0]).toHaveProperty('module');
    expect(permissoes[0]).toHaveProperty('view');
  });
});

describe('resiliência do armazenamento', () => {
  it('recria o tenant quando o localStorage está corrompido', () => {
    listUsers(TENANT); // garante que existe
    localStorage.setItem(`cuidai_tenant_${TENANT}`, '{ isso não é json');

    const data = getTenantData(TENANT);
    expect(data.tenantId).toBe(TENANT);
    expect(data.users.some((u) => u.isSystemUser)).toBe(true);
  });
});

describe('utilitários', () => {
  it('monta o avatar com as duas primeiras iniciais', () => {
    expect(buildUserAvatar('Ana Paula Souza')).toBe('AP');
    expect(buildUserAvatar('Bruno')).toBe('B');
  });

  it('expõe a senha padrão do usuário de sistema', () => {
    expect(getSystemDefaultPassword()).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------
   VULNERABILIDADE DOCUMENTADA — não é um teste de aprovação.

   hashPassword() é btoa(): Base64, não hash. É reversível com uma linha.
   Os testes abaixo pinam esse comportamento para que, quando o hash real
   (bcrypt/argon2 no backend) entrar, eles QUEBREM e obriguem a revisão aqui.

   Ao corrigir: apague este bloco inteiro junto com a função.
--------------------------------------------------------------------------- */
describe('hash de senha (INSEGURO — ver comentário acima)', () => {
  it('faz o roundtrip de verificação', () => {
    const hash = hashPassword('Senha@123');
    expect(verifyPassword('Senha@123', hash)).toBe(true);
    expect(verifyPassword('Senha@124', hash)).toBe(false);
  });

  it('é reversível: qualquer um recupera a senha original a partir do "hash"', () => {
    const hash = hashPassword('Senha@123');
    expect(atob(hash)).toBe('Senha@123');
  });
});

function seedTenantWithUser() {
  seedTenant(TENANT);
  listUsers(TENANT);
  addUser(TENANT, makeUser());
}
