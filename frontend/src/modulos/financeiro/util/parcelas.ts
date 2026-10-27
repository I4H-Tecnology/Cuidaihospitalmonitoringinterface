/**
 * O plano de parcelas de um título na tela de edição: o que muda, o que sai,
 * o que entra, e as contas de redistribuir, sempre em centavos inteiros.
 *
 * O servidor confere tudo de novo ao gravar. Aqui as contas servem para a
 * pessoa ver o resultado antes de confirmar.
 */

import type { ParcelaDetalhe } from '../api/tipos';
import { fimDoMes, somarMeses } from './datas';
import { deCentavos, paraCentavos, type Dinheiro } from './dinheiro';

/** Origens cujas parcelas mudam por aqui; as demais (folha, empréstimo...) mudam na própria origem. */
export const ORIGENS_EDITAVEIS = ['manual', 'recorrencia', 'conciliacao', 'integracao'];

export const emAberto = (p: Pick<ParcelaDetalhe, 'status'>) => p.status === 'aberta' || p.status === 'parcial';

/** Uma linha do editor: parcela em aberto que já existe (com `id`) ou nova (sem). */
export interface LinhaDoPlano {
  /** Estável na tela: o id, ou um provisório para a parcela nova. */
  chave: string;
  id: string | null;
  /** Número atual; nula na parcela nova. */
  numero: number | null;
  vencimento: string;
  valor: Dinheiro | null;
  codigoBarras: string;
  /** Pagamento parcial: o valor não desce abaixo disto. */
  valorPago: Dinheiro;
  /** Teve pagamento, mesmo estornado: não pode sair (a baixa aponta para ela). */
  teveBaixa: boolean;
}

export function linhaDaParcela(p: ParcelaDetalhe): LinhaDoPlano {
  return {
    chave: p.id,
    id: p.id,
    numero: p.numero,
    vencimento: p.vencimento,
    valor: p.valor,
    codigoBarras: p.codigoBarras ?? '',
    valorPago: p.valorPago,
    teveBaixa: p.baixas.length > 0,
  };
}

let sequencia = 0;
export function linhaNova(vencimento: string, valor: Dinheiro | null): LinhaDoPlano {
  sequencia += 1;
  return { chave: `nova-${sequencia}`, id: null, numero: null, vencimento, valor, codigoBarras: '', valorPago: '0.00', teveBaixa: false };
}

/** `centavos` em `n` partes iguais; a sobra vai para a primeira, como no servidor. */
export function dividirCentavos(centavos: number, n: number): number[] {
  if (n < 1) return [];
  const base = Math.floor(centavos / n);
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? centavos - base * n : 0));
}

