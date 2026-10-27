import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from './api';

/**
 * Carrega dado da API para uma tela: estado de carregando, erro legível e
 * `recarregar`. As telas novas usavam o mesmo bloco de 20 linhas cada; aqui
 * fica uma vez, e com o cuidado que o bloco copiado esquecia: resposta que
 * chega depois de outra mais nova (filtro trocado rápido) é descartada.
 *
 * `buscar` recebe o tenant; `chave` muda quando os parâmetros mudam.
 */
export function useDados<T>(buscar: (tenantId: string) => Promise<T>, chave: unknown[] = [], intervaloMs?: number) {
  const { tenantId } = useAuth();
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);
  const funcao = useRef(buscar);
  funcao.current = buscar;

  const recarregar = useCallback(async () => {
    if (!tenantId) return;
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const resultado = await funcao.current(tenantId);
      if (meu !== pedido.current) return;
      setDados(resultado);
      setErro(null);
    } catch (err) {
      if (meu !== pedido.current) return;
      setErro(err instanceof ApiError
        ? (err.status === 403 ? 'Seu perfil não tem acesso a estes dados.' : err.message)
        : 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.');
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, ...chave]);

  useEffect(() => { recarregar(); }, [recarregar]);

  useEffect(() => {
    if (!intervaloMs) return;
    const id = window.setInterval(recarregar, intervaloMs);
    return () => window.clearInterval(id);
  }, [recarregar, intervaloMs]);

  return { dados, carregando, erro, recarregar, setDados };
}

/** Executa uma ação de escrita guardando "enviando" e a mensagem de erro. */
export function useAcao() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const executar = useCallback(async <R,>(acao: () => Promise<R>): Promise<R | undefined> => {
    setEnviando(true);
    setErro(null);
    try {
      return await acao();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente de novo.');
      return undefined;
    } finally {
      setEnviando(false);
    }
  }, []);
  return { enviando, erro, setErro, executar };
}
