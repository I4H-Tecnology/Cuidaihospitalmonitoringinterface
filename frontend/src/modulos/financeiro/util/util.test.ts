import { describe, expect, it } from 'vitest';
import {
  deCentavos,
  formatarBRL,
  formatarCompacto,
  lerValorDigitado,
  paraCentavos,
  paraEdicao,
  somar,
} from './dinheiro';
import {
  diasEntre,
  fimDoMes,
  formatarCompetencia,
  formatarData,
  hojeISO,
  somarDias,
  somarMeses,
} from './datas';
import { montarCsv, numeroPlanilha } from './csv';

describe('dinheiro', () => {
  it('converte texto da API em centavos sem passar por float', () => {
    expect(paraCentavos('1234.56')).toBe(123456);
    expect(paraCentavos('0.1')).toBe(10);
    expect(paraCentavos('-89.9')).toBe(-8990);
    expect(paraCentavos('10.005')).toBe(1001); // meio para cima, como o servidor
    expect(paraCentavos(null)).toBe(0);
    expect(paraCentavos('abc')).toBe(0);
  });

  it('soma em centavos: 0,1 + 0,2 é 0,30', () => {
    expect(somar('0.10', '0.20')).toBe('0.30');
    expect(somar('1000.00', '-390.00', null)).toBe('610.00');
    expect(deCentavos(-5)).toBe('-0.05');
  });

  it('formata em real', () => {
    expect(formatarBRL('1234.5').replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(formatarCompacto('12900').replace(/\s/g, ' ')).toBe('R$ 12,9 mil');
    expect(formatarCompacto('2500000').replace(/\s/g, ' ')).toBe('R$ 2,5 mi');
    expect(paraEdicao('1234.5')).toBe('1.234,50');
  });

  it('lê o que a pessoa digita, no jeito brasileiro ou não', () => {
    expect(lerValorDigitado('1.234,56')).toBe('1234.56');
    expect(lerValorDigitado('R$ 1.234,56')).toBe('1234.56');
    expect(lerValorDigitado('1234,5')).toBe('1234.50');
    expect(lerValorDigitado('1234.56')).toBe('1234.56');
    expect(lerValorDigitado('1.234')).toBe('1234.00');
    expect(lerValorDigitado('-50')).toBe('-50.00');
    expect(lerValorDigitado('abc')).toBeNull();
    expect(lerValorDigitado('')).toBeNull();
  });
});

describe('datas', () => {
  it('formata sem o fuso voltar a data um dia', () => {
    expect(formatarData('2026-09-01')).toBe('01/09/2026');
    expect(formatarCompetencia('2026-09-01')).toBe('set/2026');
    expect(formatarCompetencia('2026-12')).toBe('dez/2026');
  });

  it('faz as contas de calendário', () => {
    expect(hojeISO(new Date(2026, 8, 15))).toBe('2026-09-15');
    expect(somarDias('2026-09-28', 5)).toBe('2026-10-03');
    expect(somarMeses('2026-11', 3)).toBe('2027-02');
    expect(fimDoMes('2026-02-10')).toBe('2026-02-28');
    expect(diasEntre('2026-09-10', '2026-09-15')).toBe(5);
  });
});

describe('csv', () => {
  it('usa ponto e vírgula e escapa aspas', () => {
    const csv = montarCsv(
      [{ nome: 'Aluguel "centro"', valor: '1500.00' }],
      [
        { titulo: 'Descrição', valor: (l) => l.nome },
        { titulo: 'Valor', valor: (l) => numeroPlanilha(l.valor) },
      ],
    );
    expect(csv).toBe('Descrição;Valor\r\n"Aluguel ""centro""";1500,00');
  });
});
