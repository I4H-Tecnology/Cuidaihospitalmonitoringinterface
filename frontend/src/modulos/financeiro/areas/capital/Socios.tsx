import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Socios as TSocios } from '../../api/tipos';
import { formatarBRL, type Dinheiro } from '../../util/dinheiro';
import { formatarData, hojeISO } from '../../util/datas';
import { Aviso, Botao, Campo, CampoDinheiro, Carregando, Janela, Numero, Seletor, Vazio, cartao, tabela, texto } from '../../ui/base';
import { SeletorConta, SeletorPessoa, useCadastrosBasicos, type PessoaEscolhida } from '../../ui/seletores';

type Socio = TSocios['socios'][number];

const OPERACOES = {
  integralizacao: ['Integralizar capital', 'Dinheiro do capital subscrito entrando na empresa.'],
  aporte: ['Aporte', 'Dinheiro do sócio além do capital (ex.: para cobrir caixa).'],
  distribuicao: ['Distribuir lucros', 'Lucro já apurado indo para o sócio. Não é despesa: sai da DRE.'],
  devolucao: ['Devolver capital', 'Redução do capital, devolvendo dinheiro ao sócio.'],
} as const;

export function Socios() {
  const { api, pode } = useFinanceiro();
  const dados = useDados(() => api.socios(), [api]);
  const [editando, setEditando] = useState<Socio | 'novo' | null>(null);
  const [operando, setOperando] = useState<{ socio: Socio; operacao: keyof typeof OPERACOES } | null>(null);
  const s = dados.dados;
  if (!s) return <Carregando />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Numero rotulo="Capital social (contrato)" valor={formatarBRL(s.capitalSocial)} />
        <Numero rotulo="Subscrito pelos sócios" valor={formatarBRL(s.capitalSubscrito)} />
        <Numero rotulo="Integralizado" valor={formatarBRL(s.capitalIntegralizado)} tom="bom" />
        <Numero rotulo="A integralizar" valor={formatarBRL(s.aIntegralizar)} />
      </div>
      {s.avisos.map((a) => <Aviso key={a} tipo="atencao">{a}</Aviso>)}
      <div className={cartao}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          <p className={`text-sm ${texto.suave}`}>Cada operação vira lançamento no caixa com categoria própria — aporte e distribuição não entram no resultado.</p>
          {pode('capital', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditando('novo')}>Novo sócio</Botao>}
        </div>
        {s.socios.length === 0 ? <Vazio titulo="Nenhum sócio cadastrado." /> : (
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Sócio</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Participação</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Subscrito</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Integralizado</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Aportes</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Lucros recebidos</th>
                <th className={tabela.celulaCabeca} />
              </tr>
            </thead>
            <tbody>
              {s.socios.map((socio) => (
                <tr key={socio.id} className={tabela.linha}>
                  <td className={tabela.celula}>
                    <p className={socio.dataSaida ? 'text-gray-400 line-through' : texto.titulo}>{socio.nome}</p>
                    <p className={`text-xs ${texto.suave}`}>desde {formatarData(socio.dataEntrada)}{socio.dataSaida && ` até ${formatarData(socio.dataSaida)}`}</p>
                  </td>
                  <td className={tabela.numero}>{socio.participacao.replace(/\.?0+$/, '').replace('.', ',')}%</td>
                  <td className={tabela.numero}>{formatarBRL(socio.capitalSubscrito)}</td>
                  <td className={tabela.numero}>{formatarBRL(socio.integralizado)}</td>
                  <td className={tabela.numero}>{formatarBRL(socio.aportes)}</td>
                  <td className={tabela.numero}>{formatarBRL(socio.distribuido)}</td>
                  <td className={`${tabela.celula} whitespace-nowrap text-right`}>
                    {pode('capital', 'criar') && (
                      <>
                        <Botao pequeno variante="fantasma" icone={<ArrowDownLeft className="h-3.5 w-3.5" />} onClick={() => setOperando({ socio, operacao: 'integralizacao' })}>Entrada</Botao>
                        <Botao pequeno variante="fantasma" icone={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={() => setOperando({ socio, operacao: 'distribuicao' })}>Saída</Botao>
                      </>
                    )}
                    {pode('capital', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(socio)}>Editar</Botao>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editando && <EditorSocio socio={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} aoSalvar={(novo) => { setEditando(null); dados.setDados(novo); }} />}
      {operando && <OperacaoSocio {...operando} aoFechar={() => setOperando(null)} aoSalvar={(novo) => { setOperando(null); dados.setDados(novo); }} />}
    </div>
  );
}

function EditorSocio({ socio, aoFechar, aoSalvar }: { socio: Socio | null; aoFechar: () => void; aoSalvar: (s: TSocios) => void }) {
  const { api, avisar } = useFinanceiro();
  const [pessoa, setPessoa] = useState<PessoaEscolhida>(socio ? { id: socio.pessoaId, nome: socio.nome } : null);
  const [participacao, setParticipacao] = useState(socio?.participacao ?? '');
  const [subscrito, setSubscrito] = useState<Dinheiro | null>(socio?.capitalSubscrito ?? null);
  const [entrada, setEntrada] = useState(socio?.dataEntrada ?? hojeISO());
  const [saida, setSaida] = useState(socio?.dataSaida ?? '');
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo={socio ? `Editar ${socio.nome}` : 'Novo sócio'}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvando} disabled={!pessoa || !participacao}
            onClick={async () => {
              setSalvando(true);
              try {
                aoSalvar(await api.salvarSocio({
                  ...(socio ? {} : { pessoaId: pessoa!.id }),
                  participacao: participacao.replace(',', '.'), capitalSubscrito: subscrito ?? '0',
                  dataEntrada: entrada, ...(socio ? { dataSaida: saida || null } : {}),
                }, socio?.id));
                avisar('Sócio salvo.');
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível salvar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {socio ? <p className={texto.titulo}>{socio.nome}</p> : <SeletorPessoa valor={pessoa} aoMudar={setPessoa} rotulo="Pessoa" tipoPadrao="fisica" />}
        </div>
        <Campo rotulo="Participação (%)" value={participacao} onChange={(e) => setParticipacao(e.target.value)} />
        <CampoDinheiro rotulo="Capital subscrito" valor={subscrito} aoMudar={setSubscrito} ajuda="O que o sócio se comprometeu a pôr (contrato social)." />
        <Campo rotulo="Entrada na sociedade" type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
        {socio && <Campo rotulo="Saída" dica="se saiu" type="date" value={saida} onChange={(e) => setSaida(e.target.value)} />}
      </div>
    </Janela>
  );
}

function OperacaoSocio({ socio, operacao: inicial, aoFechar, aoSalvar }: { socio: Socio; operacao: keyof typeof OPERACOES; aoFechar: () => void; aoSalvar: (s: TSocios) => void }) {
  const { api, avisar } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const [operacao, setOperacao] = useState<keyof typeof OPERACOES>(inicial);
  const [valor, setValor] = useState<Dinheiro | null>(null);
  const [data, setData] = useState(hojeISO());
  const [contaId, setContaId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const entrando = operacao === 'integralizacao' || operacao === 'aporte';
  return (
    <Janela
      titulo={`${socio.nome}: ${OPERACOES[operacao][0].toLowerCase()}`}
      subtitulo={OPERACOES[operacao][1]}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvando} disabled={!valor}
            onClick={async () => {
              setSalvando(true);
              try {
                aoSalvar(await api.operacaoSocio(socio.id, { operacao, valor, data, contaId: contaId || null }));
                avisar('Operação registrada.');
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível registrar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}>
            Registrar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Seletor rotulo="Operação" className="sm:col-span-2" value={operacao} onChange={(e) => setOperacao(e.target.value as keyof typeof OPERACOES)}
          opcoes={Object.entries(OPERACOES).map(([valor, [rotulo]]) => ({ valor, rotulo }))} />
        <CampoDinheiro rotulo="Valor" valor={valor} aoMudar={setValor} />
        <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <SeletorConta contas={cadastros.contas} valor={contaId} aoMudar={setContaId} rotulo={entrando ? 'Entrou na conta' : 'Saiu da conta'} className="sm:col-span-2" />
        <p className={`text-xs sm:col-span-2 ${texto.suave}`}>Sem conta, fica lançado como conta a {entrando ? 'receber do' : 'pagar ao'} sócio, para liquidar depois.</p>
      </div>
    </Janela>
  );
}
