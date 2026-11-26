import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalEncerrarOcorrencia } from './ModalEncerrarOcorrencia';
import { ApiError } from '../data/api';
import type { OcorrenciaResumo } from '../data/api';

const ocorrencia = {
  id: 'o-1', tipoEvento: 'queda', status: 'aberta', dataHora: '2026-11-19T10:00:00Z',
  ambienteId: 'a-1', ambienteNome: 'Quarto 101', pacienteNome: 'Ana Paula Souza',
} as unknown as OcorrenciaResumo;

async function preencherEEnviar() {
  await userEvent.click(screen.getByRole('radio', { name: /Falso positivo/ }));
  await userEvent.type(screen.getByLabelText('Observação'), 'Era a bengala caindo');
  await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
}

/*
 * Encerrar uma ocorrência é o fluxo que gera o rótulo real da detecção. Se a
 * API recusar, a janela precisa dizer isso, continuar aberta com o que a
 * pessoa digitou, e não deixar uma rejeição sem tratamento.
 */
describe('ModalEncerrarOcorrencia: falha do callback', () => {
  it('sucesso: confirma com a classificação e a observação', async () => {
    const confirmar = vi.fn().mockResolvedValue(undefined);
    render(<ModalEncerrarOcorrencia ocorrencia={ocorrencia} aoFechar={() => {}} aoConfirmar={confirmar} />);
    await preencherEEnviar();
    expect(confirmar).toHaveBeenCalledWith('falso_positivo', 'Era a bengala caindo');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falha da API: mostra a mensagem, sai do "Encerrando…" e mantém o que foi digitado', async () => {
    const confirmar = vi.fn().mockRejectedValue(new ApiError('Ocorrência já foi encerrada por outra pessoa.', 409, {}));
    const fechar = vi.fn();
    render(<ModalEncerrarOcorrencia ocorrencia={ocorrencia} aoFechar={fechar} aoConfirmar={confirmar} />);
    await preencherEEnviar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocorrência já foi encerrada por outra pessoa.');
    expect(screen.getByRole('button', { name: 'Encerrar' })).toBeEnabled(); // não ficou preso em "Encerrando…"
    expect(screen.getByLabelText('Observação')).toHaveValue('Era a bengala caindo');
    expect(screen.getByRole('radio', { name: /Falso positivo/ })).toBeChecked();
    expect(fechar).not.toHaveBeenCalled();
  });

  it('erro qualquer vira a mensagem padrão', async () => {
    const confirmar = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ModalEncerrarOcorrencia ocorrencia={ocorrencia} aoFechar={() => {}} aoConfirmar={confirmar} />);
    await preencherEEnviar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível encerrar a ocorrência. Tente de novo.');
  });

  it('uma nova tentativa que dá certo some com a mensagem de erro', async () => {
    const confirmar = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    render(<ModalEncerrarOcorrencia ocorrencia={ocorrencia} aoFechar={() => {}} aoConfirmar={confirmar} />);
    await preencherEEnviar();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmar).toHaveBeenCalledTimes(2);
  });
});
