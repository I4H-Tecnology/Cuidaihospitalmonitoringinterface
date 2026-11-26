import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { Investimentos } from './Investimentos';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Investimentos: registrar o rendimento termina buscando as contas de novo (`void lista.recarregar()`). */

const cdb = {
  id: 'c-9', nome: 'CDB Banco X', tipo: 'investimento', banco: 'X', agencia: null, numero: null, ativa: true, saldo: '10000.00', ultimoMovimento: null,
  aplicado: '9500.00', resgatado: '0.00', rendimentoAcumulado: '500.00',
};

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['capital:editar', 'cadastros:criar'] }),
    investimentos: vi.fn().mockResolvedValueOnce({ contas: [cdb], total: '10000.00' })
      .mockResolvedValue({ contas: [{ ...cdb, saldo: '10120.00', rendimentoAcumulado: '620.00' }], total: '10120.00' }),
    atualizarInvestimento: vi.fn().mockResolvedValue({}),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Investimentos />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Capital › Investimentos', () => {
  it('registrar o rendimento: manda o saldo do banco, avisa e a lista passa a mostrar o saldo novo', async () => {
    const api = montar();
    await screen.findByText('CDB Banco X');

    await userEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    const janela = await screen.findByRole('dialog');
    const saldo = within(janela).getByLabelText('Saldo que o banco mostra');
    await userEvent.clear(saldo);
    await userEvent.type(saldo, '10120');
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText('Rendimento registrado.')).toBeInTheDocument();
    expect(api.atualizarInvestimento).toHaveBeenCalledWith('c-9', expect.stringContaining('10120'), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect((await screen.findAllByText(/10\.120,00/)).length).toBeGreaterThan(0);
    expect(api.investimentos).toHaveBeenCalledTimes(2);
  });

  it('a API recusar: avisa o motivo e não busca de novo', async () => {
    const api = montar({ atualizarInvestimento: vi.fn().mockRejectedValue(new Error('Data em período fechado.')) });
    await screen.findByText('CDB Banco X');

    await userEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Data em período fechado.');
    expect(api.investimentos).toHaveBeenCalledTimes(1);
  });
});
