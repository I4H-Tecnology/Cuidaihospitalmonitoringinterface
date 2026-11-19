/**
 * Contas a pagar e contas a receber: a mesma tela, com o tipo trocado.
 *
 * A lista é de PARCELAS (é o que vence), cada uma com o título de onde veio
 * ("Título 42 · parcela 3/12"). Editar uma parcela abre o título, com o editor
 * de parcelas já nela. O topo responde "quanto venceu, quanto vence hoje e
 * esta semana" antes de qualquer filtro.
 */

import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { useDados, useFinanceiro } from '../contexto';
import type { ParcelaLista, TipoTitulo } from '../api/tipos';
import { formatarBRL, paraCentavos, somar } from '../util/dinheiro';
import { formatarCompetencia, formatarData, hojeISO } from '../util/datas';
import { ORIGENS_EDITAVEIS } from '../util/parcelas';
import { baixarCsv, montarCsv, numeroPlanilha } from '../util/csv';
import { Aviso, Botao, CabecalhoDaArea, Campo, Carregando, EtiquetaParcela, Janela, Numero, Seletor, Vazio, cartao, entrada, tabela, texto } from '../ui/base';
import { SeletorCategoria, SeletorConta, useCadastrosBasicos } from '../ui/seletores';
import { DetalheTitulo } from './titulos/DetalheTitulo';
import { FORMAS, ModalBaixa } from './titulos/ModalBaixa';
import { ModalTitulo } from './titulos/ModalTitulo';

const SITUACOES = [
  { chave: 'aberto', rotulo: 'Em aberto' },
  { chave: 'vencido', rotulo: 'Vencidas' },
  { chave: 'a_vencer', rotulo: 'A vencer' },
  { chave: 'pago', rotulo: 'Liquidadas' },
  { chave: 'cancelado', rotulo: 'Canceladas' },
  { chave: 'todos', rotulo: 'Todas' },
] as const;

const PAGINA = 100;

