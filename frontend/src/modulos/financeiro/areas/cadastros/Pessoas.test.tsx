import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { Pessoas } from './Pessoas';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Cadastro de pessoas: importar do sistema e criar terminam buscando a lista de novo (`void pessoas.recarregar()`). */

const base = {
  tipo: 'juridica', nomeFantasia: null, documento: null, email: null, telefone: null, chavePix: null, cliente: true, fornecedor: false,
  referenciaExterna: null, ativa: true, sistema: null,
};
const maria = { ...base, id: 'pe-1', nome: 'Maria Alves' };
const alfa = { ...base, id: 'pe-2', nome: 'Fornecedor Alfa', fornecedor: true, cliente: false };

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['cadastros:criar', 'cadastros:editar'] }),
    pessoas: vi.fn().mockResolvedValueOnce({ total: 1, itens: [maria] }).mockResolvedValue({ total: 2, itens: [maria, alfa] }),
    importarPessoas: vi.fn().mockResolvedValue({ criadas: 2, atualizadas: 1 }),
    criarPessoa: vi.fn().mockResolvedValue(alfa),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  const externas = vi.fn().mockResolvedValue([{ referenciaExterna: 'pac-1', nome: 'Paciente Um' }]);
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}} pessoasExternas={externas} rotuloPessoasExternas="Importar pacientes">
      <Pessoas />
    </ProvedorFinanceiro>,
  );
  return { api, externas };
}

describe('Cadastros › Pessoas', () => {
  it('importar do sistema: manda os cadastros externos, avisa quantos entraram e busca a lista de novo', async () => {
    const { api, externas } = montar();
    await screen.findByText('Maria Alves');

    await userEvent.click(screen.getByRole('button', { name: 'Importar pacientes' }));

    expect(await screen.findByText('2 cadastro(s) novo(s), 1 atualizado(s).')).toBeInTheDocument();
    expect(externas).toHaveBeenCalledTimes(1);
    expect(api.importarPessoas).toHaveBeenCalledWith([{ referenciaExterna: 'pac-1', nome: 'Paciente Um' }]);
    expect(await screen.findByText('Fornecedor Alfa')).toBeInTheDocument();
    expect(api.pessoas).toHaveBeenCalledTimes(2);
  });

  it('a importação falhar: avisa o motivo e não busca de novo', async () => {
    const { api } = montar({ importarPessoas: vi.fn().mockRejectedValue(new Error('Documento repetido em dois cadastros.')) });
    await screen.findByText('Maria Alves');

    await userEvent.click(screen.getByRole('button', { name: 'Importar pacientes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Documento repetido em dois cadastros.');
    expect(api.pessoas).toHaveBeenCalledTimes(1);
  });

  it('nova pessoa: manda os dados, avisa e a lista passa a mostrá-la', async () => {
    const { api } = montar();
    await screen.findByText('Maria Alves');

    await userEvent.click(screen.getByRole('button', { name: 'Nova pessoa' }));
    const janela = await screen.findByRole('dialog');
    const salvar = within(janela).getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled(); // sem nome não salva
    await userEvent.type(within(janela).getByLabelText('Razão social'), 'Fornecedor Alfa');
    await userEvent.click(salvar);

    expect(await screen.findByText('Cadastro salvo.')).toBeInTheDocument();
    expect(api.criarPessoa).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Fornecedor Alfa', tipo: 'juridica', ativa: true }));
    expect(await screen.findByText('Fornecedor Alfa')).toBeInTheDocument();
    expect(api.pessoas).toHaveBeenCalledTimes(2);
  });
});
