/**
 * Recorrências: aluguel, internet, mensalidades — o que se repete. O sistema
 * gera cada ocorrência em contas a pagar/receber até 60 dias à frente; mudar
 * o molde vale para as próximas, e as já geradas se editam uma a uma.
 */

import { useState } from 'react';
import { Pencil, Plus, RefreshCw } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Recorrencia } from '../../api/tipos';
import { formatarBRL, type Dinheiro } from '../../util/dinheiro';
import { formatarData, hojeISO } from '../../util/datas';
import { FREQUENCIAS } from '../../rotulos';
import { Botao, Campo, CampoDinheiro, Carregando, Etiqueta, Janela, Marcador, Seletor, Vazio, cartao, tabela, texto } from '../../ui/base';
import { SeletorCategoria, SeletorCentro, SeletorPessoa, useCadastrosBasicos, type PessoaEscolhida } from '../../ui/seletores';

export function Recorrencias() {
  const { api, pode, avisar } = useFinanceiro();
  const lista = useDados(() => api.recorrencias(), [api]);
  const [editando, setEditando] = useState<Recorrencia | 'nova' | null>(null);
  const [gerando, setGerando] = useState(false);
  return (
    <div className={cartao}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-700">
        <p className={`text-sm ${texto.suave}`}>As ocorrências aparecem em contas a pagar e a receber até 60 dias antes de vencer.</p>
        <div className="flex gap-2">
          {pode('operacao', 'criar') && (
            <Botao pequeno icone={<RefreshCw className="h-3.5 w-3.5" />} carregando={gerando}
              onClick={async () => {
                setGerando(true);
                try {
                  const r = await api.gerarRecorrencias();
                  avisar(r.gerados ? `${r.gerados} lançamento(s) gerado(s).` : 'Nada novo a gerar: tudo em dia.');
                  lista.recarregar();
                } catch (e) {
                  avisar(e instanceof Error ? e.message : 'Não foi possível gerar.', 'erro');
                } finally {
                  setGerando(false);
                }
              }}>
              Gerar próximos lançamentos
            </Botao>
          )}
          {(pode('cadastros', 'criar') || pode('operacao', 'criar')) && (
            <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditando('nova')}>Nova recorrência</Botao>
          )}
        </div>
      </div>
      {!lista.dados ? <Carregando /> : lista.dados.length === 0 ? (
        <Vazio titulo="Nenhuma recorrência.">Cadastre o aluguel, a internet ou a mensalidade de um cliente uma vez só.</Vazio>
      ) : (
        <table className={tabela.base}>
          <thead className={tabela.cabeca}>
            <tr>
              <th className={tabela.celulaCabeca}>Descrição</th>
              <th className={tabela.celulaCabeca}>Frequência</th>
              <th className={tabela.celulaCabeca}>Próximo vencimento</th>
              <th className={`${tabela.celulaCabeca} text-right`}>Valor</th>
              <th className={tabela.celulaCabeca} />
            </tr>
          </thead>
          <tbody>
            {lista.dados.map((r) => (
              <tr key={r.id} className={tabela.linha}>
                <td className={tabela.celula}>
                  <p className={r.ativa ? texto.titulo : 'text-gray-400 line-through'}>
                    <Etiqueta tom={r.tipo === 'receber' ? 'info' : 'neutro'}>{r.tipo === 'receber' ? 'Receber' : 'Pagar'}</Etiqueta> {r.descricao}
                  </p>
                  <p className={`text-xs ${texto.suave}`}>{r.categoriaNome}{r.pessoaNome ? ` · ${r.pessoaNome}` : ''} · {r.gerados} gerado(s)</p>
                </td>
                <td className={tabela.celula}>
                  {FREQUENCIAS[r.frequencia]}{r.diaVencimento ? `, dia ${r.diaVencimento}` : ''}
                  {r.fim && <p className={`text-xs ${texto.suave}`}>até {formatarData(r.fim)}</p>}
                </td>
                <td className={tabela.celula}>{r.proximaOcorrencia ? formatarData(r.proximaOcorrencia) : '—'}</td>
                <td className={tabela.numero}>{formatarBRL(r.valor)}</td>
                <td className={`${tabela.celula} text-right`}>
                  {(pode('cadastros', 'editar') || pode('operacao', 'editar')) && (
                    <Botao pequeno variante="fantasma" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(r)}>Editar</Botao>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editando && (
        <EditorRecorrencia
          recorrencia={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); lista.recarregar(); }}
        />
      )}
    </div>
  );
}

function EditorRecorrencia({ recorrencia, aoFechar, aoSalvar }: { recorrencia: Recorrencia | null; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const cadastros = useCadastrosBasicos();
  const [tipo, setTipo] = useState(recorrencia?.tipo ?? 'pagar');
  const [descricao, setDescricao] = useState(recorrencia?.descricao ?? '');
  const [valor, setValor] = useState<Dinheiro | null>(recorrencia?.valor ?? null);
  const [categoriaId, setCategoriaId] = useState(recorrencia?.categoriaId ?? '');
  const [centroId, setCentroId] = useState(recorrencia?.centroCustoId ?? '');
  const [pessoa, setPessoa] = useState<PessoaEscolhida>(recorrencia?.pessoaId ? { id: recorrencia.pessoaId, nome: recorrencia.pessoaNome ?? '' } : null);
  const [frequencia, setFrequencia] = useState(recorrencia?.frequencia ?? 'mensal');
  const [dia, setDia] = useState(String(recorrencia?.diaVencimento ?? 10));
  const [inicio, setInicio] = useState(recorrencia?.inicio ?? hojeISO());
  const [fim, setFim] = useState(recorrencia?.fim ?? '');
  const [ativa, setAtiva] = useState(recorrencia?.ativa ?? true);
  const [salvando, setSalvando] = useState(false);
  const porMes = !['semanal', 'quinzenal'].includes(frequencia);
  return (
    <Janela
      titulo={recorrencia ? 'Editar recorrência' : 'Nova recorrência'}
      subtitulo={recorrencia ? 'Vale para as próximas ocorrências; as já geradas ficam como estão.' : undefined}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={descricao.trim().length < 2 || !valor || !categoriaId}
            onClick={async () => {
              setSalvando(true);
              const dados = {
                tipo, descricao, valor, categoriaId, centroCustoId: centroId || null, pessoaId: pessoa?.id ?? null,
                frequencia, diaVencimento: porMes ? Number(dia) : null, fim: fim || null,
                ...(recorrencia ? { ativa } : { inicio }),
              };
              try {
                if (recorrencia) await api.editarRecorrencia(recorrencia.id, dados);
                else await api.criarRecorrencia(dados);
                avisar(recorrencia ? 'Recorrência atualizada.' : 'Recorrência criada e lançamentos gerados.');
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
        <Seletor rotulo="Tipo" value={tipo} disabled={Boolean(recorrencia)} onChange={(e) => { setTipo(e.target.value as 'pagar' | 'receber'); setCategoriaId(''); }}
          opcoes={[{ valor: 'pagar', rotulo: 'A pagar' }, { valor: 'receber', rotulo: 'A receber' }]} />
        <CampoDinheiro rotulo="Valor" valor={valor} aoMudar={setValor} />
        <Campo rotulo="Descrição" className="sm:col-span-2" placeholder="Ex.: Aluguel da sede" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <SeletorCategoria categorias={cadastros.categorias} natureza={tipo === 'pagar' ? 'despesa' : 'receita'} valor={categoriaId} aoMudar={setCategoriaId} />
        <SeletorCentro centros={cadastros.centros} valor={centroId} aoMudar={setCentroId} />
        <div className="sm:col-span-2">
          <SeletorPessoa valor={pessoa} aoMudar={setPessoa} rotulo={tipo === 'pagar' ? 'Fornecedor' : 'Cliente'} papel={tipo === 'pagar' ? 'fornecedor' : 'cliente'} />
        </div>
        <Seletor rotulo="Frequência" value={frequencia} onChange={(e) => setFrequencia(e.target.value)} opcoes={Object.entries(FREQUENCIAS).map(([valor, rotulo]) => ({ valor, rotulo }))} />
        {porMes && <Campo rotulo="Dia do vencimento" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} ajuda="31 vira o último dia nos meses mais curtos." />}
        {!recorrencia && <Campo rotulo="Começa em" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />}
        <Campo rotulo="Termina em" dica="opcional" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        {recorrencia && <Marcador rotulo="Ativa" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />}
      </div>
    </Janela>
  );
}
