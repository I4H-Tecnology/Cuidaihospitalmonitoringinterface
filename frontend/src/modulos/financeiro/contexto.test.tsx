import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { ProvedorFinanceiro, useAcao, useDados } from './contexto';
import type { ClienteFinanceiro } from './api/cliente';

/*
 * Contrato que as áreas do financeiro assumem ao soltar `recarregar()` com
 * `void` e ao esperar `executar(...)` sem try/catch: nenhum dos dois rejeita.
 * Falha vira estado na tela (erro, aviso vermelho), o carregamento termina e
 * nenhum aviso de sucesso aparece por engano.
 */
const apiFalsa = { sessao: vi.fn().mockResolvedValue({ permissoes: [] }) } as unknown as ClienteFinanceiro;

function Provedor({ children }: { children: ReactNode }) {
  return <ProvedorFinanceiro api={apiFalsa} navegar={() => {}}>{children}</ProvedorFinanceiro>;
}

describe('useDados (financeiro): recarregar nunca rejeita', () => {
  it('traz os dados e sai do carregamento', async () => {
    const { result } = renderHook(() => useDados(async () => ['a', 'b'], []));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.dados).toEqual(['a', 'b']);
    expect(result.current.erro).toBeNull();
  });

  it('falha: mostra a mensagem do erro, sai do carregamento, mantém o dado anterior e não rejeita', async () => {
    const buscar = vi.fn().mockResolvedValueOnce('primeiro').mockRejectedValue(new Error('Conta não encontrada.'));
    const { result } = renderHook(() => useDados<string>(buscar, []));
    await waitFor(() => expect(result.current.dados).toBe('primeiro'));

    await expect(act(() => result.current.recarregar())).resolves.toBeUndefined();
    expect(result.current.erro).toBe('Conta não encontrada.');
    expect(result.current.carregando).toBe(false);
    expect(result.current.dados).toBe('primeiro'); // não pisca vazio
  });

  it('valor que não é Error vira a mensagem padrão', async () => {
    const { result } = renderHook(() => useDados(async () => { throw 'texto solto'; }, []));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toBe('Não foi possível carregar.');
  });
});

describe('useAcao (financeiro): executar nunca rejeita', () => {
  it('sucesso devolve o resultado e só avisa quando há mensagem de sucesso', async () => {
    const { result } = renderHook(() => useAcao(), { wrapper: Provedor });
    let valor: unknown;
    await act(async () => { valor = await result.current.executar(async () => 7); });
    expect(valor).toBe(7);
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => { await result.current.executar(async () => 1, 'Folha fechada.'); });
    expect(await screen.findByRole('status')).toHaveTextContent('Folha fechada.');
  });

  it('falha devolve null, mostra aviso de ERRO, nenhum de sucesso, e termina o "ocupado"', async () => {
    const { result } = renderHook(() => useAcao(), { wrapper: Provedor });
    let valor: unknown = 'sentinela';
    await act(async () => {
      valor = await result.current.executar(async () => { throw new Error('Saldo insuficiente.'); }, 'Pago.');
    });
    expect(valor).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent('Saldo insuficiente.');
    expect(screen.queryByRole('status')).toBeNull(); // a mensagem de sucesso não pode aparecer
    expect(result.current.ocupado).toBe(false);
  });
});
