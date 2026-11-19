import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalAlta } from './ModalAlta';
import type { PacienteResumo } from '../../data/api';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ tenantId: 'clinica-teste' }) }));

const paciente: PacienteResumo = {
  id: 'p-1',
  nome: 'Ana Paula Souza',
  idade: 81,
  status: 'internado',
  dataAdmissao: '2026-11-01',
  situacao: 'stable',
  ocorrenciasAbertas: 0,
  quedasConfirmadas: 0,
  totalOcorrencias: 0,
};

/*
 * O SonarQube aponta o <label> deste modal (S6853, "must have accessible text")
 * porque o texto está em <span> aninhados dentro do rótulo, e a regra não os
 * enxerga. O que importa para quem usa leitor de tela é o NOME ACESSÍVEL do
 * botão de seleção, e é isso que se testa aqui: a biblioteca calcula o nome da
 * mesma forma que o navegador (a partir do conteúdo do <label>).
 */
describe('ModalAlta: motivo da saída, com nome acessível', () => {
  it('cada opção tem nome acessível com título e explicação', () => {
    render(<ModalAlta paciente={paciente} aoFechar={() => {}} aoConcluir={() => {}} />);

    expect(screen.getByRole('radio', { name: /^Alta\b.*deixou a clínica/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Transferência\b.*outra unidade/ })).toBeInTheDocument();
  });

  it('as opções formam um grupo e só uma fica marcada', async () => {
    render(<ModalAlta paciente={paciente} aoFechar={() => {}} aoConcluir={() => {}} />);
    const alta = screen.getByRole('radio', { name: /^Alta\b/ });
    const transferencia = screen.getByRole('radio', { name: /^Transferência\b/ });

    expect(alta).toBeChecked();
    await userEvent.click(transferencia);
    expect(transferencia).toBeChecked();
    expect(alta).not.toBeChecked();
  });

  it('clicar no texto do rótulo marca a opção', async () => {
    render(<ModalAlta paciente={paciente} aoFechar={() => {}} aoConcluir={() => {}} />);
    await userEvent.click(screen.getByText('O paciente foi para outra unidade.'));
    expect(screen.getByRole('radio', { name: /^Transferência\b/ })).toBeChecked();
  });
});
