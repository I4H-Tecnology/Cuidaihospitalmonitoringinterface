import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { ContratosScreen } from './ContratosScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const contrato = {
  id: 'c-1', numero: '2026/14', objeto: 'Limpeza hospitalar', fornecedor: 'Limpa Bem Ltda', fornecedorDocumento: null, categoria: 'servico', valorMensal: 4800,
  inicio: '2026-01-01', fim: null, renovacaoAutomatica: false, avisoPrevioDias: 60, responsavel: 'Ana Souza', observacoes: null, situacao: 'vigente',
  decidirAte: null, encerradoEm: null, motivoEncerramento: null, criadoPorNome: 'Ana Souza', criadoEm: '2026-01-01T10:00:00Z', pedidosVinculados: 0,
};

/* Encerrar um contrato: pede o motivo (mínimo de 5 letras), encerra, avisa e busca a lista de novo (`void carregar()`). */
describe('Contratos: encerrar', () => {
  const abrirEncerramento = async (extras: Array<[RegExp, unknown]> = []) => {
    const api = fetchFalso([...extras, [/^POST .*\/api\/contratos\/c-1\/encerrar/, { ok: true }], [/^GET .*\/api\/contratos/, [contrato]]]);
    render(<ContratosScreen />);
    await userEvent.click(await screen.findByRole('button', { name: /Limpeza hospitalar/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Encerrar contrato' }));
    return { api, janela: await screen.findByRole('dialog', { name: 'Encerrar contrato?' }) };
  };

  it('manda o motivo, avisa e busca os contratos de novo', async () => {
    const { api, janela } = await abrirEncerramento();
    const encerrar = within(janela).getByRole('button', { name: 'Encerrar' });
    expect(encerrar).toBeDisabled(); // sem motivo não encerra

    await userEvent.type(within(janela).getByLabelText(/Motivo/), 'Troca de fornecedor a partir de novembro');
    await userEvent.click(encerrar);

    expect(await screen.findByText('Contrato "Limpeza hospitalar" encerrado.')).toBeInTheDocument();
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/encerrar'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ motivo: 'Troca de fornecedor a partir de novembro' });
    expect(chamadas(api, /^GET .*\/api\/contratos/)).toBe(2);
  });

  it('motivo curto demais: o botão continua travado', async () => {
    const { janela } = await abrirEncerramento();

    await userEvent.type(within(janela).getByLabelText(/Motivo/), 'cris');

    expect(within(janela).getByRole('button', { name: 'Encerrar' })).toBeDisabled();
  });

  it('a API recusar: mostra o motivo na janela e não busca de novo', async () => {
    const { api, janela } = await abrirEncerramento([[/^POST .*\/encerrar/, () => erroHttp(409, 'Contrato já encerrado.')]]);

    await userEvent.type(within(janela).getByLabelText(/Motivo/), 'Troca de fornecedor');
    await userEvent.click(within(janela).getByRole('button', { name: 'Encerrar' }));

    expect(await within(janela).findByText('Contrato já encerrado.')).toBeInTheDocument();
    expect(chamadas(api, /^GET .*\/api\/contratos/)).toBe(1);
  });
});
