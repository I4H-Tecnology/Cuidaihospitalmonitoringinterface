/**
 * Tudo sobre um título: parcelas, pagamentos, categorias e o histórico de
 * quem mexeu. As ações ficam onde o dado está — pagar e editar na parcela,
 * estornar no pagamento —, e o que não pode ser feito aparece desabilitado
 * com o motivo.
 */

import { useEffect, useRef, useState } from 'react';
import { CalendarClock, ListOrdered, Pencil, RotateCcw, XCircle } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Categoria, CentroCusto, Conta, ParcelaDetalhe, Titulo } from '../../api/tipos';
import { formatarBRL, paraCentavos, somar } from '../../util/dinheiro';
import { formatarCompetencia, formatarData, formatarDataHora } from '../../util/datas';
import { emAberto } from '../../util/parcelas';
import { Aviso, Botao, Campo, Carregando, ConfirmarComMotivo, Etiqueta, EtiquetaParcela, Janela, tabela, texto } from '../../ui/base';
import { EditorParcelas } from './EditorParcelas';
import { descreverHistorico } from './historico';
import { ModalBaixa } from './ModalBaixa';
import { ModalTitulo } from './ModalTitulo';

const ORIGEM: Record<string, string> = {
  manual: 'Lançado à mão', recorrencia: 'Recorrência', folha: 'Folha de pagamento', emprestimo: 'Empréstimo',
  capital: 'Operação de sócio', patrimonio: 'Patrimônio', investimento: 'Investimento',
  conciliacao: 'Conciliação bancária', integracao: 'Integração',
};

