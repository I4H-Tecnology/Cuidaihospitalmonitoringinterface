import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { ComprasScreen } from './ComprasScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const pedido = (extra: Record<string, unknown> = {}) => ({
  id: 'ped-1', numero: 41, titulo: 'Luvas e máscaras para a ala B', justificativa: null, urgente: false, status: 'solicitado', fornecedor: null, contratoId: null,
  contratoObjeto: null, itens: [{ descricao: 'Luvas', quantidade: 10, unidade: 'cx', valorUnitario: null }], valorEstimado: null, valorFinal: null,
  solicitanteId: 'u-1', solicitanteNome: 'Ana Souza', motivoRecusa: null, motivoCancelamento: null, trilha: [], criadoEm: '2026-11-20T10:00:00Z', ...extra,
});

/* Novo pedido de compra: valida, envia, avisa o número e busca a lista de novo (`depoisDe` → `void carregar()`). */
/** A quantidade já vem com "1": limpa antes de digitar, como a pessoa faria. */
const digitarQuantidade = async (janela: HTMLElement, n: number, valor: string) => {
  const campo = within(janela).getByLabelText(`Quantidade do item ${n}`);
  await userEvent.clear(campo);
  await userEvent.type(campo, valor);
};

describe('Compras: novo pedido', () => {
  const abrirFormulario = async (extras: Array<[RegExp, unknown]> = []) => {
    const api = fetchFalso([...extras, [/^POST .*\/api\/compras/, pedido({ id: 'ped-2', numero: 42, titulo: 'Reposição de fraldas' })], [/^GET .*\/api\/compras/, [pedido()]]]);
    render(<ComprasScreen />);
    await screen.findByText('Luvas e máscaras para a ala B');
    await userEvent.click(screen.getByRole('button', { name: /Novo pedido/ }));
    return { api, janela: await screen.findByRole('dialog', { name: 'Novo pedido de compra' }) };
  };

  it('enviar: manda título e itens, avisa o número do pedido e busca a lista de novo', async () => {
    const { api, janela } = await abrirFormulario();

    await userEvent.type(within(janela).getByLabelText(/^Título/), 'Reposição de fraldas');
    await userEvent.type(within(janela).getByLabelText('Item 1'), 'Fralda geriátrica G');
    await digitarQuantidade(janela, 1, '20');
    await userEvent.type(within(janela).getByLabelText('Preço unitário estimado do item 1'), '12,50');
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar para aprovação' }));

    expect(await screen.findByText('Pedido nº 42 enviado para aprovação.')).toBeInTheDocument();
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/compras'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({
      titulo: 'Reposição de fraldas', urgente: false, itens: [{ descricao: 'Fralda geriátrica G', quantidade: 20, unidade: 'un', valorUnitario: 12.5 }],
    });
    expect(chamadas(api, /^GET .*\/api\/compras/)).toBe(2);
  });

  it.each([
    ['sem título', async (j: HTMLElement) => { await userEvent.type(within(j).getByLabelText('Item 1'), 'Luvas'); }, /Dê um título ao pedido/],
    ['sem itens', async (j: HTMLElement) => { await userEvent.type(within(j).getByLabelText(/^Título/), 'Reposição de fraldas'); }, /Inclua pelo menos um item\./],
    ['quantidade inválida', async (j: HTMLElement) => {
      await userEvent.type(within(j).getByLabelText(/^Título/), 'Reposição de fraldas');
      await userEvent.type(within(j).getByLabelText('Item 1'), 'Luvas');
      await digitarQuantidade(j, 1, '0');
    }, /Quantidade inválida em "Luvas"\./],
  ])('%s: avisa o que corrigir e não envia', async (_nome, preencher, mensagem) => {
    const { api, janela } = await abrirFormulario();

    await preencher(janela);
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar para aprovação' }));

    expect(await within(janela).findByText(mensagem)).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('a API recusar: mostra o motivo e mantém a janela aberta', async () => {
    const { api, janela } = await abrirFormulario([[/^POST .*\/api\/compras/, () => erroHttp(400, 'Pedido duplicado.')]]);

    await userEvent.type(within(janela).getByLabelText(/^Título/), 'Reposição de fraldas');
    await userEvent.type(within(janela).getByLabelText('Item 1'), 'Fralda');
    await digitarQuantidade(janela, 1, '5');
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar para aprovação' }));

    expect(await within(janela).findByText('Pedido duplicado.')).toBeInTheDocument();
    expect(chamadas(api, /^GET .*\/api\/compras/)).toBe(1);
  });
});
