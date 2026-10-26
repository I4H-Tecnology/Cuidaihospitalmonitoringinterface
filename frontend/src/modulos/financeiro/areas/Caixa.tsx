/**
 * Caixa e bancos: o extrato de cada conta, como o sistema o vê.
 *
 * É a tela para responder "de onde saiu esse dinheiro": cada linha mostra o
 * lançamento de origem e a contraparte, e o saldo acumulado linha a linha tem
 * de bater com o do banco (a conciliação confere isso automaticamente).
 */

import { useEffect, useState } from 'react';
import { ArrowLeftRight, Download, Plus, RotateCcw, Scale } from 'lucide-react';
import { useDados, useFinanceiro } from '../contexto';
import type { Conta, Extrato, Movimento } from '../api/tipos';
import { formatarBRL, paraCentavos, type Dinheiro } from '../util/dinheiro';
import { formatarData, hojeISO, inicioDoMes } from '../util/datas';
import { baixarCsv, montarCsv, numeroPlanilha } from '../util/csv';
import {
  AreaTexto, Aviso, Botao, CabecalhoDaArea, Campo, CampoDinheiro, Carregando, ConfirmarComMotivo, Etiqueta,
  Janela, Numero, Vazio, cartao, tabela, texto,
} from '../ui/base';
import { SeletorConta } from '../ui/seletores';
import { TIPOS_DE_CONTA } from '../rotulos';
import { NovaConta } from './cadastros/Contas';

const TIPO_MOVIMENTO: Record<Movimento['tipo'], string> = {
  saldo_inicial: 'Saldo inicial', baixa: 'Pagamento', estorno: 'Estorno', transferencia: 'Transferência', ajuste: 'Ajuste',
};

