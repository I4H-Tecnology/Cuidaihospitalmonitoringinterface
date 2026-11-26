/**
 * Orçamento: planejado por categoria e mês, contra o realizado (competência).
 * A grade é editável como planilha; "copiar do ano anterior" monta a base a
 * partir do realizado com um reajuste.
 */

import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Save, Trash2 } from 'lucide-react';
import { useDados, useFinanceiro } from '../contexto';
import type { Categoria, Comparativo as DadosDoComparativo, Orcamento } from '../api/tipos';
import { deCentavos, formatarBRL, formatarNumero, lerValorDigitado, paraCentavos, somar } from '../util/dinheiro';
import { MESES_EXTENSO } from '../util/datas';
import { Abas, Aviso, Botao, CabecalhoDaArea, Campo, Carregando, Etiqueta, Janela, Numero, Seletor, Vazio, cartao, tabela, texto } from '../ui/base';
import { SeletorCategoria } from '../ui/seletores';

type Linha = { categoriaId: string; nome: string; grupoRotulo: string; natureza: string; valores: string[] };

export function Planejamento() {
  const [aba, setAba] = useState<'orcamento' | 'comparativo'>('orcamento');
  const [ano, setAno] = useState(new Date().getFullYear());
  const anos = [0, 1, -1, -2].map((d) => new Date().getFullYear() + d).sort((a, b) => a - b);
  return (
    <div>
      <CabecalhoDaArea
        titulo="Orçamento"
        descricao="Quanto se planeja receber e gastar por categoria em cada mês. O realizado vem sozinho dos lançamentos (pelo mês de competência)."
        acoes={<Seletor value={String(ano)} onChange={(e) => setAno(Number(e.target.value))} opcoes={anos.map((a) => ({ valor: String(a), rotulo: String(a) }))} className="w-28" />}
      />
      <Abas atual={aba} aoMudar={setAba} abas={[{ chave: 'orcamento', rotulo: 'Planejado' }, { chave: 'comparativo', rotulo: 'Planejado × realizado' }]} />
      {/* key: trocar de ano volta ao mês padrão daquele ano. */}
      {aba === 'orcamento' ? <Grade ano={ano} /> : <Comparativo key={ano} ano={ano} />}
    </div>
  );
}

