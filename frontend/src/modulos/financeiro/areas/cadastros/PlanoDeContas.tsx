/**
 * Plano de contas: os grupos são fixos (decidem a linha da DRE e a atividade
 * do fluxo de caixa); as categorias dentro deles são da empresa.
 */

import { useMemo, useState } from 'react';
import { Lock, Pencil, Plus } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Categoria, Grupo } from '../../api/tipos';
import { Botao, Campo, Carregando, Etiqueta, Janela, Marcador, Seletor, cartao, tabela, texto } from '../../ui/base';

const LINHA_DRE: Record<string, string> = {
  receita_bruta: 'Receita bruta', deducoes: 'Deduções', custos: 'Custos', despesas_pessoal: 'Pessoal',
  despesas_administrativas: 'Administrativas', despesas_comerciais: 'Comerciais', receitas_financeiras: 'Resultado financeiro',
  despesas_financeiras: 'Resultado financeiro', outras_receitas: 'Outras receitas', outras_despesas: 'Outras despesas',
  impostos_lucro: 'IRPJ/CSLL',
};

export function PlanoDeContas() {
  const { api, pode } = useFinanceiro();
  const categorias = useDados(() => api.categorias(), [api]);
  const grupos = useDados(() => api.grupos(), [api]);
  const [editando, setEditando] = useState<Categoria | { grupo: string } | null>(null);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, Categoria[]>();
    for (const c of categorias.dados ?? []) mapa.set(c.grupo, [...(mapa.get(c.grupo) ?? []), c]);
    return mapa;
  }, [categorias.dados]);

  if (!categorias.dados || !grupos.dados) return <Carregando />;

  return (
    <div className="space-y-4">
      <p className={`text-sm ${texto.suave}`}>
        Cada grupo diz onde a categoria cai no resultado (DRE) e no fluxo de caixa. Categorias com cadeado são usadas pelo
        próprio financeiro (folha, juros, empréstimos): podem ser renomeadas, não removidas.
      </p>
      {grupos.dados.grupos.map((g) => (
        <GrupoVista
          key={g.chave}
          grupo={g}
          categorias={porGrupo.get(g.chave) ?? []}
          podeCriar={pode('cadastros', 'criar')}
          podeEditar={pode('cadastros', 'editar')}
          aoNova={() => setEditando({ grupo: g.chave })}
          aoEditar={(c) => setEditando(c)}
        />
      ))}
      {editando && (
        <EditorCategoria
          categoria={'id' in editando ? editando : null}
          grupo={editando.grupo}
          grupos={grupos.dados.grupos}
          categorias={categorias.dados}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); categorias.recarregar(); }}
        />
      )}
    </div>
  );
}

