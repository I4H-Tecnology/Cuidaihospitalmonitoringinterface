import { describe, expect, it } from 'vitest';
import { TEMAS, lerTemaSalvo, temaPorId } from './temas';

function storage(valores: Record<string, string>) {
  return { getItem: (chave: string) => valores[chave] ?? null };
}

describe('lerTemaSalvo', () => {
  it('devolve o tema salvo', () => {
    expect(lerTemaSalvo(storage({ 'cuidai-tema': 'areia' }))).toBe('areia');
  });

  it('mantém no escuro quem só tinha a preferência antiga', () => {
    expect(lerTemaSalvo(storage({ 'cuidai-dark-mode': 'true' }))).toBe('escuro');
    expect(lerTemaSalvo(storage({ 'cuidai-dark-mode': 'false' }))).toBe('claro');
  });

  it('cai no claro com valor desconhecido ou storage bloqueado', () => {
    expect(lerTemaSalvo(storage({ 'cuidai-tema': 'neon' }))).toBe('claro');
    expect(lerTemaSalvo({ getItem: () => { throw new Error('bloqueado'); } })).toBe('claro');
  });
});

describe('TEMAS', () => {
  it('o par de cada tema existe e é do lado oposto (claro ↔ escuro)', () => {
    for (const tema of TEMAS) {
      const par = temaPorId(tema.par);
      expect(par.id).toBe(tema.par);
      expect(par.escuro).toBe(!tema.escuro);
    }
  });
});
