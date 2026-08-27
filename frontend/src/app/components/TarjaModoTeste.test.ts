import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A flag chega como string do ambiente, então cada import precisa ser fresco. */
const carregar = async () => {
  vi.resetModules();
  return import('./TarjaModoTeste');
};

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe('leitura da flag de modo de teste', () => {
  it.each(['true', 'TRUE', '1', 'sim', 'on', 'yes', 't', '  true  '])(
    'reconhece "%s" como ligado',
    async (valor) => {
      vi.stubEnv('VITE_MODO_TESTE', valor);
      const { modoTesteAtivo } = await carregar();
      expect(modoTesteAtivo()).toBe(true);
    },
  );

  it.each(['false', '0', 'nao', 'off', '', 'qualquer coisa'])(
    'trata "%s" como desligado',
    async (valor) => {
      vi.stubEnv('VITE_MODO_TESTE', valor);
      const { modoTesteAtivo } = await carregar();
      expect(modoTesteAtivo()).toBe(false);
    },
  );

  it('desliga quando a variável não existe', async () => {
    vi.stubEnv('VITE_MODO_TESTE', undefined as unknown as string);
    const { modoTesteAtivo } = await carregar();
    expect(modoTesteAtivo()).toBe(false);
  });

  // O padrão seguro é DESLIGADO. Se a leitura falhasse para ligado, uma
  // instalação real exibiria "modo de teste" e perderia credibilidade; se
  // falhasse para desligado num teste, o risco é o inverso e maior — por isso
  // o comportamento na ausência da flag é explicitamente testado acima.
  it('não confunde a string "false" com o booleano verdadeiro', async () => {
    vi.stubEnv('VITE_MODO_TESTE', 'false');
    const { modoTesteAtivo } = await carregar();
    expect(modoTesteAtivo()).toBe(false);
  });
});
