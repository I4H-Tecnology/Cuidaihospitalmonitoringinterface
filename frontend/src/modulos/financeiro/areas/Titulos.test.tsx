import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../contexto';
import { Titulos } from './Titulos';
import type { ClienteFinanceiro } from '../api/cliente';

/*
 * Contas a pagar: depois de pagar uma parcela (uma a uma ou em lote), a tela busca de novo a lista, o resumo
 * do topo e os cadastros (`recarregarTudo`, com três `void`): a parcela sai da lista e os números mudam.
 */

const conta = { id: 'c-1', nome: 'Banco X', tipo: 'corrente', banco: 'X', agencia: null, numero: null, ativa: true, saldo: '1000.00', ultimoMovimento: null };
const parcela = {
  id: 'pa-1', numero: 1, totalParcelas: 1, vencimento: '2026-11-30', valor: '500.00', valorPago: '0.00', saldo: '500.00', status: 'aberta', vencida: false,
  tituloId: 't-1', tituloNumero: 7, tipo: 'pagar', descricao: 'Conta de luz', documento: null, competencia: '2026-11', origem: 'manual', pessoaId: null,
  pessoaNome: null, categoriaNome: 'Energia', categorias: 1, ultimoPagamento: null,
};
const resumo = { vencido: '0.00', vencidoQuantidade: 0, hoje: '0.00', hojeQuantidade: 0, proximos7: '500.00', proximos30: '500.00', liquidadoNoMes: '0.00' };

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['operacao:criar', 'operacao:editar'] }),
    contas: vi.fn().mockResolvedValue([conta]),
    categorias: vi.fn().mockResolvedValue([]),
    centros: vi.fn().mockResolvedValue([]),
    parcelas: vi.fn().mockResolvedValueOnce({ quantidade: 1, valor: '500.00', saldo: '500.00', itens: [parcela] })
      .mockResolvedValue({ quantidade: 0, valor: '0.00', saldo: '0.00', itens: [] }),
    resumoTitulos: vi.fn().mockResolvedValue(resumo),
    baixar: vi.fn().mockResolvedValue({}),
    baixarEmLote: vi.fn().mockResolvedValue({ quitadas: 1 }),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Titulos tipo="pagar" />
    </ProvedorFinanceiro>,
  );
  return api;
}

const conferirRecarga = async (api: Record<string, ReturnType<typeof vi.fn>>) => {
  expect(await screen.findByText('Nenhuma conta a pagar em aberto.')).toBeInTheDocument(); // a parcela paga saiu da lista
  expect(api.parcelas).toHaveBeenCalledTimes(2);
  expect(api.resumoTitulos).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(api.contas).toHaveBeenCalledTimes(2)); // o saldo da conta mudou
};

describe('Contas a pagar', () => {
  it('pagar uma parcela: registra, avisa e busca de novo a lista, o resumo e as contas', async () => {
    const api = montar();
    await screen.findByText('Conta de luz');

    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByText('Pagamento registrado.')).toBeInTheDocument();
    expect(api.baixar).toHaveBeenCalledWith('pa-1', expect.objectContaining({ contaId: 'c-1', forma: 'pix', valor: '500.00' }));
    await conferirRecarga(api);
  });

  it('pagar em lote: registra as selecionadas, avisa quantas e busca de novo', async () => {
    const api = montar();
    await screen.findByText('Conta de luz');

    await userEvent.click(screen.getByLabelText('Selecionar Conta de luz'));
    await userEvent.click(screen.getByRole('button', { name: 'Pagar selecionadas' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('button', { name: /^Pagar R\$/ }));

    expect(await screen.findByText('1 parcela(s) quitada(s).')).toBeInTheDocument();
    expect(api.baixarEmLote).toHaveBeenCalledWith(expect.objectContaining({ parcelaIds: ['pa-1'], contaId: 'c-1' }));
    await conferirRecarga(api);
  });

  it('a API recusar o pagamento: avisa o motivo e a parcela continua na lista', async () => {
    const api = montar({ baixar: vi.fn().mockRejectedValue(new Error('Período já fechado.')) });
    await screen.findByText('Conta de luz');

    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Período já fechado.');
    expect(screen.getByText('Conta de luz')).toBeInTheDocument();
    expect(api.parcelas).toHaveBeenCalledTimes(1);
  });
});
