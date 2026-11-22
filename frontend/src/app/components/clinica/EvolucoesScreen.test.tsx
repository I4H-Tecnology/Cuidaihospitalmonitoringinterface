import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { EvolucoesScreen } from './EvolucoesScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const maria = {
  id: 'p-1', nome: 'Maria Alves', status: 'internado', dataAdmissao: '2026-10-01', ambienteNome: 'Quarto 101', situacao: 'stable',
  ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
};
const evolucao = { id: 'e-1', pacienteId: 'p-1', pacienteNome: 'Maria Alves', texto: 'Dormiu bem, sem queixas.', autorNome: 'Ana Souza', dataHora: '2026-11-21T22:00:00Z' };
const rotas = (extras: Array<[RegExp, unknown]> = []): Array<[RegExp, unknown]> => [
  ...extras,
  [/^POST .*\/api\/evolucoes/, { ...evolucao, id: 'e-2' }],
  [/^GET .*\/api\/evolucoes/, [evolucao]],
  [/^GET .*\/api\/pacientes/, [maria]],
];

/* Registrar uma evolução: os rótulos levam ao campo, e depois de salvar a lista é buscada de novo. */
describe('Evoluções clínicas', () => {
  it('abre buscando as evoluções e os pacientes', async () => {
    const api = fetchFalso(rotas());
    render(<EvolucoesScreen aoAbrirPaciente={() => {}} />);

    expect(await screen.findByText('Dormiu bem, sem queixas.')).toBeInTheDocument();
    expect(chamadas(api, /^GET .*\/api\/pacientes/)).toBe(1);
  });

  it('clicar no texto dos rótulos leva o foco ao campo deles', async () => {
    fetchFalso(rotas());
    render(<EvolucoesScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText('Dormiu bem, sem queixas.');

    await userEvent.click(screen.getByText('Paciente', { selector: 'label' }));
    expect(screen.getByLabelText('Paciente')).toHaveFocus();
    await userEvent.click(screen.getByText('Nova evolução', { selector: 'label' }));
    expect(screen.getByLabelText('Nova evolução')).toHaveFocus();
  });

  it('registrar: manda paciente e texto, esvazia o campo e busca a lista de novo', async () => {
    const api = fetchFalso(rotas());
    render(<EvolucoesScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText('Dormiu bem, sem queixas.');

    await userEvent.selectOptions(screen.getByLabelText('Paciente'), 'p-1');
    await userEvent.type(screen.getByLabelText('Nova evolução'), 'Aceitou bem o almoço.');
    await userEvent.click(screen.getByRole('button', { name: /Adicionar evolução/ }));

    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/evolucoes/)).toBe(2));
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/evolucoes'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ pacienteId: 'p-1', texto: 'Aceitou bem o almoço.' });
    expect(screen.getByLabelText('Nova evolução')).toHaveValue('');
  });

  it.each([
    ['sem escolher o paciente', async () => { await userEvent.type(screen.getByLabelText('Nova evolução'), 'Aceitou bem o almoço.'); }, 'Escolha o paciente da evolução.'],
    ['com texto curto demais', async () => {
      await userEvent.selectOptions(screen.getByLabelText('Paciente'), 'p-1');
      await userEvent.type(screen.getByLabelText('Nova evolução'), 'ok');
    }, 'Escreva a evolução antes de registrar.'],
  ])('não registra %s e diz o que corrigir', async (_nome, preencher, mensagem) => {
    const api = fetchFalso(rotas());
    render(<EvolucoesScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText('Dormiu bem, sem queixas.');

    await preencher();
    await userEvent.click(screen.getByRole('button', { name: /Adicionar evolução/ }));

    expect(await screen.findByText(mensagem)).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('a API recusar: mostra o motivo e mantém o texto digitado', async () => {
    fetchFalso(rotas([[/^POST .*\/api\/evolucoes/, () => erroHttp(400, 'Paciente já recebeu alta.')]]));
    render(<EvolucoesScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText('Dormiu bem, sem queixas.');
    await userEvent.selectOptions(screen.getByLabelText('Paciente'), 'p-1');
    await userEvent.type(screen.getByLabelText('Nova evolução'), 'Aceitou bem o almoço.');

    await userEvent.click(screen.getByRole('button', { name: /Adicionar evolução/ }));

    expect(await screen.findByText('Paciente já recebeu alta.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova evolução')).toHaveValue('Aceitou bem o almoço.');
  });
});
