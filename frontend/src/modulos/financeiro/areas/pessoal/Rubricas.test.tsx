import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { Rubricas } from './Rubricas';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Rubricas da folha: salvar termina buscando a lista de novo (`void lista.recarregar()`). */

const horaExtra = {
  id: 'ru-1', codigo: 'HE50', nome: 'Hora extra 50%', tipo: 'provento', calculo: 'horas', percentual: '150', incideInss: true, incideIrrf: true,
  incideFgts: true, deduzIrrf: false, entraDsr: true, credorId: null, credorNome: null, sistema: null, ativa: true,
};

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['pessoal:criar', 'pessoal:editar'] }),
    rubricas: vi.fn().mockResolvedValueOnce([horaExtra]).mockResolvedValue([{ ...horaExtra, nome: 'Hora extra 50% (plantão)' }, { ...horaExtra, id: 'ru-2', codigo: 'ADN', nome: 'Adicional noturno' }]),
    salvarRubrica: vi.fn().mockResolvedValue(horaExtra),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Rubricas />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Pessoal › Rubricas', () => {
  it('editar: manda o que mudou, avisa e a lista passa a mostrar o nome novo', async () => {
    const api = montar();
    await screen.findByText('Hora extra 50%');

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const janela = await screen.findByRole('dialog');
    const nome = within(janela).getByLabelText('Nome');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Hora extra 50% (plantão)');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Rubrica salva.')).toBeInTheDocument();
    expect(api.salvarRubrica).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'HE50', nome: 'Hora extra 50% (plantão)', percentual: '150' }), 'ru-1');
    expect(await screen.findByText('Adicional noturno')).toBeInTheDocument();
    expect(api.rubricas).toHaveBeenCalledTimes(2);
  });

  it('a API recusar: avisa o motivo e não busca de novo', async () => {
    const api = montar({ salvarRubrica: vi.fn().mockRejectedValue(new Error('Já existe rubrica com esse código.')) });
    await screen.findByText('Hora extra 50%');

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe rubrica com esse código.');
    expect(api.rubricas).toHaveBeenCalledTimes(1);
  });
});
