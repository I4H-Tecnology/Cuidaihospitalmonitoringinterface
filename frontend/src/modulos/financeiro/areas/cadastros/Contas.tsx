import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Conta } from '../../api/tipos';
import { formatarBRL, type Dinheiro } from '../../util/dinheiro';
import { hojeISO } from '../../util/datas';
import { TIPOS_DE_CONTA } from '../../rotulos';
import { Botao, Campo, CampoDinheiro, Carregando, Etiqueta, Janela, Marcador, Seletor, Vazio, cartao, tabela, texto } from '../../ui/base';

const OPCOES_TIPO = Object.entries(TIPOS_DE_CONTA).map(([valor, rotulo]) => ({ valor, rotulo }));

export function Contas() {
  const { api, pode } = useFinanceiro();
  const contas = useDados(() => api.contas(), [api]);
  const [editando, setEditando] = useState<Conta | 'nova' | null>(null);
  return (
    <div className={cartao}>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-700">
        <p className={`text-sm ${texto.suave}`}>Onde o dinheiro está: caixa, contas correntes, aplicações e cartões.</p>
        {pode('cadastros', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditando('nova')}>Nova conta</Botao>}
      </div>
      {!contas.dados ? <Carregando /> : contas.dados.length === 0 ? <Vazio titulo="Nenhuma conta." /> : (
        <table className={tabela.base}>
          <thead className={tabela.cabeca}>
            <tr>
              <th className={tabela.celulaCabeca}>Conta</th>
              <th className={tabela.celulaCabeca}>Tipo</th>
              <th className={tabela.celulaCabeca}>Banco / agência / número</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Saldo hoje</th>
              <th className={tabela.celulaCabeca} />
            </tr>
          </thead>
          <tbody>
            {contas.dados.map((c) => (
              <tr key={c.id} className={tabela.linha}>
                <td className={tabela.celula}>
                  <span className={texto.titulo}>{c.nome}</span> {!c.ativa && <Etiqueta>Inativa</Etiqueta>}
                </td>
                <td className={tabela.celula}>{TIPOS_DE_CONTA[c.tipo]}</td>
                <td className={tabela.celula}>{[c.banco, c.agencia, c.numero].filter(Boolean).join(' · ') || '—'}</td>
                <td className={tabela.numero}>{formatarBRL(c.saldo)}</td>
                <td className={`${tabela.celula} text-right`}>
                  {pode('cadastros', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(c)}>Editar</Botao>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editando === 'nova' && <NovaConta aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); void contas.recarregar(); }} />}
      {editando && editando !== 'nova' && (
        <EditarConta conta={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); void contas.recarregar(); }} />
      )}
    </div>
  );
}

export function NovaConta({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: (c: Conta) => void }) {
  const { api, avisar } = useFinanceiro();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('corrente');
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [numero, setNumero] = useState('');
  const [saldo, setSaldo] = useState<Dinheiro | null>(null);
  const [dataSaldo, setDataSaldo] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo="Nova conta"
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={nome.trim().length < 2}
            onClick={async () => {
              setSalvando(true);
              try {
                const conta = await api.criarConta({ nome, tipo, banco: banco || null, agencia: agencia || null, numero: numero || null, saldoInicial: saldo, dataSaldoInicial: dataSaldo });
                avisar('Conta criada.');
                aoSalvar(conta);
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível criar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            Criar conta
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" placeholder="Ex.: Banco do Brasil — movimento" className="sm:col-span-2" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Seletor rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} opcoes={OPCOES_TIPO} />
        <Campo rotulo="Banco" dica="opcional" value={banco} onChange={(e) => setBanco(e.target.value)} />
        <Campo rotulo="Agência" dica="opcional" value={agencia} onChange={(e) => setAgencia(e.target.value)} />
        <Campo rotulo="Número" dica="opcional" value={numero} onChange={(e) => setNumero(e.target.value)} />
        <CampoDinheiro rotulo="Saldo inicial" valor={saldo} aoMudar={setSaldo} permitirNegativo ajuda="O saldo no dia em que a conta passa a ser controlada aqui." />
        <Campo rotulo="Data do saldo inicial" type="date" value={dataSaldo} onChange={(e) => setDataSaldo(e.target.value)} />
      </div>
    </Janela>
  );
}

function EditarConta({ conta, aoFechar, aoSalvar }: { conta: Conta; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const [nome, setNome] = useState(conta.nome);
  const [banco, setBanco] = useState(conta.banco ?? '');
  const [agencia, setAgencia] = useState(conta.agencia ?? '');
  const [numero, setNumero] = useState(conta.numero ?? '');
  const [ativa, setAtiva] = useState(conta.ativa);
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo={`Editar ${conta.nome}`}
      subtitulo="O saldo não se edita: ele é a soma dos movimentos. Para corrigir, use Ajustar saldo em Caixa e bancos."
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.editarConta(conta.id, { nome, banco: banco || null, agencia: agencia || null, numero: numero || null, ativa });
                avisar('Conta atualizada.');
                aoSalvar();
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" className="sm:col-span-2" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="Banco" value={banco} onChange={(e) => setBanco(e.target.value)} />
        <Campo rotulo="Agência" value={agencia} onChange={(e) => setAgencia(e.target.value)} />
        <Campo rotulo="Número" value={numero} onChange={(e) => setNumero(e.target.value)} />
        <Marcador rotulo="Conta ativa" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="mt-6" />
      </div>
    </Janela>
  );
}
