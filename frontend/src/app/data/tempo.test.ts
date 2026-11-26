import { describe, expect, it } from 'vitest';
import { maisRecente } from './tempo';

describe('maisRecente', () => {
  it('devolve a data mais recente de uma lista', () => {
    expect(maisRecente(['2026-11-19T10:00:00Z', '2026-11-19T12:30:00Z', '2026-11-18T23:59:59Z'])).toBe('2026-11-19T12:30:00Z');
  });

  it('compara o instante, não o texto: fusos diferentes', () => {
    // 12:00+02:00 é 10:00Z, ANTERIOR a 11:00Z; como texto, "12:00..." viria depois de "11:00...".
    const datas = ['2026-11-19T12:00:00+02:00', '2026-11-19T11:00:00Z'];
    expect(maisRecente(datas)).toBe('2026-11-19T11:00:00Z');
    expect([...datas].sort().at(-1)).toBe('2026-11-19T12:00:00+02:00'); // o que o sort() antigo devolvia
  });

  it('lista vazia devolve undefined; datas inválidas são ignoradas', () => {
    expect(maisRecente([])).toBeUndefined();
    expect(maisRecente(['isto não é data', '2026-11-19T10:00:00Z'])).toBe('2026-11-19T10:00:00Z');
    expect(maisRecente(['lixo'])).toBeUndefined();
  });
});
