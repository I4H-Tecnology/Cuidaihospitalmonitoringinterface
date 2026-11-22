import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../contexto';
import { Planejamento } from './Planejamento';
import type { ClienteFinanceiro } from '../api/cliente';

/*
 * Orçamento: o seletor de ano lista os anos em ordem crescente (dois atrás até o próximo), com o ano atual
 * escolhido, e trocar o ano busca o orçamento daquele ano. A lista é montada fora de ordem ([0, 1, -1, -2]),
 * então o teste prova que ela é ordenada; com anos de quatro dígitos `sort()` puro dá o mesmo resultado.
 */

const orcamento = (ano: number) => ({ ano, meses: [], linhas: [] });

function montar() {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['planejamento:editar'] }),
    categorias: vi.fn().mockResolvedValue([]),
    orcamento: vi.fn(async (ano: number) => orcamento(ano)),
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Planejamento />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Orçamento: seletor de ano', () => {
  it('lista os anos em ordem crescente, com o ano atual escolhido', async () => {
    const atual = new Date().getFullYear();
    montar();

    const seletor = await screen.findByRole('combobox');

    const anos = [...(seletor as HTMLSelectElement).options].map((o) => o.value);
    expect(anos).toEqual([atual - 2, atual - 1, atual, atual + 1].map(String));
    expect(seletor).toHaveValue(String(atual));
  });

  it('trocar o ano busca o orçamento daquele ano', async () => {
    const atual = new Date().getFullYear();
    const api = montar();
    const seletor = await screen.findByRole('combobox');
    await vi.waitFor(() => expect(api.orcamento).toHaveBeenCalledWith(atual));

    await userEvent.selectOptions(seletor, String(atual + 1));

    await vi.waitFor(() => expect(api.orcamento).toHaveBeenCalledWith(atual + 1));
  });
});