/** `n` vencimentos mensais no dia do primeiro; dia 31 vira o último dia dos meses curtos. */
export function vencimentosMensais(primeiro: string, n: number): string[] {
  const dia = Number(primeiro.slice(8, 10));
  return Array.from({ length: n }, (_, i) => {
    const mes = somarMeses(primeiro, i);
    const ultimo = Number(fimDoMes(`${mes}-01`).slice(8, 10));
    return `${mes}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
  });
}

export const somaDasLinhas = (linhas: LinhaDoPlano[]) => linhas.reduce((t, l) => t + paraCentavos(l.valor), 0);

/** Por que a linha não vale, ou null. */
export function problemaDaLinha(l: LinhaDoPlano): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.vencimento)) return 'Informe o vencimento.';
  const valor = paraCentavos(l.valor);
  if (valor <= 0) return 'Informe um valor maior que zero.';
  if (valor < paraCentavos(l.valorPago)) return 'Já foi pago mais do que isso nesta parcela.';
  return null;
}

/**
 * Refaz em `n` parcelas mensais o valor das linhas que podem ser refeitas (as
 * sem pagamento). Reaproveita as que já existem, na ordem: o que sobra de
 * parcela antiga sai, e o que falta entra como nova. Quem teve pagamento fica.
 */
export function refazer(linhas: LinhaDoPlano[], n: number, primeiro: string, totalCentavos: number): LinhaDoPlano[] {
  const ficam = linhas.filter((l) => l.teveBaixa);
  const reaproveitaveis = linhas.filter((l) => !l.teveBaixa && l.id);
  const valores = dividirCentavos(totalCentavos, n);
  const refeitas = vencimentosMensais(primeiro, n).map((vencimento, i) => {
    const base = reaproveitaveis[i];
    const valor = deCentavos(valores[i]);
    return base ? { ...base, vencimento, valor } : linhaNova(vencimento, valor);
  });
  return [...ficam, ...refeitas];
}

/**
 * Leva a diferença entre o total do plano e `alvoCentavos` para as parcelas
 * que vêm depois da linha `chave` (a que a pessoa mudou); se não houver
 * nenhuma depois, para as de antes; sem `chave`, divide entre todas. Devolve
 * as linhas novas, ou o motivo de não dar (a diferença não cabe sem zerar
 * parcela ou descer abaixo do pago).
 */
export function compensar(linhas: LinhaDoPlano[], chave: string | null, alvoCentavos: number, pagasCentavos: number): LinhaDoPlano[] | string {
  const diferenca = alvoCentavos - (pagasCentavos + somaDasLinhas(linhas));
  if (diferenca === 0) return linhas;
  const posicao = chave === null ? -1 : linhas.findIndex((l) => l.chave === chave);
  const depois = linhas.filter((l, i) => i > posicao && l.chave !== chave);
  const alvos = depois.length ? depois : linhas.filter((l) => l.chave !== chave);
  if (!alvos.length) return 'Não há outra parcela em aberto para receber a diferença.';

  const partes = dividirCentavos(Math.abs(diferenca), alvos.length).map((c) => Math.sign(diferenca) * c);
  const ajuste = new Map(alvos.map((l, i) => [l.chave, partes[i]]));
  const novas = linhas.map((l) => {
    const delta = ajuste.get(l.chave);
    return delta === undefined ? l : { ...l, valor: deCentavos(paraCentavos(l.valor) + delta) };
  });
  const quebrou = novas.find((l) => ajuste.has(l.chave) && problemaDaLinha(l));
  return quebrou ? 'A diferença é maior do que as outras parcelas comportam: ajuste os valores à mão.' : novas;
}

export interface MudancaDeParcela {
  numero: number;
  antes: { vencimento: string; valor: Dinheiro; codigoBarras: string };
  depois: { vencimento: string; valor: Dinheiro; codigoBarras: string };
}

export interface ResumoDoPlano {
  alteradas: MudancaDeParcela[];
  excluidas: ParcelaDetalhe[];
  novas: LinhaDoPlano[];
  pagas: ParcelaDetalhe[];
  totalAntes: number;
  totalDepois: number;
}

/** Compara o plano com as parcelas de hoje: o que muda, o que sai, o que entra. */
export function resumirPlano(parcelas: ParcelaDetalhe[], linhas: LinhaDoPlano[]): ResumoDoPlano {
  const pagas = parcelas.filter((p) => !emAberto(p));
  const porId = new Map(linhas.filter((l) => l.id).map((l) => [l.id as string, l]));
  const alteradas: MudancaDeParcela[] = [];
  const excluidas: ParcelaDetalhe[] = [];
  for (const p of parcelas.filter(emAberto)) {
    const l = porId.get(p.id);
    if (!l) {
      excluidas.push(p);
      continue;
    }
    const antes = { vencimento: p.vencimento, valor: deCentavos(paraCentavos(p.valor)), codigoBarras: p.codigoBarras ?? '' };
    const depois = { vencimento: l.vencimento, valor: deCentavos(paraCentavos(l.valor)), codigoBarras: l.codigoBarras.trim() };
    if (antes.vencimento !== depois.vencimento || antes.valor !== depois.valor || antes.codigoBarras !== depois.codigoBarras) {
      alteradas.push({ numero: p.numero, antes, depois });
    }
  }
  const pagasCentavos = pagas.reduce((t, p) => t + paraCentavos(p.valor), 0);
  return {
    alteradas,
    excluidas,
    novas: linhas.filter((l) => !l.id),
    pagas,
    totalAntes: parcelas.reduce((t, p) => t + paraCentavos(p.valor), 0),
    totalDepois: pagasCentavos + somaDasLinhas(linhas),
  };
}

export const mudouAlgo = (r: ResumoDoPlano) =>
  r.alteradas.length > 0 || r.excluidas.length > 0 || r.novas.length > 0 || r.totalAntes !== r.totalDepois;

/** Excluir parcela ou mudar o total pede motivo (o servidor recusa sem). */
export const pedeMotivo = (r: ResumoDoPlano) => r.excluidas.length > 0 || r.totalAntes !== r.totalDepois;
