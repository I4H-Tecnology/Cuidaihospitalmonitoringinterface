import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAcao, useDados } from './useDados';
import { ApiError } from './api';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ tenantId: 'clinica-teste' }) }));

/*
 * Contrato que os ~90 pontos de "recarregar();" das telas assumem: a recarga
 * NUNCA rejeita. Falha vira estado (`erro`), o carregamento termina, e quem
 * chama pode soltar a promessa com `void` sem deixar rejeição sem tratamento.
 * Estes testes forçam a falha para provar isso.
 */
function adiavel<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
}

describe('useDados: recarregar nunca rejeita', () => {
  it('carrega, preenche os dados e sai do carregamento', async () => {
    const { result } = renderHook(() => useDados(async () => ({ total: 3 })));
    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.dados).toEqual({ total: 3 });
    expect(result.current.erro).toBeNull();
  });

  it('falha de rede: mostra a mensagem, sai do carregamento e recarregar() resolve', async () => {
    const { result } = renderHook(() => useDados(async () => { throw new TypeError('Failed to fetch'); }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toMatch(/Não foi possível falar com o servidor/);
    expect(result.current.dados).toBeNull();
    await expect(act(() => result.current.recarregar())).resolves.toBeUndefined();
  });

  it('403 diz que o perfil não tem acesso; outro erro da API mostra a mensagem dela', async () => {
    const proibido = renderHook(() => useDados(async () => { throw new ApiError('proibido', 403, {}); }));
    await waitFor(() => expect(proibido.result.current.carregando).toBe(false));
    expect(proibido.result.current.erro).toBe('Seu perfil não tem acesso a estes dados.');

    const quebrado = renderHook(() => useDados(async () => { throw new ApiError('Banco indisponível.', 503, {}); }));
    await waitFor(() => expect(quebrado.result.current.carregando).toBe(false));
    expect(quebrado.result.current.erro).toBe('Banco indisponível.');
  });

  it('depois de uma falha, uma recarga que dá certo limpa o erro e traz os dados', async () => {
    const buscar = vi.fn().mockRejectedValueOnce(new Error('caiu')).mockResolvedValue('de novo');
    const { result } = renderHook(() => useDados<string>(buscar));
    await waitFor(() => expect(result.current.erro).not.toBeNull());
    await act(() => result.current.recarregar());
    expect(result.current.erro).toBeNull();
    expect(result.current.dados).toBe('de novo');
    expect(result.current.carregando).toBe(false);
  });

  it('resposta que chega depois de uma mais nova é descartada', async () => {
    const lenta = adiavel<string>();
    const rapida = adiavel<string>();
    const buscar = vi.fn().mockReturnValueOnce(lenta.promessa).mockReturnValueOnce(rapida.promessa);
    const { result } = renderHook(() => useDados<string>(buscar));

    act(() => { void result.current.recarregar(); }); // 2º pedido, enquanto o 1º ainda não voltou
    await act(async () => { rapida.resolver('nova'); });
    await act(async () => { lenta.resolver('velha'); });

    expect(result.current.dados).toBe('nova');
    expect(result.current.carregando).toBe(false);
  });
});

describe('useAcao: executar nunca rejeita', () => {
  it('sucesso devolve o resultado e não deixa erro', async () => {
    const { result } = renderHook(() => useAcao());
    let valor: unknown;
    await act(async () => { valor = await result.current.executar(async () => 42); });
    expect(valor).toBe(42);
    expect(result.current.erro).toBeNull();
    expect(result.current.enviando).toBe(false);
  });

  it('falha devolve undefined, mostra o erro, termina o "enviando" e não rejeita', async () => {
    const { result } = renderHook(() => useAcao());
    let valor: unknown = 'sentinela';
    await act(async () => {
      valor = await result.current.executar(async () => { throw new ApiError('Login já usado.', 409, {}); });
    });
    expect(valor).toBeUndefined();
    expect(result.current.erro).toBe('Login já usado.');
    expect(result.current.enviando).toBe(false);
  });

  it('erro que não é da API vira a mensagem genérica', async () => {
    const { result } = renderHook(() => useAcao());
    await act(async () => { await result.current.executar(async () => { throw new Error('qualquer'); }); });
    expect(result.current.erro).toBe('Não foi possível concluir. Tente de novo.');
  });

  it('uma tentativa nova limpa o erro da anterior', async () => {
    const { result } = renderHook(() => useAcao());
    await act(async () => { await result.current.executar(async () => { throw new Error('x'); }); });
    expect(result.current.erro).not.toBeNull();
    await act(async () => { await result.current.executar(async () => 'ok'); });
    expect(result.current.erro).toBeNull();
  });
});
