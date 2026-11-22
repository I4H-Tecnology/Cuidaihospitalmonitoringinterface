import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { Recorrencias } from './Recorrencias';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Recorrências: gerar os próximos lançamentos e salvar uma recorrência terminam buscando a lista de novo (`void lista.recarregar()`). */

const aluguel = {
  id: 'r-1', tipo: 'pagar', descricao: 'Aluguel da sede', valor: '1500.00', categoriaId: 'cat-1', categoriaNome: 'Aluguel', centroCustoId: null,
  centroCustoNome: null, pessoaId: null, pessoaNome: null, frequencia: 'mensal', diaVencimento: 10, inicio: '2026-01-01', fim: null,
  geradoAte: '2026-12-10', ativa: true, gerados: 11, proximaOcorrencia: '2026-12-10',
};

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['cadastros:criar', 'cadastros:editar', 'operacao:criar', 'operacao:editar'] }),
    contas: vi.fn().mockResolvedValue([]),
    categorias: vi.fn().mockResolvedValue([]),
    centros: vi.fn().mockResolvedValue([]),
    recorrencias: vi.fn().mockResolvedValueOnce([aluguel]).mockResolvedValue([{ ...aluguel, gerados: 12 }]),
    gerarRecorrencias: vi.fn().mockResolvedValue({ gerados: 1, ate: '2027-01-10' }),
    editarRecorrencia: vi.fn().mockResolvedValue(aluguel),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Recorrencias />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Cadastros › Recorrências', () => {
  it('gerar os próximos lançamentos: avisa quantos nasceram e busca a lista de novo', async () => {
    const api = montar();
    await screen.findByText(/11 gerado\(s\)/);

    await userEvent.click(screen.getByRole('button', { name: 'Gerar próximos lançamentos' }));

    expect(await screen.findByText('1 lançamento(s) gerado(s).')).toBeInTheDocument();
    expect(await screen.findByText(/12 gerado\(s\)/)).toBeInTheDocument();
    expect(api.recorrencias).toHaveBeenCalledTimes(2);
  });

  it('nada a gerar: diz que está tudo em dia', async () => {
    montar({ gerarRecorrencias: vi.fn().mockResolvedValue({ gerados: 0, ate: '2027-01-10' }) });
    await screen.findByText(/11 gerado\(s\)/);

    await userEvent.click(screen.getByRole('button', { name: 'Gerar próximos lançamentos' }));

    expect(await screen.findByText('Nada novo a gerar: tudo em dia.')).toBeInTheDocument();
  });

  it('editar: manda o molde alterado, avisa e busca a lista de novo', async () => {
    const api = montar();
    await screen.findByText(/11 gerado\(s\)/);

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const janela = await screen.findByRole('dialog');
    const descricao = within(janela).getByLabelText('Descrição');
    await userEvent.clear(descricao);
    await userEvent.type(descricao, 'Aluguel da sede e garagem');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Recorrência atualizada.')).toBeInTheDocument();
    expect(api.editarRecorrencia).toHaveBeenCalledWith('r-1', expect.objectContaining({ descricao: 'Aluguel da sede e garagem', frequencia: 'mensal', diaVencimento: 10, ativa: true }));
    expect(await screen.findByText(/12 gerado\(s\)/)).toBeInTheDocument();
    expect(api.recorrencias).toHaveBeenCalledTimes(2);
  });
});
