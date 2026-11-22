import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../contexto';
import { Configuracoes } from './Configuracoes';
import type { ClienteFinanceiro } from '../api/cliente';

/*
 * Configurações do financeiro: fechar e reabrir período, cadastrar tabela de imposto e cadastrar feriado.
 * Depois de cada um a tela busca de novo o que mudou (`void recarregar()`); o fechamento ainda recarrega
 * a sessão, porque o que a pessoa pode fazer muda com o período fechado.
 */

function fabrica(api: Record<string, unknown>) {
  return {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['cadastros:criar', 'configuracoes:editar'] }),
    // A aba "Empresa e folha" abre primeiro e não é o assunto: a primeira busca da organização fica pendente.
    organizacao: vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue({ fechadoAte: null }),
    ...api,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
}

async function abrir(api: ClienteFinanceiro, aba: string) {
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Configuracoes />
    </ProvedorFinanceiro>,
  );
  await userEvent.click(await screen.findByRole('tab', { name: aba }));
}

describe('Configurações › Fechamento de período', () => {
  it('fechar: pede o motivo, manda o mês, avisa, mostra o resultado e recarrega a sessão', async () => {
    const api = fabrica({ alterarFechamento: vi.fn().mockResolvedValue({ fechadoAte: '2026-10-31' }) });
    await abrir(api, 'Fechamento de período');
    await screen.findByText('Nenhum período fechado ainda.');
    const sessoesAntes = vi.mocked(api.sessao).mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Fechar período' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.type(within(janela).getByLabelText(/Motivo/), 'Mês conferido pela contabilidade');
    // "Fechar" é também o nome do X da janela; o botão de ação é o do rodapé, o último.
    await userEvent.click(within(janela).getAllByRole('button', { name: 'Fechar' }).at(-1)!);

    expect(await screen.findByText('Período fechado.')).toBeInTheDocument();
    expect(api.alterarFechamento).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/), 'Mês conferido pela contabilidade');
    expect(await screen.findByText(/Período fechado até/)).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(api.sessao).mock.calls.length).toBeGreaterThan(sessoesAntes));
  });

  it('reabrir tudo: manda null com o motivo, avisa e recarrega a sessão', async () => {
    const api = fabrica({
      organizacao: vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue({ fechadoAte: '2026-10-31' }),
      alterarFechamento: vi.fn().mockResolvedValue({ fechadoAte: null }),
    });
    await abrir(api, 'Fechamento de período');
    await screen.findByText(/Período fechado até/);
    const sessoesAntes = vi.mocked(api.sessao).mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Reabrir tudo' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.type(within(janela).getByLabelText(/Motivo/), 'Ajuste de uma nota fiscal');
    await userEvent.click(within(janela).getByRole('button', { name: 'Reabrir' }));

    expect(await screen.findByText('Períodos reabertos.')).toBeInTheDocument();
    expect(api.alterarFechamento).toHaveBeenCalledWith(null, 'Ajuste de uma nota fiscal');
    expect(await screen.findByText('Nenhum período fechado ainda.')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(api.sessao).mock.calls.length).toBeGreaterThan(sessoesAntes));
  });
});

describe('Configurações › Tabelas de imposto', () => {
  const tabela = { id: 't-1', tipo: 'inss', oficial: false, vigencia: '2027-01', fonte: 'Portaria MPS/MF nº 999', dados: { faixas: [{ ate: '1621.00', aliquota: '7.5' }] } };

  it('cadastrar: manda a tabela, avisa e busca a lista de novo, que passa a mostrá-la', async () => {
    const api = fabrica({
      tabelasFiscais: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([tabela]),
      criarTabelaFiscal: vi.fn().mockResolvedValue(tabela),
    });
    await abrir(api, 'Tabelas de imposto');
    await userEvent.click(await screen.findByRole('button', { name: /Nova tabela/ }));
    const janela = await screen.findByRole('dialog');
    const cadastrar = within(janela).getByRole('button', { name: 'Cadastrar' });
    expect(cadastrar).toBeDisabled(); // sem a fonte oficial não cadastra

    await userEvent.type(within(janela).getByLabelText('Fonte (norma oficial)'), 'Portaria MPS/MF nº 999');
    expect(cadastrar).toBeEnabled();
    await userEvent.click(cadastrar);

    expect(await screen.findByText('Tabela cadastrada.')).toBeInTheDocument();
    expect(api.criarTabelaFiscal).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'inss', fonte: 'Portaria MPS/MF nº 999' }));
    expect(await screen.findByText('Portaria MPS/MF nº 999', { selector: 'td' })).toBeInTheDocument();
    expect(api.tabelasFiscais).toHaveBeenCalledTimes(2);
  });
});

describe('Configurações › Feriados', () => {
  it('cadastrar: manda data e nome, limpa os campos e busca a lista de novo', async () => {
    const novo = { id: 'f-1', data: '2026-12-08', nome: 'Aniversário da cidade', nacional: false };
    const api = fabrica({
      feriados: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([novo]),
      criarFeriado: vi.fn().mockResolvedValue(novo),
    });
    await abrir(api, 'Feriados');
    const adicionar = await screen.findByRole('button', { name: 'Adicionar' });
    expect(adicionar).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Data'), '2026-12-08');
    await userEvent.type(screen.getByLabelText('Nome'), 'Aniversário da cidade');
    await userEvent.click(adicionar);

    expect(await screen.findByText('Aniversário da cidade', { selector: 'td, span, p' })).toBeInTheDocument();
    expect(api.criarFeriado).toHaveBeenCalledWith('2026-12-08', 'Aniversário da cidade');
    expect(screen.getByLabelText('Nome')).toHaveValue('');
    expect(api.feriados).toHaveBeenCalledTimes(2);
  });

  it('a API recusar: avisa o erro e mantém o que foi digitado', async () => {
    const api = fabrica({
      feriados: vi.fn().mockResolvedValue([]),
      criarFeriado: vi.fn().mockRejectedValue(new Error('Já existe feriado nessa data.')),
    });
    await abrir(api, 'Feriados');
    await userEvent.type(await screen.findByLabelText('Data'), '2026-12-08');
    await userEvent.type(screen.getByLabelText('Nome'), 'Aniversário da cidade');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe feriado nessa data.');
    expect(screen.getByLabelText('Nome')).toHaveValue('Aniversário da cidade');
    expect(api.feriados).toHaveBeenCalledTimes(1);
  });
});
