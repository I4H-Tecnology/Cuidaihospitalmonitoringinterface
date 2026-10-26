/**
 * Custo de pessoal: quanto cada pessoa custa de verdade para a empresa — o
 * salário mais FGTS, encargos, benefícios e a provisão de férias e 13º, que
 * é o dinheiro que precisa estar separado quando novembro e dezembro chegam.
 */

import { useState } from 'react';
import { useDados, useFinanceiro } from '../../contexto';
import { formatarBRL, paraCentavos } from '../../util/dinheiro';
import { competenciaDe, formatarCompetencia, hojeISO } from '../../util/datas';
import { VINCULOS } from '../../rotulos';
import { Aviso, Campo, Carregando, Etiqueta, Numero, Secao, Vazio, cartao, tabela, texto } from '../../ui/base';
import { CartaoGrafico, GraficoBarrasHorizontais } from '../../ui/graficos';

const FONTE: Record<string, [string, 'bom' | 'info' | 'neutro']> = {
  folha: ['da folha', 'bom'],
  estimativa: ['estimado', 'info'],
  contrato: ['contrato', 'neutro'],
};

export function Custos() {
  const { api } = useFinanceiro();
  const [competencia, setCompetencia] = useState(competenciaDe(hojeISO()));
  const custos = useDados(() => api.custosPessoal(competencia), [api, competencia]);
  const c = custos.dados;
  return (
    <div className="space-y-4">
      <div className={`${cartao} flex flex-wrap items-end gap-4 p-4`}>
        <Campo rotulo="Competência" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        {c && (
          <p className={`text-xs ${texto.suave}`}>
            {c.folhaStatus
              ? `Valores da folha de ${formatarCompetencia(c.competencia)} (${c.folhaStatus}).`
              : 'Ainda não há folha deste mês: os valores são estimados pelo salário e pelos itens fixos.'}
          </p>
        )}
      </div>
      {!c ? <Carregando /> : c.colaboradores.length === 0 ? (
        <div className={cartao}><Vazio titulo="Ninguém com vínculo nesta competência." /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Numero rotulo="Pessoas" valor={String(c.totais.pessoas)} />
            <Numero rotulo="Custo do mês" valor={formatarBRL(c.totais.custoMes)} />
            <Numero rotulo="Provisão férias + 13º" valor={formatarBRL(c.totais.provisao)} detalhe="Separar por mês" />
            <Numero rotulo="Custo com provisão" valor={formatarBRL(c.totais.custoComProvisao)} destaque />
          </div>
          {paraCentavos(c.totais.provisao) > 0 && (
            <Aviso tipo="info">
              A provisão não é conta a pagar: é quanto precisaria estar guardado todo mês para o 13º (novembro e dezembro)
              e as férias não apertarem o caixa. A projeção de caixa já considera o 13º.
            </Aviso>
          )}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <Secao titulo="Por colaborador" semPadding>
                <div className="overflow-x-auto">
                  <table className={tabela.base}>
                    <thead className={tabela.cabeca}>
                      <tr>
                        <th className={tabela.celulaCabeca}>Colaborador</th>
                        <th className={`${tabela.celulaCabeca} text-right`}>Proventos</th>
                        <th className={`${tabela.celulaCabeca} text-right`}>FGTS + encargos</th>
                        <th className={`${tabela.celulaCabeca} text-right`}>Custo do mês</th>
                        <th className={`${tabela.celulaCabeca} text-right`}>Provisão</th>
                        <th className={`${tabela.celulaCabeca} text-right`}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.colaboradores.map((p) => (
                        <tr key={p.colaboradorId} className={tabela.linha}>
                          <td className={tabela.celula}>
                            <p className={texto.titulo}>{p.nome}</p>
                            <p className={`text-xs ${texto.suave}`}>
                              {VINCULOS[p.vinculo]}{p.centroCustoNome ? ` · ${p.centroCustoNome}` : ''} · <Etiqueta tom={FONTE[p.fonte][1]}>{FONTE[p.fonte][0]}</Etiqueta>
                            </p>
                          </td>
                          <td className={tabela.numero}>{formatarBRL(p.proventos)}</td>
                          <td className={tabela.numero}>{formatarBRL(p.encargos)}</td>
                          <td className={tabela.numero}>{formatarBRL(p.custoMes)}</td>
                          <td className={tabela.numero}>{formatarBRL(p.provisao)}</td>
                          <td className={`${tabela.numero} font-medium`}>{formatarBRL(p.custoComProvisao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Secao>
            </div>
            <CartaoGrafico
              titulo="Custo do mês por centro de custo"
              grafico={
                <GraficoBarrasHorizontais
                  rotulo="Custo do mês por centro de custo"
                  itens={c.porCentro.map((g) => ({ rotulo: g.centroCusto, valor: paraCentavos(g.custoMes) / 100 }))}
                />
              }
              tabela={
                <table className={tabela.base}>
                  <thead className={tabela.cabeca}>
                    <tr>
                      <th className={tabela.celulaCabeca}>Centro</th>
                      <th className={`${tabela.celulaCabeca} text-right`}>Pessoas</th>
                      <th className={`${tabela.celulaCabeca} text-right`}>Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.porCentro.map((g) => (
                      <tr key={g.centroCusto} className={tabela.linha}>
                        <td className={tabela.celula}>{g.centroCusto}</td>
                        <td className={tabela.numero}>{g.pessoas}</td>
                        <td className={tabela.numero}>{formatarBRL(g.custoMes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
