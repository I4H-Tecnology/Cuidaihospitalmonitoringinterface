/**
 * Conciliação bancária: o extrato do banco (OFX ou CSV) contra o que foi
 * lançado. Cada linha do banco vira conciliada (casou com um lançamento),
 * lançada a partir daqui (tarifa, rendimento, PIX sem conta aberta) ou
 * ignorada com motivo. O sistema SUGERE o par — valor igual ao centavo e data
 * próxima —, mas quem confirma é a pessoa.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCheck, FileUp, Link2, Plus, Sparkles, XCircle } from 'lucide-react';
import { useDados, useFinanceiro } from '../contexto';
import type { Pendencias, SugestaoConciliacao } from '../api/tipos';
import { formatarBRL, paraCentavos } from '../util/dinheiro';
import { formatarData, formatarDataHora } from '../util/datas';
import {
  Aviso, Botao, CabecalhoDaArea, Campo, Carregando, ConfirmarComMotivo, Etiqueta, Janela, Numero, Seletor, Vazio,
  cartao, tabela, texto,
} from '../ui/base';
import { SeletorCategoria, SeletorCentro, SeletorConta, useCadastrosBasicos } from '../ui/seletores';

type Linha = Pendencias['linhas'][number];

export function Conciliacao() {
  const { api, pode, avisar } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const [contaId, setContaId] = useState('');
  const [importando, setImportando] = useState(false);
  const [lancando, setLancando] = useState<Linha | null>(null);
  const [ignorando, setIgnorando] = useState<Linha | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const bancarias = cadastros.contas.filter((c) => c.ativa && c.tipo !== 'caixa');
  useEffect(() => {
    if (!contaId && bancarias.length) setContaId(bancarias[0].id);
  }, [bancarias, contaId]);

  const pendencias = useDados<Pendencias | null>(() => (contaId ? api.pendencias(contaId) : Promise.resolve(null)), [api, contaId]);
  const dados = pendencias.dados;

  const conciliar = async (linha: Linha, sugestao: SugestaoConciliacao) => {
    setOcupado(linha.id);
    try {
      await api.conciliar(linha.id, sugestao.tipo === 'movimento' ? { movimentoId: sugestao.id } : { parcelaId: sugestao.id });
      avisar(sugestao.tipo === 'parcela' ? 'Pagamento registrado e conciliado.' : 'Linha conciliada.');
      await pendencias.recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível conciliar.', 'erro');
    } finally {
      setOcupado(null);
    }
  };

  const fortes = dados?.linhas.filter((l) => l.sugestao?.tipo === 'movimento' && l.sugestao.pontuacao >= 70).length ?? 0;

  return (
    <div>
      <CabecalhoDaArea
        titulo="Conciliação bancária"
        descricao="Importe o extrato do internet banking (OFX, ou CSV) e confira linha a linha. Importar o mesmo arquivo de novo não duplica nada."
        acoes={
          pode('operacao', 'criar') && (
            <Botao variante="primario" icone={<FileUp className="h-4 w-4" />} disabled={!contaId} onClick={() => setImportando(true)}>
              Importar extrato
            </Botao>
          )
        }
      />

      <div className={`${cartao} mb-4 flex flex-wrap items-end gap-4 p-4`}>
        <SeletorConta contas={bancarias} valor={contaId} aoMudar={setContaId} rotulo="Conta bancária" className="min-w-72" />
        {dados?.ultimaImportacao && (
          <p className={`text-xs ${texto.suave}`}>
            Última importação: {dados.ultimaImportacao.arquivo}, em {formatarDataHora(dados.ultimaImportacao.importadoEm)}
            {dados.ultimaImportacao.fim && <> · extrato até {formatarData(dados.ultimaImportacao.fim)}</>}
          </p>
        )}
      </div>

      {bancarias.length === 0 && !cadastros.carregando && (
        <Aviso tipo="info">Cadastre a conta bancária em Cadastros &gt; Contas para conciliar o extrato dela.</Aviso>
      )}

      {dados && dados.ultimaImportacao?.saldoFinal != null && dados.saldoSistemaNaData != null && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Numero rotulo={`Saldo do banco em ${formatarData(dados.ultimaImportacao.fim)}`} valor={formatarBRL(dados.ultimaImportacao.saldoFinal)} />
          <Numero rotulo="Saldo do sistema na mesma data" valor={formatarBRL(dados.saldoSistemaNaData)} />
          <Numero
            rotulo="Diferença"
            valor={formatarBRL(dados.diferenca)}
            tom={paraCentavos(dados.diferenca) === 0 ? 'bom' : 'atencao'}
            detalhe={paraCentavos(dados.diferenca) === 0 ? 'Batendo com o banco.' : 'Há lançamento faltando ou sobrando.'}
          />
        </div>
      )}

      {!dados && contaId ? (
        <Carregando />
      ) : dados && dados.linhas.length === 0 ? (
        <div className={cartao}>
          <Vazio titulo="Nada para conciliar nesta conta.">
            {dados.ultimaImportacao ? 'Todas as linhas importadas foram resolvidas.' : 'Importe o extrato para começar.'}
          </Vazio>
        </div>
      ) : dados ? (
        <div className={`${cartao} overflow-hidden ${pendencias.carregando ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-700">
            <p className={`text-sm ${texto.normal}`}>{dados.linhas.length} linha(s) do banco a resolver</p>
            {fortes > 0 && pode('operacao', 'editar') && (
              <Botao
                pequeno
                icone={<CheckCheck className="h-3.5 w-3.5" />}
                onClick={async () => {
                  try {
                    const r = await api.conciliarFortes(contaId);
                    avisar(`${r.conciliadas} linha(s) conciliada(s).`);
                    pendencias.recarregar();
                  } catch (e) {
                    avisar(e instanceof Error ? e.message : 'Não foi possível conciliar.', 'erro');
                  }
                }}
              >
                Aceitar {fortes} sugestão(ões) forte(s)
              </Botao>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className={tabela.base}>
              <thead className={tabela.cabeca}>
                <tr>
                  <th className={tabela.celulaCabeca}>Data</th>
                  <th className={tabela.celulaCabeca}>No banco</th>
                  <th className={`${tabela.celulaCabeca} text-right`}>Valor</th>
                  <th className={tabela.celulaCabeca}>Par sugerido</th>
                  <th className={tabela.celulaCabeca} />
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((linha) => (
                  <tr key={linha.id} className={tabela.linha}>
                    <td className={`${tabela.celula} whitespace-nowrap`}>{formatarData(linha.data)}</td>
                    <td className={tabela.celula}>
                      <p className={texto.titulo}>{linha.descricao}</p>
                      {linha.documento && <p className={`text-xs ${texto.suave}`}>doc. {linha.documento}</p>}
                    </td>
                    <td className={`${tabela.numero} ${paraCentavos(linha.valor) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatarBRL(linha.valor)}</td>
                    <td className={tabela.celula}>
                      {linha.sugestao ? (
                        <SugestaoVista sugestao={linha.sugestao} />
                      ) : (
                        <span className={`text-xs ${texto.suave}`}>Nenhum lançamento com esse valor e data.</span>
                      )}
                      {linha.alternativas.length > 0 && (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer text-[var(--fin-primaria,#0A7EA4)]">outras opções ({linha.alternativas.length})</summary>
                          <ul className="mt-1 space-y-1">
                            {linha.alternativas.map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2">
                                <SugestaoVista sugestao={a} />
                                {pode('operacao', 'editar') && (
                                  <Botao pequeno variante="fantasma" onClick={() => conciliar(linha, a)}>usar</Botao>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className={`${tabela.celula} whitespace-nowrap text-right`}>
                      <div className="flex justify-end gap-1">
                        {linha.sugestao && pode('operacao', 'editar') && (
                          <Botao pequeno variante="primario" icone={<Link2 className="h-3.5 w-3.5" />} carregando={ocupado === linha.id} onClick={() => conciliar(linha, linha.sugestao!)}>
                            {linha.sugestao.tipo === 'parcela' ? (paraCentavos(linha.valor) < 0 ? 'Pagar e conciliar' : 'Receber e conciliar') : 'Conciliar'}
                          </Botao>
                        )}
                        {pode('operacao', 'criar') && (
                          <Botao pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setLancando(linha)}>Lançar</Botao>
                        )}
                        {pode('operacao', 'editar') && (
                          <Botao pequeno variante="fantasma" icone={<XCircle className="h-3.5 w-3.5" />} onClick={() => setIgnorando(linha)}>Ignorar</Botao>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {importando && (
        <Importacao
          contaId={contaId}
          aoFechar={() => setImportando(false)}
          aoConcluir={() => {
            setImportando(false);
            pendencias.recarregar();
          }}
        />
      )}
      {lancando && (
        <LancarDaLinha
          linha={lancando}
          cadastros={cadastros}
          aoFechar={() => setLancando(null)}
          aoConcluir={() => {
            setLancando(null);
            pendencias.recarregar();
            void cadastros.recarregar();
          }}
        />
      )}
      {ignorando && (
        <ConfirmarComMotivo
          titulo="Ignorar linha do extrato"
          mensagem={`"${ignorando.descricao}" (${formatarBRL(ignorando.valor)}) não vai entrar no financeiro.`}
          rotuloAcao="Ignorar"
          perigoso={false}
          aoFechar={() => setIgnorando(null)}
          aoConfirmar={async (motivo) => {
            try {
              await api.ignorarLinha(ignorando.id, motivo);
              setIgnorando(null);
              pendencias.recarregar();
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'Não foi possível ignorar.', 'erro');
            }
          }}
        />
      )}
    </div>
  );
}

function SugestaoVista({ sugestao }: { sugestao: SugestaoConciliacao }) {
  const forte = sugestao.pontuacao >= 70;
  return (
    <div>
      <p className={`text-sm ${texto.titulo}`}>
        {sugestao.tipo === 'parcela' ? <Etiqueta tom="atencao">Conta em aberto</Etiqueta> : <Etiqueta tom="info">Já lançado</Etiqueta>}{' '}
        {sugestao.descricao}
      </p>
      <p className={`text-xs ${texto.suave}`} title={`Pontuação ${sugestao.pontuacao}`}>
        {forte && <Sparkles className="mr-1 inline h-3 w-3 text-amber-500" />}
        {formatarData(sugestao.data)} · {sugestao.motivos.join(', ')}
      </p>
    </div>
  );
}

function Importacao({ contaId, aoFechar, aoConcluir }: { contaId: string; aoFechar: () => void; aoConcluir: () => void }) {
  const { api, avisar } = useFinanceiro();
  const arquivo = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [formato, setFormato] = useState<'ofx' | 'csv'>('ofx');
  const [colunas, setColunas] = useState({ data: 'data', descricao: 'descricao', valor: 'valor', formatoData: '%d/%m/%Y', decimal: ',' });
  const [enviando, setEnviando] = useState(false);

  const ler = (f: File) => {
    setNome(f.name);
    setFormato(f.name.toLowerCase().endsWith('.csv') ? 'csv' : 'ofx');
    const leitor = new FileReader();
    leitor.onload = () => {
      const bytes = new Uint8Array(leitor.result as ArrayBuffer);
      let binario = '';
      bytes.forEach((b) => (binario += String.fromCharCode(b)));
      setConteudo(btoa(binario));
    };
    leitor.readAsArrayBuffer(f);
  };

  return (
    <Janela
      titulo="Importar extrato"
      subtitulo="No internet banking, procure por “exportar extrato” em OFX (Money/Quicken). CSV também serve."
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={enviando}
            disabled={!conteudo}
            onClick={async () => {
              setEnviando(true);
              try {
                const r = await api.importarExtrato(contaId, {
                  formato, nomeArquivo: nome, conteudoBase64: conteudo,
                  ...(formato === 'csv' ? { csv: { colunaData: colunas.data, colunaDescricao: colunas.descricao, colunaValor: colunas.valor, formatoData: colunas.formatoData, decimal: colunas.decimal } } : {}),
                });
                avisar(`${r.novas} linha(s) nova(s)${r.repetidas ? `, ${r.repetidas} já importada(s) antes` : ''}.`);
                aoConcluir();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível importar.', 'erro');
              } finally {
                setEnviando(false);
              }
            }}
          >
            Importar
          </Botao>
        </>
      }
    >
      <input ref={arquivo} type="file" accept=".ofx,.OFX,.csv,.CSV,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
      <button
        type="button"
        onClick={() => arquivo.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-sm text-gray-500 hover:border-[var(--fin-primaria,#0A7EA4)] dark:border-gray-600"
      >
        <FileUp className="h-6 w-6" />
        {nome || 'Escolher arquivo (.ofx ou .csv)'}
      </button>
      {formato === 'csv' && conteudo && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className={`text-xs sm:col-span-2 ${texto.suave}`}>Diga em que coluna está cada informação (o nome do cabeçalho, como aparece no arquivo). Valor negativo é saída.</p>
          <Campo rotulo="Coluna da data" value={colunas.data} onChange={(e) => setColunas({ ...colunas, data: e.target.value })} />
          <Campo rotulo="Coluna da descrição" value={colunas.descricao} onChange={(e) => setColunas({ ...colunas, descricao: e.target.value })} />
          <Campo rotulo="Coluna do valor" value={colunas.valor} onChange={(e) => setColunas({ ...colunas, valor: e.target.value })} />
          <Seletor
            rotulo="Formato da data"
            value={colunas.formatoData}
            onChange={(e) => setColunas({ ...colunas, formatoData: e.target.value })}
            opcoes={[
              { valor: '%d/%m/%Y', rotulo: 'DD/MM/AAAA' },
              { valor: '%Y-%m-%d', rotulo: 'AAAA-MM-DD' },
              { valor: '%d/%m/%y', rotulo: 'DD/MM/AA' },
            ]}
          />
          <Seletor
            rotulo="Separador decimal"
            value={colunas.decimal}
            onChange={(e) => setColunas({ ...colunas, decimal: e.target.value })}
            opcoes={[{ valor: ',', rotulo: 'Vírgula (1.234,56)' }, { valor: '.', rotulo: 'Ponto (1,234.56)' }]}
          />
        </div>
      )}
    </Janela>
  );
}

function LancarDaLinha({
  linha,
  cadastros,
  aoFechar,
  aoConcluir,
}: {
  linha: Linha;
  cadastros: ReturnType<typeof useCadastrosBasicos>;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const { api, avisar } = useFinanceiro();
  const entrada = paraCentavos(linha.valor) > 0;
  const [categoriaId, setCategoriaId] = useState('');
  const [centroId, setCentroId] = useState('');
  const [descricao, setDescricao] = useState(linha.descricao);
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo={entrada ? 'Lançar entrada a partir do extrato' : 'Lançar saída a partir do extrato'}
      subtitulo={`${formatarData(linha.data)} · ${formatarBRL(linha.valor)} — entra já paga e conciliada.`}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={!categoriaId}
            onClick={async () => {
              setSalvando(true);
              try {
                await api.lancarDoExtrato(linha.id, { categoriaId, centroCustoId: centroId || null, descricao });
                avisar('Lançado e conciliado.');
                aoConcluir();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível lançar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            Lançar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3">
        <Campo rotulo="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <SeletorCategoria categorias={cadastros.categorias} natureza={entrada ? 'receita' : 'despesa'} valor={categoriaId} aoMudar={setCategoriaId} />
        <SeletorCentro centros={cadastros.centros} valor={centroId} aoMudar={setCentroId} />
      </div>
    </Janela>
  );
}
