/**
 * Uma folha: os holerites do mês, os totais e o ciclo (recalcular, fechar,
 * reabrir). Fechar gera as contas a pagar — líquidos, DCTFWeb, FGTS e
 * repasses — e depois disso nada muda sem reabrir.
 */

import { useState } from 'react';
import { ArrowLeft, Calculator, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import { deCentavos, formatarBRL, paraCentavos, somar } from '../../util/dinheiro';
import { formatarCompetencia, formatarData } from '../../util/datas';
import { VINCULOS } from '../../rotulos';
import { Aviso, Botao, Carregando, ConfirmarComMotivo, Etiqueta, Janela, Numero, cartao, tabela, texto } from '../../ui/base';
import { STATUS_FOLHA } from './Folhas';
import { HoleriteModal } from './HoleriteModal';

export function FolhaDetalhe({ folhaId, aoVoltar }: { folhaId: string; aoVoltar: () => void }) {
  const { api, pode, avisar, navegar } = useFinanceiro();
  const folha = useDados(() => api.folha(folhaId), [api, folhaId]);
  const [holerite, setHolerite] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [reabrindo, setReabrindo] = useState(false);
  const [confirmandoFechar, setConfirmandoFechar] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const f = folha.dados;
  if (!f) return <Carregando />;
  const fechada = f.status === 'fechada';
  const podeEditar = pode('pessoal', 'editar');

  const acao = async (nome: string, executar: () => Promise<unknown>, sucesso: string) => {
    setOcupado(nome);
    try {
      await executar();
      avisar(sucesso);
      await folha.recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível concluir.', 'erro');
    } finally {
      setOcupado(null);
    }
  };

  const avisos = f.holerites.filter((h) => h.avisos.length > 0);
  const titulosAtivos = f.titulos.filter((t) => !t.canceladoEm);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Botao variante="fantasma" icone={<ArrowLeft className="h-4 w-4" />} onClick={aoVoltar}>Folhas</Botao>
          <div>
            <h2 className={`text-lg ${texto.titulo}`}>
              Folha {f.tipo === 'mensal' ? 'mensal' : 'de adiantamento'} de {formatarCompetencia(f.competencia)}{' '}
              <Etiqueta tom={STATUS_FOLHA[f.status][1]}>{STATUS_FOLHA[f.status][0]}</Etiqueta>
            </h2>
            <p className={`text-xs ${texto.suave}`}>
              Pagamento em {formatarData(f.dataPagamento)}{f.fechadaPor && ` · fechada por ${f.fechadaPor}`}
            </p>
          </div>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            {!fechada && (
              <>
                {pode('pessoal', 'excluir') && (
                  <Botao variante="fantasma" icone={<Trash2 className="h-4 w-4" />} onClick={() => setExcluindo(true)}>Excluir</Botao>
                )}
                <Botao icone={<Calculator className="h-4 w-4" />} carregando={ocupado === 'recalcular'}
                  onClick={() => acao('recalcular', () => api.recalcularFolha(f.id), 'Folha recalculada.')}>
                  Recalcular
                </Botao>
                <Botao variante="primario" icone={<Lock className="h-4 w-4" />} carregando={ocupado === 'fechar'} onClick={() => setConfirmandoFechar(true)}>
                  Fechar e gerar contas a pagar
                </Botao>
              </>
            )}
            {fechada && (
              <Botao icone={<RotateCcw className="h-4 w-4" />} onClick={() => setReabrindo(true)}>Reabrir</Botao>
            )}
          </div>
        )}
      </div>

      {!fechada && (
        <div className="mb-4">
          <Aviso tipo="info">
            Clique num colaborador para lançar o variável do mês (hora extra, falta, comissão) ou registrar o valor que a
            contabilidade calculou. Salário, impostos e itens fixos são recalculados sozinhos.
          </Aviso>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Numero rotulo="Proventos" valor={formatarBRL(f.totais.totalProventos)} />
        <Numero rotulo="Líquido a pagar" valor={formatarBRL(f.totais.liquido)} />
        <Numero rotulo="INSS + IRRF retidos" valor={formatarBRL(somar(f.totais.inss, f.totais.irrf))} />
        <Numero rotulo="FGTS + encargos" valor={formatarBRL(somar(f.totais.fgts, f.totais.encargosPatronais))} />
        <Numero rotulo="Custo total da empresa" valor={formatarBRL(f.totais.custoTotal)} destaque />
      </div>

      {avisos.length > 0 && (
        <div className="mb-4 space-y-1">
          {avisos.map((h) => (
            <Aviso key={h.id} tipo="atencao">
              <strong>{h.nome}:</strong> {h.avisos.join(' ')}
            </Aviso>
          ))}
        </div>
      )}

      <div className={`${cartao} mb-4 overflow-x-auto ${folha.carregando ? 'opacity-60' : ''}`}>
        <table className={tabela.base}>
          <thead className={tabela.cabeca}>
            <tr>
              <th className={tabela.celulaCabeca}>Colaborador</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Proventos</th>
              <th className={`${tabela.celulaCabeca} text-right`}>INSS</th>
              <th className={`${tabela.celulaCabeca} text-right`}>IRRF</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Outros descontos</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Líquido</th>
              <th className={`${tabela.celulaCabeca} text-right`}>FGTS</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Custo total</th>
            </tr>
          </thead>
          <tbody>
            {f.holerites.map((h) => {
              const outros = deCentavos(paraCentavos(h.totalDescontos) - paraCentavos(h.inss) - paraCentavos(h.irrf));
              return (
                <tr key={h.id} className={tabela.linhaClicavel} onClick={() => setHolerite(h.id)}>
                  <td className={tabela.celula}>
                    <p className={texto.titulo}>{h.nome}</p>
                    <p className={`text-xs ${texto.suave}`}>
                      {VINCULOS[h.vinculo] ?? h.vinculo}
                      {h.diasTrabalhados < 30 && ` · ${h.diasTrabalhados} dias`}
                      {h.lancamentos > 0 && ` · ${h.lancamentos} lançamento(s)`}
                    </p>
                    {h.ajustado && <Etiqueta tom="atencao">Valores da contabilidade</Etiqueta>}
                  </td>
                  <td className={tabela.numero}>{formatarBRL(h.totalProventos)}</td>
                  <td className={tabela.numero}>{formatarBRL(h.inss)}</td>
                  <td className={tabela.numero}>{formatarBRL(h.irrf)}</td>
                  <td className={tabela.numero}>{formatarBRL(outros)}</td>
                  <td className={`${tabela.numero} font-medium`}>{formatarBRL(h.liquido)}</td>
                  <td className={tabela.numero}>{formatarBRL(h.fgts)}</td>
                  <td className={tabela.numero}>{formatarBRL(h.custoTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {f.titulos.length > 0 && (
        <div className={cartao}>
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-700">
            <h3 className={`text-sm font-semibold ${texto.titulo}`}>Contas a pagar geradas</h3>
            {pode('operacao', 'ver') && titulosAtivos.length > 0 && <Botao pequeno variante="fantasma" onClick={() => navegar('pagar')}>Ver em contas a pagar</Botao>}
          </div>
          <table className={tabela.base}>
            <tbody>
              {f.titulos.map((t) => (
                <tr key={t.id} className={tabela.linha}>
                  <td className={tabela.celula}>{t.canceladoEm ? <s className={texto.suave}>{t.descricao}</s> : t.descricao}</td>
                  <td className={tabela.celula}>{formatarData(t.vencimento)}</td>
                  <td className={tabela.celula}>{t.canceladoEm ? <Etiqueta>Cancelada</Etiqueta> : t.status === 'paga' ? <Etiqueta tom="bom">Paga</Etiqueta> : <Etiqueta tom="info">Em aberto</Etiqueta>}</td>
                  <td className={tabela.numero}>{formatarBRL(t.valorTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {holerite && (
        <HoleriteModal
          holeriteId={holerite}
          folhaId={f.id}
          editavel={!fechada && podeEditar}
          aoFechar={() => setHolerite(null)}
          aoMudar={() => folha.recarregar()}
        />
      )}
      {confirmandoFechar && (
        <Janela
          titulo="Fechar a folha"
          aoFechar={() => setConfirmandoFechar(false)}
          largura="max-w-lg"
          rodape={
            <>
              <Botao onClick={() => setConfirmandoFechar(false)}>Voltar</Botao>
              <Botao variante="primario" carregando={ocupado === 'fechar'}
                onClick={async () => {
                  await acao('fechar', () => api.fecharFolha(f.id), 'Folha fechada: contas a pagar geradas.');
                  setConfirmandoFechar(false);
                }}>
                Fechar folha
              </Botao>
            </>
          }
        >
          <p className={`text-sm ${texto.normal}`}>
            A folha é recalculada uma última vez e gera, em contas a pagar: o líquido de cada colaborador (vencendo em{' '}
            {formatarData(f.dataPagamento)}){f.tipo === 'mensal' && ', a guia da DCTFWeb (INSS e IRRF) e o FGTS, vencendo no dia 20 do mês seguinte'}.
            Depois disso, alterar exige reabrir — o que só é possível enquanto nenhuma dessas contas foi paga.
          </p>
        </Janela>
      )}
      {reabrindo && (
        <ConfirmarComMotivo
          titulo="Reabrir a folha"
          mensagem="As contas a pagar geradas por esta folha são canceladas (só é possível se nenhuma foi paga). Ao fechar de novo, elas são geradas outra vez."
          rotuloAcao="Reabrir"
          aoFechar={() => setReabrindo(false)}
          aoConfirmar={async (motivo) => {
            await acao('reabrir', () => api.reabrirFolha(f.id, motivo), 'Folha reaberta.');
            setReabrindo(false);
          }}
        />
      )}
      {excluindo && (
        <ConfirmarComMotivo
          titulo="Excluir a folha"
          mensagem="A folha e os lançamentos feitos nela serão removidos. Como ela não foi fechada, nenhuma conta a pagar existe ainda."
          rotuloAcao="Excluir"
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            try {
              await api.excluirFolha(f.id);
              avisar('Folha excluída.');
              aoVoltar();
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não foi possível excluir.', 'erro');
            }
          }}
        />
      )}
    </div>
  );
}
