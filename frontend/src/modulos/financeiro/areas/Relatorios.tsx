/**
 * Relatórios: DRE (a empresa deu lucro?), fluxo de caixa (para onde foi o
 * dinheiro?), projeção (para onde o saldo vai?) e inadimplência (quem deve?).
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useDados, useFinanceiro } from '../contexto';
import type { Dre, TipoTitulo } from '../api/tipos';
import { formatarBRL, paraCentavos } from '../util/dinheiro';
import { competenciaDe, formatarCompetencia, formatarData, hojeISO, inicioDoMes, somarMeses } from '../util/datas';
import { baixarCsv, montarCsv, numeroPlanilha } from '../util/csv';
import { Abas, Aviso, Botao, CabecalhoDaArea, Campo, Carregando, Etiqueta, Numero, Secao, Seletor, Vazio, cartao, tabela, texto } from '../ui/base';
import { COR, CartaoGrafico, GraficoBarrasHorizontais, GraficoColunas, GraficoLinha, emReais } from '../ui/graficos';
import { useCadastrosBasicos } from '../ui/seletores';

type Aba = 'dre' | 'fluxo' | 'projecao' | 'inadimplencia';

export function Relatorios() {
  const [aba, setAba] = useState<Aba>('dre');
  return (
    <div>
      <CabecalhoDaArea titulo="Relatórios" descricao="Os números da empresa, cada relatório respondendo uma pergunta. Todos exportam para planilha." />
      <Abas
        atual={aba}
        aoMudar={setAba}
        abas={[
          { chave: 'dre', rotulo: 'Resultado (DRE)' },
          { chave: 'fluxo', rotulo: 'Fluxo de caixa' },
          { chave: 'projecao', rotulo: 'Projeção de caixa' },
          { chave: 'inadimplencia', rotulo: 'Inadimplência' },
        ]}
      />
      {aba === 'dre' && <RelatorioDre />}
      {aba === 'fluxo' && <RelatorioFluxo />}
      {aba === 'projecao' && <RelatorioProjecao />}
      {aba === 'inadimplencia' && <RelatorioInadimplencia />}
    </div>
  );
}

// --------------------------------------------------------------------------
// DRE
// --------------------------------------------------------------------------

function RelatorioDre() {
  const { api } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const atual = competenciaDe(hojeISO());
  const [de, setDe] = useState(`${atual.slice(0, 4)}-01`);
  const [ate, setAte] = useState(atual);
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia');
  const [centro, setCentro] = useState('');
  const dre = useDados(() => api.dre({ de, ate, regime, centroCustoId: centro || undefined }), [api, de, ate, regime, centro]);
  const d = dre.dados;

  const exportar = (dados: Dre) => {
    const cabecalho = ['Linha', ...dados.meses.map((m) => formatarCompetencia(m.mes)), 'Total', '% da receita líquida'];
    const linhas = dados.linhas.map((linha, i) => [
      linha.rotulo, ...dados.meses.map((m) => numeroPlanilha(m.linhas[i].valor)), numeroPlanilha(linha.valor), linha.percentual ?? '',
    ]);
    baixarCsv(`dre-${regime}-${de}-a-${ate}`, montarCsv(linhas, cabecalho.map((titulo, i) => ({ titulo, valor: (l: string[]) => l[i] }))));
  };

  return (
    <div className="space-y-4">
      <div className={`${cartao} flex flex-wrap items-end gap-3 p-4`}>
        <Campo rotulo="De" type="month" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="month" value={ate} onChange={(e) => setAte(e.target.value)} />
        <Seletor rotulo="Regime" value={regime} onChange={(e) => setRegime(e.target.value as 'competencia' | 'caixa')}
          opcoes={[{ valor: 'competencia', rotulo: 'Competência (a que mês pertence)' }, { valor: 'caixa', rotulo: 'Caixa (quando foi pago)' }]} />
        <Seletor rotulo="Centro de custo" value={centro} onChange={(e) => setCentro(e.target.value)} vazio="Empresa inteira"
          opcoes={cadastros.centros.map((c) => ({ valor: c.id, rotulo: c.nome }))} />
        {d && <Botao className="ml-auto" icone={<Download className="h-4 w-4" />} onClick={() => exportar(d)}>Planilha</Botao>}
      </div>
      {dre.erro && <Aviso tipo="erro">{dre.erro}</Aviso>}
      {d?.observacao && <Aviso tipo="info">{d.observacao}</Aviso>}
      {!d ? <Carregando /> : (
        <div className={`${cartao} overflow-x-auto ${dre.carregando ? 'opacity-60' : ''}`}>
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={`${tabela.celulaCabeca} sticky left-0 bg-gray-50 dark:bg-gray-900`}>Demonstração do resultado</th>
                {d.meses.length > 1 && d.meses.map((m) => <th key={m.mes} className={`${tabela.celulaCabeca} text-right`}>{formatarCompetencia(m.mes)}</th>)}
                <th className={`${tabela.celulaCabeca} text-right`}>Total</th>
                <th className={`${tabela.celulaCabeca} text-right`} title="Percentual da receita líquida">AV %</th>
              </tr>
            </thead>
            <tbody>
              {d.linhas.map((linha, i) => {
                const forte = linha.tipo !== 'linha';
                const negativo = paraCentavos(linha.valor) < 0;
                return (
                  <tr key={linha.chave} className={`${tabela.linha} ${linha.tipo === 'resultado' ? 'bg-gray-50 dark:bg-gray-900/40' : ''}`}>
                    <td className={`${tabela.celula} sticky left-0 ${linha.tipo === 'resultado' ? 'bg-gray-50 dark:bg-gray-900' : 'bg-white dark:bg-gray-800'} ${forte ? 'font-semibold text-gray-900 dark:text-gray-100' : 'pl-8'}`}>
                      {linha.rotulo}
                    </td>
                    {d.meses.length > 1 && d.meses.map((m) => (
                      <td key={m.mes} className={`${tabela.numero} ${forte ? 'font-semibold' : ''}`}>{formatarBRL(m.linhas[i].valor)}</td>
                    ))}
                    <td className={`${tabela.numero} ${forte ? 'font-semibold' : ''} ${linha.tipo === 'resultado' && negativo ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {formatarBRL(linha.valor)}
                    </td>
                    <td className={`${tabela.numero} ${texto.suave}`}>{linha.percentual ? `${linha.percentual.replace('.', ',')}%` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {d && d.categorias.length > 0 && (
        <CartaoGrafico
          titulo="Maiores despesas do período"
          subtitulo="Por categoria, no regime escolhido"
          grafico={
            <GraficoBarrasHorizontais
              rotulo="Maiores despesas por categoria"
              itens={d.categorias.filter((c) => c.natureza === 'despesa').slice(0, 10).map((c) => ({ rotulo: c.nome, valor: -paraCentavos(c.valor) / 100 }))}
            />
          }
          tabela={
            <table className={tabela.base}>
              <tbody>
                {d.categorias.map((c) => (
                  <tr key={c.categoriaId} className={tabela.linha}>
                    <td className={tabela.celula}>{c.nome}</td>
                    <td className={tabela.celula}>{c.natureza === 'receita' ? 'Receita' : 'Despesa'}</td>
                    <td className={tabela.numero}>{formatarBRL(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Fluxo de caixa
// --------------------------------------------------------------------------

function RelatorioFluxo() {
  const { api } = useFinanceiro();
  const hoje = hojeISO();
  const [de, setDe] = useState(inicioDoMes(`${somarMeses(competenciaDe(hoje), -5)}-01`));
  const [ate, setAte] = useState(hoje);
  const [agrupamento, setAgrupamento] = useState('mes');
  const fluxo = useDados(() => api.fluxoCaixa({ de, ate, agrupamento }), [api, de, ate, agrupamento]);
  const f = fluxo.dados;
  const rotulo = (inicio: string) => (agrupamento === 'mes' ? formatarCompetencia(inicio) : formatarData(inicio).slice(0, 5));

  return (
    <div className="space-y-4">
      <div className={`${cartao} flex flex-wrap items-end gap-3 p-4`}>
        <Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <Seletor rotulo="Agrupar por" value={agrupamento} onChange={(e) => setAgrupamento(e.target.value)}
          opcoes={[{ valor: 'mes', rotulo: 'Mês' }, { valor: 'semana', rotulo: 'Semana' }, { valor: 'dia', rotulo: 'Dia' }]} />
        {f && (
          <Botao className="ml-auto" icone={<Download className="h-4 w-4" />}
            onClick={() => baixarCsv(`fluxo-de-caixa-${de}-a-${ate}`, montarCsv(f.categorias, [
              { titulo: 'Categoria', valor: (c) => c.nome },
              { titulo: 'Atividade', valor: (c) => f.atividades[c.atividade] ?? c.atividade },
              ...f.periodos.map((p, i) => ({ titulo: rotulo(p.inicio), valor: (c: (typeof f.categorias)[number]) => numeroPlanilha(c.valores[i]) })),
              { titulo: 'Total', valor: (c) => numeroPlanilha(c.total) },
            ]))}>
            Planilha
          </Botao>
        )}
      </div>
      {fluxo.erro && <Aviso tipo="erro">{fluxo.erro}</Aviso>}
      {!f ? <Carregando /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Numero rotulo="Saldo inicial" valor={formatarBRL(f.saldoInicial)} />
            <Numero rotulo="Entradas" valor={formatarBRL(f.totais.entradas)} />
            <Numero rotulo="Saídas" valor={formatarBRL(f.totais.saidas)} />
            <Numero rotulo="Ajustes de saldo" valor={formatarBRL(f.totais.ajustes)} detalhe="Saldos iniciais e correções" />
            <Numero rotulo="Saldo final" valor={formatarBRL(f.saldoFinal)} destaque />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <CartaoGrafico
              titulo="Entradas e saídas"
              grafico={
                <GraficoColunas
                  dados={emReais(f.periodos as unknown as Array<Record<string, unknown>>, ['entradas', 'saidas'])}
                  x="inicio"
                  rotuloX={rotulo}
                  series={[{ chave: 'entradas', rotulo: 'Entradas', cor: COR.serie1 }, { chave: 'saidas', rotulo: 'Saídas', cor: COR.serie2 }]}
                />
              }
              tabela={<TabelaPeriodos periodos={f.periodos} rotulo={rotulo} />}
            />
            <CartaoGrafico
              titulo="Saldo no fim de cada período"
              subtitulo="Todas as contas somadas"
              grafico={<GraficoLinha dados={emReais(f.periodos as unknown as Array<Record<string, unknown>>, ['saldoFinal'])} x="inicio" y="saldoFinal" rotulo="Saldo" rotuloX={rotulo} />}
              tabela={<TabelaPeriodos periodos={f.periodos} rotulo={rotulo} />}
            />
          </div>
          <Secao titulo="Por atividade" subtitulo="Operacional: o negócio em si. Investimento: compra e venda de bens. Financiamento: sócios e empréstimos.">
            <div className="grid gap-4 sm:grid-cols-3">
              {Object.entries(f.atividades).map(([chave, nome]) => (
                <Numero key={chave} rotulo={nome} valor={formatarBRL(f.totais[chave])} tom={paraCentavos(f.totais[chave]) < 0 ? 'atencao' : 'neutro'} />
              ))}
            </div>
          </Secao>
          <Secao titulo="Por categoria" semPadding>
            {f.categorias.length === 0 ? <Vazio titulo="Nenhum pagamento no período." /> : (
              <div className="overflow-x-auto">
                <table className={tabela.base}>
                  <thead className={tabela.cabeca}>
                    <tr>
                      <th className={tabela.celulaCabeca}>Categoria</th>
                      {f.periodos.length <= 12 && f.periodos.map((p) => <th key={p.inicio} className={`${tabela.celulaCabeca} text-right`}>{rotulo(p.inicio)}</th>)}
                      <th className={`${tabela.celulaCabeca} text-right`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.categorias.map((c) => (
                      <tr key={c.categoriaId} className={tabela.linha}>
                        <td className={tabela.celula}>
                          <p className={texto.titulo}>{c.nome}</p>
                          <p className={`text-xs ${texto.suave}`}>{c.grupoRotulo}</p>
                        </td>
                        {f.periodos.length <= 12 && c.valores.map((v, i) => <td key={i} className={tabela.numero}>{paraCentavos(v) ? formatarBRL(v) : ''}</td>)}
                        <td className={`${tabela.numero} font-medium`}>{formatarBRL(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        </>
      )}
    </div>
  );
}

function TabelaPeriodos({ periodos, rotulo }: { periodos: Array<{ inicio: string; entradas: string; saidas: string; saldoFinal: string }>; rotulo: (s: string) => string }) {
  return (
    <table className={tabela.base}>
      <thead className={tabela.cabeca}>
        <tr>
          <th className={tabela.celulaCabeca}>Período</th>
          <th className={`${tabela.celulaCabeca} text-right`}>Entradas</th>
          <th className={`${tabela.celulaCabeca} text-right`}>Saídas</th>
          <th className={`${tabela.celulaCabeca} text-right`}>Saldo final</th>
        </tr>
      </thead>
      <tbody>
        {periodos.map((p) => (
          <tr key={p.inicio} className={tabela.linha}>
            <td className={tabela.celula}>{rotulo(p.inicio)}</td>
            <td className={tabela.numero}>{formatarBRL(p.entradas)}</td>
            <td className={tabela.numero}>{formatarBRL(p.saidas)}</td>
            <td className={tabela.numero}>{formatarBRL(p.saldoFinal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --------------------------------------------------------------------------
// Projeção
// --------------------------------------------------------------------------

const ORIGEM_PROJECAO: Record<string, [string, 'neutro' | 'info' | 'atencao']> = {
  lancado: ['Lançado', 'neutro'],
  recorrencia: ['Recorrência', 'info'],
  folha_estimada: ['Folha estimada', 'atencao'],
  decimo_terceiro: ['13º estimado', 'atencao'],
};

function RelatorioProjecao() {
  const { api } = useFinanceiro();
  const [dias, setDias] = useState(90);
  const [agrupamento, setAgrupamento] = useState('semana');
  const [vencidos, setVencidos] = useState(true);
  const proj = useDados(() => api.fluxoProjetado({ dias, agrupamento, incluirVencidos: vencidos }), [api, dias, agrupamento, vencidos]);
  const p = proj.dados;
  const rotulo = (inicio: string) => (agrupamento === 'mes' ? formatarCompetencia(inicio) : formatarData(inicio).slice(0, 5));
  return (
    <div className="space-y-4">
      <div className={`${cartao} flex flex-wrap items-end gap-3 p-4`}>
        <Seletor rotulo="Horizonte" value={String(dias)} onChange={(e) => setDias(Number(e.target.value))}
          opcoes={[30, 60, 90, 180, 365].map((d) => ({ valor: String(d), rotulo: `${d} dias` }))} />
        <Seletor rotulo="Agrupar por" value={agrupamento} onChange={(e) => setAgrupamento(e.target.value)}
          opcoes={[{ valor: 'semana', rotulo: 'Semana' }, { valor: 'mes', rotulo: 'Mês' }, { valor: 'dia', rotulo: 'Dia' }]} />
        <Seletor rotulo="Contas vencidas" value={vencidos ? 's' : 'n'} onChange={(e) => setVencidos(e.target.value === 's')}
          opcoes={[{ valor: 's', rotulo: 'Contar como se entrassem/saíssem hoje' }, { valor: 'n', rotulo: 'Deixar de fora' }]} />
      </div>
      {!p ? <Carregando /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Numero rotulo="Saldo hoje" valor={formatarBRL(p.saldoAtual)} />
            <Numero rotulo={`Saldo em ${formatarData(p.ate)}`} valor={formatarBRL(p.periodos[p.periodos.length - 1]?.saldoFinal ?? p.saldoAtual)} destaque />
            <Numero rotulo="Menor saldo no período" valor={formatarBRL(p.menorSaldo.valor)} detalhe={`em ${formatarData(p.menorSaldo.data)}`}
              tom={paraCentavos(p.menorSaldo.valor) < 0 ? 'critico' : 'neutro'} />
            <Numero rotulo="Vencidos em aberto" valor={formatarBRL(p.vencidos.receber)} detalhe={`a receber · a pagar ${formatarBRL(p.vencidos.pagar)}`} />
          </div>
          {paraCentavos(p.menorSaldo.valor) < 0 && (
            <Aviso tipo="erro">
              O caixa fica negativo até {formatarData(p.menorSaldo.data)}. Antecipe recebimentos, renegocie vencimentos ou planeje capital de giro.
            </Aviso>
          )}
          <CartaoGrafico
            titulo="Saldo projetado"
            subtitulo="Com o que já está lançado, as recorrências e as estimativas de folha e 13º"
            grafico={<GraficoLinha dados={emReais(p.periodos as unknown as Array<Record<string, unknown>>, ['saldoFinal'])} x="inicio" y="saldoFinal" rotulo="Saldo projetado" rotuloX={rotulo} altura={260} />}
            tabela={<TabelaPeriodos periodos={p.periodos} rotulo={rotulo} />}
          />
          <Secao titulo="O que compõe a projeção" semPadding>
            <div className="max-h-96 overflow-y-auto">
              <table className={tabela.base}>
                <tbody>
                  {p.itens.map((item, i) => (
                    <tr key={i} className={tabela.linha}>
                      <td className={`${tabela.celula} whitespace-nowrap`}>{formatarData(item.data)}</td>
                      <td className={tabela.celula}>
                        {item.descricao} {item.vencido && <Etiqueta tom="critico">vencido</Etiqueta>}
                      </td>
                      <td className={tabela.celula}><Etiqueta tom={ORIGEM_PROJECAO[item.origem]?.[1] ?? 'neutro'}>{ORIGEM_PROJECAO[item.origem]?.[0] ?? item.origem}</Etiqueta></td>
                      <td className={`${tabela.numero} ${paraCentavos(item.valor) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatarBRL(item.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Inadimplência
// --------------------------------------------------------------------------

function RelatorioInadimplencia() {
  const { api } = useFinanceiro();
  const [tipo, setTipo] = useState<TipoTitulo>('receber');
  const dados = useDados(() => api.inadimplencia(tipo), [api, tipo]);
  const d = dados.dados;
  return (
    <div className="space-y-4">
      <div className={`${cartao} flex flex-wrap items-end gap-3 p-4`}>
        <Seletor rotulo="Olhar" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTitulo)}
          opcoes={[{ valor: 'receber', rotulo: 'O que clientes devem à empresa' }, { valor: 'pagar', rotulo: 'O que a empresa deve' }]} />
      </div>
      {!d ? <Carregando /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Numero rotulo="Vencido" valor={formatarBRL(d.totalVencido)} tom={paraCentavos(d.totalVencido) > 0 ? 'critico' : 'bom'} destaque />
            <Numero rotulo="A vencer" valor={formatarBRL(d.totalAVencer)} />
            <Numero rotulo="Vencido sobre o total em aberto" valor={d.percentualVencido ? `${d.percentualVencido.replace('.', ',')}%` : '—'} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <CartaoGrafico
              titulo="Vencido por tempo de atraso"
              grafico={<GraficoBarrasHorizontais rotulo="Vencido por faixa de atraso" itens={d.vencidas.map((f) => ({ rotulo: f.rotulo, valor: paraCentavos(f.valor) / 100 }))} />}
              tabela={
                <table className={tabela.base}>
                  <tbody>
                    {[...d.vencidas, ...d.aVencer.map((f) => ({ ...f, rotulo: `A vencer: ${f.rotulo}` }))].map((f) => (
                      <tr key={f.rotulo} className={tabela.linha}>
                        <td className={tabela.celula}>{f.rotulo}</td>
                        <td className={tabela.numero}>{f.quantidade}</td>
                        <td className={tabela.numero}>{formatarBRL(f.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
            <Secao titulo={tipo === 'receber' ? 'Quem mais deve' : 'A quem mais se deve'} semPadding>
              {d.pessoas.length === 0 ? <Vazio titulo="Nada vencido." /> : (
                <table className={tabela.base}>
                  <thead className={tabela.cabeca}>
                    <tr>
                      <th className={tabela.celulaCabeca}>Pessoa</th>
                      <th className={`${tabela.celulaCabeca} text-right`}>Parcelas</th>
                      <th className={`${tabela.celulaCabeca} text-right`}>Maior atraso</th>
                      <th className={`${tabela.celulaCabeca} text-right`}>Vencido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.pessoas.map((p) => (
                      <tr key={p.nome} className={tabela.linha}>
                        <td className={tabela.celula}>{p.nome}</td>
                        <td className={tabela.numero}>{p.parcelas}</td>
                        <td className={tabela.numero}>{p.maiorAtraso} dias</td>
                        <td className={`${tabela.numero} font-medium`}>{formatarBRL(p.vencido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Secao>
          </div>
        </>
      )}
    </div>
  );
}