export function DetalheTitulo({
  tituloId,
  editarParcelaAoAbrir = null,
  contas,
  categorias,
  centros,
  aoFechar,
  aoMudar,
}: {
  tituloId: string;
  /** Abre direto na edição de parcelas, com esta parcela marcada (vem da lista). */
  editarParcelaAoAbrir?: string | null;
  contas: Conta[];
  categorias: Categoria[];
  centros: CentroCusto[];
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const { api, pode, avisar } = useFinanceiro();
  const { dados: titulo, recarregar, setDados } = useDados(() => api.titulo(tituloId), [api, tituloId]);
  const [baixando, setBaixando] = useState<ParcelaDetalhe | null>(null);
  const [estornando, setEstornando] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [mudandoVencimento, setMudandoVencimento] = useState<ParcelaDetalhe | null>(null);
  // null: editor fechado; { destaque }: aberto, com a parcela clicada marcada (ou nenhuma).
  const [editandoParcelas, setEditandoParcelas] = useState<{ destaque: string | null } | null>(null);
  const abriuEditor = useRef(false);

  useEffect(() => {
    if (titulo && editarParcelaAoAbrir && !abriuEditor.current) {
      abriuEditor.current = true;
      if (titulo.editavel) setEditandoParcelas({ destaque: editarParcelaAoAbrir });
    }
  }, [titulo, editarParcelaAoAbrir]);

  const atualizar = (novo?: Titulo) => {
    if (novo) setDados(novo);
    else void recarregar();
    aoMudar();
  };

  if (!titulo) {
    return (
      <Janela titulo="Título" aoFechar={aoFechar}>
        <Carregando />
      </Janela>
    );
  }

  const verbo = titulo.tipo === 'pagar' ? 'Pagar' : 'Receber';
  const cancelado = Boolean(titulo.canceladoEm);
  const temPagamentoAtivo = titulo.parcelas.some((p) => p.baixas.some((b) => !b.estornadaEm));
  const podePagar = pode('operacao', 'criar') && !cancelado;
  const podeEditar = pode('operacao', 'editar') && !cancelado;
  const geradoPor = `Gerado por ${ORIGEM[titulo.origem] ?? titulo.origem}`;
  const motivoSemCancelar = !titulo.editavel
    ? `${geradoPor}: cancele por lá.`
    : temPagamentoAtivo
      ? 'Estorne os pagamentos antes de cancelar.'
      : undefined;
  const motivoSemParcelas = !titulo.editavel
    ? `${geradoPor}: valores e parcelas mudam por lá (aqui, só o vencimento).`
    : !titulo.parcelas.some(emAberto)
      ? 'Todas as parcelas estão pagas.'
      : undefined;
  const historico = descreverHistorico(titulo.historico, titulo.parcelas);

  return (
    <>
      <Janela
        titulo={`Título ${titulo.numero} · ${titulo.descricao}`}
        subtitulo={`${titulo.tipo === 'pagar' ? 'Conta a pagar' : 'Conta a receber'}${titulo.pessoaNome ? ` · ${titulo.pessoaNome}` : ''} · competência ${formatarCompetencia(titulo.competencia)}`}
        aoFechar={aoFechar}
        largura="max-w-4xl"
        rodape={
          <>
            {!cancelado && pode('operacao', 'excluir') && (
              <Botao
                variante="fantasma"
                icone={<XCircle className="h-4 w-4" />}
                disabled={Boolean(motivoSemCancelar)}
                title={motivoSemCancelar}
                onClick={() => setCancelando(true)}
              >
                Cancelar título
              </Botao>
            )}
            {podeEditar && (
              <Botao
                icone={<Pencil className="h-4 w-4" />}
                disabled={!titulo.editavel}
                title={!titulo.editavel ? `${geradoPor}: altere por lá.` : 'Descrição, fornecedor, documento e categorias'}
                onClick={() => setEditando(true)}
              >
                Editar título
              </Botao>
            )}
            <Botao variante="primario" onClick={aoFechar}>Fechar</Botao>
          </>
        }
      >
        {cancelado && (
          <div className="mb-4">
            <Aviso tipo="atencao">Cancelado em {formatarDataHora(titulo.canceladoEm)}. Motivo: {titulo.motivoCancelamento}</Aviso>
          </div>
        )}

        <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-4">
          <Dado rotulo="Valor total" valor={formatarBRL(titulo.valorTotal)} />
          <Dado rotulo="Em aberto" valor={formatarBRL(titulo.saldo)} />
          <Dado rotulo="Emissão" valor={formatarData(titulo.dataEmissao)} />
          <Dado rotulo="Origem" valor={ORIGEM[titulo.origem] ?? titulo.origem} />
          {titulo.documento && <Dado rotulo="Documento" valor={titulo.documento} />}
          {titulo.criadoPor && <Dado rotulo="Lançado por" valor={titulo.criadoPor} />}
        </dl>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className={`text-sm font-semibold ${texto.titulo}`}>Parcelas e pagamentos</h3>
          {podeEditar && (
            <Botao
              pequeno
              icone={<ListOrdered className="h-3.5 w-3.5" />}
              disabled={Boolean(motivoSemParcelas)}
              title={motivoSemParcelas ?? 'Vencimento e valor de cada parcela em aberto, incluir, tirar e refazer parcelas'}
              onClick={() => setEditandoParcelas({ destaque: null })}
            >
              Editar parcelas
            </Botao>
          )}
        </div>
        <div className="mb-5 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Parcela</th>
                <th className={tabela.celulaCabeca}>Vencimento</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Valor</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Saldo</th>
                <th className={tabela.celulaCabeca}>Situação</th>
                <th className={tabela.celulaCabeca} />
              </tr>
            </thead>
            <tbody>
              {titulo.parcelas.map((p) => (
                <FragmentoParcela
                  key={p.id}
                  parcela={p}
                  total={titulo.parcelas.length}
                  tipo={titulo.tipo}
                  verbo={verbo}
                  podePagar={podePagar}
                  podeEstornar={pode('operacao', 'excluir')}
                  podeEditar={podeEditar}
                  editavel={titulo.editavel}
                  aoPagar={() => setBaixando(p)}
                  aoEstornar={(id) => setEstornando(id)}
                  aoEditar={() => (titulo.editavel ? setEditandoParcelas({ destaque: p.id }) : setMudandoVencimento(p))}
                />
              ))}
            </tbody>
          </table>
        </div>

        <h3 className={`mb-2 text-sm font-semibold ${texto.titulo}`}>Categorias</h3>
        <ul className="mb-5 space-y-1 text-sm">
          {titulo.rateio.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span className={texto.normal}>
                {r.categoriaNome}
                {r.centroCustoNome && <span className={texto.suave}> · {r.centroCustoNome}</span>}
              </span>
              <span className={`tabular-nums ${texto.titulo}`}>{formatarBRL(r.valor)}</span>
            </li>
          ))}
        </ul>

        {titulo.observacao && <p className={`mb-5 whitespace-pre-line text-sm ${texto.normal}`}>{titulo.observacao}</p>}

        <h3 className={`mb-2 text-sm font-semibold ${texto.titulo}`}>Histórico</h3>
        <ol className="space-y-2 text-xs">
          {historico.map((h) => (
            <li key={h.chave} className={texto.suave}>
              <span className={texto.normal}>{formatarDataHora(h.em)}</span> · {h.usuario} · {h.frase}
              {h.motivo && <> — “{h.motivo}”</>}
              {h.detalhes.length > 0 && (
                <ul className="ml-4 mt-0.5 list-disc space-y-0.5">
                  {h.detalhes.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </Janela>

      {editandoParcelas && (
        <EditorParcelas
          titulo={titulo}
          destaque={editandoParcelas.destaque}
          aoFechar={() => setEditandoParcelas(null)}
          aoSalvar={(novo) => {
            setEditandoParcelas(null);
            atualizar(novo);
          }}
        />
      )}

      {baixando && (
        <ModalBaixa
          tipo={titulo.tipo}
          parcela={baixando}
          descricao={titulo.descricao}
          contas={contas}
          aoFechar={() => setBaixando(null)}
          aoConcluir={() => {
            setBaixando(null);
            atualizar();
          }}
        />
      )}
      {estornando && (
        <ConfirmarComMotivo
          titulo="Estornar pagamento"
          mensagem="O pagamento não é apagado: um movimento de volta é lançado na data de hoje, e a parcela volta a ficar em aberto."
          rotuloAcao="Estornar"
          aoFechar={() => setEstornando(null)}
          aoConfirmar={async (motivo) => {
            try {
              atualizar(await api.estornarBaixa(estornando, motivo));
              avisar('Pagamento estornado.');
              setEstornando(null);
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não foi possível estornar.', 'erro');
            }
          }}
        />
      )}
      {cancelando && (
        <ConfirmarComMotivo
          titulo={`Cancelar o título ${titulo.numero}`}
          mensagem="O título sai das contas em aberto e dos relatórios, mas continua no histórico com o motivo."
          rotuloAcao="Cancelar título"
          aoFechar={() => setCancelando(false)}
          aoConfirmar={async (motivo) => {
            try {
              atualizar(await api.cancelarTitulo(titulo.id, motivo));
              avisar('Título cancelado.');
              setCancelando(false);
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não foi possível cancelar.', 'erro');
            }
          }}
        />
      )}
      {editando && (
        <ModalTitulo
          tipo={titulo.tipo}
          titulo={titulo}
          contas={contas}
          categorias={categorias}
          centros={centros}
          aoFechar={() => setEditando(false)}
          aoSalvar={(novo) => {
            setEditando(false);
            atualizar(novo);
          }}
        />
      )}
      {mudandoVencimento && (
        <NovoVencimento
          parcela={mudandoVencimento}
          aoFechar={() => setMudandoVencimento(null)}
          aoSalvar={(novo) => {
            setMudandoVencimento(null);
            atualizar(novo);
          }}
        />
      )}
    </>
  );
}

function FragmentoParcela({
  parcela: p,
  total,
  tipo,
  verbo,
  podePagar,
  podeEstornar,
  podeEditar,
  editavel,
  aoPagar,
  aoEstornar,
  aoEditar,
}: {
  parcela: ParcelaDetalhe;
  total: number;
  tipo: 'pagar' | 'receber';
  verbo: string;
  podePagar: boolean;
  podeEstornar: boolean;
  podeEditar: boolean;
  /** Título que muda por aqui; o gerado por outra parte do módulo só muda o vencimento. */
  editavel: boolean;
  aoPagar: () => void;
  aoEstornar: (baixaId: string) => void;
  aoEditar: () => void;
}) {
  const aberta = p.status === 'aberta' || p.status === 'parcial';
  return (
    <>
      <tr className={tabela.linha}>
        <td className={tabela.celula}>{p.numero}/{total}</td>
        <td className={tabela.celula}>{formatarData(p.vencimento)}</td>
        <td className={tabela.numero}>{formatarBRL(p.valor)}</td>
        <td className={tabela.numero}>{aberta ? formatarBRL(p.saldo) : '—'}</td>
        <td className={tabela.celula}><EtiquetaParcela status={p.status} vencida={p.vencida} tipo={tipo} /></td>
        <td className={`${tabela.celula} text-right`}>
          <div className="flex justify-end gap-1">
            {aberta && podeEditar && (
              editavel ? (
                <Botao pequeno variante="fantasma" icone={<Pencil className="h-3.5 w-3.5" />} onClick={aoEditar} title="Vencimento, valor e código de barras desta parcela">
                  Editar
                </Botao>
              ) : (
                <Botao pequeno variante="fantasma" icone={<CalendarClock className="h-3.5 w-3.5" />} onClick={aoEditar} title="Mudar vencimento">
                  Vencimento
                </Botao>
              )
            )}
            {aberta && podePagar && <Botao pequeno variante="primario" onClick={aoPagar}>{verbo}</Botao>}
          </div>
        </td>
      </tr>
      {p.baixas.map((b) => (
        <tr key={b.id} className="text-xs">
          <td />
          <td className="px-4 py-1.5 text-gray-500 dark:text-gray-400" colSpan={3}>
            {b.estornadaEm ? <s>{formatarData(b.data)}</s> : formatarData(b.data)} · {b.contaNome} · {formatarBRL(b.valor)}
            {paraCentavos(somar(b.juros, b.multa)) > 0 && <> + juros/multa {formatarBRL(somar(b.juros, b.multa))}</>}
            {paraCentavos(b.desconto) > 0 && <> − desconto {formatarBRL(b.desconto)}</>}
            {b.criadoPor && <> · {b.criadoPor}</>}
            {b.estornadaEm && <> · estornado: {b.motivoEstorno}</>}
          </td>
          <td className="px-4 py-1.5">
            {b.estornadaEm ? <Etiqueta>Estornado</Etiqueta> : b.conciliada ? <Etiqueta tom="bom">Conciliado</Etiqueta> : null}
          </td>
          <td className="px-4 py-1.5 text-right">
            {!b.estornadaEm && podeEstornar && (
              <Botao pequeno variante="fantasma" icone={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => aoEstornar(b.id)}>
                Estornar
              </Botao>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function NovoVencimento({ parcela, aoFechar, aoSalvar }: { parcela: ParcelaDetalhe; aoFechar: () => void; aoSalvar: (t: Titulo) => void }) {
  const { api, avisar } = useFinanceiro();
  const [vencimento, setVencimento] = useState(parcela.vencimento);
  const [codigo, setCodigo] = useState(parcela.codigoBarras ?? '');
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo={`Parcela ${parcela.numero}: vencimento`}
      aoFechar={aoFechar}
      largura="max-w-md"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                aoSalvar(await api.alterarParcela(parcela.id, { vencimento, codigoBarras: codigo || null }));
                avisar('Vencimento atualizado.');
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível salvar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3">
        <Campo rotulo="Novo vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        <Campo rotulo="Código de barras / linha digitável" dica="opcional" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
      </div>
    </Janela>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className={`text-xs ${texto.suave}`}>{rotulo}</dt>
      <dd className={texto.titulo}>{valor}</dd>
    </div>
  );
}
