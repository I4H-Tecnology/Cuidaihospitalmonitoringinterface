import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { AbaClinica } from './AbaClinica';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const clinica = {
  slug: 'clinica-teste', nome: 'Clínica Teste', cnpj: '12345678000190', endereco: 'Rua das Flores, 10',
  telefone: '(47) 3000-0000', email: 'contato@clinica.com', ativa: true,
};

async function abrirEdicao(extras: Array<[RegExp, unknown]> = []) {
  const api = fetchFalso([...extras, [/^GET .*\/api\/clinica/, clinica]]);
  render(<AbaClinica />);
  await userEvent.click(await screen.findByTitle('Editar'));
  return { api, janela: await screen.findByRole('dialog') };
}

/*
 * Editar o cadastro da clínica: cada campo tem o rótulo ligado a ele (quem clica no texto cai no campo),
 * Tipo e Status aparecem travados com o motivo, e salvar manda só o que a API aceita.
 */
describe('Configurações › Clínica: edição do cadastro', () => {
  it('todos os rótulos levam ao campo deles; Tipo e Status ficam travados com o motivo', async () => {
    const { janela } = await abrirEdicao();

    for (const rotulo of ['Nome da Unidade *', 'Endereço', 'Telefone', 'E-mail']) {
      await userEvent.click(within(janela).getByText(rotulo));
      expect(within(janela).getByLabelText(rotulo)).toHaveFocus();
    }
    const tipo = within(janela).getByLabelText('Tipo *');
    const status = within(janela).getByLabelText('Status');
    expect(tipo).toBeDisabled();
    expect(tipo).toHaveAttribute('title', expect.stringContaining('o sistema trata todos como clínica'));
    expect(status).toBeDisabled();
    expect(status).toHaveValue('ativa');
  });

  it('salvar: manda os dados alterados, fecha a janela e avisa', async () => {
    const { api, janela } = await abrirEdicao([[/^PATCH .*\/api\/clinica/, { ...clinica, telefone: '(47) 3999-1111' }]]);

    const telefone = within(janela).getByLabelText('Telefone');
    await userEvent.clear(telefone);
    await userEvent.type(telefone, '(47) 3999-1111');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cadastro da clínica atualizado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const envio = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ nome: 'Clínica Teste', telefone: '(47) 3999-1111', email: 'contato@clinica.com' });
    expect(screen.getByText('(47) 3999-1111')).toBeInTheDocument(); // a tela já mostra o dado novo
  });

  it('nome curto demais: avisa e não envia', async () => {
    const { api, janela } = await abrirEdicao();

    const nome = within(janela).getByLabelText('Nome da Unidade *');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'ab');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await within(janela).findByRole('alert')).toHaveTextContent('Informe o nome da clínica.');
    expect(chamadas(api, /^PATCH /)).toBe(0);
  });

  it('e-mail sem arroba: o navegador barra o envio e o campo fica marcado como inválido', async () => {
    const { api, janela } = await abrirEdicao();

    const email = within(janela).getByLabelText('E-mail');
    await userEvent.clear(email);
    await userEvent.type(email, 'contato.clinica.com');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(email).toBeInvalid();
    expect(chamadas(api, /^PATCH /)).toBe(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a API recusar: mostra o motivo e a janela continua aberta', async () => {
    const { janela } = await abrirEdicao([[/^PATCH .*\/api\/clinica/, () => erroHttp(400, 'Telefone inválido.')]]);

    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await within(janela).findByRole('alert')).toHaveTextContent('Telefone inválido.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
