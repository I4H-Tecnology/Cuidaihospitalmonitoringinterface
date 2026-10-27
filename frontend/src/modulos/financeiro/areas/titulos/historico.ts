/**
 * O histórico de um título em frases.
 *
 * A auditoria grava linha por linha (cada parcela alterada é uma linha, e
 * renumerar é outra). A tela junta o que foi feito na mesma operação — mesma
 * hora, mesma pessoa, mesmo motivo — e diz o que mudou em cada parcela:
 * "alterou 2 parcelas: parcela 2 (vencimento 10/10/2026 → 20/10/2026)...".
 *
 * As chaves de `antes`/`depois` chegam em camelCase (a API converte tudo).
 */

import type { Historico, ParcelaDetalhe } from '../../api/tipos';
import { formatarBRL } from '../../util/dinheiro';
import { formatarCompetencia, formatarData } from '../../util/datas';

export interface EntradaDoHistorico {
  chave: string;
  em: string;
  usuario: string;
  motivo: string | null;
  frase: string;
  detalhes: string[];
}

type Valores = Record<string, unknown>;

const dinheiro = (v: unknown) => formatarBRL(typeof v === 'number' || typeof v === 'string' ? v : null);
const data = (v: unknown) => (typeof v === 'string' ? formatarData(v) : '—');

/** "campo antes → depois" para os campos que a pessoa reconhece; o resto só pelo nome. */
function mudancas(antes: Valores, depois: Valores, ignorar: string[] = []): string[] {
  return Object.keys(depois)
    .filter((c) => !ignorar.includes(c))
    .map((c) => {
      const a = antes[c];
      const d = depois[c];
      switch (c) {
        case 'vencimento': return `vencimento ${data(a)} → ${data(d)}`;
        case 'valor': return `valor ${dinheiro(a)} → ${dinheiro(d)}`;
        case 'valorTotal': return `total ${dinheiro(a)} → ${dinheiro(d)}`;
        case 'competencia': return `competência ${formatarCompetencia(String(a ?? ''))} → ${formatarCompetencia(String(d ?? ''))}`;
        case 'descricao': return `descrição “${a ?? ''}” → “${d ?? ''}”`;
        case 'codigoBarras': return d ? 'código de barras' : 'código de barras removido';
        case 'documento': return 'documento';
        case 'observacao': return 'observação';
        case 'pessoaId': return 'fornecedor/cliente';
        case 'dataEmissao': return `emissão ${data(a)} → ${data(d)}`;
        default: return c;
      }
    });
}

interface Grupo {
  em: string;
  usuario: string;
  motivo: string | null;
  tabela: string;
  operacao: Historico['operacao'];
  itens: Historico[];
}

