import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientCard } from './PatientCard';
import type { PacienteResumo } from '../../data/api';

const paciente: PacienteResumo = {
  id: 'p-1',
  nome: 'Ana Paula Souza',
  idade: 81,
  status: 'internado',
  dataAdmissao: '2026-11-01',
  situacao: 'attention',
  ocorrenciasAbertas: 1,
  quedasConfirmadas: 0,
  totalOcorrencias: 3,
};

describe('PatientCard (acessível pelo teclado)', () => {
  it('é um botão, alcançável pela tecla Tab', () => {
    render(<PatientCard paciente={paciente} onClick={() => {}} />);
    const cartao = screen.getByRole('button');
    expect(cartao).toHaveAttribute('tabindex', '0');
    expect(cartao).toHaveTextContent('Ana Paula Souza');
  });

  it('abre com clique, com Enter e com Espaço', async () => {
    const abrir = vi.fn();
    render(<PatientCard paciente={paciente} onClick={abrir} />);
    const cartao = screen.getByRole('button');

    await userEvent.click(cartao);
    expect(abrir).toHaveBeenCalledTimes(1);

    cartao.focus();
    await userEvent.keyboard('{Enter}');
    expect(abrir).toHaveBeenCalledTimes(2);

    await userEvent.keyboard(' ');
    expect(abrir).toHaveBeenCalledTimes(3);
  });

  it('ignora outras teclas', async () => {
    const abrir = vi.fn();
    render(<PatientCard paciente={paciente} onClick={abrir} />);
    screen.getByRole('button').focus();
    await userEvent.keyboard('a{Escape}{ArrowDown}');
    expect(abrir).not.toHaveBeenCalled();
  });

  it('sem onClick, Enter não quebra', async () => {
    render(<PatientCard paciente={paciente} />);
    screen.getByRole('button').focus();
    await expect(userEvent.keyboard('{Enter}')).resolves.not.toThrow();
  });
});
