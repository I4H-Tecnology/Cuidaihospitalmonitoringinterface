import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../contexto';
import { Caixa } from './Caixa';
import type { ClienteFinanceiro } from '../api/cliente';

/*
 * Caixa e bancos: depois de criar uma conta a partir daqui, a tela busca de novo as contas (o saldo e o cartão
 * novo) e o extrato da conta escolhida (`recarregar`, com dois `void`).
 */

const conta = { id: 'c-1', nome: 'Banco X', tipo: 'corrente', banco: 'X', agencia: null, numero: null, ativa: true, saldo: '1000.00', ultimoMovimento: null };
const extrato = {
  conta: { id: 'c-1', nome: 'Banco X', tipo: 'corrente' }, de: '2026-11-01', ate: '2026-11-22', saldoAnterior: '1000.00',
  entradas: '0.00', saidas: '0.00', saldoFinal: '1000.00', movimentos: [],
};

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['cadastros:criar', 'operacao:criar'] }),
    contas: vi.fn().mockResolvedValueOnce([conta]).mockResolvedValue([conta, { ...conta, id: 'c-2', nome: 'Reserva' }]),
    extrato: vi.fn().mockResolvedValue(extrato),
    criarConta: vi.fn().mockResolvedValue({ ...conta, id: 'c-2', nome: 'Reserva' }),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Caixa />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Caixa e bancos', () => {
  it('nova conta: cria, avisa e busca de novo as contas e o extrato, que passam a mostrar a conta nova', async () => {
    const api = montar();
    await screen.findByRole('button', { name: /Banco X/ });
    await waitFor(() => expect(api.extrato).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Nova conta' }));
    const janela = await screen.findByRole('dialog');
    const criar = within(janela).getByRole('button', { name: 'Criar conta' });
    expect(criar).toBeDisabled(); // sem nome não cria
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Reserva');
    await userEvent.click(criar);

    expect(await screen.findByText('Conta criada.')).toBeInTheDocument();
    expect(api.criarConta).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Reserva', tipo: 'corrente' }));
    expect(await screen.findByRole('button', { name: /Reserva/ })).toBeInTheDocument();
    await waitFor(() => expect(api.extrato).toHaveBeenCalledTimes(2));
    expect(api.contas).toHaveBeenCalledTimes(2);
  });

  it('a API recusar a conta: avisa o motivo e a janela continua aberta', async () => {
    const api = montar({ criarConta: vi.fn().mockRejectedValue(new Error('Já existe uma conta com esse nome.')) });
    await screen.findByRole('button', { name: /Banco X/ });

    await userEvent.click(screen.getByRole('button', { name: 'Nova conta' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Banco X');
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma conta com esse nome.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.contas).toHaveBeenCalledTimes(1);
  });
});
