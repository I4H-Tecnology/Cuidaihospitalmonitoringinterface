import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import { ScoreRiscoScreen, SensoresScreen } from './Monitoramento';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const aoNavegar = () => {};
const corpoDoPost = (api: ReturnType<typeof fetchFalso>, fim: string) => {
  const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith(fim));
  return JSON.parse(String(envio?.[1]?.body));
};

describe('Score de risco (Escala de Morse)', () => {
  const nuncaAvaliada = {
    pacienteId: 'p-1', pacienteNome: 'Maria Alves', ambienteNome: 'Quarto 101', morse: null, faixa: null, morseAnterior: null,
    avaliadoEm: null, avaliadoPor: null, admissao: '2026-11-01', fatores: [],
  };
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/avaliacoes-morse/, { id: 'a-1', total: 50, faixa: 'alto' }],
    [/^GET .*\/api\/risco-queda/, [nuncaAvaliada]],
  ];
  /** Marca uma opção dentro do item (cada item é um grupo com o título como nome). */
  const marcar = (janela: HTMLElement, item: RegExp, opcao: string) =>
    userEvent.click(within(within(janela).getByRole('group', { name: item })).getByRole('radio', { name: new RegExp(`^${opcao}`) }));

  it('avaliar: só libera depois dos seis itens, soma os pontos, registra e busca o painel de novo', async () => {
    const api = fetchFalso(rotas);
    render(<ScoreRiscoScreen onNavigate={aoNavegar} />);
    await screen.findByText('Maria Alves');

    await userEvent.click(screen.getByRole('button', { name: 'Avaliar' }));
    const janela = await screen.findByRole('dialog', { name: 'Escala de Morse' });
    const registrar = within(janela).getByRole('button', { name: 'Registrar avaliação' });
    expect(registrar).toBeDisabled();

    await marcar(janela, /Histórico de quedas/, 'Sim');
    await marcar(janela, /Diagnóstico secundário/, 'Não');
    await marcar(janela, /Auxílio na deambulação/, 'Muleta');
    await marcar(janela, /Terapia endovenosa/, 'Não');
    await marcar(janela, /Marcha/, 'Fraca');
    expect(registrar).toBeDisabled(); // falta o sexto item
    await marcar(janela, /Estado mental/, 'Orientado');
    expect(registrar).toBeEnabled();
    expect(within(janela).getByText('50')).toBeInTheDocument(); // 25 + 0 + 15 + 0 + 10 + 0
    await userEvent.click(registrar);

    expect(await screen.findByText('Avaliação registrada: 50 pontos.')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/risco-queda/)).toBe(2));
    expect(corpoDoPost(api, '/api/avaliacoes-morse')).toMatchObject({
      pacienteId: 'p-1', historicoQueda: 25, diagnosticoSecundario: 0, auxilioDeambulacao: 15, terapiaEndovenosa: 0, marcha: 10, estadoMental: 0,
    });
  });
});

describe('Sensores', () => {
  const sensor = {
    id: 's-1', nome: 'Tapete da cama 101', tipo: 'cama', ambienteId: 'a-1', ambienteNome: 'Quarto 101', ativo: true, ultimoSinal: null,
    ultimaLeitura: null, online: false, alertas24h: 0, criadoEm: '2026-11-01T10:00:00Z',
  };
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/sensores\/s-1\/desativar/, { ok: true }],
    [/^POST .*\/api\/sensores$/, { ...sensor, id: 's-2', nome: 'Porta do corredor', tipo: 'porta', token: 'tok-secreto-123' }],
    [/^GET .*\/api\/sensores/, [sensor]],
    [/^GET .*\/api\/ambientes/, [{ id: 'a-1', nome: 'Quarto 101', tipo: 'quarto', cameras: 1, pacienteNome: null }]],
  ];

  it('desativar: avisa e busca a lista de sensores de novo', async () => {
    const api = fetchFalso(rotas);
    render(<SensoresScreen onNavigate={aoNavegar} />);
    await screen.findByText(/Tapete da cama 101/);

    await userEvent.click(screen.getByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText('Sensor Tapete da cama 101 desativado.')).toBeInTheDocument();
    expect(chamadas(api, /^POST .*\/api\/sensores\/s-1\/desativar/)).toBe(1);
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/sensores/)).toBe(2));
  });

  it('cadastrar: mostra o token uma vez e busca a lista de sensores de novo', async () => {
    const api = fetchFalso(rotas);
    render(<SensoresScreen onNavigate={aoNavegar} />);
    await screen.findByText(/Tapete da cama 101/);

    await userEvent.click(screen.getByRole('button', { name: /Cadastrar sensor/ }));
    const janela = await screen.findByRole('dialog', { name: 'Cadastrar sensor' });
    await userEvent.type(within(janela).getByLabelText('Nome *'), 'Porta do corredor');
    await userEvent.selectOptions(within(janela).getByLabelText('Tipo *'), 'porta');
    await within(janela).findByRole('option', { name: 'Quarto 101' });
    await userEvent.selectOptions(within(janela).getByLabelText('Ambiente'), 'a-1');
    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar e gerar token' }));

    const token = await screen.findByRole('dialog', { name: 'Sensor "Porta do corredor" cadastrado' });
    expect(within(token).getByText(/tok-secreto-123/)).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/sensores/)).toBe(2));
    expect(corpoDoPost(api, '/api/sensores')).toMatchObject({ nome: 'Porta do corredor', tipo: 'porta', ambienteId: 'a-1' });
  });

  it('cadastrar sem nome: avisa e não envia', async () => {
    const api = fetchFalso(rotas);
    render(<SensoresScreen onNavigate={aoNavegar} />);
    await screen.findByText(/Tapete da cama 101/);
    await userEvent.click(screen.getByRole('button', { name: /Cadastrar sensor/ }));
    const janela = await screen.findByRole('dialog', { name: 'Cadastrar sensor' });

    await userEvent.click(within(janela).getByRole('button', { name: 'Cadastrar e gerar token' }));

    expect(await within(janela).findByText('Dê um nome ao sensor (ex.: "Cama 101").')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});