function GrupoVista({
  grupo,
  categorias,
  podeCriar,
  podeEditar,
  aoNova,
  aoEditar,
}: {
  grupo: Grupo;
  categorias: Categoria[];
  podeCriar: boolean;
  podeEditar: boolean;
  aoNova: () => void;
  aoEditar: (c: Categoria) => void;
}) {
  const destino = grupo.linhaDre ? `DRE: ${LINHA_DRE[grupo.linhaDre] ?? grupo.linhaDre}` : 'Fora da DRE';
  return (
    <div className={cartao}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-2.5 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-sm font-semibold ${texto.titulo}`}>{grupo.rotulo}</h3>
          <Etiqueta tom={grupo.natureza === 'receita' ? 'info' : 'neutro'}>{grupo.natureza === 'receita' ? 'Entrada' : 'Saída'}</Etiqueta>
          <span className={`text-xs ${texto.suave}`}>{destino} · fluxo: {grupo.atividade}</span>
        </div>
        {podeCriar && <Botao pequeno variante="fantasma" icone={<Plus className="h-3.5 w-3.5" />} onClick={aoNova}>Categoria</Botao>}
      </div>
      {categorias.length > 0 && (
        <table className={tabela.base}>
          <tbody>
            {categorias.map((c) => (
              <tr key={c.id} className={tabela.linha}>
                <td className={tabela.celula}>
                  <span className={`${c.ativa ? texto.titulo : 'text-gray-400 line-through'} ${c.paiId ? 'pl-4' : ''}`}>
                    {c.codigo && <span className={`mr-2 ${texto.suave}`}>{c.codigo}</span>}
                    {c.nome}
                  </span>
                  {c.sistema && <Lock className="ml-1 inline h-3 w-3 text-gray-400" aria-label="Usada pelo sistema" />}
                </td>
                <td className={`${tabela.celula} w-28`}><Etiqueta>{c.comportamento === 'fixo' ? 'Fixa' : 'Variável'}</Etiqueta></td>
                <td className={`${tabela.celula} w-32 text-right ${texto.suave}`}>{c.usos} lançamento(s)</td>
                <td className={`${tabela.celula} w-24 text-right`}>
                  {podeEditar && <Botao pequeno variante="fantasma" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => aoEditar(c)}>Editar</Botao>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EditorCategoria({
  categoria,
  grupo,
  grupos,
  categorias,
  aoFechar,
  aoSalvar,
}: {
  categoria: Categoria | null;
  grupo: string;
  grupos: Grupo[];
  categorias: Categoria[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { api, avisar } = useFinanceiro();
  const [nome, setNome] = useState(categoria?.nome ?? '');
  const [codigo, setCodigo] = useState(categoria?.codigo ?? '');
  const [grupoEscolhido, setGrupo] = useState(grupo);
  const [paiId, setPaiId] = useState(categoria?.paiId ?? '');
  const [comportamento, setComportamento] = useState(categoria?.comportamento ?? 'variavel');
  const [ativa, setAtiva] = useState(categoria?.ativa ?? true);
  const [salvando, setSalvando] = useState(false);
  const natureza = grupos.find((g) => g.chave === grupo)?.natureza;
  const maes = categorias.filter((c) => c.grupo === grupoEscolhido && !c.paiId && c.id !== categoria?.id);
  return (
    <Janela
      titulo={categoria ? `Editar ${categoria.nome}` : 'Nova categoria'}
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
              const dados = { nome, codigo: codigo || null, comportamento, grupo: grupoEscolhido, ...(categoria ? { ativa } : { paiId: paiId || null }) };
              try {
                if (categoria) await api.editarCategoria(categoria.id, dados);
                else await api.criarCategoria(dados);
                avisar('Plano de contas atualizado.');
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
        <Seletor
          rotulo="Grupo"
          value={grupoEscolhido}
          disabled={Boolean(categoria?.sistema)}
          onChange={(e) => setGrupo(e.target.value)}
          opcoes={grupos.filter((g) => !categoria || g.natureza === natureza).map((g) => ({ valor: g.chave, rotulo: g.rotulo }))}
        />
        <Campo rotulo="Código" dica="opcional" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        {!categoria && (
          <Seletor rotulo="Subcategoria de" value={paiId} onChange={(e) => setPaiId(e.target.value)} vazio="Nenhuma (categoria principal)" opcoes={maes.map((m) => ({ valor: m.id, rotulo: m.nome }))} />
        )}
        <Seletor
          rotulo="Comportamento"
          value={comportamento}
          onChange={(e) => setComportamento(e.target.value as 'fixo' | 'variavel')}
          opcoes={[{ valor: 'fixo', rotulo: 'Fixa (não depende do volume)' }, { valor: 'variavel', rotulo: 'Variável (acompanha o volume)' }]}
        />
        {categoria && !categoria.sistema && <Marcador rotulo="Categoria ativa" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />}
      </div>
      <p className={`mt-3 text-xs ${texto.suave}`}>Fixa ou variável é o que permite calcular o ponto de equilíbrio na visão geral.</p>
    </Janela>
  );
}
