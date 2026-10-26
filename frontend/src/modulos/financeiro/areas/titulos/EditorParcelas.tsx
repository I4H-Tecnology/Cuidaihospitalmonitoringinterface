/**
 * Editar as parcelas de um título: vencimento, valor e código de barras de
 * cada parcela em aberto, incluir e tirar parcelas, refazer o saldo em N
 * vezes. As pagas ficam travadas. Nada é gravado antes de a pessoa revisar o
 * resumo (o que muda, o que sai, o total antes e depois) e confirmar.
 *
 * O título é o documento; as parcelas são como ele se paga. Por isso a tela
 * mostra sempre o total do título: mudar o total muda o título inteiro, e o
 * servidor leva as categorias junto, na mesma proporção.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarRange, Lock, Plus, Scale, Trash2 } from 'lucide-react';
import { useFinanceiro } from '../../contexto';
import type { Titulo } from '../../api/tipos';
import { deCentavos, formatarBRL, paraCentavos, type Dinheiro } from '../../util/dinheiro';
import { formatarCompetencia, formatarData, hojeISO } from '../../util/datas';
import {
  compensar,
  emAberto,
  linhaDaParcela,
  linhaNova,
  mudouAlgo,
  pedeMotivo,
  problemaDaLinha,
  refazer,
  resumirPlano,
  somaDasLinhas,
  vencimentosMensais,
  type LinhaDoPlano,
} from '../../util/parcelas';
import { AreaTexto, Aviso, Botao, Campo, CampoDinheiro, Etiqueta, Janela, entrada, tabela, texto } from '../../ui/base';

export function EditorParcelas({
  titulo,
  destaque = null,
  aoFechar,
  aoSalvar,
}: {
  titulo: Titulo;
  /** A parcela que a pessoa clicou para editar: aparece marcada. */
  destaque?: string | null;
  aoFechar: () => void;
  aoSalvar: (t: Titulo) => void;
}) {
  const { api, pode, avisar, sessao } = useFinanceiro();
  const [linhas, setLinhas] = useState<LinhaDoPlano[]>(() => titulo.parcelas.filter(emAberto).map(linhaDaParcela));
  const [ultimaEditada, setUltimaEditada] = useState<string | null>(destaque);
  const [refazendo, setRefazendo] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const pagas = titulo.parcelas.filter((p) => !emAberto(p));
  const pagasCentavos = pagas.reduce((t, p) => t + paraCentavos(p.valor), 0);
  const jaPagoCentavos = titulo.parcelas.reduce((t, p) => t + paraCentavos(p.valorPago), 0);
  const resumo = useMemo(() => resumirPlano(titulo.parcelas, linhas), [titulo.parcelas, linhas]);
  const totalMudou = resumo.totalDepois !== resumo.totalAntes;
  const podeExcluir = pode('operacao', 'excluir');
  const fechadoAte = sessao?.organizacao.fechadoAte ?? null;
  const competenciaFechada = Boolean(fechadoAte && titulo.competencia <= fechadoAte);
  const precisaMotivo = pedeMotivo(resumo);

  const bloqueio = linhas.some((l) => problemaDaLinha(l))
    ? 'Corrija as parcelas marcadas em vermelho.'
    : resumo.totalDepois <= 0
      ? 'O título precisa de ao menos uma parcela. Para desistir dele, cancele o título.'
      : totalMudou && competenciaFechada
        ? `A competência ${formatarCompetencia(titulo.competencia)} está fechada: as parcelas podem mudar, mas o total não. Use “Manter o total”.`
        : resumo.excluidas.length > 0 && !podeExcluir
          ? 'Seu perfil não permite excluir parcelas: mantenha a quantidade, ou peça a quem pode excluir.'
          : !mudouAlgo(resumo)
            ? 'Nada mudou ainda.'
            : null;

  const mudar = (chave: string, mudanca: Partial<LinhaDoPlano>) =>
    setLinhas((atuais) => atuais.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));

  const incluir = () => {
    const ultima = linhas.length ? linhas[linhas.length - 1].vencimento : pagas[pagas.length - 1]?.vencimento;
    const vencimento = ultima ? vencimentosMensais(ultima, 2)[1] : hojeISO();
    const nova = linhaNova(vencimento, null);
    setLinhas((atuais) => [...atuais, nova]);
    setUltimaEditada(nova.chave);
  };

  const manterTotal = () => {
    // Sem parcela mudada à mão (só tirou ou incluiu), a diferença vai para todas.
    const chave = ultimaEditada && linhas.some((l) => l.chave === ultimaEditada) ? ultimaEditada : null;
    const resultado = compensar(linhas, chave, resumo.totalAntes, pagasCentavos);
    if (typeof resultado === 'string') avisar(resultado, 'erro');
    else setLinhas(resultado);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const novo = await api.reparcelar(titulo.id, {
        parcelas: linhas.map((l) => ({
          ...(l.id ? { id: l.id } : {}),
          vencimento: l.vencimento,
          valor: deCentavos(paraCentavos(l.valor)),
          codigoBarras: l.codigoBarras.trim() || null,
        })),
        motivo: motivo.trim() || null,
      });
      avisar('Parcelas do título atualizadas.');
      aoSalvar(novo);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível salvar as parcelas.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const cabecalho = `Título ${titulo.numero} · ${titulo.descricao}`;

  if (revisando) {
    return (
      <Janela
        titulo="Confira antes de gravar"
        subtitulo={cabecalho}
        aoFechar={aoFechar}
        largura="max-w-2xl"
        rodape={
          <>
            <Botao variante="fantasma" icone={<ArrowLeft className="h-4 w-4" />} onClick={() => setRevisando(false)}>Voltar e ajustar</Botao>
            <Botao
              variante="primario"
              carregando={salvando}
              disabled={precisaMotivo && motivo.trim().length < 3}
              title={precisaMotivo && motivo.trim().length < 3 ? 'Escreva o motivo: ele fica no histórico do título.' : undefined}
              onClick={salvar}
            >
              Confirmar alterações
            </Botao>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          {resumo.alteradas.length > 0 && (
            <Bloco titulo={`Alteradas (${resumo.alteradas.length})`}>
              {resumo.alteradas.map((m) => (
                <li key={m.numero}>
                  <span className={texto.titulo}>Parcela {m.numero}:</span>{' '}
                  {[
                    m.antes.vencimento !== m.depois.vencimento && `vencimento ${formatarData(m.antes.vencimento)} → ${formatarData(m.depois.vencimento)}`,
                    m.antes.valor !== m.depois.valor && `valor ${formatarBRL(m.antes.valor)} → ${formatarBRL(m.depois.valor)}`,
                    m.antes.codigoBarras !== m.depois.codigoBarras && (m.depois.codigoBarras ? 'código de barras novo' : 'código de barras removido'),
                  ].filter(Boolean).join(' · ')}
                </li>
              ))}
            </Bloco>
          )}
          {resumo.excluidas.length > 0 && (
            <Bloco titulo={`Excluídas (${resumo.excluidas.length})`} tom="critico">
              {resumo.excluidas.map((p) => (
                <li key={p.id}>Parcela {p.numero} · vencia em {formatarData(p.vencimento)} · {formatarBRL(p.valor)}</li>
              ))}
            </Bloco>
          )}
          {resumo.novas.length > 0 && (
            <Bloco titulo={`Novas (${resumo.novas.length})`} tom="bom">
              {resumo.novas.map((l) => (
                <li key={l.chave}>Vence em {formatarData(l.vencimento)} · {formatarBRL(l.valor)}</li>
              ))}
            </Bloco>
          )}
          {resumo.pagas.length > 0 && (
            <p className={texto.suave}>
              Pagas, mantidas como estão: {resumo.pagas.map((p) => `parcela ${p.numero}`).join(', ')}.
            </p>
          )}
          {totalMudou && (
            <Aviso tipo="atencao">
              O total do título passa de {formatarBRL(deCentavos(resumo.totalAntes))} para{' '}
              <strong>{formatarBRL(deCentavos(resumo.totalDepois))}</strong>. As categorias acompanham, na mesma proporção.
            </Aviso>
          )}
          <p className={`text-xs ${texto.suave}`}>Depois de gravar, as parcelas são renumeradas pela ordem de vencimento.</p>
          <AreaTexto
            rotulo={precisaMotivo ? 'Motivo (obrigatório: fica no histórico do título)' : 'Motivo (opcional: fica no histórico do título)'}
            placeholder="Ex.: fornecedor aceitou dividir o saldo em 4 vezes"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      </Janela>
    );
  }

  return (
    <Janela
      titulo="Editar parcelas"
      subtitulo={cabecalho}
      aoFechar={aoFechar}
      largura="max-w-4xl"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={Boolean(bloqueio)} title={bloqueio ?? undefined} onClick={() => setRevisando(true)}>
            Revisar alterações
          </Botao>
        </>
      }
    >
      <p className={`mb-4 text-sm ${texto.suave}`}>
        Mude vencimento e valor das parcelas em aberto, inclua ou tire parcelas. As pagas ficam como estão, e nada é
        gravado antes de você revisar e confirmar.
      </p>

      {pagas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900/40">
          <Lock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
          <span className={texto.suave}>Pagas:</span>
          {pagas.map((p) => (
            <span key={p.id} className={texto.normal}>
              {p.numero} · {formatarData(p.vencimento)} · {formatarBRL(p.valor)}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className={tabela.base}>
          <thead className={tabela.cabeca}>
            <tr>
              <th className={`${tabela.celulaCabeca} w-14`}>Nº</th>
              <th className={tabela.celulaCabeca}>Vencimento</th>
              <th className={tabela.celulaCabeca}>Valor</th>
              <th className={tabela.celulaCabeca}>Código de barras</th>
              <th className={tabela.celulaCabeca}>Situação</th>
              <th className={tabela.celulaCabeca} />
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr className={tabela.linha}>
                <td colSpan={6} className={`${tabela.celula} text-center ${texto.suave}`}>
                  Nenhuma parcela em aberto no plano: o título fica só com o que já foi pago.
                </td>
              </tr>
            )}
            {linhas.map((l) => {
              const problema = problemaDaLinha(l);
              const parcial = paraCentavos(l.valorPago) > 0;
              const semTirar = l.teveBaixa
                ? 'Teve pagamento (mesmo estornado): não pode sair. Mude o valor ou o vencimento.'
                : l.id && !podeExcluir
                  ? 'Seu perfil não permite excluir parcelas.'
                  : undefined;
              return (
                <tr
                  key={l.chave}
                  className={`${tabela.linha} ${l.chave === destaque ? 'bg-sky-50 dark:bg-sky-950/40' : ''}`}
                >
                  <td className={tabela.celula}>{l.numero ?? <Etiqueta tom="info">nova</Etiqueta>}</td>
                  <td className="px-2 py-2 align-top">
                    <input
                      type="date"
                      aria-label={`Vencimento da parcela ${l.numero ?? 'nova'}`}
                      className={`${entrada} min-w-[9.5rem]`}
                      value={l.vencimento}
                      onChange={(e) => mudar(l.chave, { vencimento: e.target.value })}
                    />
                  </td>
                  <td className="w-44 px-2 py-2 align-top">
                    <CampoDinheiro
                      aria-label={`Valor da parcela ${l.numero ?? 'nova'}`}
                      valor={l.valor}
                      aoMudar={(v) => {
                        mudar(l.chave, { valor: v });
                        setUltimaEditada(l.chave);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <input
                      aria-label={`Código de barras da parcela ${l.numero ?? 'nova'}`}
                      className={entrada}
                      placeholder="opcional"
                      value={l.codigoBarras}
                      onChange={(e) => mudar(l.chave, { codigoBarras: e.target.value })}
                    />
                  </td>
                  <td className={`${tabela.celula} align-top`}>
                    {parcial ? (
                      <Etiqueta tom="atencao">Parcial · pago {formatarBRL(l.valorPago)}</Etiqueta>
                    ) : l.id ? (
                      <Etiqueta>Em aberto</Etiqueta>
                    ) : (
                      <Etiqueta tom="info">Entra agora</Etiqueta>
                    )}
                    {problema && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{problema}</p>}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    <button
                      type="button"
                      aria-label={`Tirar a parcela ${l.numero ?? 'nova'}`}
                      title={semTirar ?? 'Tirar esta parcela do plano'}
                      disabled={Boolean(semTirar)}
                      className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-red-950"
                      onClick={() => setLinhas((atuais) => atuais.filter((x) => x.chave !== l.chave))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Botao pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={incluir}>Incluir parcela</Botao>
        <Botao pequeno icone={<CalendarRange className="h-3.5 w-3.5" />} onClick={() => setRefazendo((r) => !r)}>
          Refazer em N vezes
        </Botao>
        {totalMudou && (
          <Botao pequeno icone={<Scale className="h-3.5 w-3.5" />} onClick={manterTotal}
            title="Divide a diferença entre as parcelas seguintes à que você mudou; se você só tirou ou incluiu parcelas, entre todas">
            Manter o total de {formatarBRL(deCentavos(resumo.totalAntes))}
          </Botao>
        )}
      </div>

      {refazendo && (
        <Refazer
          linhas={linhas}
          pagas={pagas.map((p) => p.vencimento)}
          aoAplicar={(novas) => {
            setLinhas(novas);
            setRefazendo(false);
          }}
          aoFechar={() => setRefazendo(false)}
        />
      )}

      <dl className="mt-4 grid gap-3 rounded-lg border border-gray-200 p-4 text-sm sm:grid-cols-3 dark:border-gray-700">
        <div>
          <dt className={`text-xs ${texto.suave}`}>Já pago</dt>
          <dd className={`tabular-nums ${texto.titulo}`}>{formatarBRL(deCentavos(jaPagoCentavos))}</dd>
        </div>
        <div>
          <dt className={`text-xs ${texto.suave}`}>Em aberto com o plano novo</dt>
          <dd className={`tabular-nums ${texto.titulo}`}>{formatarBRL(deCentavos(resumo.totalDepois - jaPagoCentavos))}</dd>
        </div>
        <div>
          <dt className={`text-xs ${texto.suave}`}>Total do título</dt>
          <dd className={`tabular-nums font-semibold ${texto.titulo}`}>{formatarBRL(deCentavos(resumo.totalDepois))}</dd>
          {totalMudou && (
            <dd className="text-xs text-amber-700 dark:text-amber-400">
              antes {formatarBRL(deCentavos(resumo.totalAntes))} · diferença{' '}
              {resumo.totalDepois > resumo.totalAntes ? '+' : '−'}
              {formatarBRL(deCentavos(Math.abs(resumo.totalDepois - resumo.totalAntes)))}
            </dd>
          )}
        </div>
      </dl>

      {bloqueio && mudouAlgo(resumo) && (
        <div className="mt-3">
          <Aviso tipo="atencao">{bloqueio}</Aviso>
        </div>
      )}
    </Janela>
  );
}

function Refazer({
  linhas,
  pagas,
  aoAplicar,
  aoFechar,
}: {
  linhas: LinhaDoPlano[];
  pagas: string[];
  aoAplicar: (linhas: LinhaDoPlano[]) => void;
  aoFechar: () => void;
}) {
  const refaziveis = linhas.filter((l) => !l.teveBaixa);
  const depoisDaUltimaPaga = pagas.length ? vencimentosMensais(pagas[pagas.length - 1], 2)[1] : hojeISO();
  const [quantidade, setQuantidade] = useState(String(Math.max(1, refaziveis.length)));
  const [primeiro, setPrimeiro] = useState(refaziveis[0]?.vencimento ?? depoisDaUltimaPaga);
  const [valor, setValor] = useState<Dinheiro | null>(deCentavos(somaDasLinhas(refaziveis)));
  const n = Math.floor(Number(quantidade));
  const valido = n >= 1 && n <= 360 && /^\d{4}-\d{2}-\d{2}$/.test(primeiro) && paraCentavos(valor) >= n;

  return (
    <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
      <div className="grid items-end gap-3 sm:grid-cols-[8rem_11rem_12rem_auto]">
        <Campo rotulo="Em quantas vezes" type="number" min={1} max={360} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
        <Campo rotulo="Primeiro vencimento" type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />
        <CampoDinheiro rotulo="Valor a parcelar" valor={valor} aoMudar={setValor} />
        <div className="flex gap-2">
          <Botao variante="primario" disabled={!valido} onClick={() => aoAplicar(refazer(linhas, n, primeiro, paraCentavos(valor)))}>
            Aplicar
          </Botao>
          <Botao variante="fantasma" onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>
      <p className={`mt-2 text-xs ${texto.suave}`}>
        Refaz as parcelas sem pagamento, uma por mês a partir do primeiro vencimento. As que tiveram pagamento ficam;
        as que sobrarem saem; as que faltarem entram como novas. O valor vem somado das parcelas refeitas. Mudá-lo muda o
        total do título.
      </p>
    </div>
  );
}

function Bloco({ titulo, tom = 'neutro', children }: { titulo: string; tom?: 'neutro' | 'critico' | 'bom'; children: ReactNode }) {
  const cor = {
    neutro: 'border-gray-200 dark:border-gray-700',
    critico: 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/40',
    bom: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/40',
  }[tom];
  return (
    <section className={`rounded-lg border p-3 ${cor}`}>
      <h3 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${texto.suave}`}>{titulo}</h3>
      <ul className={`space-y-1 ${texto.normal}`}>{children}</ul>
    </section>
  );
}
