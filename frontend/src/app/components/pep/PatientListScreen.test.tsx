import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { PatientListScreen } from './PatientListScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const paciente = (extra: Record<string, unknown> = {}) => ({
  id: 'p-1', nome: 'Maria Alves', status: 'internado', dataAdmissao: '2026-10-01', situacao: 'stable',
  ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0, ...extra,
});
const comAlta = paciente({ id: 'p-2', nome: 'João Prado', status: 'alta', dataAlta: '2026-11-10' });

/*
 * "Reinternar" é um `<span role="button">` dentro da linha do paciente (que também é um botão). Ele funciona
 * por clique e pelo teclado (Enter e Espaço), sem abrir o prontuário da linha, e a lista é buscada de novo.
 */
describe('Lista de prontuários: reinternar', () => {
  const abrir = async (extras: Array<[RegExp, unknown]> = []) => {
    const aoSelecionar = vi.fn();
    const api = fetchFalso([
      ...extras,
      [/^PATCH .*\/api\/pacientes\/p-2/, paciente({ id: 'p-2', nome: 'João Prado' })],
      [/^GET .*\/api\/pacientes/, [paciente(), comAlta]],
    ]);
    render(<PatientListScreen onSelectPatient={aoSelecionar} />);
    await screen.findByText('João Prado');
    return { api, aoSelecionar, reinternar: () => screen.getByRole('button', { name: 'Reinternar' }) };
  };

  it('por clique: manda o status internado, busca a lista de novo e não abre o prontuário', async () => {
    const { api, aoSelecionar, reinternar } = await abrir();

    await userEvent.click(reinternar());

    await waitFor(() => expect(chamadas(api, /^PATCH .*\/api\/pacientes\/p-2/)).toBe(1));
    const envio = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ status: 'internado' });
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/pacientes/)).toBe(2));
    expect(aoSelecionar).not.toHaveBeenCalled();
  });

  it.each([['Enter', '{Enter}'], ['Espaço', ' ']])('pelo teclado (%s): reinterna sem abrir o prontuário', async (_nome, tecla) => {
    const { api, aoSelecionar, reinternar } = await abrir();

    reinternar().focus();
    await userEvent.keyboard(tecla);

    await waitFor(() => expect(chamadas(api, /^PATCH .*\/api\/pacientes\/p-2/)).toBe(1));
    expect(aoSelecionar).not.toHaveBeenCalled();
  });

  it('outra tecla não faz nada', async () => {
    const { api, reinternar } = await abrir();

    reinternar().focus();
    await userEvent.keyboard('a');

    expect(chamadas(api, /^PATCH /)).toBe(0);
  });

  it('a API recusar: avisa na tela', async () => {
    const { reinternar } = await abrir([[/^PATCH .*\/api\/pacientes\/p-2/, () => erroHttp(500, 'Falhou.')]]);

    await userEvent.click(reinternar());

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível reinternar o paciente.');
  });
});
