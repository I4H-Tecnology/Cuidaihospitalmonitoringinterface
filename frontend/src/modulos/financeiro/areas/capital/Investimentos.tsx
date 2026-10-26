/**
 * Investimentos: contas do tipo "investimento". Aplicar e resgatar são
 * transferências (em Caixa e bancos); o rendimento se registra informando o
 * saldo que o banco mostra — a diferença vira receita financeira.
 */

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import { formatarBRL, type Dinheiro } from '../../util/dinheiro';
import { hojeISO } from '../../util/datas';
import { Aviso, Botao, Campo, CampoDinheiro, Carregando, Janela, Numero, Vazio, cartao, tabela, texto } from '../../ui/base';

export function Investimentos() {
  const { api, pode, navegar } = useFinanceiro();
  const lista = useDados(() => api.investimentos(), [api]);
  const [atualizando, setAtualizando] = useState<{ id: string; nome: string; saldo: string } | null>(null);
  const d = lista.dados;
  if (!d) return <Carregando />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo="Total investido hoje" valor={formatarBRL(d.total)} destaque />
      </div>
      <div className={cartao}>
        {d.contas.length === 0 ? (
          <Vazio titulo="Nenhuma conta de investimento." acao={pode('cadastros', 'criar') ? <Botao onClick={() => navegar('cadastros')}>Cadastrar em Cadastros &gt; Contas</Botao> : undefined}>
            Crie uma conta do tipo “Investimento” para cada aplicação (CDB, fundo, poupança).
          </Vazio>
        ) : (
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Aplicação</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Aplicado</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Resgatado</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Rendimento acumulado</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Saldo</th>
                <th className={tabela.celulaCabeca} />
              </tr>
            </thead>
            <tbody>
              {d.contas.map((c) => (
                <tr key={c.id} className={tabela.linha}>
                  <td className={tabela.celula}><span className={texto.titulo}>{c.nome}</span>{c.banco && <span className={`text-xs ${texto.suave}`}> · {c.banco}</span>}</td>
                  <td className={tabela.numero}>{formatarBRL(c.aplicado)}</td>
                  <td className={tabela.numero}>{formatarBRL(c.resgatado)}</td>
                  <td className={tabela.numero}>{formatarBRL(c.rendimentoAcumulado)}</td>
                  <td className={`${tabela.numero} font-medium`}>{formatarBRL(c.saldo)}</td>
                  <td className={`${tabela.celula} text-right`}>
                    {pode('capital', 'editar') && c.ativa && (
                      <Botao pequeno icone={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setAtualizando({ id: c.id, nome: c.nome, saldo: c.saldo })}>
                        Atualizar saldo
                      </Botao>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className={`text-xs ${texto.suave}`}>Para aplicar ou resgatar, faça uma transferência em Caixa e bancos: dinheiro mudando de conta não é receita nem despesa.</p>
      {atualizando && <Atualizar conta={atualizando} aoFechar={() => setAtualizando(null)} aoSalvar={() => { setAtualizando(null); lista.recarregar(); }} />}
    </div>
  );
}

function Atualizar({ conta, aoFechar, aoSalvar }: { conta: { id: string; nome: string; saldo: string }; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const [saldo, setSaldo] = useState<Dinheiro | null>(conta.saldo);
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo={`Atualizar ${conta.nome}`}
      subtitulo={`Saldo no sistema: ${formatarBRL(conta.saldo)}`}
      aoFechar={aoFechar}
      largura="max-w-md"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvando} disabled={!saldo}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.atualizarInvestimento(conta.id, saldo!, data);
                avisar('Rendimento registrado.');
                aoSalvar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível atualizar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}>
            Registrar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3">
        <CampoDinheiro rotulo="Saldo que o banco mostra" valor={saldo} aoMudar={setSaldo} />
        <Campo rotulo="Na data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <Aviso tipo="info">A diferença para o saldo do sistema vira rendimento (receita financeira) — ou perda, se for menor.</Aviso>
      </div>
    </Janela>
  );
}
