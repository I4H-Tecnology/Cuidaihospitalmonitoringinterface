/**
 * Visão geral: responde, nesta ordem, "quanto dinheiro tenho", "o que vence",
 * "estou tendo lucro", "para onde o caixa vai" e "o que precisa de atenção".
 */

import { ArrowDownLeft, ArrowUpRight, ChevronRight, Info } from 'lucide-react';
import { useDados, useFinanceiro } from '../contexto';
import type { AreaFinanceira } from '../navegacao';
import { formatarBRL, paraCentavos } from '../util/dinheiro';
import { formatarCompetencia, formatarData } from '../util/datas';
import { Aviso, CabecalhoDaArea, Carregando, Etiqueta, Numero, Secao, tabela, texto } from '../ui/base';
import { COR, CartaoGrafico, GraficoColunas, emReais } from '../ui/graficos';
import { TIPOS_DE_CONTA } from '../rotulos';

export function VisaoGeral() {
  const { api, navegar, pode } = useFinanceiro();
  const { dados: painel, carregando, erro } = useDados(() => api.painel(), [api]);

  if (!painel) {
    return (
      <>
        <CabecalhoDaArea titulo="Visão geral" />
        {erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando texto="Montando a visão geral…" />}
      </>
    );
  }

  const ind = painel.indicadores;
  const resultado = paraCentavos(painel.resultadoMes.resultado);
  const grafico = emReais(painel.grafico, ['entradas', 'saidas']);
  const temProjecao = painel.grafico.some((g) => g.tipo === 'projetado');

  return (
    <div className={carregando ? 'opacity-60 transition-opacity' : ''}>
      <CabecalhoDaArea
        titulo="Visão geral"
        descricao={`Situação em ${formatarData(painel.hoje)}.${painel.fechadoAte ? ` Período fechado até ${formatarData(painel.fechadoAte)}.` : ''}`}
      />

      {painel.alertas.length > 0 && (
        <div className="mb-6 space-y-2">
          {painel.alertas.map((alerta, i) => (
            <Aviso
              key={i}
              tipo={alerta.nivel === 'critico' ? 'erro' : alerta.nivel === 'atencao' ? 'atencao' : 'info'}
              acao={
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center text-xs font-medium underline-offset-2 hover:underline"
                  onClick={() => navegar(alerta.area as AreaFinanceira)}
                >
                  Ver <ChevronRight className="h-3.5 w-3.5" />
                </button>
              }
            >
              {alerta.mensagem}
            </Aviso>
          ))}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Numero rotulo="Saldo em contas" valor={formatarBRL(painel.saldoTotal)} destaque detalhe={`${painel.contas.length} conta(s) ativa(s)`} aoClicar={() => navegar('caixa')} />
        <Numero
          rotulo="A receber em 30 dias"
          valor={formatarBRL(painel.receber.proximos30)}
          tom={paraCentavos(painel.receber.vencido) > 0 ? 'atencao' : 'neutro'}
          detalhe={paraCentavos(painel.receber.vencido) > 0 ? `${formatarBRL(painel.receber.vencido)} em atraso` : 'Nada em atraso'}
          aoClicar={pode('operacao', 'ver') ? () => navegar('receber') : undefined}
        />
        <Numero
          rotulo="A pagar em 30 dias"
          valor={formatarBRL(painel.pagar.proximos30)}
          tom={paraCentavos(painel.pagar.vencido) > 0 ? 'critico' : 'neutro'}
          detalhe={paraCentavos(painel.pagar.vencido) > 0 ? `${formatarBRL(painel.pagar.vencido)} vencido` : 'Nada vencido'}
          aoClicar={pode('operacao', 'ver') ? () => navegar('pagar') : undefined}
        />
        <Numero
          rotulo={`Resultado de ${formatarCompetencia(painel.resultadoMes.mes)}`}
          valor={formatarBRL(painel.resultadoMes.resultado)}
          tom={resultado < 0 ? 'critico' : resultado > 0 ? 'bom' : 'neutro'}
          detalhe={`Receitas ${formatarBRL(painel.resultadoMes.receitas)} · despesas ${formatarBRL(painel.resultadoMes.despesas)}`}
          aoClicar={() => navegar('relatorios')}
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CartaoGrafico
            titulo="Entradas e saídas por mês"
            subtitulo={temProjecao ? 'Meses passados: realizado. Meses à frente (mais claros): o que já está lançado e o previsível.' : 'Realizado nos últimos meses.'}
            grafico={
              <GraficoColunas
                dados={grafico}
                x="mes"
                rotuloX={formatarCompetencia}
                series={[
                  { chave: 'entradas', rotulo: 'Entradas', cor: COR.serie1 },
                  { chave: 'saidas', rotulo: 'Saídas', cor: COR.serie2 },
                ]}
                esmaecer={(l) => l.tipo === 'projetado'}
                legendaExtra={temProjecao ? <span className={texto.suave}>· mais claro = projetado</span> : undefined}
              />
            }
            tabela={
              <table className={tabela.base}>
                <thead className={tabela.cabeca}>
                  <tr>
                    <th className={tabela.celulaCabeca}>Mês</th>
                    <th className={`${tabela.celulaCabeca} text-right`}>Entradas</th>
                    <th className={`${tabela.celulaCabeca} text-right`}>Saídas</th>
                    <th className={tabela.celulaCabeca}>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.grafico.map((g) => (
                    <tr key={g.mes} className={tabela.linha}>
                      <td className={tabela.celula}>{formatarCompetencia(g.mes)}</td>
                      <td className={tabela.numero}>{formatarBRL(g.entradas)}</td>
                      <td className={tabela.numero}>{formatarBRL(g.saidas)}</td>
                      <td className={tabela.celula}>{g.tipo === 'projetado' ? 'Projetado' : 'Realizado'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </div>

        <Secao titulo="Contas" subtitulo="Saldo de hoje" semPadding>
          {painel.contas.length === 0 ? (
            <p className={`p-5 text-sm ${texto.suave}`}>Nenhuma conta ativa.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {painel.contas.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className={`text-sm ${texto.titulo}`}>{c.nome}</p>
                    <p className={`text-xs ${texto.suave}`}>{TIPOS_DE_CONTA[c.tipo] ?? c.tipo}</p>
                  </div>
                  <span className={`text-sm tabular-nums ${paraCentavos(c.saldo) < 0 ? 'text-red-600 dark:text-red-400' : texto.titulo}`}>
                    {formatarBRL(c.saldo)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Secao
          className="xl:col-span-2"
          titulo="Vencimentos dos próximos 15 dias"
          subtitulo="Inclui o que já venceu e não foi pago"
          semPadding
        >
          {painel.proximosVencimentos.length === 0 ? (
            <p className={`p-5 text-sm ${texto.suave}`}>Nada vencendo nos próximos 15 dias.</p>
          ) : (
            <table className={tabela.base}>
              <tbody>
                {painel.proximosVencimentos.map((v) => (
                  <tr key={v.id} className={tabela.linhaClicavel} onClick={() => navegar(v.tipo === 'pagar' ? 'pagar' : 'receber')}>
                    <td className={tabela.celula}>
                      <span className="inline-flex items-center gap-1.5">
                        {v.tipo === 'pagar' ? <ArrowUpRight className="h-4 w-4 text-gray-400" /> : <ArrowDownLeft className="h-4 w-4 text-gray-400" />}
                        {v.tipo === 'pagar' ? 'Pagar' : 'Receber'}
                      </span>
                    </td>
                    <td className={tabela.celula}>
                      <p className={texto.titulo}>{v.descricao}</p>
                      {v.pessoaNome && <p className={`text-xs ${texto.suave}`}>{v.pessoaNome}</p>}
                    </td>
                    <td className={tabela.celula}>
                      {v.vencida ? <Etiqueta tom="critico">Venceu {formatarData(v.vencimento)}</Etiqueta> : formatarData(v.vencimento)}
                    </td>
                    <td className={tabela.numero}>{formatarBRL(v.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>

        <Secao titulo="Indicadores" subtitulo="Passe o mouse no ícone para ver o que cada um responde">
          <dl className="space-y-3 text-sm">
            <Indicador
              rotulo="Capital de giro (90 dias)"
              valor={formatarBRL(ind.capitalDeGiro)}
              ruim={paraCentavos(ind.capitalDeGiro) < 0}
              explicacao="Saldo em contas + o que vai entrar em 90 dias − o que vence em 90 dias. Negativo: as contas assumidas não cabem no que existe e no que vai entrar."
            />
            <Indicador
              rotulo="Fôlego de caixa"
              valor={ind.folegoMeses !== null ? `${ind.folegoMeses.replace('.', ',')} mês(es)` : 'Sem saídas recentes'}
              ruim={ind.folegoMeses !== null && Number(ind.folegoMeses) < 1}
              explicacao="Quantos meses o saldo atual paga, sem nenhuma entrada, na média de saídas dos últimos 3 meses."
            />
            <Indicador
              rotulo="Inadimplência"
              valor={ind.inadimplenciaPercentual !== null ? `${ind.inadimplenciaPercentual.replace('.', ',')}%` : '—'}
              ruim={ind.inadimplenciaPercentual !== null && Number(ind.inadimplenciaPercentual) > 5}
              explicacao="Do que há a receber, quanto já está vencido."
            />
            <Indicador
              rotulo="Prazo médio de recebimento / pagamento"
              valor={`${ind.prazoMedioRecebimento ?? '—'} / ${ind.prazoMedioPagamento ?? '—'} dias`}
              explicacao="Dias, em média, entre lançar e liquidar (últimos 90 dias). Receber depois de pagar é financiar o cliente com o próprio caixa."
            />
            <Indicador
              rotulo="Ponto de equilíbrio mensal"
              valor={ind.pontoDeEquilibrioMensal ? formatarBRL(ind.pontoDeEquilibrioMensal) : '—'}
              explicacao={`Receita mínima por mês para não ter prejuízo, pelos custos fixos e variáveis dos últimos 3 meses. Receita média no período: ${formatarBRL(ind.receitaMediaMensal)}.`}
            />
          </dl>
        </Secao>
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, explicacao, ruim }: { rotulo: string; valor: string; explicacao: string; ruim?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className={`inline-flex items-center gap-1 ${texto.normal}`}>
        {rotulo}
        <span title={explicacao} aria-label={explicacao}>
          <Info className="h-3.5 w-3.5 text-gray-400" />
        </span>
      </dt>
      <dd className={`text-right tabular-nums ${ruim ? 'text-red-600 dark:text-red-400' : texto.titulo}`}>{valor}</dd>
    </div>
  );
}
