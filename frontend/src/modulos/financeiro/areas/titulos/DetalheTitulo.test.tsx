import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { DetalheTitulo } from './DetalheTitulo';
import type { ClienteFinanceiro } from '../../api/cliente';

/*
 * Detalhe do título: depois de pagar uma parcela a janela busca o título de novo (a parcela passa a paga)
 * e avisa a lista de trás (`aoMudar`), que também se atualiza.
 */

const conta = { id: 'c-1', nome: 'Banco X', tipo: 'corrente', banco: 'X', agencia: null, numero: null, ativa: true, saldo: '1000.00', ultimoMovimento: null };
const parcelaAberta = { id: 'pa-1', numero: 1, vencimento: '2026-11-30', valor: '500.00', valorPago: '0.00', saldo: '500.00', status: 'aberta', vencida: false, codigoBarras: null, baixas: [] };
const titulo = {
  id: 't-1', numero: 7, tipo: 'pagar', pessoaId: null, pessoaNome: null, descricao: 'Conta de luz', documento: null, competencia: '2026-11',
  dataEmissao: '2026-11-01', valorTotal: '500.00', origem: 'manual', observacao: null, canceladoEm: null, motivoCancelamento: null, criadoPor: 'Ana',
  parcelas: [parcelaAberta], rateio: [{ id: 'r-1', categoriaId: 'cat-1', categoriaNome: 'Energia', grupo: 'despesas_administrativas', centroCustoId: null, centroCustoNome: null, valor: '500.00' }],
  historico: [], saldo: '500.00', editavel: true, temBaixa: false,
};

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['operacao:criar'] }),
    titulo: vi.fn().mockResolvedValueOnce(titulo)
      .mockResolvedValue({ ...titulo, saldo: '0.00', temBaixa: true, parcelas: [{ ...parcelaAberta, status: 'paga', valorPago: '500.00', saldo: '0.00' }] }),
    baixar: vi.fn().mockResolvedValue({}),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  const aoMudar = vi.fn();
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <DetalheTitulo tituloId="t-1" contas={[conta] as never} categorias={[]} centros={[]} aoFechar={() => {}} aoMudar={aoMudar} />
    </ProvedorFinanceiro>,
  );
  return { api, aoMudar };
}

describe('Detalhe do título', () => {
  it('pagar uma parcela: registra, busca o título de novo e avisa a lista', async () => {
    const { api, aoMudar } = montar();
    await screen.findByText(/Título 7/);

    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));
    await vi.waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2)); // o detalhe e, por cima, o pagamento
    const baixa = screen.getAllByRole('dialog')[1];
    await userEvent.click(within(baixa).getByRole('button', { name: 'Pagar' }));

    expect(await screen.findByText('Pagamento registrado.')).toBeInTheDocument();
    expect(api.baixar).toHaveBeenCalledWith('pa-1', expect.objectContaining({ contaId: 'c-1', valor: '500.00' }));
    await vi.waitFor(() => expect(api.titulo).toHaveBeenCalledTimes(2)); // a parcela passa a paga
    expect(aoMudar).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Pagar' })).toBeNull()); // já não há o que pagar
  });
});
