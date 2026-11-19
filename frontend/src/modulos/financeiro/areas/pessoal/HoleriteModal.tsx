/**
 * O holerite de um colaborador: itens, bases e o IRRF passo a passo — para
 * quem confere entender de onde saiu cada número. Aqui também se lança o
 * variável do mês e se registra o valor da contabilidade.
 */

import { useState } from 'react';
import { Printer, Trash2 } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Holerite, Rubrica } from '../../api/tipos';
import { formatarBRL, paraCentavos, type Dinheiro, semZerosFinais } from '../../util/dinheiro';
import { formatarCompetencia, formatarData } from '../../util/datas';
import { VINCULOS } from '../../rotulos';
import { Aviso, Botao, Campo, CampoDinheiro, Carregando, Etiqueta, Janela, Seletor, tabela, texto } from '../../ui/base';

export function HoleriteModal({
  holeriteId,
  folhaId,
  editavel,
  aoFechar,
  aoMudar,
}: {
  holeriteId: string;
  folhaId: string;
  editavel: boolean;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const { api, avisar } = useFinanceiro();
  const holerite = useDados(() => api.holerite(holeriteId), [api, holeriteId]);
  const rubricas = useDados(() => api.rubricas(), [api]);
  const h = holerite.dados;

  const atualizar = (novo: Holerite) => {
    holerite.setDados(novo);
    aoMudar();
  };

  if (!h) return <Janela titulo="Holerite" aoFechar={aoFechar}><Carregando /></Janela>;

  const proventos = h.itens.filter((i) => i.tipo === 'provento');
  const descontos = h.itens.filter((i) => i.tipo === 'desconto');
  const informativos = h.itens.filter((i) => i.tipo === 'informativo');
  const mensal = h.folhaTipo === 'mensal';

  return (
    <Janela
      titulo={`Holerite — ${h.nome}`}
      subtitulo={`${formatarCompetencia(h.competencia)} · ${VINCULOS[h.vinculo] ?? h.vinculo}${h.cargo ? ` · ${h.cargo}` : ''} · pagamento em ${formatarData(h.dataPagamento)}`}
      aoFechar={aoFechar}
      largura="max-w-4xl"
      rodape={
        <>
          <Botao icone={<Printer className="h-4 w-4" />} onClick={() => imprimir(h)}>Imprimir</Botao>
          <Botao variante="primario" onClick={aoFechar}>Fechar</Botao>
        </>
      }
    >
      {h.avisos.length > 0 && <div className="mb-4"><Aviso tipo="atencao">{h.avisos.join(' ')}</Aviso></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaDeItens titulo="Proventos" itens={proventos} total={h.totalProventos} editavel={editavel}
          aoRemover={async (id) => atualizar(await api.removerLancamento(folhaId, id))} />
        <ListaDeItens titulo="Descontos" itens={descontos} total={h.totalDescontos} editavel={editavel}
          aoRemover={async (id) => atualizar(await api.removerLancamento(folhaId, id))} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900/40">
        <span className={`text-sm ${texto.normal}`}>Líquido a receber</span>
        <span className={`text-xl font-semibold tabular-nums ${texto.titulo}`}>{formatarBRL(h.liquido)}</span>
      </div>

      {mensal && (
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
          <Base rotulo="Base do INSS" valor={h.baseInss} />
          <Base rotulo="Rendimento tributável (IR)" valor={h.baseIrrf} />
          <Base rotulo="Base do FGTS" valor={h.baseFgts} />
          <Base rotulo="FGTS do mês (empresa)" valor={h.fgts} />
          <Base rotulo="Encargos da empresa" valor={h.encargosPatronais} />
          {informativos.length > 0 && <Base rotulo="Benefícios (custo da empresa)" valor={h.beneficios} />}
          <Base rotulo="Custo total da empresa" valor={h.custoTotal} />
        </dl>
      )}

      {h.detalheIrrf && paraCentavos(h.detalheIrrf.rendimentos) > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-[var(--fin-primaria,#0A7EA4)]">Como o IRRF foi calculado</summary>
          <ol className={`mt-2 list-decimal space-y-1 pl-5 ${texto.normal}`}>
            <li>Rendimento tributável: {formatarBRL(h.detalheIrrf.rendimentos)}.</li>
            <li>
              {h.detalheIrrf.simplificado
                ? 'Usado o desconto simplificado mensal, que deu imposto menor que as deduções legais.'
                : `Deduções legais (INSS, dependentes e pensão): ${formatarBRL(h.detalheIrrf.deducoesLegais)}.`}
            </li>
            <li>Base de cálculo {formatarBRL(h.detalheIrrf.base)}, alíquota {h.detalheIrrf.aliquota.replace('.', ',')}%: imposto pela tabela {formatarBRL(h.detalheIrrf.impostoPelaTabela)}.</li>
            <li>Redução da Lei 15.270/2025 (pelo rendimento): −{formatarBRL(h.detalheIrrf.reducao)}.</li>
            <li>
              Imposto retido: <strong>{formatarBRL(h.detalheIrrf.imposto)}</strong>
              {h.detalheIrrf.dispensado && ' (valor de até R$ 10,00 não é retido)'}.
            </li>
          </ol>
        </details>
      )}

      {editavel && mensal && <LancarVariavel h={h} folhaId={folhaId} rubricas={rubricas.dados ?? []} aoLancar={atualizar} />}
      {editavel && mensal && <AjusteDaContabilidade h={h} aoSalvar={atualizar} aoErro={(m) => avisar(m, 'erro')} />}
      {!editavel && h.ajuste && (
        <p className={`mt-4 text-xs ${texto.suave}`}>INSS/IRRF/FGTS informados pela contabilidade{h.ajuste.por ? ` (${h.ajuste.por})` : ''}.</p>
      )}
    </Janela>
  );
}

function ListaDeItens({
  titulo,
  itens,
  total,
  editavel,
  aoRemover,
}: {
  titulo: string;
  itens: Holerite['itens'];
  total: Dinheiro;
  editavel: boolean;
  aoRemover: (id: string) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <table className={tabela.base}>
        <thead className={tabela.cabeca}>
          <tr>
            <th className={tabela.celulaCabeca}>{titulo}</th>
            <th className={`${tabela.celulaCabeca} text-right`}>Ref.</th>
            <th className={`${tabela.celulaCabeca} text-right`}>Valor</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 && (
            <tr className={tabela.linha}><td className={`${tabela.celula} ${texto.suave}`} colSpan={4}>Nenhum.</td></tr>
          )}
          {itens.map((i) => (
            <tr key={i.id} className={tabela.linha}>
              <td className={tabela.celula}>
                <span className={texto.suave}>{i.codigo}</span> {i.nome}
                {i.origem === 'lancado' && <Etiqueta tom="info">lançado</Etiqueta>}
                {i.origem === 'ajuste' && <Etiqueta tom="atencao">contabilidade</Etiqueta>}
                {i.credorNome && <p className={`text-xs ${texto.suave}`}>repasse a {i.credorNome}</p>}
              </td>
              <td className={`${tabela.numero} ${texto.suave}`}>{i.referencia ? semZerosFinais(i.referencia).replace('.', ',') : ''}</td>
              <td className={tabela.numero}>{formatarBRL(i.valor)}</td>
              <td className="pr-2 text-right">
                {editavel && i.origem === 'lancado' && (
                  <button type="button" aria-label={`Remover ${i.nome}`} className="text-gray-400 hover:text-red-600" onClick={() => aoRemover(i.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-gray-700">
            <td className={`${tabela.celula} font-medium`} colSpan={2}>Total</td>
            <td className={`${tabela.numero} font-medium`}>{formatarBRL(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LancarVariavel({ h, folhaId, rubricas, aoLancar }: { h: Holerite; folhaId: string; rubricas: Rubrica[]; aoLancar: (h: Holerite) => void }) {
  const { api, avisar } = useFinanceiro();
  const [rubricaId, setRubricaId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [valor, setValor] = useState<Dinheiro | null>(null);
  const [enviando, setEnviando] = useState(false);
  const lista = rubricas.filter((r) => !r.sistema && r.ativa && r.tipo !== 'informativo');
  const escolhida = lista.find((r) => r.id === rubricaId);
  const porValor = escolhida?.calculo === 'valor';
  return (
    <div className="mt-5 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <h3 className={`mb-2 text-sm font-semibold ${texto.titulo}`}>Lançar variável do mês</h3>
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_10rem_auto]">
        <Seletor value={rubricaId} onChange={(e) => setRubricaId(e.target.value)} vazio="Hora extra, falta, comissão…"
          opcoes={lista.map((r) => ({ valor: r.id, rotulo: `${r.codigo} ${r.nome}`, grupo: r.tipo === 'provento' ? 'Proventos' : 'Descontos' }))} />
        {porValor ? (
          <CampoDinheiro valor={valor} aoMudar={setValor} aria-label="Valor" />
        ) : (
          <Campo
            placeholder={escolhida?.calculo === 'horas' ? 'horas' : escolhida?.calculo === 'dias' ? 'dias' : '%'}
            aria-label="Referência"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        )}
        <Botao
          variante="primario"
          carregando={enviando}
          disabled={!escolhida || (porValor ? !valor : !referencia)}
          onClick={async () => {
            setEnviando(true);
            try {
              aoLancar(await api.lancarNaFolha(folhaId, {
                colaboradorId: h.colaboradorId, rubricaId,
                ...(porValor ? { valor } : { referencia: referencia.replace(',', '.') }),
              }));
              setRubricaId(''); setReferencia(''); setValor(null);
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não foi possível lançar.', 'erro');
            } finally {
              setEnviando(false);
            }
          }}
        >
          Lançar
        </Botao>
      </div>
      <p className={`mt-1 text-xs ${texto.suave}`}>Horas extras e comissões entram também no DSR (descanso semanal remunerado), calculado sozinho.</p>
    </div>
  );
}

function AjusteDaContabilidade({ h, aoSalvar, aoErro }: { h: Holerite; aoSalvar: (h: Holerite) => void; aoErro: (m: string) => void }) {
  const { api } = useFinanceiro();
  const [aberto, setAberto] = useState(Boolean(h.ajuste));
  const [inss, setInss] = useState<Dinheiro | null>((h.ajuste?.inss as string) ?? null);
  const [irrf, setIrrf] = useState<Dinheiro | null>((h.ajuste?.irrf as string) ?? null);
  const [fgts, setFgts] = useState<Dinheiro | null>((h.ajuste?.fgts as string) ?? null);
  const [observacao, setObservacao] = useState((h.ajuste?.observacao as string) ?? '');
  const [salvando, setSalvando] = useState(false);

  if (!aberto) {
    return (
      <button type="button" className="mt-4 text-sm text-[var(--fin-primaria,#0A7EA4)] hover:underline" onClick={() => setAberto(true)}>
        A contabilidade fechou com outro valor? Registrar os valores dela
      </button>
    );
  }
  const calculado = h.calculado;
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <h3 className={`mb-1 text-sm font-semibold ${texto.titulo}`}>Valores da contabilidade</h3>
      <p className={`mb-3 text-xs ${texto.suave}`}>
        Prevalecem sobre o cálculo. O que o sistema tinha calculado fica guardado para comparar
        {calculado && ` (INSS ${formatarBRL(calculado.inss)}, IRRF ${formatarBRL(calculado.irrf)}, FGTS ${formatarBRL(calculado.fgts)})`}.
        Deixe em branco o que não mudou.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <CampoDinheiro rotulo="INSS" valor={inss} aoMudar={setInss} />
        <CampoDinheiro rotulo="IRRF" valor={irrf} aoMudar={setIrrf} />
        <CampoDinheiro rotulo="FGTS" valor={fgts} aoMudar={setFgts} />
        <Campo rotulo="Observação" className="sm:col-span-3" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {h.ajuste && (
          <Botao pequeno variante="fantasma" onClick={async () => {
            try {
              aoSalvar(await api.removerAjuste(h.id));
              setInss(null); setIrrf(null); setFgts(null); setObservacao('');
            } catch (e) {
              aoErro(e instanceof Error ? e.message : 'Não foi possível remover.');
            }
          }}>
            Voltar ao valor calculado
          </Botao>
        )}
        <Botao
          pequeno
          variante="primario"
          carregando={salvando}
          disabled={!inss && !irrf && !fgts}
          onClick={async () => {
            setSalvando(true);
            try {
              aoSalvar(await api.ajustarHolerite(h.id, { inss, irrf, fgts, observacao: observacao || null }));
            } catch (e) {
              aoErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
            } finally {
              setSalvando(false);
            }
          }}
        >
          Aplicar valores da contabilidade
        </Botao>
      </div>
    </div>
  );
}

function Base({ rotulo, valor }: { rotulo: string; valor: Dinheiro }) {
  return (
    <div>
      <dt className={texto.suave}>{rotulo}</dt>
      <dd className={`tabular-nums ${texto.titulo}`}>{formatarBRL(valor)}</dd>
    </div>
  );
}

/** Abre o holerite numa janela própria, pronto para imprimir ou salvar em PDF. */
function imprimir(h: Holerite) {
  const janela = window.open('', '_blank', 'width=800,height=900');
  if (!janela) return;
  const doc = janela.document;
  doc.title = `Holerite ${h.nome} ${formatarCompetencia(h.competencia)}`;
  const estilo = doc.createElement('style');
  estilo.textContent = `
    body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:32px;font-size:13px}
    h1{font-size:16px;margin:0} p{margin:2px 0} table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left} td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
    .total{font-weight:600} .rodape{margin-top:32px;color:#555;font-size:11px}`;
  doc.head.appendChild(estilo);
  const add = (tag: string, texto: string, pai: HTMLElement = doc.body, classe?: string) => {
    const el = doc.createElement(tag);
    el.textContent = texto;
    if (classe) el.className = classe;
    pai.appendChild(el);
    return el;
  };
  add('h1', h.empresaNome);
  if (h.empresaDocumento) add('p', `CNPJ ${h.empresaDocumento}`);
  add('p', `Recibo de pagamento — ${formatarCompetencia(h.competencia)}${h.folhaTipo === 'adiantamento' ? ' (adiantamento)' : ''}`);
  add('p', `${h.nome}${h.documento ? ` · CPF ${h.documento}` : ''}${h.cargo ? ` · ${h.cargo}` : ''} · admissão ${formatarData(h.dataAdmissao)}`);
  const tabelaHtml = doc.createElement('table');
  const cab = tabelaHtml.createTHead().insertRow();
  ['Código', 'Descrição', 'Referência', 'Proventos', 'Descontos'].forEach((t, i) => {
    const th = doc.createElement('th');
    th.textContent = t;
    if (i >= 2) th.className = 'n';
    cab.appendChild(th);
  });
  const corpo = tabelaHtml.createTBody();
  for (const item of h.itens.filter((i) => i.tipo !== 'informativo')) {
    const linha = corpo.insertRow();
    [item.codigo, item.nome, item.referencia ?? '', item.tipo === 'provento' ? formatarBRL(item.valor) : '', item.tipo === 'desconto' ? formatarBRL(item.valor) : '']
      .forEach((valor, i) => {
        const td = linha.insertCell();
        td.textContent = valor;
        if (i >= 2) td.className = 'n';
      });
  }
  const totais = corpo.insertRow();
  ['', 'Totais', '', formatarBRL(h.totalProventos), formatarBRL(h.totalDescontos)].forEach((valor, i) => {
    const td = totais.insertCell();
    td.textContent = valor;
    td.className = i >= 2 ? 'n total' : 'total';
  });
  doc.body.appendChild(tabelaHtml);
  add('p', `Líquido a receber: ${formatarBRL(h.liquido)}`, doc.body, 'total');
  add('p', `Base INSS ${formatarBRL(h.baseInss)} · Base IRRF ${formatarBRL(h.baseIrrf)} · Base FGTS ${formatarBRL(h.baseFgts)} · FGTS do mês ${formatarBRL(h.fgts)}`, doc.body, 'rodape');
  add('p', 'Declaro ter recebido a importância líquida discriminada neste recibo.', doc.body, 'rodape');
  add('p', '_______________________________________    Data: ____/____/______', doc.body, 'rodape');
  janela.focus();
  janela.print();
}