export function descreverHistorico(historico: Historico[], parcelas: ParcelaDetalhe[]): EntradaDoHistorico[] {
  // O que foi feito junto: mesma hora (a da transação), pessoa, motivo, tabela e
  // operação. Numa operação, as linhas de uma mesma tabela nem sempre vêm
  // vizinhas (o valor muda, entra parcela nova, depois renumera), por isso o
  // agrupamento é por operação inteira, e não por vizinhança.
  const grupos: Grupo[] = [];
  let horaDoBloco: string | null = null;
  let doBloco = new Map<string, Grupo>();
  for (const h of historico) {
    const usuario = h.usuarioNome ?? 'sistema';
    if (h.em !== horaDoBloco) {
      horaDoBloco = h.em;
      doBloco = new Map();
    }
    const chave = [usuario, h.motivo ?? '', h.tabela, h.operacao].join('|');
    const grupo = doBloco.get(chave);
    if (grupo) {
      grupo.itens.push(h);
    } else {
      const novo: Grupo = { em: h.em, usuario, motivo: h.motivo, tabela: h.tabela, operacao: h.operacao, itens: [h] };
      doBloco.set(chave, novo);
      grupos.push(novo);
    }
  }

  const numeroAtual = new Map(parcelas.map((p) => [p.id, p.numero]));
  const lancamentos = new Set(grupos.filter((g) => g.tabela === 'titulo' && g.operacao === 'INSERT').map((g) => g.em));
  const categoriasDitas = new Set<string>();
  const entradas: EntradaDoHistorico[] = [];

  for (const [i, g] of grupos.entries()) {
    const base = { chave: `${g.em}-${i}`, em: g.em, usuario: g.usuario, motivo: g.motivo };
    const n = g.itens.length;

    if (g.tabela === 'titulo') {
      const h = g.itens[0];
      if (g.operacao === 'INSERT') {
        const qtd = grupos.find((x) => x.em === g.em && x.tabela === 'parcela' && x.operacao === 'INSERT')?.itens.length ?? 0;
        entradas.push({ ...base, frase: `lançou o título${qtd ? ` em ${qtd} parcela${qtd > 1 ? 's' : ''}` : ''}`, detalhes: [] });
      } else if (g.operacao === 'UPDATE' && h.depois && 'canceladoEm' in h.depois && h.depois.canceladoEm) {
        entradas.push({ ...base, frase: 'cancelou o título', detalhes: [] });
      } else {
        const detalhes = mudancas(h.antes ?? {}, h.depois ?? {}, ['motivoCancelamento', 'canceladoEm']);
        entradas.push({ ...base, frase: 'alterou o título', detalhes });
      }
      continue;
    }

    if (g.tabela === 'rateio') {
      // Criadas junto com o título, as categorias já estão ditas no "lançou";
      // e trocar categorias apaga e recria linhas, que viram uma frase só.
      if ((g.operacao === 'INSERT' && lancamentos.has(g.em)) || categoriasDitas.has(g.em)) continue;
      categoriasDitas.add(g.em);
      entradas.push({ ...base, frase: g.operacao === 'UPDATE' ? 'ajustou os valores das categorias' : 'mudou as categorias', detalhes: [] });
      continue;
    }

    if (g.tabela === 'baixa') {
      for (const h of g.itens) {
        const d = h.depois ?? {};
        if (g.operacao === 'INSERT') {
          entradas.push({ ...base, chave: `${base.chave}-${h.registroId}`, frase: `registrou pagamento de ${dinheiro(d.valor)} em ${data(d.data)}`, detalhes: [] });
        } else if (d.estornadaEm) {
          entradas.push({ ...base, chave: `${base.chave}-${h.registroId}`, frase: 'estornou um pagamento', detalhes: [] });
        }
      }
      continue;
    }

    if (g.tabela === 'parcela') {
      if (g.operacao === 'INSERT' && lancamentos.has(g.em)) continue;
      const plural = (verbo: string, quantas: number) => `${verbo} ${quantas > 1 ? `${quantas} parcelas` : 'uma parcela'}`;
      if (g.operacao === 'INSERT' || g.operacao === 'DELETE') {
        const detalhes = g.itens.map((h) => {
          const v = (g.operacao === 'INSERT' ? h.depois : h.antes) ?? {};
          // A incluída entra com número provisório e é renumerada logo depois: vale o de agora.
          const numero = (g.operacao === 'INSERT' && numeroAtual.get(h.registroId ?? '')) || v.numero || '?';
          return `parcela ${numero}: vence em ${data(v.vencimento)}, ${dinheiro(v.valor)}`;
        });
        entradas.push({ ...base, frase: plural(g.operacao === 'INSERT' ? 'incluiu' : 'excluiu', n), detalhes });
        continue;
      }
      // UPDATE: uma parcela pode ter duas linhas (o valor e a renumeração); junta por parcela.
      const incluidasAgora = new Set(
        grupos.filter((x) => x.em === g.em && x.tabela === 'parcela' && x.operacao === 'INSERT').flatMap((x) => x.itens.map((h) => h.registroId)),
      );
      const porParcela = new Map<string, { antes: Valores; depois: Valores }>();
      for (const h of g.itens) {
        const id = h.registroId ?? '';
        const atual = porParcela.get(id) ?? { antes: {}, depois: {} };
        for (const [campo, valor] of Object.entries(h.depois ?? {})) {
          if (!(campo in atual.depois)) atual.depois[campo] = valor; // a mais nova vem primeiro
          atual.antes[campo] = (h.antes ?? {})[campo];               // e a mais antiga, por último
        }
        porParcela.set(id, atual);
      }
      const detalhes = [...porParcela.entries()].flatMap(([id, { antes, depois }]) => {
        const numero = numeroAtual.get(id) ?? depois.numero ?? antes.numero ?? '?';
        const outras = mudancas(antes, depois, ['numero', 'valorPago']);
        // Renumerar a parcela que acabou de entrar não é notícia: ela já aparece com o número final.
        const renumerada = 'numero' in depois && !incluidasAgora.has(id) ? `passou de nº ${antes.numero} para nº ${depois.numero}` : null;
        const tudo = [...outras, renumerada].filter(Boolean);
        return tudo.length ? [`parcela ${numero}: ${tudo.join(', ')}`] : [];
      });
      if (detalhes.length) entradas.push({ ...base, frase: plural('alterou', detalhes.length), detalhes });
      continue;
    }

    entradas.push({ ...base, frase: `${g.operacao === 'INSERT' ? 'criou' : g.operacao === 'UPDATE' ? 'alterou' : 'removeu'} ${g.tabela}`, detalhes: [] });
  }
  return entradas;
}