function Grade({ ano }: { ano: number }) {
  const { api, pode, avisar } = useFinanceiro();
  const orcamento = useDados(() => api.orcamento(ano), [api, ano]);
  const categorias = useDados(() => api.categorias(), [api]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [sujo, setSujo] = useState(false);
  const [adicionando, setAdicionando] = useState('');
  const [copiando, setCopiando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const editavel = pode('planejamento', 'editar');

  useEffect(() => {
    if (!orcamento.dados) return;
    setLinhas(orcamento.dados.linhas.map((l) => ({ categoriaId: l.categoriaId, nome: l.nome, grupoRotulo: l.grupoRotulo, natureza: l.natureza, valores: l.valores })));
    setSujo(false);
  }, [orcamento.dados]);

  const noResultado = (categorias.dados ?? []).filter((c) => !['aporte_socio', 'captacao_emprestimo', 'venda_ativo', 'compra_ativo', 'amortizacao_emprestimo', 'retirada_socio'].includes(c.grupo));
  const usadas = new Set(linhas.map((l) => l.categoriaId));
  const totais = useMemo(() => {
    const porNatureza = (n: string) => Array.from({ length: 12 }, (_, m) => somar(...linhas.filter((l) => l.natureza === n).map((l) => l.valores[m])));
    return { receita: porNatureza('receita'), despesa: porNatureza('despesa') };
  }, [linhas]);

  if (!orcamento.dados || !categorias.dados) return <Carregando />;

  const mudar = (i: number, mes: number, texto: string) => {
    const valor = lerValorDigitado(texto) ?? '0.00';
    setLinhas((atuais) => atuais.map((l, j) => (j === i ? { ...l, valores: l.valores.map((v, k) => (k === mes ? valor : v)) } : l)));
    setSujo(true);
  };

  return (
    <div className="space-y-4">
      {editavel && (
        <div className={`${cartao} flex flex-wrap items-end gap-3 p-4`}>
          <SeletorCategoria categorias={noResultado.filter((c) => !usadas.has(c.id)) as Categoria[]} valor={adicionando} aoMudar={setAdicionando} rotulo="Adicionar categoria" className="min-w-72" />
          <Botao icone={<Plus className="h-4 w-4" />} disabled={!adicionando}
            onClick={() => {
              const c = categorias.dados!.find((x) => x.id === adicionando)!;
              setLinhas((a) => [...a, { categoriaId: c.id, nome: c.nome, grupoRotulo: c.grupoRotulo, natureza: c.natureza, valores: Array(12).fill('0.00') }]);
              setAdicionando('');
              setSujo(true);
            }}>
            Adicionar
          </Botao>
          <Botao icone={<Copy className="h-4 w-4" />} onClick={() => setCopiando(true)}>Copiar de outro ano</Botao>
          <Botao variante="primario" icone={<Save className="h-4 w-4" />} className="ml-auto" disabled={!sujo} carregando={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                orcamento.setDados(await api.salvarOrcamento(ano, linhas.map((l) => ({ categoriaId: l.categoriaId, valores: l.valores }))));
                avisar('Orçamento salvo.');
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível salvar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}>
            Salvar orçamento
          </Botao>
        </div>
      )}
      {linhas.length === 0 ? (
        <div className={cartao}><Vazio titulo={`Sem orçamento para ${ano}.`}>Adicione as categorias que quer acompanhar, ou copie do ano anterior.</Vazio></div>
      ) : (
        <div className={`${cartao} overflow-x-auto`}>
          <table className={`${tabela.base} min-w-[1100px]`}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={`${tabela.celulaCabeca} sticky left-0 bg-gray-50 dark:bg-gray-900`}>Categoria</th>
                {MESES_EXTENSO.map((m) => <th key={m} className={`${tabela.celulaCabeca} text-right`}>{m.slice(0, 3)}</th>)}
                <th className={`${tabela.celulaCabeca} text-right`}>Ano</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.categoriaId} className={tabela.linha}>
                  <td className={`${tabela.celula} sticky left-0 bg-white dark:bg-gray-800`}>
                    <p className={texto.titulo}>{l.nome}</p>
                    <p className={`text-xs ${texto.suave}`}>{l.grupoRotulo}</p>
                  </td>
                  {l.valores.map((v, m) => (
                    <td key={m} className="px-1 py-1">
                      <input
                        aria-label={`${l.nome} em ${MESES_EXTENSO[m]}`}
                        disabled={!editavel}
                        defaultValue={paraCentavos(v) ? formatarNumero(v) : ''}
                        key={`${l.categoriaId}-${m}-${orcamento.dados?.ano}`}
                        onBlur={(e) => mudar(i, m, e.target.value)}
                        className="w-20 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums hover:border-gray-200 focus:border-[var(--fin-primaria,#0A7EA4)] focus:outline-none dark:text-gray-200 dark:hover:border-gray-600"
                      />
                    </td>
                  ))}
                  <td className={`${tabela.numero} font-medium`}>{formatarBRL(somar(...l.valores))}</td>
                  <td className="pr-2">
                    {editavel && (
                      <button type="button" aria-label={`Remover ${l.nome}`} className="text-gray-400 hover:text-red-600"
                        onClick={() => { setLinhas((a) => a.map((x, j) => (j === i ? { ...x, valores: Array(12).fill('0.00') } : x))); setSujo(true); }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 text-sm dark:border-gray-600">
              {(['receita', 'despesa'] as const).map((n) => (
                <tr key={n}>
                  <td className={`${tabela.celula} sticky left-0 bg-white font-medium dark:bg-gray-800`}>{n === 'receita' ? 'Receitas' : 'Despesas'}</td>
                  {totais[n].map((v, m) => <td key={m} className={tabela.numero}>{formatarNumero(v)}</td>)}
                  <td className={`${tabela.numero} font-semibold`}>{formatarBRL(somar(...totais[n]))}</td>
                  <td />
                </tr>
              ))}
              <tr>
                <td className={`${tabela.celula} sticky left-0 bg-white font-semibold dark:bg-gray-800`}>Resultado planejado</td>
                {totais.receita.map((v, m) => <td key={m} className={tabela.numero}>{formatarNumero(deCentavos(paraCentavos(v) - paraCentavos(totais.despesa[m])))}</td>)}
                <td className={`${tabela.numero} font-semibold`}>{formatarBRL(deCentavos(paraCentavos(somar(...totais.receita)) - paraCentavos(somar(...totais.despesa))))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {sujo && <Aviso tipo="atencao">Há alterações não salvas.</Aviso>}
      {copiando && <Copiar ano={ano} aoFechar={() => setCopiando(false)} aoCopiar={(o) => { setCopiando(false); orcamento.setDados(o); }} />}
    </div>
  );
}

function Copiar({ ano, aoFechar, aoCopiar }: { ano: number; aoFechar: () => void; aoCopiar: (o: Orcamento) => void }) {
  const { api, avisar } = useFinanceiro();
  const [origem, setOrigem] = useState(String(ano - 1));
  const [base, setBase] = useState<'orcado' | 'realizado'>('realizado');
  const [reajuste, setReajuste] = useState('0');
  const [ocupado, setOcupado] = useState(false);
  return (
    <Janela
      titulo={`Montar ${ano} a partir de outro ano`}
      subtitulo="Substitui os meses das categorias que existirem na origem."
      aoFechar={aoFechar}
      largura="max-w-md"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={ocupado}
            onClick={async () => {
              setOcupado(true);
              try {
                aoCopiar(await api.copiarOrcamento(ano, { anoOrigem: Number(origem), base, reajuste: reajuste.replace(',', '.') || '0' }));
                avisar('Orçamento montado.');
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível copiar.', 'erro');
              } finally {
                setOcupado(false);
              }
            }}>
            Montar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3">
        <Campo rotulo="Ano de origem" type="number" value={origem} onChange={(e) => setOrigem(e.target.value)} />
        <Seletor rotulo="Usar" value={base} onChange={(e) => setBase(e.target.value as 'orcado' | 'realizado')}
          opcoes={[{ valor: 'realizado', rotulo: 'O que realmente aconteceu (realizado)' }, { valor: 'orcado', rotulo: 'O que foi planejado (orçado)' }]} />
        <Campo rotulo="Reajuste (%)" value={reajuste} onChange={(e) => setReajuste(e.target.value)} ajuda="Ex.: 5 para inflação estimada de 5%." />
      </div>
    </Janela>
  );
}

/**
 * Planejado × realizado de UM mês, com o acumulado do ano até ele. O total
 * do ano não serve para comparar: em setembro ele põe doze meses planejados
 * contra nove realizados.
 */
function Comparativo({ ano }: { ano: number }) {
  const { api } = useFinanceiro();
  // Sem mês escolhido, a API decide: o atual no ano corrente, dezembro num ano que já passou.
  const [mes, setMes] = useState<number>();
  const comp = useDados(() => api.comparativo(ano, mes), [api, ano, mes]);
  const c = comp.dados;
  if (!c) return <Carregando />;
  const nomeDoMes = MESES_EXTENSO[c.mes - 1].toLowerCase();
  const r = c.resumo;
  const a = c.acumulado;
  const resultadoAbaixo = paraCentavos(r.resultadoRealizado) < paraCentavos(r.resultadoOrcado);
  return (
    <div className="space-y-4">
      <div className={`${cartao} flex flex-wrap items-end justify-between gap-3 p-4`}>
        <p className={`max-w-2xl text-sm ${texto.suave}`}>
          A diferença e a situação são de <strong className={texto.titulo}>{nomeDoMes}</strong>; a última coluna soma de janeiro até ele.
          {!c.mesEncerrado && ' O mês ainda não acabou: receita abaixo do planejado só vira alerta depois que ele fechar.'}
        </p>
        <Seletor rotulo="Mês" value={String(c.mes)} onChange={(e) => setMes(Number(e.target.value))} className="w-40"
          opcoes={MESES_EXTENSO.map((m, i) => ({ valor: String(i + 1), rotulo: m }))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo={`Receitas em ${nomeDoMes}`} valor={formatarBRL(r.receitasRealizadas)}
          detalhe={`planejado ${formatarBRL(r.receitasOrcadas)} · no ano, ${formatarBRL(a.receitasRealizadas)} de ${formatarBRL(a.receitasOrcadas)}`} />
        <Numero rotulo={`Despesas em ${nomeDoMes}`} valor={formatarBRL(r.despesasRealizadas)}
          detalhe={`planejado ${formatarBRL(r.despesasOrcadas)} · no ano, ${formatarBRL(a.despesasRealizadas)} de ${formatarBRL(a.despesasOrcadas)}`} />
        <Numero rotulo={`Resultado de ${nomeDoMes}`} valor={formatarBRL(r.resultadoRealizado)}
          detalhe={`planejado ${formatarBRL(r.resultadoOrcado)} · no ano, ${formatarBRL(a.resultadoRealizado)}`}
          tom={!c.mesEncerrado ? 'neutro' : resultadoAbaixo ? 'atencao' : 'bom'} />
      </div>
      <div className={`${cartao} overflow-x-auto`}>
        {c.linhas.length === 0 ? <Vazio titulo="Nada planejado nem realizado neste ano." /> : (
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Categoria</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Planejado</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Realizado</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Diferença</th>
                <th className={tabela.celulaCabeca}>Situação</th>
                <th className={`${tabela.celulaCabeca} text-right`}>No ano, até {nomeDoMes}</th>
              </tr>
            </thead>
            <tbody>
              {c.linhas.map((l) => {
                const planejado = l.orcado[c.mes - 1];
                const realizado = l.realizado[c.mes - 1];
                return (
                  <tr key={l.categoriaId} className={tabela.linha}>
                    <td className={tabela.celula}>
                      <p className={texto.titulo}>{l.nome}</p>
                      <p className={`text-xs ${texto.suave}`}>{l.grupoRotulo}</p>
                    </td>
                    <td className={tabela.numero}>{formatarBRL(planejado)}</td>
                    <td className={tabela.numero}>{formatarBRL(realizado)}</td>
                    <td className={tabela.numero}>
                      {formatarBRL(l.variacao)}
                      {l.variacaoPercentual && <span className={`ml-1 text-xs ${texto.suave}`}>({l.variacaoPercentual.replace('.', ',')}%)</span>}
                    </td>
                    <td className={tabela.celula}><Situacao linha={l} planejado={planejado} realizado={realizado} mesEncerrado={c.mesEncerrado} /></td>
                    <td className={tabela.numero}>
                      {formatarBRL(l.acumuladoRealizado)}
                      <p className={`text-xs ${texto.suave}`}>de {formatarBRL(l.acumuladoOrcado)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Situacao({ linha, planejado, realizado, mesEncerrado }: {
  linha: DadosDoComparativo['linhas'][number]; planejado: string; realizado: string; mesEncerrado: boolean;
}) {
  if (paraCentavos(planejado) === 0) {
    return paraCentavos(realizado) === 0 ? <span className={texto.suave}>—</span> : <Etiqueta>Sem orçamento no mês</Etiqueta>;
  }
  if (linha.desfavoravel) {
    return <Etiqueta tom="critico">{linha.natureza === 'despesa' ? 'Acima do planejado' : 'Abaixo do planejado'}</Etiqueta>;
  }
  if (linha.natureza === 'receita' && !mesEncerrado && paraCentavos(realizado) < paraCentavos(planejado)) {
    return <Etiqueta tom="info">Mês em andamento</Etiqueta>;
  }
  return <Etiqueta tom="bom">Dentro</Etiqueta>;
}
