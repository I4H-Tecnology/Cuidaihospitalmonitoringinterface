import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { Centros } from './Centros';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Centros de custo: criar e editar terminam buscando a lista de novo (`void centros.recarregar()`). */

const centro = { id: 'ct-1', paiId: null, codigo: null, nome: 'Enfermagem', ativo: true };

function montar() {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['cadastros:criar', 'cadastros:editar'] }),
    centros: vi.fn().mockResolvedValueOnce([centro]).mockResolvedValue([{ ...centro, nome: 'Enfermagem noturna' }, { ...centro, id: 'ct-2', nome: 'Recepção' }]),
    criarCentro: vi.fn().mockResolvedValue({ ...centro, id: 'ct-2', nome: 'Recepção' }),
    editarCentro: vi.fn().mockResolvedValue({ ...centro, nome: 'Enfermagem noturna' }),
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Centros />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Cadastros › Centros de custo', () => {
  it('criar: manda os dados, avisa e a lista passa a mostrar o centro novo', async () => {
    const api = montar();
    await screen.findByText('Enfermagem');

    await userEvent.click(screen.getByRole('button', { name: 'Novo centro' }));
    const janela = await screen.findByRole('dialog');
    const salvar = within(janela).getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled(); // sem nome não salva
    await userEvent.type(within(janela).getByLabelText('Nome'), 'Recepção');
    await userEvent.click(salvar);

    expect(await screen.findByText('Centro de custo salvo.')).toBeInTheDocument();
    expect(api.criarCentro).toHaveBeenCalledWith({ nome: 'Recepção', codigo: null, paiId: null });
    expect(await screen.findByText('Recepção')).toBeInTheDocument();
    expect(api.centros).toHaveBeenCalledTimes(2);
  });

  it('editar: manda a alteração e a lista passa a mostrar o nome novo', async () => {
    const api = montar();
    await screen.findByText('Enfermagem');

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const janela = await screen.findByRole('dialog');
    const nome = within(janela).getByLabelText('Nome');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Enfermagem noturna');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Centro de custo salvo.')).toBeInTheDocument();
    expect(api.editarCentro).toHaveBeenCalledWith('ct-1', { nome: 'Enfermagem noturna', codigo: null, paiId: null, ativo: true });
    await waitFor(() => expect(screen.getByText('Enfermagem noturna')).toBeInTheDocument());
    expect(api.centros).toHaveBeenCalledTimes(2);
  });
});
