import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { Contas } from './Contas';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Cadastro de contas: criar e editar terminam buscando a lista de novo (`void contas.recarregar()`). */

const conta = { id: 'c-1', nome: 'Banco X', tipo: 'corrente', banco: 'X', agencia: null, numero: null, ativa: true, saldo: '1000.00', ultimoMovimento: null };

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['cadastros:criar', 'cadastros:editar'] }),
    contas: vi.fn().mockResolvedValueOnce([conta]).mockResolvedValue([{ ...conta, nome: 'Banco X (principal)' }, { ...conta, id: 'c-2', nome: 'Reserva' }]),
    criarConta: vi.fn().mockResolvedValue({ ...conta, id: 'c-2', nome: 'Reserva' }),
    editarConta: vi.fn().mockResolvedValue({ ...conta, nome: 'Banco X (principal)' }),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Contas />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Cadastros › Contas', () => {
  it('criar: manda os dados, avisa e a lista passa a mostrar a conta nova', async () => {
    const api = montar();
    await screen.findByText('Banco X');

    await userEvent.click(screen.getByRole('button', { name: 'Nova conta' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Reserva');
    await userEvent.type(within(janela).getByLabelText(/^Banco/), 'Banco Y');
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Conta criada.')).toBeInTheDocument();
    expect(api.criarConta).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Reserva', banco: 'Banco Y' }));
    expect(await screen.findByText('Reserva')).toBeInTheDocument();
    expect(api.contas).toHaveBeenCalledTimes(2);
  });

  it('editar: manda a alteração, avisa e a lista passa a mostrar o nome novo', async () => {
    const api = montar();
    await screen.findByText('Banco X');

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const janela = await screen.findByRole('dialog');
    const nome = within(janela).getByLabelText('Nome');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Banco X (principal)');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Conta atualizada.')).toBeInTheDocument();
    expect(api.editarConta).toHaveBeenCalledWith('c-1', expect.objectContaining({ nome: 'Banco X (principal)', ativa: true }));
    await waitFor(() => expect(screen.getByText('Banco X (principal)')).toBeInTheDocument());
    expect(api.contas).toHaveBeenCalledTimes(2);
  });
});
