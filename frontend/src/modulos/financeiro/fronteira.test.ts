import { describe, expect, it } from 'vitest';

/**
 * A fronteira do módulo: nada nesta pasta importa do sistema hospedeiro.
 *
 * É isto que permite copiar `src/modulos/financeiro` para outro projeto
 * React. Se um dia alguém importar um componente do MedSignal "só para
 * aproveitar", este teste quebra antes de o módulo deixar de ser portável.
 */

const fontes = import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PACOTES_PERMITIDOS = ['react', 'react-dom', 'lucide-react', 'recharts', 'vitest', '@testing-library/react', '@testing-library/user-event'];

function importacoes(codigo: string): string[] {
  const achadas: string[] = [];
  const padrao = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const casou of codigo.matchAll(padrao)) achadas.push(casou[1] ?? casou[2]);
  return achadas;
}

function saiDaPasta(arquivo: string, alvo: string): boolean {
  // arquivo: './areas/pessoal/Folhas.tsx' -> profundidade 2 dentro da pasta do módulo
  const profundidade = arquivo.split('/').length - 2;
  const subidas = alvo.split('/').filter((p) => p === '..').length;
  return subidas > profundidade;
}

describe('fronteira do módulo financeiro', () => {
  it('encontrou os arquivos do módulo', () => {
    expect(Object.keys(fontes).length).toBeGreaterThan(20);
  });

  it('não importa nada do sistema hospedeiro', () => {
    const violacoes: string[] = [];
    for (const [arquivo, codigo] of Object.entries(fontes)) {
      for (const alvo of importacoes(codigo)) {
        if (alvo.startsWith('.')) {
          if (saiDaPasta(arquivo, alvo)) violacoes.push(`${arquivo} -> ${alvo}`);
        } else if (alvo.startsWith('@/') || !PACOTES_PERMITIDOS.some((p) => alvo === p || alvo.startsWith(`${p}/`))) {
          violacoes.push(`${arquivo} -> ${alvo}`);
        }
      }
    }
    expect(violacoes).toEqual([]);
  });
});
