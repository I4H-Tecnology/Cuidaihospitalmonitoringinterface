import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { PlanoDeContas } from './PlanoDeContas';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Plano de contas: criar e editar uma categoria terminam buscando as categorias de novo (`void categorias.recarregar()`). */

const grupo = { chave: 'despesa_fin', rotulo: 'Despesas financeiras', natureza: 'despesa', linhaDre: 'despesas_financeiras', atividade: 'financiamento' };
const categoria = {
  id: 'cat-1', paiId: null, grupo: 'despesa_fin', grupoRotulo: 'Despesas financeiras', natureza: 'despesa', codigo: null,
  nome: 'Tarifas bancárias', comportamento: 'variavel', sistema: null, ativa: true, usos: 4,
};

function montar() {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['cadastros:criar', 'cadastros:editar'] }),
    grupos: vi.fn().mockResolvedValue({ grupos: [grupo], atividades: {} }),
    categorias: vi.fn().mockResolvedValueOnce([categoria]).mockResolvedValue([{ ...categoria, nome: 'Tarifas e taxas' }, { ...categoria, id: 'cat-2', nome: 'Juros pagos' }]),
    criarCategoria: vi.fn().mockResolvedValue({ ...categoria, id: 'cat-2', nome: 'Juros pagos' }),
    editarCategoria: vi.fn().mockResolvedValue({ ...categoria, nome: 'Tarifas e taxas' }),
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <PlanoDeContas />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Cadastros › Plano de contas', () => {
  it('criar uma categoria no grupo: manda os dados, avisa e a lista passa a mostrá-la', async () => {
    const api = montar();
    await screen.findByText('Tarifas bancárias');

    await userEvent.click(screen.getByRole('button', { name: 'Categoria' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Juros pagos');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Plano de contas atualizado.')).toBeInTheDocument();
    expect(api.criarCategoria).toHaveBeenCalledWith({ nome: 'Juros pagos', codigo: null, comportamento: 'variavel', grupo: 'despesa_fin', paiId: null });
    expect(await screen.findByText('Juros pagos')).toBeInTheDocument();
    expect(api.categorias).toHaveBeenCalledTimes(2);
  });

  it('editar uma categoria: manda a alteração e a lista passa a mostrar o nome novo', async () => {
    const api = montar();
    await screen.findByText('Tarifas bancárias');

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const janela = await screen.findByRole('dialog');
    const nome = within(janela).getByLabelText('Nome');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Tarifas e taxas');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Plano de contas atualizado.')).toBeInTheDocument();
    expect(api.editarCategoria).toHaveBeenCalledWith('cat-1', expect.objectContaining({ nome: 'Tarifas e taxas', ativa: true }));
    expect(await screen.findByText('Tarifas e taxas')).toBeInTheDocument();
    expect(api.categorias).toHaveBeenCalledTimes(2);
  });
});
