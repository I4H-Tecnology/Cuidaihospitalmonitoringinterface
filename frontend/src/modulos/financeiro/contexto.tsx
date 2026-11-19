/**
 * O que toda tela do financeiro compartilha: o cliente da API, a sessão (quem
 * é, de qual empresa, o que pode) e os avisos de canto de tela.
 *
 * As permissões vêm da própria API (`/sessao`), não do hospedeiro: o servidor
 * é quem decide, e a tela só esconde o que ele já vai recusar.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import type { ClienteFinanceiro } from './api/cliente';
import type { Acao, Recurso, Sessao } from './api/tipos';
import type { AreaFinanceira } from './navegacao';

interface Aviso {
  id: number;
  texto: string;
  tipo: 'sucesso' | 'erro';
}

interface ValorDoContexto {
  api: ClienteFinanceiro;
  sessao: Sessao | null;
  pode: (recurso: Recurso, acao: Acao) => boolean;
  avisar: (texto: string, tipo?: Aviso['tipo']) => void;
  navegar: (area: AreaFinanceira) => void;
  recarregarSessao: () => Promise<void>;
  /** Cadastros do sistema hospedeiro que podem virar clientes (ex.: pacientes). */
  pessoasExternas?: () => Promise<Array<{ referenciaExterna: string; nome: string; observacao?: string }>>;
  rotuloPessoasExternas?: string;
}

const Contexto = createContext<ValorDoContexto | null>(null);

export function ProvedorFinanceiro(props: {
  api: ClienteFinanceiro;
  navegar: (area: AreaFinanceira) => void;
  pessoasExternas?: ValorDoContexto['pessoasExternas'];
  rotuloPessoasExternas?: string;
  children: ReactNode;
}) {
  const { api, navegar, pessoasExternas, rotuloPessoasExternas, children } = props;
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximo = useRef(1);

  const recarregarSessao = useCallback(async () => {
    try {
      setSessao(await api.sessao());
    } catch {
      setSessao(null);
    }
  }, [api]);

  useEffect(() => {
    void recarregarSessao();
  }, [recarregarSessao]);

  const avisar = useCallback((texto: string, tipo: Aviso['tipo'] = 'sucesso') => {
    const id = proximo.current++;
    setAvisos((atuais) => [...atuais, { id, texto, tipo }]);
    window.setTimeout(() => setAvisos((atuais) => atuais.filter((a) => a.id !== id)), tipo === 'erro' ? 7000 : 4000);
  }, []);

  const valor = useMemo<ValorDoContexto>(() => {
    const permissoes = new Set(sessao?.permissoes ?? []);
    return {
      api,
      sessao,
      pode: (recurso, acao) => permissoes.has(`${recurso}:${acao}`),
      avisar,
      navegar,
      recarregarSessao,
      pessoasExternas,
      rotuloPessoasExternas,
    };
  }, [api, sessao, avisar, navegar, recarregarSessao, pessoasExternas, rotuloPessoasExternas]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="fixed bottom-4 right-4 z-[70] flex w-80 flex-col gap-2" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === 'erro' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${
              a.tipo === 'erro'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
            }`}
          >
            {a.tipo === 'erro' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="flex-1">{a.texto}</span>
            <button type="button" aria-label="Fechar aviso" onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}>
              <X className="h-4 w-4 opacity-60" />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useFinanceiro(): ValorDoContexto {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useFinanceiro precisa estar dentro de <ProvedorFinanceiro>.');
  return valor;
}

/**
 * Carrega dado da API com estado de carregando/erro. Ao recarregar, o dado
 * anterior continua na tela (esmaecido pela área) em vez de piscar vazio.
 */
export function useDados<T>(buscar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const versao = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recarregar = useCallback(async () => {
    const minha = ++versao.current;
    setCarregando(true);
    try {
      const resultado = await buscar();
      if (minha === versao.current) {
        setDados(resultado);
        setErro(null);
      }
    } catch (e) {
      if (minha === versao.current) setErro(e instanceof Error ? e.message : 'Não foi possível carregar.');
    } finally {
      if (minha === versao.current) setCarregando(false);
    }
  }, deps);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, carregando, erro, recarregar, setDados };
}

/** Executa uma ação da API com aviso de sucesso ou erro. Devolve o resultado, ou null se falhou. */
export function useAcao() {
  const { avisar } = useFinanceiro();
  const [ocupado, setOcupado] = useState(false);
  const executar = useCallback(
    async <R,>(acao: () => Promise<R>, sucesso?: string): Promise<R | null> => {
      setOcupado(true);
      try {
        const resultado = await acao();
        if (sucesso) avisar(sucesso);
        return resultado;
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'Não foi possível concluir.', 'erro');
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [avisar],
  );
  return { executar, ocupado };
}
