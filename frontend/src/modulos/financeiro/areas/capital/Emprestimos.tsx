/**
 * Empréstimos e financiamentos: simule antes de gravar. Cada parcela vira
 * conta a pagar com juros (despesa, entra na DRE) e amortização (devolução do
 * principal, não entra) separados.
 */

import { useState } from 'react';
import { Calculator, Plus } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Emprestimo, SimulacaoEmprestimo } from '../../api/tipos';
import { formatarBRL, type Dinheiro } from '../../util/dinheiro';
import { formatarData, hojeISO, somarDias } from '../../util/datas';
import {
  Aviso, Botao, Campo, CampoDinheiro, Carregando, ConfirmarComMotivo, EtiquetaParcela, Janela, Numero, Seletor, Vazio,
  cartao, tabela, texto,
} from '../../ui/base';
import { SeletorCentro, SeletorConta, SeletorPessoa, useCadastrosBasicos, type PessoaEscolhida } from '../../ui/seletores';

export function Emprestimos() {
  const { api, pode } = useFinanceiro();
  const lista = useDados(() => api.emprestimos(), [api]);
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const d = lista.dados;
  if (!d) return <Carregando />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo="Contratos ativos" valor={String(d.totais.contratos)} />
        <Numero rotulo="Principal contratado" valor={formatarBRL(d.totais.principal)} />
        <Numero rotulo="Saldo devedor" valor={formatarBRL(d.totais.saldoDevedor)} tom={d.totais.contratos ? 'atencao' : 'neutro'} destaque />
      </div>
      <div className={cartao}>
        <div className="flex items-center justify-end border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          {pode('capital', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setNovo(true)}>Novo empréstimo</Botao>}
        </div>
        {d.itens.length === 0 ? <Vazio titulo="Nenhum empréstimo.">Registre financiamentos e capital de giro para acompanhar o saldo devedor e ver os juros na DRE.</Vazio> : (
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Contrato</th>
                <th className={tabela.celulaCabeca}>Condições</th>
                <th className={tabela.celulaCabeca}>Parcelas</th>
                <th className={tabela.celulaCabeca}>Próximo vencimento</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Saldo devedor</th>
              </tr>
            </thead>
            <tbody>
              {d.itens.map((e) => (
                <tr key={e.id} className={tabela.linhaClicavel} onClick={() => setAberto(e.id)}>
                  <td className={tabela.celula}>
                    <p className={e.canceladoEm ? 'text-gray-400 line-through' : texto.titulo}>{e.descricao}</p>
                    <p className={`text-xs ${texto.suave}`}>{e.credorNome} · {formatarData(e.dataContratacao)}</p>
                  </td>
                  <td className={tabela.celula}>{formatarBRL(e.valorPrincipal)} · {e.taxaMensal.replace(/\.?0+$/, '').replace('.', ',')}% a.m. · {e.sistema.toUpperCase()}</td>
                  <td className={tabela.celula}>{e.parcelasPagas}/{e.parcelas} pagas</td>
                  <td className={tabela.celula}>{e.proximoVencimento ? formatarData(e.proximoVencimento) : '—'}</td>
                  <td className={tabela.numero}>{formatarBRL(e.saldoDevedor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {novo && <NovoEmprestimo aoFechar={() => setNovo(false)} aoSalvar={() => { setNovo(false); lista.recarregar(); }} />}
      {aberto && <DetalheEmprestimo id={aberto} aoFechar={() => setAberto(null)} aoMudar={() => lista.recarregar()} />}
    </div>
  );
}

function NovoEmprestimo({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const [credor, setCredor] = useState<PessoaEscolhida>(null);
  const [contaId, setContaId] = useState('');
  const [centroId, setCentroId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [sistema, setSistema] = useState<'price' | 'sac'>('price');
  const [principal, setPrincipal] = useState<Dinheiro | null>(null);
  const [taxa, setTaxa] = useState('');
  const [prazo, setPrazo] = useState('12');
  const [carencia, setCarencia] = useState('0');
  const [jurosCarencia, setJurosCarencia] = useState('pagos');
  const [contratacao, setContratacao] = useState(hojeISO());
  const [primeiro, setPrimeiro] = useState(somarDias(hojeISO(), 30));
  const [custos, setCustos] = useState<Dinheiro | null>(null);
  const [simulacao, setSimulacao] = useState<SimulacaoEmprestimo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const dados = () => ({
    pessoaId: credor?.id, contaId, centroCustoId: centroId || null, descricao: descricao || null, sistema,
    valorPrincipal: principal, taxaMensal: taxa.replace(',', '.') || '0', prazo: Number(prazo), carencia: Number(carencia) || 0,
    jurosNaCarencia: jurosCarencia, dataContratacao: contratacao, primeiroVencimento: primeiro, custosIniciais: custos,
  });
  const podeSimular = principal && prazo && primeiro;

  return (
    <Janela
      titulo="Novo empréstimo ou financiamento"
      aoFechar={aoFechar}
      largura="max-w-4xl"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao icone={<Calculator className="h-4 w-4" />} disabled={!podeSimular}
            onClick={async () => {
              try {
                setSimulacao(await api.simularEmprestimo(dados()));
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível simular.', 'erro');
              }
            }}>
            Simular
          </Botao>
          <Botao variante="primario" carregando={ocupado} disabled={!podeSimular || !credor || !contaId}
            title={!credor || !contaId ? 'Escolha o credor e a conta onde o dinheiro entrou' : undefined}
            onClick={async () => {
              setOcupado(true);
              try {
                await api.criarEmprestimo(dados());
                avisar('Empréstimo registrado: entrada no caixa e parcelas em contas a pagar.');
                aoSalvar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível registrar.', 'erro');
              } finally {
                setOcupado(false);
              }
            }}>
            Registrar empréstimo
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><SeletorPessoa valor={credor} aoMudar={setCredor} rotulo="Credor (banco, financeira)" papel="fornecedor" /></div>
        <SeletorConta contas={cadastros.contas} valor={contaId} aoMudar={setContaId} rotulo="Dinheiro entrou na conta" />
        <Campo rotulo="Descrição" dica="opcional" className="sm:col-span-2" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Capital de giro — Banco X" />
        <SeletorCentro centros={cadastros.centros} valor={centroId} aoMudar={setCentroId} />
        <CampoDinheiro rotulo="Valor emprestado" valor={principal} aoMudar={setPrincipal} />
        <Campo rotulo="Taxa (% ao mês)" value={taxa} onChange={(e) => setTaxa(e.target.value)} placeholder="1,49" />
        <Seletor rotulo="Sistema" value={sistema} onChange={(e) => setSistema(e.target.value as 'price' | 'sac')}
          opcoes={[{ valor: 'price', rotulo: 'Price (parcela fixa)' }, { valor: 'sac', rotulo: 'SAC (amortização fixa)' }]} />
        <Campo rotulo="Parcelas" type="number" min={1} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        <Campo rotulo="Carência (meses)" type="number" min={0} value={carencia} onChange={(e) => setCarencia(e.target.value)} />
        <Seletor rotulo="Juros na carência" value={jurosCarencia} onChange={(e) => setJurosCarencia(e.target.value)} disabled={carencia === '0'}
          opcoes={[{ valor: 'pagos', rotulo: 'Pagos mês a mês' }, { valor: 'capitalizados', rotulo: 'Somados ao saldo' }]} />
        <Campo rotulo="Contratação" type="date" value={contratacao} onChange={(e) => setContratacao(e.target.value)} />
        <Campo rotulo="Primeiro vencimento" type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />
        <CampoDinheiro rotulo="IOF e tarifas" dica="descontados na liberação" valor={custos} aoMudar={setCustos} />
      </div>
      {simulacao && (
        <div className="mt-5">
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Numero rotulo="Total pago" valor={formatarBRL(simulacao.totalPago)} />
            <Numero rotulo="Juros no total" valor={formatarBRL(simulacao.juros)} tom="atencao" />
            <Numero rotulo="Primeira parcela" valor={formatarBRL(simulacao.parcelas.find((p) => !p.carencia)?.valor ?? '0')} />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className={tabela.base}>
              <thead className={`${tabela.cabeca} sticky top-0`}>
                <tr>
                  <th className={tabela.celulaCabeca}>#</th>
                  <th className={tabela.celulaCabeca}>Vencimento</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Juros</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Amortização</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Parcela</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Saldo após</th>
                </tr>
              </thead>
              <tbody>
                {simulacao.parcelas.map((p) => (
                  <tr key={p.numero} className={tabela.linha}>
                    <td className={tabela.celula}>{p.numero}{p.carencia && <span className={`text-xs ${texto.suave}`}> carência</span>}</td>
                    <td className={tabela.celula}>{formatarData(p.vencimento)}</td>
                    <td className={tabela.numero}>{formatarBRL(p.juros)}</td>
                    <td className={tabela.numero}>{formatarBRL(p.amortizacao)}</td>
                    <td className={tabela.numero}>{formatarBRL(p.valor)}</td>
                    <td className={tabela.numero}>{formatarBRL(p.saldoFinal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Janela>
  );
}

function DetalheEmprestimo({ id, aoFechar, aoMudar }: { id: string; aoFechar: () => void; aoMudar: () => void }) {
  const { api, pode, avisar } = useFinanceiro();
  const emp = useDados(() => api.emprestimo(id), [api, id]);
  const [cancelando, setCancelando] = useState(false);
  const e: Emprestimo | null = emp.dados;
  return (
    <>
      <Janela
        titulo={e?.descricao ?? 'Empréstimo'}
        subtitulo={e ? `${e.credorNome} · ${formatarBRL(e.valorPrincipal)} a ${e.taxaMensal.replace(/\.?0+$/, '').replace('.', ',')}% a.m. · juros totais ${formatarBRL(e.jurosTotais ?? '0')}` : undefined}
        aoFechar={aoFechar}
        largura="max-w-3xl"
        rodape={
          <>
            {e && !e.canceladoEm && pode('capital', 'excluir') && (
              <Botao variante="fantasma" disabled={e.parcelasPagas > 0} title={e.parcelasPagas > 0 ? 'Já há parcela paga' : undefined} onClick={() => setCancelando(true)}>
                Cancelar contrato
              </Botao>
            )}
            <Botao variante="primario" onClick={aoFechar}>Fechar</Botao>
          </>
        }
      >
        {!e ? <Carregando /> : (
          <>
            {e.canceladoEm && <div className="mb-3"><Aviso tipo="atencao">Contrato cancelado.</Aviso></div>}
            <p className={`mb-3 text-sm ${texto.normal}`}>Saldo devedor: <strong>{formatarBRL(e.saldoDevedor)}</strong>. As parcelas se pagam em Contas a pagar.</p>
            <table className={tabela.base}>
              <thead className={tabela.cabeca}>
                <tr>
                  <th className={tabela.celulaCabeca}>Vencimento</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Juros</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Amortização</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Parcela</th>
                  <th className={tabela.celulaCabeca}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {(e.cronograma ?? []).map((p) => (
                  <tr key={p.parcelaId} className={tabela.linha}>
                    <td className={tabela.celula}>{formatarData(p.vencimento)}</td>
                    <td className={tabela.numero}>{formatarBRL(p.juros)}</td>
                    <td className={tabela.numero}>{formatarBRL(p.amortizacao)}</td>
                    <td className={tabela.numero}>{formatarBRL(p.valor)}</td>
                    <td className={tabela.celula}><EtiquetaParcela status={p.status} vencida={p.vencida} tipo="pagar" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Janela>
      {cancelando && e && (
        <ConfirmarComMotivo
          titulo="Cancelar contrato"
          mensagem="A entrada do dinheiro é estornada e as parcelas são canceladas. Use só para contrato lançado por engano."
          rotuloAcao="Cancelar contrato"
          aoFechar={() => setCancelando(false)}
          aoConfirmar={async (motivo) => {
            try {
              emp.setDados(await api.cancelarEmprestimo(e.id, motivo));
              avisar('Contrato cancelado.');
              setCancelando(false);
              aoMudar();
            } catch (erro) {
              avisar(erro instanceof Error ? erro.message : 'Não foi possível cancelar.', 'erro');
            }
          }}
        />
      )}
    </>
  );
}
