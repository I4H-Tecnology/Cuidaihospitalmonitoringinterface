/**
 * Seletores de cadastro usados nos formulários: conta, categoria, centro de
 * custo e pessoa (com busca e cadastro na hora, que é o caminho mais comum:
 * o fornecedor novo aparece quando chega a primeira nota dele).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, UserRound } from 'lucide-react';
import { useDados, useFinanceiro } from '../contexto';
import type { Categoria, Conta, CentroCusto, Pessoa } from '../api/tipos';
import { formatarBRL } from '../util/dinheiro';
import { Botao, Campo, Janela, Rotulo, Seletor, entrada, texto } from './base';

export function useCadastrosBasicos() {
  const { api } = useFinanceiro();
  const contas = useDados(() => api.contas(), [api]);
  const categorias = useDados(() => api.categorias(), [api]);
  const centros = useDados(() => api.centros(), [api]);
  return {
    contas: contas.dados ?? ([] as Conta[]),
    categorias: categorias.dados ?? ([] as Categoria[]),
    centros: centros.dados ?? ([] as CentroCusto[]),
    carregando: contas.carregando || categorias.carregando || centros.carregando,
    recarregar: () => Promise.all([contas.recarregar(), categorias.recarregar(), centros.recarregar()]),
  };
}

export function SeletorConta({
  contas,
  valor,
  aoMudar,
  rotulo = 'Conta',
  tipos,
  className,
}: {
  contas: Conta[];
  valor: string;
  aoMudar: (id: string) => void;
  rotulo?: string;
  tipos?: Conta['tipo'][];
  className?: string;
}) {
  const opcoes = contas
    .filter((c) => c.ativa && (!tipos || tipos.includes(c.tipo)))
    .map((c) => ({ valor: c.id, rotulo: `${c.nome} — ${formatarBRL(c.saldo)}` }));
  return <Seletor rotulo={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)} opcoes={opcoes} vazio="Escolha a conta" className={className} />;
}

export function SeletorCategoria({
  categorias,
  natureza,
  valor,
  aoMudar,
  rotulo = 'Categoria',
  grupos,
  className,
  vazio = 'Escolha a categoria',
}: {
  categorias: Categoria[];
  natureza?: 'receita' | 'despesa';
  valor: string;
  aoMudar: (id: string) => void;
  rotulo?: string;
  grupos?: string[];
  className?: string;
  vazio?: string;
}) {
  const opcoes = categorias
    .filter((c) => (c.ativa || c.id === valor) && (!natureza || c.natureza === natureza) && (!grupos || grupos.includes(c.grupo)))
    .map((c) => ({ valor: c.id, rotulo: `${c.codigo ? `${c.codigo} ` : ''}${c.nome}`, grupo: c.grupoRotulo }));
  return <Seletor rotulo={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)} opcoes={opcoes} vazio={vazio} className={className} />;
}

export function SeletorCentro({
  centros,
  valor,
  aoMudar,
  rotulo = 'Centro de custo',
  className,
}: {
  centros: CentroCusto[];
  valor: string;
  aoMudar: (id: string) => void;
  rotulo?: string;
  className?: string;
}) {
  const opcoes = centros.filter((c) => c.ativo || c.id === valor).map((c) => ({ valor: c.id, rotulo: c.nome }));
  return <Seletor rotulo={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)} opcoes={opcoes} vazio="Nenhum" className={className} />;
}

export type PessoaEscolhida = { id: string; nome: string } | null;

export function SeletorPessoa({
  valor,
  aoMudar,
  rotulo = 'Pessoa',
  papel,
  tipoPadrao = 'juridica',
}: {
  valor: PessoaEscolhida;
  aoMudar: (pessoa: PessoaEscolhida) => void;
  rotulo?: string;
  papel?: 'cliente' | 'fornecedor';
  tipoPadrao?: 'fisica' | 'juridica';
}) {
  const { api, pode } = useFinanceiro();
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [resultados, setResultados] = useState<Pessoa[]>([]);
  const [criando, setCriando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const temporizador = window.setTimeout(async () => {
      try {
        const pagina = await api.pessoas({ busca, limite: 8 });
        setResultados(pagina.itens);
      } catch {
        setResultados([]);
      }
    }, 250);
    return () => window.clearTimeout(temporizador);
  }, [api, busca, aberto]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const podeCriar = pode('cadastros', 'criar') || pode('operacao', 'criar');

  return (
    <div ref={caixa} className="relative">
      <Rotulo>{rotulo}</Rotulo>
      {valor ? (
        <div className={`${entrada} flex items-center justify-between`}>
          <span className="inline-flex items-center gap-2 truncate">
            <UserRound className="h-4 w-4 text-gray-400" />
            {valor.nome}
          </span>
          <button type="button" className="text-xs text-[var(--fin-primaria,#0A7EA4)] hover:underline" onClick={() => aoMudar(null)}>
            trocar
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${entrada} pl-9`}
            placeholder="Buscar por nome ou CPF/CNPJ…"
            value={busca}
            onFocus={() => setAberto(true)}
            onChange={(e) => {
              setBusca(e.target.value);
              setAberto(true);
            }}
          />
        </div>
      )}
      {aberto && !valor && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {resultados.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              onClick={() => {
                aoMudar({ id: p.id, nome: p.nome });
                setAberto(false);
                setBusca('');
              }}
            >
              <span className={texto.normal}>{p.nome}</span>
              <span className={`text-xs ${texto.suave}`}>{p.documento ?? ''}</span>
            </button>
          ))}
          {resultados.length === 0 && <p className={`px-3 py-2 text-sm ${texto.suave}`}>Ninguém encontrado.</p>}
          {podeCriar && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-[var(--fin-primaria,#0A7EA4)] hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
              onClick={() => {
                setCriando(true);
                setAberto(false);
              }}
            >
              <Plus className="h-4 w-4" />
              {busca.trim() ? `Cadastrar "${busca.trim()}"` : 'Cadastrar nova pessoa'}
            </button>
          )}
        </div>
      )}
      {criando && (
        <CadastroRapido
          nomeInicial={busca.trim()}
          tipoPadrao={tipoPadrao}
          papel={papel}
          aoFechar={() => setCriando(false)}
          aoCriar={(p) => {
            aoMudar({ id: p.id, nome: p.nome });
            setCriando(false);
            setBusca('');
          }}
        />
      )}
    </div>
  );
}

function CadastroRapido({
  nomeInicial,
  tipoPadrao,
  papel,
  aoFechar,
  aoCriar,
}: {
  nomeInicial: string;
  tipoPadrao: 'fisica' | 'juridica';
  papel?: 'cliente' | 'fornecedor';
  aoFechar: () => void;
  aoCriar: (p: Pessoa) => void;
}) {
  const { api, avisar } = useFinanceiro();
  const [tipo, setTipo] = useState(tipoPadrao);
  const [nome, setNome] = useState(nomeInicial);
  const [documento, setDocumento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const rotuloDoc = useMemo(() => (tipo === 'fisica' ? 'CPF' : 'CNPJ'), [tipo]);
  return (
    <Janela
      titulo="Cadastrar pessoa"
      subtitulo="O resto do cadastro (PIX, banco, endereço) pode ser completado depois em Cadastros."
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
              try {
                aoCriar(await api.criarPessoa({
                  tipo, nome, documento: documento || null,
                  cliente: papel === 'cliente', fornecedor: papel === 'fornecedor',
                }));
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'Não foi possível cadastrar.', 'erro');
              } finally {
                setSalvando(false);
              }
            }}
          >
            Cadastrar
          </Botao>
        </>
      }
    >
      <div className="grid gap-3">
        <Seletor
          rotulo="Tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'fisica' | 'juridica')}
          opcoes={[
            { valor: 'juridica', rotulo: 'Pessoa jurídica (empresa)' },
            { valor: 'fisica', rotulo: 'Pessoa física' },
          ]}
        />
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Campo rotulo={rotuloDoc} dica="opcional" value={documento} onChange={(e) => setDocumento(e.target.value)} />
      </div>
    </Janela>
  );
}
