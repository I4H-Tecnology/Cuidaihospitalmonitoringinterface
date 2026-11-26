import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../../contexto';
import { Patrimonio } from './Patrimonio';
import type { ClienteFinanceiro } from '../../api/cliente';

/* Patrimônio: cadastrar e baixar um bem terminam buscando a lista de bens de novo (`void ativos.recarregar()`). */

const bem = {
  id: 'a-1', descricao: 'Cama hospitalar elétrica', classe: 'maquina', classeRotulo: 'Máquinas e equipamentos', identificacao: null,
  centroCustoId: null, centroCustoNome: null, dataAquisicao: '2026-01-10', inicioUso: '2026-01-10', valorAquisicao: '3000.00', valorResidual: '0.00',
  vidaUtilMeses: 120, baixadoEm: null, motivoBaixa: null, valorVenda: null, valorContabil: '2750.00', depreciacaoAcumulada: '250.00', depreciacaoMensal: '25.00',
};
const totais = { bens: 1, valorAquisicao: '3000.00', valorContabil: '2750.00', depreciacaoMensal: '25.00' };
const classes = { maquina: { rotulo: 'Máquinas e equipamentos', vidaUtilSugerida: 120 }, terreno: { rotulo: 'Terreno', vidaUtilSugerida: null } };

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['capital:criar', 'capital:excluir'] }),
    contas: vi.fn().mockResolvedValue([]),
    categorias: vi.fn().mockResolvedValue([]),
    centros: vi.fn().mockResolvedValue([]),
    ativos: vi.fn().mockResolvedValueOnce({ itens: [bem], totais, classes })
      .mockResolvedValue({ itens: [bem, { ...bem, id: 'a-2', descricao: 'Desfibrilador' }], totais: { ...totais, bens: 2 }, classes }),
    criarAtivo: vi.fn().mockResolvedValue({ ...bem, id: 'a-2', descricao: 'Desfibrilador' }),
    baixarAtivo: vi.fn().mockResolvedValue({ ...bem, baixadoEm: '2026-11-22', motivoBaixa: 'Descarte' }),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Patrimonio />
    </ProvedorFinanceiro>,
  );
  return api;
}

describe('Capital › Patrimônio', () => {
  it('cadastrar um bem: manda os dados, avisa e a lista passa a mostrá-lo', async () => {
    const api = montar();
    await screen.findByText('Cama hospitalar elétrica');

    await userEvent.click(screen.getByRole('button', { name: 'Novo bem' }));
    const janela = await screen.findByRole('dialog');
    const cadastrar = within(janela).getByRole('button', { name: 'Cadastrar' });
    expect(cadastrar).toBeDisabled(); // sem descrição e valor não cadastra
    await userEvent.type(within(janela).getByLabelText('Descrição'), 'Desfibrilador');
    await userEvent.type(within(janela).getByLabelText('Valor de aquisição'), '4500');
    await userEvent.click(cadastrar);

    expect(await screen.findByText('Bem cadastrado.')).toBeInTheDocument();
    expect(api.criarAtivo).toHaveBeenCalledWith(expect.objectContaining({ descricao: 'Desfibrilador', classe: 'maquina', vidaUtilMeses: 120, valorAquisicao: expect.stringContaining('4500') }));
    expect(await screen.findByText('Desfibrilador')).toBeInTheDocument();
    expect(api.ativos).toHaveBeenCalledTimes(2);
  });

  it('baixar um bem: exige o motivo, manda, avisa e busca a lista de novo', async () => {
    const api = montar();
    await screen.findByText('Cama hospitalar elétrica');

    await userEvent.click(screen.getByRole('button', { name: 'Baixar' }));
    const janela = await screen.findByRole('dialog');
    const baixar = within(janela).getByRole('button', { name: 'Baixar bem' });
    expect(baixar).toBeDisabled(); // sem motivo não baixa
    await userEvent.type(within(janela).getByLabelText('Motivo'), 'Descarte por defeito');
    await userEvent.click(baixar);

    expect(await screen.findByText('Bem baixado.')).toBeInTheDocument();
    expect(api.baixarAtivo).toHaveBeenCalledWith('a-1', expect.objectContaining({ motivo: 'Descarte por defeito', pessoaId: null }));
    expect(api.ativos).toHaveBeenCalledTimes(2);
  });

  it('a API recusar o cadastro: avisa o motivo e a janela continua aberta', async () => {
    const api = montar({ criarAtivo: vi.fn().mockRejectedValue(new Error('Período já fechado.')) });
    await screen.findByText('Cama hospitalar elétrica');

    await userEvent.click(screen.getByRole('button', { name: 'Novo bem' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.type(within(janela).getByLabelText('Descrição'), 'Desfibrilador');
    await userEvent.type(within(janela).getByLabelText('Valor de aquisição'), '4500');
    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Período já fechado.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.ativos).toHaveBeenCalledTimes(1);
  });
});
