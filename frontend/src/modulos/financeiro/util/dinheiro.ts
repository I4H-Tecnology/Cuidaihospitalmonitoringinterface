/**
 * Dinheiro no navegador: texto na API, centavos inteiros na conta, BRL na tela.
 *
 * A API manda "1234.56" (texto) justamente para o valor não passar por float.
 * Qualquer soma feita aqui é em centavos inteiros: 0,1 + 0,2 em float dá
 * 0,30000000000000004; em centavos, 10 + 20 dá 30.
 */

export type Dinheiro = string;

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMERO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1234.56" | 1234.56 | null -> 123456. Arredonda meio para cima, como o servidor. */
export function paraCentavos(valor: Dinheiro | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  const texto = typeof valor === 'number' ? valor.toFixed(4) : String(valor).trim();
  const casou = /^(-)?(\d+)(?:\.(\d+))?$/.exec(texto);
  if (!casou) return 0;
  const [, sinal, inteiro, fracao = ''] = casou;
  const casas = (fracao + '000').slice(0, 3);
  let centavos = Number(inteiro) * 100 + Number(casas.slice(0, 2));
  if (Number(casas[2]) >= 5) centavos += 1;
  return sinal ? -centavos : centavos;
}

/** 123456 -> "1234.56" (o formato que a API aceita). */
export function deCentavos(centavos: number): Dinheiro {
  const sinal = centavos < 0 ? '-' : '';
  const absoluto = Math.abs(Math.round(centavos));
  return `${sinal}${Math.floor(absoluto / 100)}.${String(absoluto % 100).padStart(2, '0')}`;
}

export function somar(...valores: Array<Dinheiro | number | null | undefined>): Dinheiro {
  return deCentavos(valores.reduce<number>((total, v) => total + paraCentavos(v), 0));
}

/** "R$ 1.234,56" */
export function formatarBRL(valor: Dinheiro | number | null | undefined): string {
  return BRL.format(paraCentavos(valor) / 100);
}

/** "1.234,56" — para tabelas com a moeda no cabeçalho. */
export function formatarNumero(valor: Dinheiro | number | null | undefined): string {
  return NUMERO.format(paraCentavos(valor) / 100);
}

/** "R$ 12,9 mil" / "R$ 1,2 mi" — para eixos e cartões pequenos. */
export function formatarCompacto(valor: Dinheiro | number | null | undefined): string {
  const reais = paraCentavos(valor) / 100;
  const absoluto = Math.abs(reais);
  const sinal = reais < 0 ? '-' : '';
  const um = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (absoluto >= 1_000_000) return `${sinal}R$ ${um(absoluto / 1_000_000)} mi`;
  if (absoluto >= 10_000) return `${sinal}R$ ${um(absoluto / 1_000)} mil`;
  return formatarBRL(valor);
}

/**
 * O que a pessoa digitou -> formato da API, ou null se não é valor.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234,56" e "-50".
 * Com ponto E vírgula, o último separador é o decimal.
 */
export function lerValorDigitado(texto: string): Dinheiro | null {
  let t = (texto ?? '').replace(/R\$|\s/g, '');
  if (!t) return null;
  const negativo = t.startsWith('-');
  t = t.replace(/^[-+]/, '');
  const virgula = t.lastIndexOf(',');
  const ponto = t.lastIndexOf('.');
  if (virgula >= 0 && ponto >= 0) {
    t = virgula > ponto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (virgula >= 0) {
    t = t.replace(',', '.');
  } else if (ponto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // "1.234" digitado é milhar, não decimal
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const valor = deCentavos(paraCentavos(t));
  return negativo ? deCentavos(-paraCentavos(valor)) : valor;
}

/** Valor da API -> texto para editar num campo ("1234.5" -> "1.234,50"). */
export function paraEdicao(valor: Dinheiro | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  return formatarNumero(valor);
}

export const ehNegativo = (valor: Dinheiro | number | null | undefined) => paraCentavos(valor) < 0;
export const ehZero = (valor: Dinheiro | number | null | undefined) => paraCentavos(valor) === 0;

/**
 * Tira os zeros à direita da parte decimal de um número em texto
 * ("1.5000" -> "1.5", "10.00" -> "10"). Sem ponto decimal devolve o valor como
 * veio: "100" continua "100" (a regex `\.?0+$` o transformaria em "1").
 * Feito com laço, e não com regex, para não ter custo super-linear.
 */
export function semZerosFinais(valor: string): string {
  if (!valor.includes('.')) return valor;
  let fim = valor.length;
  while (fim > 0 && valor[fim - 1] === '0') fim -= 1;
  if (valor[fim - 1] === '.') fim -= 1;
  return valor.slice(0, fim);
}

