/**
 * Pessoas: a outra ponta de todo lançamento — clientes, fornecedores,
 * colaboradores, sócios e bancos. Um cadastro só, com papéis.
 */

import { useEffect, useState } from 'react';
import { Download, Pencil, Plus, Search } from 'lucide-react';
import { useDados, useFinanceiro } from '../../contexto';
import type { Pessoa } from '../../api/tipos';
import { formatarBRL } from '../../util/dinheiro';
import { AreaTexto, Botao, Campo, Carregando, Etiqueta, Janela, Marcador, Seletor, Vazio, cartao, entrada, tabela, texto } from '../../ui/base';

const PAPEIS = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'cliente', rotulo: 'Clientes' },
  { valor: 'fornecedor', rotulo: 'Fornecedores' },
  { valor: 'colaborador', rotulo: 'Colaboradores' },
  { valor: 'socio', rotulo: 'Sócios' },
];

function formatarDocumento(doc: string | null): string {
  if (!doc) return '';
  if (doc.length === 11) return `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`;
  if (doc.length === 14) return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`;
  return doc;
}

export function Pessoas() {
  const { api, pode, avisar, pessoasExternas, rotuloPessoasExternas } = useFinanceiro();
  const [busca, setBusca] = useState('');
  const [aplicada, setAplicada] = useState('');
  const [papel, setPapel] = useState('');
  const [inativas, setInativas] = useState(false);
  const [limite, setLimite] = useState(50);
  const [editando, setEditando] = useState<Pessoa | 'nova' | null>(null);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setAplicada(busca), 300);
    return () => window.clearTimeout(t);
  }, [busca]);

  const pessoas = useDados(
    () => api.pessoas({ busca: aplicada || undefined, papel: papel || undefined, incluirInativas: inativas, limite }),
    [api, aplicada, papel, inativas, limite],
  );

  return (
    <div className={cartao}>
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-700">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className={`${entrada} pl-9`} placeholder="Nome, nome fantasia ou CPF/CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Seletor value={papel} onChange={(e) => setPapel(e.target.value)} opcoes={PAPEIS} className="w-44" />
        <Marcador rotulo="Mostrar inativas" checked={inativas} onChange={(e) => setInativas(e.target.checked)} />
        {pessoasExternas && pode('cadastros', 'criar') && (
          <Botao pequeno icone={<Download className="h-3.5 w-3.5" />} carregando={importando}
            onClick={async () => {
              setImportando(true);
              try {
                const externas = await pessoasExternas();
                const r = await api.importarPessoas(externas);
                avisar(`${r.criadas} cadastro(s) novo(s), ${r.atualizadas} atualizado(s).`);
                void pessoas.recarregar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível importar.', 'erro');
              } finally {
                setImportando(false);
              }
            }}>
            {rotuloPessoasExternas ?? 'Importar do sistema'}
          </Botao>
        )}
        {pode('cadastros', 'criar') && <Botao variante="primario" pequeno icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditando('nova')}>Nova pessoa</Botao>}
      </div>
      {!pessoas.dados ? <Carregando /> : pessoas.dados.itens.length === 0 ? <Vazio titulo="Ninguém encontrado." /> : (
        <>
          <table className={tabela.base}>
            <thead className={tabela.cabeca}>
              <tr>
                <th className={tabela.celulaCabeca}>Nome</th>
                <th className={tabela.celulaCabeca}>CPF/CNPJ</th>
                <th className={tabela.celulaCabeca}>Contato</th>
                <th className={tabela.celulaCabeca}>Papéis</th>
                <th className={tabela.celulaCabeca} />
              </tr>
            </thead>
            <tbody>
              {pessoas.dados.itens.map((p) => (
                <tr key={p.id} className={tabela.linha}>
                  <td className={tabela.celula}>
                    <p className={p.ativa ? texto.titulo : 'text-gray-400 line-through'}>{p.nome}</p>
                    {p.nomeFantasia && <p className={`text-xs ${texto.suave}`}>{p.nomeFantasia}</p>}
                  </td>
                  <td className={`${tabela.celula} tabular-nums`}>{formatarDocumento(p.documento)}</td>
                  <td className={tabela.celula}>{[p.email, p.telefone].filter(Boolean).join(' · ')}</td>
                  <td className={tabela.celula}>
                    <span className="inline-flex flex-wrap gap-1">
                      {p.cliente && <Etiqueta tom="info">Cliente</Etiqueta>}
                      {p.fornecedor && <Etiqueta>Fornecedor</Etiqueta>}
                      {p.colaborador && <Etiqueta>Colaborador</Etiqueta>}
                      {p.socio && <Etiqueta>Sócio</Etiqueta>}
                      {p.referenciaExterna && <Etiqueta tom="bom">Vinculado</Etiqueta>}
                    </span>
                  </td>
                  <td className={`${tabela.celula} text-right`}>
                    {pode('cadastros', 'editar') && <Botao pequeno variante="fantasma" icone={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditando(p)}>Editar</Botao>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pessoas.dados.total > pessoas.dados.itens.length && (
            <div className="border-t border-gray-100 p-3 text-center dark:border-gray-700">
              <Botao pequeno onClick={() => setLimite((l) => l + 50)}>Mostrar mais ({pessoas.dados.total - pessoas.dados.itens.length})</Botao>
            </div>
          )}
        </>
      )}
      {editando && (
        <EditorPessoa
          pessoaId={editando === 'nova' ? null : editando.id}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); void pessoas.recarregar(); }}
        />
      )}
    </div>
  );
}

function EditorPessoa({ pessoaId, aoFechar, aoSalvar }: { pessoaId: string | null; aoFechar: () => void; aoSalvar: () => void }) {
  const { api, avisar } = useFinanceiro();
  const existente = useDados(() => (pessoaId ? api.pessoa(pessoaId) : Promise.resolve(null)), [api, pessoaId]);
  const [form, setForm] = useState<Partial<Pessoa>>({ tipo: 'juridica', ativa: true });
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (existente.dados) setForm(existente.dados);
  }, [existente.dados]);
  const muda = (campo: keyof Pessoa) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const sistema = Boolean(form.sistema);

  if (pessoaId && !existente.dados) {
    return <Janela titulo="Pessoa" aoFechar={aoFechar}><Carregando /></Janela>;
  }

  return (
    <Janela
      titulo={pessoaId ? `Editar ${form.nome ?? ''}` : 'Nova pessoa'}
      subtitulo={existente.dados?.resumo
        ? `A receber ${formatarBRL(existente.dados.resumo.aReceber)} · a pagar ${formatarBRL(existente.dados.resumo.aPagar)} · ${existente.dados.resumo.titulos} lançamento(s)`
        : undefined}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={salvando}
            disabled={(form.nome ?? '').trim().length < 2}
            onClick={async () => {
              setSalvando(true);
              const dados = {
                tipo: form.tipo, nome: form.nome, nomeFantasia: form.nomeFantasia || null, documento: form.documento || null,
                email: form.email || null, telefone: form.telefone || null, chavePix: form.chavePix || null,
                banco: form.banco || null, agencia: form.agencia || null, contaBancaria: form.contaBancaria || null,
                endereco: form.endereco || null, observacao: form.observacao || null,
                cliente: Boolean(form.cliente), fornecedor: Boolean(form.fornecedor), ativa: form.ativa !== false,
              };
              try {
                if (pessoaId) await api.editarPessoa(pessoaId, dados);
                else await api.criarPessoa(dados);
                avisar('Cadastro salvo.');
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
        <Seletor rotulo="Tipo" value={form.tipo} disabled={sistema} onChange={muda('tipo')}
          opcoes={[{ valor: 'juridica', rotulo: 'Pessoa jurídica' }, { valor: 'fisica', rotulo: 'Pessoa física' }]} />
        <Campo rotulo={form.tipo === 'fisica' ? 'CPF' : 'CNPJ'} dica="opcional" value={form.documento ?? ''} onChange={muda('documento')} />
        <Campo rotulo={form.tipo === 'fisica' ? 'Nome' : 'Razão social'} className="sm:col-span-2" value={form.nome ?? ''} onChange={muda('nome')} />
        {form.tipo === 'juridica' && <Campo rotulo="Nome fantasia" className="sm:col-span-2" value={form.nomeFantasia ?? ''} onChange={muda('nomeFantasia')} disabled={sistema} />}
        <Campo rotulo="E-mail" value={form.email ?? ''} onChange={muda('email')} disabled={sistema} />
        <Campo rotulo="Telefone" value={form.telefone ?? ''} onChange={muda('telefone')} disabled={sistema} />
        <Campo rotulo="Chave PIX" value={form.chavePix ?? ''} onChange={muda('chavePix')} />
        <Campo rotulo="Banco" value={form.banco ?? ''} onChange={muda('banco')} />
        <Campo rotulo="Agência" value={form.agencia ?? ''} onChange={muda('agencia')} />
        <Campo rotulo="Conta" value={form.contaBancaria ?? ''} onChange={muda('contaBancaria')} />
        <Campo rotulo="Endereço" className="sm:col-span-2" value={form.endereco ?? ''} onChange={muda('endereco')} disabled={sistema} />
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <Marcador rotulo="Cliente" checked={Boolean(form.cliente)} disabled={sistema} onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.checked }))} />
          <Marcador rotulo="Fornecedor" checked={Boolean(form.fornecedor)} disabled={sistema} onChange={(e) => setForm((f) => ({ ...f, fornecedor: e.target.checked }))} />
          {pessoaId && <Marcador rotulo="Ativa" checked={form.ativa !== false} disabled={sistema} onChange={(e) => setForm((f) => ({ ...f, ativa: e.target.checked }))} />}
        </div>
        <AreaTexto rotulo="Observação" className="sm:col-span-2" value={form.observacao ?? ''} onChange={muda('observacao')} />
      </div>
    </Janela>
  );
}
