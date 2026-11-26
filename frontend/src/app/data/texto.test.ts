import { describe, expect, it } from 'vitest';
import { emailValido, semBarraFinal } from './texto';

describe('emailValido', () => {
  it.each(['ana@hospital.com', 'ana.souza@clinica.com.br', 'a+b@x.io'])('aceita %s', (email) => {
    expect(emailValido(email)).toBe(true);
  });

  it.each([
    '',
    'sem-arroba',
    'ana@semponto',
    '@hospital.com',
    'ana@',
    'ana@.com',
    'ana@hospital..com',
    'ana@hospital.',
    'ana souza@hospital.com',
    'a@b@c.com',
  ])('recusa %j', (email) => {
    expect(emailValido(email)).toBe(false);
  });

  it('recusa e-mail maior que 254 caracteres', () => {
    expect(emailValido(`${'a'.repeat(250)}@x.com`)).toBe(false);
  });

  it('responde depressa a uma entrada montada para o retrocesso (ReDoS)', () => {
    const hostil = `a@${'a.'.repeat(120)}`; // 242 caracteres, termina em ponto
    const inicio = performance.now();
    expect(emailValido(hostil)).toBe(false);
    expect(performance.now() - inicio).toBeLessThan(50);
  });
});

describe('semBarraFinal', () => {
  it('tira as barras do fim e só elas', () => {
    expect(semBarraFinal('http://api.local///')).toBe('http://api.local');
    expect(semBarraFinal('http://api.local/v1/')).toBe('http://api.local/v1');
    expect(semBarraFinal('http://api.local')).toBe('http://api.local');
  });

  it('aceita vazio e só barras', () => {
    expect(semBarraFinal('')).toBe('');
    expect(semBarraFinal('////')).toBe('');
  });
});
