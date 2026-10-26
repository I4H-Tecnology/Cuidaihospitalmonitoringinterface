import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { CentroCusto } from '../../api/tipos';
import { Botao, Campo, Carregando, Etiqueta, Janela, Marcador, Seletor, Vazio, cartao, tabela, texto } from '../../ui/base';

export function Centros() {
  const { api, pode } = useFinanceiro();
  const centros = useDados(() => api.centros(), [api]);
  const [editando, setEditando] = useState<CentroCusto | 'novo' | null>(null);
  const nomes = new Map((centros.dados ?? []).map((c) => [c.id, c.nome]));
  return (
    <div className={cartao}>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-700">
        <p className={`text-sm ${texto.suave}`}>“De quem é este gasto”: setor, unidade, projeto. Toda conta pode ser repartida entre centros.</p>
        {pode('cadastros', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditando('novo')}>Novo centro</Botao>}
      </div>
      {!centros.dados ? <Carregando /> : centros.dados.length === 0 ? (
        <Vazio titulo="Nenhum centro de custo.">Opcional: sem eles, os relatórios mostram a empresa inteira.</Vazio>
      ) : (
        <table className={tabela.base}>
          <tbody>
            {centros.dados.map((c) => (
              <tr key={c.id} className={tabela.linha}>
                <td className={tabela.celula}>
                  {c.codigo && <span className={`mr-2 ${texto.suave}`}>{c.codigo}</span>}
                  <span className={texto.titulo}>{c.nome}</span>
                  {c.paiId && <span className={`text-xs ${texto.suave}`}> · em {nomes.get(c.paiId)}</span>} {!c.ativo && <Etiqueta>Inativo</Etiqueta>}
                </td>
                <td className={`${tabela.celula} text-right`}>
                  {pode('cadastros', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(c)}>Editar</Botao>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editando && (
        <EditorCentro
          centro={editando === 'novo' ? null : editando}
          centros={centros.dados ?? []}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); centros.recarregar(); }}
        />
      )}
    </div>
  );
}

function EditorCentro({ centro, centros, aoFechar, aoSalvar }: { centro: CentroCusto | null; centros: CentroCusto[]; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const [nome, setNome] = useState(centro?.nome ?? '');
  const [codigo, setCodigo] = useState(centro?.codigo ?? '');
  const [paiId, setPaiId] = useState(centro?.paiId ?? '');
  const [ativo, setAtivo] = useState(centro?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  return (
    <Janela
      titulo={centro ? `Editar ${centro.nome}` : 'Novo centro de custo'}
      aoFechar={aoFechar}
      largura="max-w-md"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={nome.trim().length < 2}
            onClick={async () => {
              setSalvando(true);
              const dados = { nome, codigo: codigo || null, paiId: paiId || null, ...(centro ? { ativo } : {}) };
              try {
                if (centro) await api.editarCentro(centro.id, dados);
                else await api.criarCentro(dados);
                avisar('Centro de custo salvo.');
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
      <div className="grid gap-3">
        <Campo rotulo="Nome" placeholder="Ex.: Enfermagem, Unidade Centro" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo="Código" dica="opcional" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        <Seletor rotulo="Dentro de" value={paiId} onChange={(e) => setPaiId(e.target.value)} vazio="Nenhum (principal)"
          opcoes={centros.filter((c) => c.id !== centro?.id).map((c) => ({ valor: c.id, rotulo: c.nome }))} />
        {centro && <Marcador rotulo="Ativo" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />}
      </div>
    </Janela>
  );
}
