import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { Emprestimos } from './Emprestimos';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Empréstimos: registrar um contrato termina buscando a lista de novo (`void lista.recarregar()`). */

const conta = { id: 'c-1', nome: 'Banco X', tipo: 'corrente', banco: 'X', agencia: null, numero: null, ativa: true, saldo: '1000.00', ultimoMovimento: null };
const contrato = {
  id: 'e-1', pessoaId: 'pe-1', credorNome: 'Banco Alfa', contaNome: 'Banco X', descricao: 'Capital de giro — Banco Alfa', sistema: 'price',
  valorPrincipal: '20000.00', taxaMensal: '1.4900', prazo: 12, carencia: 0, dataContratacao: '2026-11-01', primeiroVencimento: '2026-12-01',
  custosIniciais: '0.00', canceladoEm: null, parcelas: 12, parcelasPagas: 0, proximoVencimento: '2026-12-01', saldoDevedor: '20000.00',
};
const totais = (n: number) => ({ contratos: n, principal: n ? '20000.00' : '0.00', saldoDevedor: n ? '20000.00' : '0.00' });

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['capital:criar', 'cadastros:criar'] }),
    contas: vi.fn().mockResolvedValue([conta]),
    categorias: vi.fn().mockResolvedValue([]),
    centros: vi.fn().mockResolvedValue([]),
    pessoas: vi.fn().mockResolvedValue({ total: 1, itens: [{ id: 'pe-1', nome: 'Banco Alfa', documento: null }] }),
    emprestimos: vi.fn().mockResolvedValueOnce({ itens: [], totais: totais(0) }).mockResolvedValue({ itens: [contrato], totais: totais(1) }),
    criarEmprestimo: vi.fn().mockResolvedValue(contrato),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Emprestimos />
    </ProvedorFinanceiro>,
  );
  return api;
}

async function preencherContrato(janela: HTMLElement) {
  await userEvent.click(within(janela).getByPlaceholderText(/Buscar por nome/));
  await userEvent.click(await within(janela).findByRole('button', { name: /Banco Alfa/ }));
  await userEvent.selectOptions(within(janela).getByLabelText('Dinheiro entrou na conta'), 'c-1');
  await userEvent.type(within(janela).getByLabelText('Valor emprestado'), '20000');
  await userEvent.type(within(janela).getByLabelText(/^Taxa/), '1,49');
}

describe('Capital › Empréstimos', () => {
  it('registrar um contrato: exige credor, conta e valor, manda, avisa e a lista passa a mostrá-lo', async () => {
    const api = montar();
    await screen.findByText('Nenhum empréstimo.');

    await userEvent.click(screen.getByRole('button', { name: 'Novo empréstimo' }));
    const janela = await screen.findByRole('dialog');
    const registrar = within(janela).getByRole('button', { name: 'Registrar empréstimo' });
    expect(registrar).toBeDisabled(); // sem credor, conta e valor não registra
    await preencherContrato(janela);
    expect(registrar).toBeEnabled();
    await userEvent.click(registrar);

    expect(await screen.findByText('Empréstimo registrado: entrada no caixa e parcelas em contas a pagar.')).toBeInTheDocument();
    expect(api.criarEmprestimo).toHaveBeenCalledWith(expect.objectContaining({
      pessoaId: 'pe-1', contaId: 'c-1', sistema: 'price', taxaMensal: '1.49', prazo: 12, valorPrincipal: expect.stringContaining('20000'),
    }));
    expect(await screen.findByText('Capital de giro — Banco Alfa')).toBeInTheDocument();
    expect(api.emprestimos).toHaveBeenCalledTimes(2);
  });

  it('a API recusar: avisa o motivo e a janela continua aberta', async () => {
    const api = montar({ criarEmprestimo: vi.fn().mockRejectedValue(new Error('Conta sem saldo inicial.')) });
    await screen.findByText('Nenhum empréstimo.');

    await userEvent.click(screen.getByRole('button', { name: 'Novo empréstimo' }));
    const janela = await screen.findByRole('dialog');
    await preencherContrato(janela);
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar empréstimo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Conta sem saldo inicial.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.emprestimos).toHaveBeenCalledTimes(1);
  });
});
