import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO, lerPreferencias } from './preferencias';
import { SECOES, filtrarSecoes } from '../components/settings/secoes';

const storage = (valor: string | null) => ({ getItem: () => valor });

describe('lerPreferencias', () => {
  it('sem nada salvo, devolve o padrão (som e vibração ligados)', () => {
    expect(lerPreferencias(storage(null))).toEqual(PREFERENCIAS_PADRAO);
    expect(PREFERENCIAS_PADRAO.somDeQueda).toBe(true);
  });

  it('aproveita o que é válido e ignora o resto', () => {
    const prefs = lerPreferencias(storage(JSON.stringify({ tamanhoTexto: 'maior', somDeQueda: false, vibrar: 'sim', tamanho: 3 })));
    expect(prefs.tamanhoTexto).toBe('maior');
    expect(prefs.somDeQueda).toBe(false);
    expect(prefs.vibrar).toBe(PREFERENCIAS_PADRAO.vibrar);
  });

  it('JSON quebrado não derruba a tela', () => {
    expect(lerPreferencias(storage('{quebrado'))).toEqual(PREFERENCIAS_PADRAO);
  });
});

describe('filtrarSecoes', () => {
  it('acha sem acento e pelos termos extras', () => {
    expect(filtrarSecoes(SECOES, 'cafe').map((s) => s.id)).toEqual(['aparencia']);
    expect(filtrarSecoes(SECOES, 'SENHA').map((s) => s.id)).toContain('conta');
  });

  it('busca vazia devolve tudo', () => {
    expect(filtrarSecoes(SECOES, '  ')).toHaveLength(SECOES.length);
  });
});