export function Titulos({ tipo }: { tipo: TipoTitulo }) {
  const { api, pode, avisar } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const [situacao, setSituacao] = useState<string>('aberto');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [limite, setLimite] = useState(PAGINA);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [novo, setNovo] = useState(false);
  // O título aberto; com `editarParcela`, abre já no editor de parcelas, nela.
  const [aberto, setAberto] = useState<{ tituloId: string; editarParcela: string | null } | null>(null);
  const [baixando, setBaixando] = useState<ParcelaLista | null>(null);
  const [emLote, setEmLote] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAplicada(busca), 300);
    return () => window.clearTimeout(t);
  }, [busca]);

  const lista = useDados(
    () => api.parcelas({ tipo, situacao, de: de || undefined, ate: ate || undefined, categoriaId: categoriaId || undefined, busca: buscaAplicada || undefined, limite }),
    [api, tipo, situacao, de, ate, categoriaId, buscaAplicada, limite],
  );
  const resumo = useDados(() => api.resumoTitulos(tipo), [api, tipo]);

  useEffect(() => {
    setSelecionadas(new Set());
  }, [tipo, situacao, de, ate, categoriaId, buscaAplicada]);

  const recarregarTudo = () => {
    lista.recarregar();
    resumo.recarregar();
    void cadastros.recarregar();
  };

  const pagar = tipo === 'pagar';
  const verbo = pagar ? 'Pagar' : 'Receber';
  const itens = lista.dados?.itens ?? [];
  const abertasSelecionadas = itens.filter((i) => selecionadas.has(i.id) && (i.status === 'aberta' || i.status === 'parcial'));
  const r = resumo.dados;

  const exportar = () => {
    const csv = montarCsv(itens, [
      { titulo: 'Vencimento', valor: (l) => formatarData(l.vencimento) },
      { titulo: 'Título', valor: (l) => String(l.tituloNumero) },
      { titulo: 'Descrição', valor: (l) => l.descricao },
      { titulo: 'Parcela', valor: (l) => `${l.numero}/${l.totalParcelas}` },
      { titulo: pagar ? 'Fornecedor' : 'Cliente', valor: (l) => l.pessoaNome ?? '' },
      { titulo: 'Categoria', valor: (l) => (l.categorias > 1 ? `${l.categoriaNome} e outras` : l.categoriaNome ?? '') },
      { titulo: 'Competência', valor: (l) => formatarCompetencia(l.competencia) },
      { titulo: 'Valor', valor: (l) => numeroPlanilha(l.valor) },
      { titulo: 'Saldo', valor: (l) => numeroPlanilha(l.saldo) },
      { titulo: 'Situação', valor: (l) => (l.vencida ? 'vencida' : l.status) },
    ]);
    baixarCsv(`${pagar ? 'contas-a-pagar' : 'contas-a-receber'}-${hojeISO()}`, csv);
  };

  return (
    <div>
      <CabecalhoDaArea
        titulo={pagar ? 'Contas a pagar' : 'Contas a receber'}
        descricao={pagar
          ? 'Tudo o que a empresa deve: fornecedores, impostos, folha, parcelas de empréstimo. Clique numa linha para ver os detalhes e o histórico.'
          : 'Tudo o que a empresa tem a receber: mensalidades, serviços, vendas. Clique numa linha para ver os detalhes e o histórico.'}
        acoes={
          <>
            <Botao icone={<Download className="h-4 w-4" />} onClick={exportar} disabled={!itens.length} title={!itens.length ? 'Nada para exportar' : undefined}>
              Planilha
            </Botao>
            {pode('operacao', 'criar') && (
              <Botao variante="primario" icone={<Plus className="h-4 w-4" />} onClick={() => setNovo(true)}>
                {pagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
              </Botao>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Numero
          rotulo={pagar ? 'Vencido' : 'Em atraso'}
          valor={r ? formatarBRL(r.vencido) : '—'}
          detalhe={r ? `${r.vencidoQuantidade} parcela(s)` : undefined}
          tom={r && paraCentavos(r.vencido) > 0 ? 'critico' : 'neutro'}
          aoClicar={() => setSituacao('vencido')}
        />
        <Numero rotulo="Vence hoje" valor={r ? formatarBRL(r.hoje) : '—'} detalhe={r ? `${r.hojeQuantidade} parcela(s)` : undefined} tom={r && paraCentavos(r.hoje) > 0 ? 'atencao' : 'neutro'} />
        <Numero rotulo="Próximos 7 dias" valor={r ? formatarBRL(r.proximos7) : '—'} />
        <Numero rotulo="Próximos 30 dias" valor={r ? formatarBRL(r.proximos30) : '—'} />
        <Numero rotulo={pagar ? 'Pago neste mês' : 'Recebido neste mês'} valor={r ? formatarBRL(r.liquidadoNoMes) : '—'} tom="bom" />
      </div>

      <div className={`${cartao} mb-4 p-4`}>
        <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Situação">
          {SITUACOES.map((s) => (
            <button
              key={s.chave}
              type="button"
              role="tab"
              aria-selected={situacao === s.chave}
              onClick={() => setSituacao(s.chave)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                situacao === s.chave
                  ? 'bg-[var(--fin-primaria,#0A7EA4)] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_10rem_10rem_16rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${entrada} pl-9`} placeholder="Buscar por descrição, documento, pessoa ou nº do título…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Campo type="date" aria-label="Vencimento a partir de" title="Vencimento a partir de" value={de} onChange={(e) => setDe(e.target.value)} />
          <Campo type="date" aria-label="Vencimento até" title="Vencimento até" value={ate} onChange={(e) => setAte(e.target.value)} />
          <SeletorCategoria
            categorias={cadastros.categorias}
            natureza={pagar ? 'despesa' : 'receita'}
            valor={categoriaId}
            aoMudar={setCategoriaId}
            rotulo=""
            vazio="Todas as categorias"
          />
        </div>
      </div>

      {abertasSelecionadas.length > 0 && pode('operacao', 'criar') && (
        <div className="mb-4">
          <Aviso
            tipo="info"
            acao={<Botao pequeno variante="primario" onClick={() => setEmLote(true)}>{verbo} selecionadas</Botao>}
          >
            {abertasSelecionadas.length} parcela(s) selecionada(s), somando {formatarBRL(somar(...abertasSelecionadas.map((i) => i.saldo)))}.
          </Aviso>
        </div>
      )}

      {lista.erro && <div className="mb-4"><Aviso tipo="erro">{lista.erro}</Aviso></div>}

      <div className={`${cartao} overflow-hidden ${lista.carregando && lista.dados ? 'opacity-60' : ''}`}>
        {!lista.dados ? (
          <Carregando />
        ) : itens.length === 0 ? (
          <Vazio
            titulo={situacao === 'aberto' ? `Nenhuma conta a ${pagar ? 'pagar' : 'receber'} em aberto.` : 'Nada com esses filtros.'}
            acao={pode('operacao', 'criar') && situacao === 'aberto' ? (
              <Botao variante="primario" icone={<Plus className="h-4 w-4" />} onClick={() => setNovo(true)}>
                Lançar a primeira
              </Botao>
            ) : undefined}
          >
            Contas geradas pela folha, por recorrências e por empréstimos também aparecem aqui.
          </Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className={tabela.base}>
              <thead className={tabela.cabeca}>
                <tr>
                  <th className={`${tabela.celulaCabeca} w-8`}>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas"
                      checked={itens.length > 0 && itens.every((i) => selecionadas.has(i.id))}
                      onChange={(e) => setSelecionadas(e.target.checked ? new Set(itens.map((i) => i.id)) : new Set())}
                    />
                  </th>
                  <th className={tabela.celulaCabeca}>Vencimento</th>
                  <th className={tabela.celulaCabeca}>Descrição</th>
                  <th className={tabela.celulaCabeca}>Categoria</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Valor</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Em aberto</th>
                  <th className={tabela.celulaCabeca}>Situação</th>
                  <th className={tabela.celulaCabeca} />
                </tr>
              </thead>
              <tbody>
                {itens.map((p) => {
                  const aberta = p.status === 'aberta' || p.status === 'parcial';
                  const editavel = aberta && pode('operacao', 'editar') && ORIGENS_EDITAVEIS.includes(p.origem);
                  return (
                    <tr key={p.id} className={tabela.linhaClicavel} onClick={() => setAberto({ tituloId: p.tituloId, editarParcela: null })}>
                      <td className={tabela.celula} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${p.descricao}`}
                          checked={selecionadas.has(p.id)}
                          onChange={(e) => {
                            const nova = new Set(selecionadas);
                            if (e.target.checked) nova.add(p.id);
                            else nova.delete(p.id);
                            setSelecionadas(nova);
                          }}
                        />
                      </td>
                      <td className={`${tabela.celula} whitespace-nowrap`}>{formatarData(p.vencimento)}</td>
                      <td className={tabela.celula}>
                        <p className={texto.titulo}>{p.descricao}</p>
                        <p className={`text-xs ${texto.suave}`}>
                          Título {p.tituloNumero} · parcela {p.numero}/{p.totalParcelas}
                          {p.pessoaNome && <> · {p.pessoaNome}</>}
                        </p>
                      </td>
                      <td className={tabela.celula}>
                        {p.categoriaNome}
                        {p.categorias > 1 && <span className={`text-xs ${texto.suave}`}> +{p.categorias - 1}</span>}
                      </td>
                      <td className={tabela.numero}>{formatarBRL(p.valor)}</td>
                      <td className={tabela.numero}>{aberta ? formatarBRL(p.saldo) : '—'}</td>
                      <td className={tabela.celula}><EtiquetaParcela status={p.status} vencida={p.vencida} tipo={tipo} /></td>
                      <td className={`${tabela.celula} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {editavel && (
                            <Botao
                              pequeno
                              variante="fantasma"
                              icone={<Pencil className="h-3.5 w-3.5" />}
                              aria-label={`Editar a parcela ${p.numero} do título ${p.tituloNumero}`}
                              title="Editar esta parcela (vencimento, valor) e as demais do título"
                              onClick={() => setAberto({ tituloId: p.tituloId, editarParcela: p.id })}
                            >
                              Editar
                            </Botao>
                          )}
                          {aberta && pode('operacao', 'criar') && (
                            <Botao pequeno variante="primario" onClick={() => setBaixando(p)}>{verbo}</Botao>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 text-sm dark:border-gray-700 dark:bg-gray-900/40">
                  <td className={tabela.celula} colSpan={4}>
                    {lista.dados.quantidade} parcela(s){lista.dados.quantidade > itens.length && ` — mostrando ${itens.length}`}
                  </td>
                  <td className={tabela.numero}>{formatarBRL(lista.dados.valor)}</td>
                  <td className={tabela.numero}>{formatarBRL(lista.dados.saldo)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {lista.dados && lista.dados.quantidade > itens.length && (
        <div className="mt-3 text-center">
          <Botao icone={<RefreshCw className="h-4 w-4" />} onClick={() => setLimite((l) => l + PAGINA)}>Mostrar mais</Botao>
        </div>
      )}

      {novo && (
        <ModalTitulo
          tipo={tipo}
          contas={cadastros.contas}
          categorias={cadastros.categorias}
          centros={cadastros.centros}
          aoFechar={() => setNovo(false)}
          aoSalvar={() => {
            setNovo(false);
            recarregarTudo();
          }}
        />
      )}
      {aberto && (
        <DetalheTitulo
          key={aberto.tituloId}
          tituloId={aberto.tituloId}
          editarParcelaAoAbrir={aberto.editarParcela}
          contas={cadastros.contas}
          categorias={cadastros.categorias}
          centros={cadastros.centros}
          aoFechar={() => setAberto(null)}
          aoMudar={recarregarTudo}
        />
      )}
      {baixando && (
        <ModalBaixa
          tipo={tipo}
          parcela={baixando}
          descricao={baixando.descricao}
          contas={cadastros.contas}
          aoFechar={() => setBaixando(null)}
          aoConcluir={() => {
            setBaixando(null);
            recarregarTudo();
          }}
        />
      )}
      {emLote && (
        <BaixaEmLote
          verbo={verbo}
          parcelas={abertasSelecionadas}
          contas={cadastros.contas}
          aoFechar={() => setEmLote(false)}
          aoConcluir={(quantas) => {
            setEmLote(false);
            setSelecionadas(new Set());
            avisar(`${quantas} parcela(s) quitada(s).`);
            recarregarTudo();
          }}
        />
      )}
    </div>
  );
}

function BaixaEmLote({
  verbo,
  parcelas,
  contas,
  aoFechar,
  aoConcluir,
}: {
  verbo: string;
  parcelas: ParcelaLista[];
  contas: ReturnType<typeof useCadastrosBasicos>['contas'];
  aoFechar: () => void;
  aoConcluir: (quantas: number) => void;
}) {
  const { api, avisar } = useFinanceiro();
  const [contaId, setContaId] = useState(contas.find((c) => c.ativa)?.id ?? '');
  const [data, setData] = useState(hojeISO());
  const [forma, setForma] = useState('pix');
  const [salvando, setSalvando] = useState(false);
  const total = useMemo(() => somar(...parcelas.map((p) => p.saldo)), [parcelas]);
  return (
    <Janela
      titulo={`${verbo} ${parcelas.length} parcela(s)`}
      subtitulo={`Quita o saldo inteiro de cada uma: ${formatarBRL(total)} no total. Para juros ou desconto, pague uma a uma.`}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={!contaId}
            onClick={async () => {
              setSalvando(true);
              try {
                const r = await api.baixarEmLote({ parcelaIds: parcelas.map((p) => p.id), contaId, data, forma });
                aoConcluir(r.quitadas);
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível concluir.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            {verbo} {formatarBRL(total)}
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SeletorConta contas={contas} valor={contaId} aoMudar={setContaId} className="sm:col-span-2" />
        <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <Seletor rotulo="Forma" value={forma} onChange={(e) => setForma(e.target.value)} opcoes={FORMAS} />
      </div>
      <ul className={`mt-4 max-h-48 space-y-1 overflow-y-auto text-sm ${texto.normal}`}>
        {parcelas.map((p) => (
          <li key={p.id} className="flex justify-between gap-3">
            <span className="truncate">{p.descricao}</span>
            <span className="tabular-nums">{formatarBRL(p.saldo)}</span>
          </li>
        ))}
      </ul>
    </Janela>
  );
}
