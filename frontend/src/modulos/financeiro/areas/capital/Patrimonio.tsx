/**
 * Patrimônio: os bens da empresa e a depreciação. A compra sai do caixa de
 * uma vez; no resultado entra aos poucos, mês a mês, pela vida útil.
 */

import { useState } from 'react';
import { PackageMinus, Plus } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Ativo } from '../../api/tipos';
import { formatarBRL, type Dinheiro } from '../../util/dinheiro';
import { formatarData, hojeISO } from '../../util/datas';
import { CLASSES_DE_BEM } from '../../rotulos';
import { AreaTexto, Botao, Campo, CampoDinheiro, Carregando, Etiqueta, Janela, Marcador, Numero, Seletor, Vazio, cartao, tabela, texto } from '../../ui/base';
import { SeletorCentro, SeletorConta, SeletorPessoa, useCadastrosBasicos, type PessoaEscolhida } from '../../ui/seletores';

export function Patrimonio() {
  const { api, pode } = useFinanceiro();
  const ativos = useDados(() => api.ativos(), [api]);
  const [novo, setNovo] = useState(false);
  const [baixando, setBaixando] = useState<Ativo | null>(null);
  const d = ativos.dados;
  if (!d) return <Carregando />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Numero rotulo="Bens" valor={String(d.totais.bens)} />
        <Numero rotulo="Valor de aquisição" valor={formatarBRL(d.totais.valorAquisicao)} />
        <Numero rotulo="Valor contábil hoje" valor={formatarBRL(d.totais.valorContabil)} destaque />
        <Numero rotulo="Depreciação por mês" valor={formatarBRL(d.totais.depreciacaoMensal)} detalhe="Entra na DRE todo mês" />
      </div>
      <div className={cartao}>
        <div className="flex items-center justify-end border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          {pode('capital', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setNovo(true)}>Novo bem</Botao>}
        </div>
        {d.itens.length === 0 ? <Vazio titulo="Nenhum bem cadastrado.">Equipamentos, móveis, veículos e computadores da empresa.</Vazio> : (
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Bem</th>
                <th className={tabela.celulaCabeca}>Aquisição</th>
                <th className={tabela.celulaCabeca}>Vida útil</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Valor pago</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Depreciado</th>
                <th className={`${tabela.celulaCabeca} text-right`}>Valor contábil</th>
                <th className={tabela.celulaCabeca} />
              </tr>
            </thead>
            <tbody>
              {d.itens.map((a) => (
                <tr key={a.id} className={tabela.linha}>
                  <td className={tabela.celula}>
                    <p className={a.baixadoEm ? 'text-gray-400 line-through' : texto.titulo}>{a.descricao}</p>
                    <p className={`text-xs ${texto.suave}`}>{a.classeRotulo}{a.identificacao ? ` · ${a.identificacao}` : ''}{a.centroCustoNome ? ` · ${a.centroCustoNome}` : ''}</p>
                    {a.baixadoEm && <Etiqueta>Baixado em {formatarData(a.baixadoEm)}: {a.motivoBaixa}</Etiqueta>}
                  </td>
                  <td className={tabela.celula}>{formatarData(a.dataAquisicao)}</td>
                  <td className={tabela.celula}>{a.vidaUtilMeses ? `${a.vidaUtilMeses} meses` : 'não deprecia'}</td>
                  <td className={tabela.numero}>{formatarBRL(a.valorAquisicao)}</td>
                  <td className={tabela.numero}>{formatarBRL(a.depreciacaoAcumulada)}</td>
                  <td className={`${tabela.numero} font-medium`}>{formatarBRL(a.valorContabil)}</td>
                  <td className={`${tabela.celula} text-right`}>
                    {!a.baixadoEm && pode('capital', 'excluir') && (
                      <Botao pequeno variante="fantasma" icone={<PackageMinus className="h-3.5 w-3.5" />} onClick={() => setBaixando(a)}>Baixar</Botao>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {novo && <NovoBem classes={d.classes} aoFechar={() => setNovo(false)} aoSalvar={() => { setNovo(false); void ativos.recarregar(); }} />}
      {baixando && <BaixarBem ativo={baixando} aoFechar={() => setBaixando(null)} aoSalvar={() => { setBaixando(null); void ativos.recarregar(); }} />}
    </div>
  );
}

function NovoBem({ classes, aoFechar, aoSalvar }: { classes: Record<string, { rotulo: string; vidaUtilSugerida: number | null }>; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const [descricao, setDescricao] = useState('');
  const [classe, setClasse] = useState('maquina');
  const [identificacao, setIdentificacao] = useState('');
  const [valor, setValor] = useState<Dinheiro | null>(null);
  const [residual, setResidual] = useState<Dinheiro | null>(null);
  const [aquisicao, setAquisicao] = useState(hojeISO());
  const [vida, setVida] = useState(String(classes.maquina?.vidaUtilSugerida ?? ''));
  const [centroId, setCentroId] = useState('');
  const [gerarConta, setGerarConta] = useState(true);
  const [fornecedor, setFornecedor] = useState<PessoaEscolhida>(null);
  const [pago, setPago] = useState(false);
  const [contaId, setContaId] = useState('');
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo="Novo bem"
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvando} disabled={descricao.trim().length < 2 || !valor}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.criarAtivo({
                  descricao, classe, identificacao: identificacao || null, valorAquisicao: valor, valorResidual: residual,
                  dataAquisicao: aquisicao, vidaUtilMeses: classe === 'terreno' ? null : Number(vida) || null,
                  centroCustoId: centroId || null,
                  ...(gerarConta ? { compra: { pessoaId: fornecedor?.id ?? null, ...(pago && contaId ? { contaId } : {}) } } : {}),
                });
                avisar('Bem cadastrado.');
                aoSalvar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível cadastrar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}>
            Cadastrar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Descrição" className="sm:col-span-2" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Cama hospitalar elétrica" />
        <Seletor rotulo="Classe" value={classe} onChange={(e) => { setClasse(e.target.value); setVida(String(classes[e.target.value]?.vidaUtilSugerida ?? '')); }}
          opcoes={Object.entries(CLASSES_DE_BEM).map(([valor, rotulo]) => ({ valor, rotulo }))} />
        <Campo rotulo="Identificação" dica="placa, nº de série, patrimônio" value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} />
        <CampoDinheiro rotulo="Valor de aquisição" valor={valor} aoMudar={setValor} />
        <Campo rotulo="Data da aquisição" type="date" value={aquisicao} onChange={(e) => setAquisicao(e.target.value)} />
        {classe !== 'terreno' && (
          <Campo rotulo="Vida útil (meses)" type="number" value={vida} onChange={(e) => setVida(e.target.value)}
            ajuda="Sugestão pela taxa da Receita (IN RFB 1.700/2017, Anexo III); a vida real é decisão da empresa." />
        )}
        {classe !== 'terreno' && <CampoDinheiro rotulo="Valor residual" dica="opcional" valor={residual} aoMudar={setResidual} ajuda="Quanto o bem ainda vale no fim da vida útil." />}
        <SeletorCentro centros={cadastros.centros} valor={centroId} aoMudar={setCentroId} />
      </div>
      <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <Marcador rotulo="Lançar a compra em contas a pagar" checked={gerarConta} onChange={(e) => setGerarConta(e.target.checked)} />
        {gerarConta && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><SeletorPessoa valor={fornecedor} aoMudar={setFornecedor} rotulo="Fornecedor" papel="fornecedor" /></div>
            <Marcador rotulo="Já foi pago" checked={pago} onChange={(e) => setPago(e.target.checked)} />
            {pago && <SeletorConta contas={cadastros.contas} valor={contaId} aoMudar={setContaId} />}
          </div>
        )}
      </div>
    </Janela>
  );
}

function BaixarBem({ ativo, aoFechar, aoSalvar }: { ativo: Ativo; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const [motivo, setMotivo] = useState('');
  const [data, setData] = useState(hojeISO());
  const [venda, setVenda] = useState<Dinheiro | null>(null);
  const [comprador, setComprador] = useState<PessoaEscolhida>(null);
  const [contaId, setContaId] = useState('');
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo={`Baixar ${ativo.descricao}`}
      subtitulo={`Valor contábil hoje: ${formatarBRL(ativo.valorContabil)}. A diferença para o valor de venda vira ganho ou perda no resultado.`}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="perigo" carregando={salvando} disabled={motivo.trim().length < 3}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.baixarAtivo(ativo.id, { motivo, data, valorVenda: venda, pessoaId: comprador?.id ?? null, contaId: contaId || null });
                avisar('Bem baixado.');
                aoSalvar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível baixar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}>
            Baixar bem
          </Botao>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <AreaTexto rotulo="Motivo" className="sm:col-span-2" placeholder="Venda, perda, descarte, doação…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <CampoDinheiro rotulo="Valor de venda" dica="se vendeu" valor={venda} aoMudar={setVenda} />
        {venda && (
          <>
            <div className="sm:col-span-2"><SeletorPessoa valor={comprador} aoMudar={setComprador} rotulo="Comprador" papel="cliente" /></div>
            <SeletorConta contas={cadastros.contas} valor={contaId} aoMudar={setContaId} rotulo="Recebido na conta (se já recebeu)" className="sm:col-span-2" />
          </>
        )}
      </div>
    </Janela>
  );
}
