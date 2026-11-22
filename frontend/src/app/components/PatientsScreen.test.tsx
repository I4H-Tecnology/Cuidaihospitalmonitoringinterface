import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import { PatientsScreen } from './PatientsScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const maria = {
  id: 'p-1', nome: 'Maria Alves', status: 'internado', dataAdmissao: '2026-10-01', ambienteId: 'a-1', ambienteNome: 'Quarto 101', ambienteTipo: 'quarto',
  situacao: 'stable', ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
};
const ambientes = [{ id: 'a-1', nome: 'Quarto 101', tipo: 'quarto', cameras: 1, pacienteNome: 'Maria Alves' }];

describe('Gestão de pacientes: admitir', () => {
  it('admitir: manda o paciente novo, fecha a janela e busca pacientes e ambientes de novo', async () => {
    const api = fetchFalso([
      [/^POST .*\/api\/pacientes$/, { ...maria, id: 'p-2', nome: 'Carlos Dias' }],
      [/^GET .*\/api\/pacientes\?/, [maria]],
      [/^GET .*\/api\/ambientes/, ambientes],
    ]);
    render(<PatientsScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText(/1 paciente\(s\) internado\(s\)/);

    await userEvent.click(screen.getByRole('button', { name: /Admitir paciente/ }));
    await userEvent.type(await screen.findByLabelText(/^Nome/), 'Carlos Dias');
    const botoes = screen.getAllByRole('button', { name: 'Admitir paciente' });
    await userEvent.click(botoes[botoes.length - 1]); // o da janela vem depois do da tela

    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/pacientes\?/)).toBe(2));
    expect(chamadas(api, /^GET .*\/api\/ambientes/)).toBeGreaterThanOrEqual(2);
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/pacientes'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ nome: 'Carlos Dias' });
    await waitFor(() => expect(screen.queryByLabelText(/^Nome/)).toBeNull());
  });
});
