import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Lido do disco: no Vitest, `theme.css?raw` volta vazio (CSS não é processado nos testes).
// Os testes rodam a partir de frontend/ (npm run test), no CI e localmente.
const tema = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');

/*
 * Cartão em degradê claro (`from-<cor>-50`) precisa de tradução no tema escuro.
 * Sem ela o texto cinza clareia e o fundo continua quase branco: o texto some
 * (cartão "Detecção de quedas" do Dashboard, 26/11/2026). Este teste lê as
 * telas e falha se aparecer um `from-<cor>-50` sem a regra correspondente em
 * theme.css, a menos que o próprio elemento já declare `dark:from-` ou `dark:bg-`.
 */
const telas = import.meta.glob('../app/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function coresUsadas(): Map<string, string[]> {
  const usadas = new Map<string, string[]>();
  for (const [arquivo, codigo] of Object.entries(telas)) {
    if (arquivo.includes('.test.')) continue;
    for (const classes of codigo.matchAll(/className="([^"]*)"/g)) {
      const lista = classes[1];
      if (/\bdark:(from|bg)-/.test(lista)) continue;
      for (const m of lista.matchAll(/\bfrom-([a-z]+)-50\b/g)) {
        usadas.set(m[1], [...(usadas.get(m[1]) ?? []), arquivo]);
      }
    }
  }
  return usadas;
}

describe('tema escuro: cartões em degradê claro', () => {
  it('as telas usam algum degradê claro (o teste está olhando os arquivos certos)', () => {
    expect(coresUsadas().size).toBeGreaterThan(0);
  });

  it('toda cor `from-<cor>-50` usada nas telas tem tradução no tema escuro', () => {
    const semRegra = [...coresUsadas()]
      .filter(([cor]) => !tema.includes(`.dark [class~="from-${cor}-50"]`))
      .map(([cor, arquivos]) => `from-${cor}-50 em ${[...new Set(arquivos)].join(', ')}`);
    expect(semRegra).toEqual([]);
  });

  it('a tradução tira o degradê e põe o tingido da mesma família', () => {
    const regra = tema.split('\n').find((l) => l.startsWith('.dark [class~="from-purple-50"]')) ?? '';
    expect(regra).toContain('background-image: none');
    expect(regra).toContain('color-mix(in oklab, #a855f7 14%, var(--superficie))');
  });
});
