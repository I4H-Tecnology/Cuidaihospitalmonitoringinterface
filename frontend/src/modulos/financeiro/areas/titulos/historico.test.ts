import { describe, expect, it } from 'vitest';
import type { Historico, ParcelaDetalhe } from '../../api/tipos';
import { descreverHistorico } from './historico';

const REPARCELOU = '2026-09-26T19:00:00+00:00';
const LANCOU = '2026-09-01T10:00:00+00:00';

function linha(em: string, tabela: string, operacao: Historico['operacao'], registroId: string, antes: object | null, depois: object | null, motivo: string | null = null): Historico {
  return { em, tabela, operacao, registroId, antes: antes as Historico['antes'], depois: depois as Historico['depois'], usuarioNome: 'Ana', motivo };
}

// Como a API devolve: mais nova primeiro (hora e id decrescentes).
const historico: Historico[] = [
  linha(REPARCELOU, 'rateio', 'UPDATE', 'r1', { valor: 900 }, { valor: 990 }, 'acordo'),
  linha(REPARCELOU, 'titulo', 'UPDATE', 't1', { valorTotal: 1200 }, { valorTotal: 1320 }, 'acordo'),
  linha(REPARCELOU, 'parcela', 'UPDATE', 'p9', { numero: 5 }, { numero: 3 }, 'acordo'),
  linha(REPARCELOU, 'parcela', 'INSERT', 'p9', null, { numero: 5, vencimento: '2026-12-05', valor: 320 }, 'acordo'),
  linha(REPARCELOU, 'parcela', 'UPDATE', 'p2', { vencimento: '2026-10-10' }, { vencimento: '2026-10-20' }, 'acordo'),
  linha(REPARCELOU, 'parcela', 'DELETE', 'p3', { numero: 3, vencimento: '2026-11-10', valor: 400 }, null, 'acordo'),
  linha(LANCOU, 'rateio', 'INSERT', 'r1', null, { valor: 900 }),
  linha(LANCOU, 'parcela', 'INSERT', 'p3', null, { numero: 3 }),
  linha(LANCOU, 'parcela', 'INSERT', 'p2', null, { numero: 2 }),
  linha(LANCOU, 'parcela', 'INSERT', 'p1', null, { numero: 1 }),
  linha(LANCOU, 'titulo', 'INSERT', 't1', null, { valorTotal: 1200 }),
];

const atuais = [
  { id: 'p1', numero: 1 }, { id: 'p2', numero: 2 }, { id: 'p9', numero: 3 },
] as ParcelaDetalhe[];

describe('histórico do título', () => {
  const entradas = descreverHistorico(historico, atuais);
  const texto = entradas.map((e) => [e.frase, ...e.detalhes].join(' | ').replace(/\s/g, ' '));

  it('junta o que foi feito na mesma operação, com o motivo', () => {
    expect(texto).toEqual([
      'ajustou os valores das categorias',
      'alterou o título | total R$ 1.200,00 → R$ 1.320,00',
      'alterou uma parcela | parcela 2: vencimento 10/10/2026 → 20/10/2026',
      'incluiu uma parcela | parcela 3: vence em 05/12/2026, R$ 320,00',
      'excluiu uma parcela | parcela 3: vence em 10/11/2026, R$ 400,00',
      'lançou o título em 3 parcelas',
    ]);
    expect(entradas.slice(0, 5).every((e) => e.motivo === 'acordo' && e.usuario === 'Ana')).toBe(true);
  });

  it('mostra a renumeração de parcela que já existia', () => {
    const renumerou = [linha(REPARCELOU, 'parcela', 'UPDATE', 'p2', { numero: 3 }, { numero: 2 })];
    expect(descreverHistorico(renumerou, atuais)[0].detalhes).toEqual(['parcela 2: passou de nº 3 para nº 2']);
  });
});
