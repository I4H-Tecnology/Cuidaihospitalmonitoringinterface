import { describe, expect, it } from 'vitest';
import type { ParcelaDetalhe } from '../api/tipos';
import {
  compensar,
  dividirCentavos,
  linhaDaParcela,
  linhaNova,
  mudouAlgo,
  pedeMotivo,
  refazer,
  resumirPlano,
  vencimentosMensais,
} from './parcelas';

function parcela(numero: number, vencimento: string, valor: string, extra: Partial<ParcelaDetalhe> = {}): ParcelaDetalhe {
  return {
    id: `p${numero}`, numero, vencimento, valor, valorPago: '0.00', saldo: valor, status: 'aberta',
    vencida: false, codigoBarras: null, baixas: [], ...extra,
  };
}

const paga = (numero: number, vencimento: string, valor: string) =>
  parcela(numero, vencimento, valor, {
    status: 'paga', valorPago: valor, saldo: '0.00',
    baixas: [{ id: `b${numero}`, parcelaId: `p${numero}`, data: vencimento, valor, juros: '0.00', multa: '0.00', desconto: '0.00', forma: 'pix', observacao: null, estornadaEm: null, motivoEstorno: null, criadoPor: null, contaNome: 'Banco', conciliada: false }],
  });

// Título de 1.200 em 3x de 400, com a primeira paga.
const parcelas = [paga(1, '2026-09-10', '400.00'), parcela(2, '2026-10-10', '400.00'), parcela(3, '2026-11-10', '400.00')];
const abertas = parcelas.slice(1).map(linhaDaParcela);

describe('divisão e vencimentos', () => {
  it('divide sem perder centavo, com a sobra na primeira (como o servidor)', () => {
    expect(dividirCentavos(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(dividirCentavos(80000, 4)).toEqual([20000, 20000, 20000, 20000]);
  });

  it('repete o dia do mês, e dia 31 cai no último dia dos meses curtos', () => {
    expect(vencimentosMensais('2026-01-31', 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('resumo do plano', () => {
  it('sem mudança, não há o que confirmar', () => {
    const r = resumirPlano(parcelas, abertas);
    expect(mudouAlgo(r)).toBe(false);
    expect(r.pagas).toHaveLength(1);
    expect(r.totalAntes).toBe(120000);
  });

  it('separa alteradas, excluídas e novas, e pede motivo quando exclui ou muda o total', () => {
    const linhas = [{ ...abertas[0], vencimento: '2026-10-20' }, linhaNova('2026-12-10', '400.00')];
    const r = resumirPlano(parcelas, linhas);
    expect(r.alteradas).toEqual([
      { numero: 2, antes: { vencimento: '2026-10-10', valor: '400.00', codigoBarras: '' }, depois: { vencimento: '2026-10-20', valor: '400.00', codigoBarras: '' } },
    ]);
    expect(r.excluidas.map((p) => p.numero)).toEqual([3]);
    expect(r.novas).toHaveLength(1);
    expect(r.totalDepois).toBe(120000);
    expect(pedeMotivo(r)).toBe(true);

    const soDatas = resumirPlano(parcelas, [{ ...abertas[0], vencimento: '2026-10-20' }, abertas[1]]);
    expect(pedeMotivo(soDatas)).toBe(false);
  });
});

describe('refazer o saldo', () => {
  it('reaproveita as parcelas que existem e cria só as que faltam', () => {
    const linhas = refazer(abertas, 4, '2026-10-05', 80000);
    expect(linhas.map((l) => [l.id, l.vencimento, l.valor])).toEqual([
      ['p2', '2026-10-05', '200.00'],
      ['p3', '2026-11-05', '200.00'],
      [null, '2026-12-05', '200.00'],
      [null, '2027-01-05', '200.00'],
    ]);
    // Em menos vezes, a que sobra sai.
    expect(refazer(abertas, 1, '2026-10-05', 80000).map((l) => l.id)).toEqual(['p2']);
  });

  it('parcela com pagamento no histórico fica como está', () => {
    const comEstorno = { ...abertas[0], teveBaixa: true };
    const linhas = refazer([comEstorno, abertas[1]], 2, '2026-12-01', 40000);
    expect(linhas[0]).toBe(comEstorno);
    expect(linhas.slice(1).map((l) => [l.id, l.valor])).toEqual([['p3', '200.00'], [null, '200.00']]);
  });
});

describe('compensar a diferença', () => {
  it('leva a diferença para as parcelas seguintes e mantém o total', () => {
    const editada = [{ ...abertas[0], valor: '500.00' }, abertas[1]];
    const resultado = compensar(editada, 'p2', 120000, 40000);
    expect(Array.isArray(resultado) && resultado.map((l) => l.valor)).toEqual(['500.00', '300.00']);
  });

  it('sem parcela mudada (só tirou uma), divide entre todas as que ficaram', () => {
    const tres = [abertas[0], abertas[1], linhaNova('2026-12-10', '400.00')];
    // Tirou a terceira: faltam 400 para o total de 1.600 (400 pagos + 3 × 400).
    const resultado = compensar(tres.slice(0, 2), null, 160000, 40000);
    expect(Array.isArray(resultado) && resultado.map((l) => l.valor)).toEqual(['600.00', '600.00']);
  });

  it('sem parcela depois, usa as de antes; e recusa o que zeraria uma parcela', () => {
    const editada = [abertas[0], { ...abertas[1], valor: '450.00' }];
    const resultado = compensar(editada, 'p3', 120000, 40000);
    expect(Array.isArray(resultado) && resultado.map((l) => l.valor)).toEqual(['350.00', '450.00']);
    expect(typeof compensar([abertas[0], { ...abertas[1], valor: '900.00' }], 'p3', 120000, 40000)).toBe('string');
  });
});
