import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmarComMotivo } from './base';

async function digitarMotivoEConfirmar() {
  await userEvent.type(screen.getByLabelText(/Motivo/), 'Lançado em duplicidade');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar título' }));
}

/*
 * Cancelar, estornar e reabrir passam por esta janela. Se o callback falhar,
 * a falha precisa aparecer aqui (e não virar rejeição sem tratamento) e o
 * botão precisa voltar a funcionar, com o motivo digitado ainda lá.
 */
describe('ConfirmarComMotivo: falha do callback', () => {
  it('sucesso: confirma com o motivo sem espaços nas pontas e não mostra erro', async () => {
    const confirmar = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmarComMotivo titulo="Cancelar" mensagem="Certeza?" rotuloAcao="Cancelar título" aoConfirmar={confirmar} aoFechar={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Motivo/), '  Duplicado  ');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar título' }));
    expect(confirmar).toHaveBeenCalledWith('Duplicado');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falha: mostra a mensagem, libera o botão e mantém o motivo digitado', async () => {
    const confirmar = vi.fn().mockRejectedValue(new Error('Título já tem baixa, não pode ser cancelado.'));
    const fechar = vi.fn();
    render(<ConfirmarComMotivo titulo="Cancelar" mensagem="Certeza?" rotuloAcao="Cancelar título" aoConfirmar={confirmar} aoFechar={fechar} />);
    await digitarMotivoEConfirmar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Título já tem baixa, não pode ser cancelado.');
    expect(screen.getByLabelText(/Motivo/)).toHaveValue('Lançado em duplicidade');
    expect(screen.getByRole('button', { name: 'Cancelar título' })).toBeEnabled();
    expect(fechar).not.toHaveBeenCalled();
  });

  it('valor que não é Error vira a mensagem padrão', async () => {
    const confirmar = vi.fn().mockRejectedValue('texto solto');
    render(<ConfirmarComMotivo titulo="Cancelar" mensagem="Certeza?" rotuloAcao="Cancelar título" aoConfirmar={confirmar} aoFechar={() => {}} />);
    await digitarMotivoEConfirmar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir.');
  });
});