export function Caixa() {
  const { api, pode, avisar } = useFinanceiro();
  const contas = useDados(() => api.contas(), [api]);
  const [contaId, setContaId] = useState('');
  const [de, setDe] = useState(inicioDoMes(hojeISO()));
  const [ate, setAte] = useState(hojeISO());
  const [transferindo, setTransferindo] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [estornando, setEstornando] = useState<string | null>(null);

  const ativas = (contas.dados ?? []).filter((c) => c.ativa);
  useEffect(() => {
    if (!contaId && ativas.length) setContaId(ativas[0].id);
  }, [ativas, contaId]);

  const extrato = useDados<Extrato | null>(
    () => (contaId ? api.extrato(contaId, de, ate) : Promise.resolve(null)),
    [api, contaId, de, ate],
  );

  const recarregar = () => {
    contas.recarregar();
    extrato.recarregar();
  };

  const exportar = () => {
    if (!extrato.dados) return;
    baixarCsv(
      `extrato-${extrato.dados.conta.nome}-${de}-a-${ate}`,
      montarCsv(extrato.dados.movimentos, [
        { titulo: 'Data', valor: (m) => formatarData(m.data) },
        { titulo: 'Descrição', valor: (m) => m.descricao },
        { titulo: 'Tipo', valor: (m) => TIPO_MOVIMENTO[m.tipo] },
        { titulo: 'Valor', valor: (m) => numeroPlanilha(m.valor) },
        { titulo: 'Saldo', valor: (m) => numeroPlanilha(m.saldo) },
        { titulo: 'Conciliado', valor: (m) => (m.conciliado ? 'sim' : 'não') },
      ]),
    );
  };

  return (
    <div>
      <CabecalhoDaArea
        titulo="Caixa e bancos"
        descricao="Saldo e extrato de cada conta. Transferência entre contas da empresa não é receita nem despesa — por isso não aparece nas entradas e saídas."
        acoes={
          <>
            {pode('cadastros', 'criar') && <Botao icone={<Plus className="h-4 w-4" />} onClick={() => setCriando(true)}>Nova conta</Botao>}
            {pode('operacao', 'criar') && (
              <Botao variante="primario" icone={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setTransferindo(true)} disabled={ativas.length < 2}
                title={ativas.length < 2 ? 'É preciso ter duas contas ativas' : undefined}>
                Transferir entre contas
              </Botao>
            )}
          </>
        }
      />

      {!contas.dados ? (
        <Carregando />
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ativas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setContaId(c.id)}
              aria-pressed={c.id === contaId}
              className={`${cartao} p-4 text-left transition-shadow hover:shadow-md ${c.id === contaId ? 'ring-2 ring-[var(--fin-primaria,#0A7EA4)]' : ''}`}
            >
              <p className={`text-xs ${texto.suave}`}>{TIPOS_DE_CONTA[c.tipo]}{c.banco ? ` · ${c.banco}` : ''}</p>
              <p className={`text-sm font-medium ${texto.titulo}`}>{c.nome}</p>
              <p className={`mt-2 text-xl font-semibold tabular-nums ${paraCentavos(c.saldo) < 0 ? 'text-red-600 dark:text-red-400' : texto.titulo}`}>
                {formatarBRL(c.saldo)}
              </p>
            </button>
          ))}
        </div>
      )}

      {extrato.dados && (
        <>
          <div className={`${cartao} mb-4 flex flex-wrap items-end gap-3 p-4`}>
            <Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            <div className="ml-auto flex gap-2">
              {pode('operacao', 'editar') && (
                <Botao icone={<Scale className="h-4 w-4" />} onClick={() => setAjustando(true)}>Ajustar saldo</Botao>
              )}
              <Botao icone={<Download className="h-4 w-4" />} onClick={exportar}>Planilha</Botao>
            </div>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-4">
            <Numero rotulo="Saldo anterior" valor={formatarBRL(extrato.dados.saldoAnterior)} />
            <Numero rotulo="Entradas" valor={formatarBRL(extrato.dados.entradas)} />
            <Numero rotulo="Saídas" valor={formatarBRL(extrato.dados.saidas)} />
            <Numero rotulo="Saldo no fim do período" valor={formatarBRL(extrato.dados.saldoFinal)} />
          </div>

          <div className={`${cartao} overflow-x-auto ${extrato.carregando ? 'opacity-60' : ''}`}>
            {extrato.dados.movimentos.length === 0 ? (
              <Vazio titulo="Nenhum movimento no período." />
            ) : (
              <table className={tabela.base}>
                <thead className={tabela.cabeca}>
                  <tr>
                    <th className={tabela.celulaCabeca}>Data</th>
                    <th className={tabela.celulaCabeca}>Descrição</th>
                    <th className={tabela.celulaCabeca}>Tipo</th>
                    <th className={`${tabela.celulaCabeca} text-right`}>Valor</th>
                    <th className={`${tabela.celulaCabeca} text-right`}>Saldo</th>
                    <th className={tabela.celulaCabeca} />
                  </tr>
                </thead>
                <tbody>
                  {extrato.dados.movimentos.map((m) => (
                    <tr key={m.id} className={tabela.linha}>
                      <td className={`${tabela.celula} whitespace-nowrap`}>{formatarData(m.data)}</td>
                      <td className={tabela.celula}>
                        <p className={texto.titulo}>{m.descricao}</p>
                        {m.contaContrapartida && <p className={`text-xs ${texto.suave}`}>↔ {m.contaContrapartida}</p>}
                      </td>
                      <td className={tabela.celula}>
                        <span className="inline-flex flex-wrap gap-1">
                          <Etiqueta>{TIPO_MOVIMENTO[m.tipo]}</Etiqueta>
                          {m.conciliado && <Etiqueta tom="bom">Conciliado</Etiqueta>}
                        </span>
                      </td>
                      <td className={`${tabela.numero} ${paraCentavos(m.valor) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatarBRL(m.valor)}</td>
                      <td className={tabela.numero}>{formatarBRL(m.saldo)}</td>
                      <td className={`${tabela.celula} text-right`}>
                        {m.tipo === 'transferencia' && m.transferenciaId && pode('operacao', 'excluir') && (
                          <Botao pequeno variante="fantasma" icone={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setEstornando(m.transferenciaId)}>
                            Estornar
                          </Botao>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
      {contas.dados && ativas.length === 0 && (
        <Aviso tipo="info">Cadastre a primeira conta (banco ou caixa) para começar a controlar saldos.</Aviso>
      )}

      {transferindo && (
        <Transferencia contas={ativas} aoFechar={() => setTransferindo(false)} aoConcluir={() => { setTransferindo(false); recarregar(); }} />
      )}
      {ajustando && extrato.dados && (
        <AjusteSaldo
          conta={ativas.find((c) => c.id === contaId)!}
          aoFechar={() => setAjustando(false)}
          aoConcluir={() => { setAjustando(false); recarregar(); }}
        />
      )}
      {criando && <NovaConta aoFechar={() => setCriando(false)} aoSalvar={() => { setCriando(false); recarregar(); }} />}
      {estornando && (
        <ConfirmarComMotivo
          titulo="Estornar transferência"
          mensagem="Uma transferência de volta é lançada hoje; a original fica no histórico."
          rotuloAcao="Estornar"
          aoFechar={() => setEstornando(null)}
          aoConfirmar={async (motivo) => {
            try {
              await api.estornarTransferencia(estornando, motivo);
              avisar('Transferência estornada.');
              setEstornando(null);
              recarregar();
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não foi possível estornar.', 'erro');
            }
          }}
        />
      )}
    </div>
  );
}

function Transferencia({ contas, aoFechar, aoConcluir }: { contas: Conta[]; aoFechar: () => void; aoConcluir: () => void }) {
  const { api, avisar } = useFinanceiro();
  const [origem, setOrigem] = useState(contas[0]?.id ?? '');
  const [destino, setDestino] = useState(contas[1]?.id ?? '');
  const [valor, setValor] = useState<Dinheiro | null>(null);
  const [data, setData] = useState(hojeISO());
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo="Transferir entre contas"
      subtitulo="Aplicar e resgatar investimento também é transferência."
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={!origem || !destino || origem === destino || !valor || paraCentavos(valor) <= 0}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.transferir({ contaOrigemId: origem, contaDestinoId: destino, valor, data, descricao: descricao || null });
                avisar('Transferência registrada.');
                aoConcluir();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível transferir.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            Transferir
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SeletorConta contas={contas} valor={origem} aoMudar={setOrigem} rotulo="Sai de" />
        <SeletorConta contas={contas} valor={destino} aoMudar={setDestino} rotulo="Entra em" />
        <CampoDinheiro rotulo="Valor" valor={valor} aoMudar={setValor} />
        <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <Campo rotulo="Descrição" dica="opcional" className="sm:col-span-2" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>
    </Janela>
  );
}

function AjusteSaldo({ conta, aoFechar, aoConcluir }: { conta: Conta; aoFechar: () => void; aoConcluir: () => void }) {
  const { api, avisar } = useFinanceiro();
  const [saldo, setSaldo] = useState<Dinheiro | null>(conta.saldo);
  const [data, setData] = useState(hojeISO());
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo={`Ajustar saldo — ${conta.nome}`}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={saldo === null || motivo.trim().length < 3}
            onClick={async () => {
              setSalvando(true);
              try {
                const r = await api.ajustarSaldo(conta.id, { saldoInformado: saldo, data, motivo });
                avisar(`Saldo ajustado (diferença de ${formatarBRL(r.diferenca)}).`);
                aoConcluir();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível ajustar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            Ajustar
          </Botao>
        </>
      }
    >
      <Aviso tipo="atencao">
        Ajuste não tem categoria e não entra no resultado. Tarifa, juros ou rendimento que o banco lançou devem virar
        lançamento (a conciliação faz isso a partir do extrato). Use o ajuste só para o que não tem explicação melhor.
      </Aviso>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CampoDinheiro rotulo="Saldo correto" valor={saldo} aoMudar={setSaldo} permitirNegativo />
        <Campo rotulo="Na data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <AreaTexto rotulo="Motivo" className="sm:col-span-2" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </Janela>
  );
}

