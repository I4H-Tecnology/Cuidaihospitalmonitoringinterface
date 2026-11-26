import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import type { PacienteResumo } from '@/app/data/api';
import { PEPScreen } from './PEPScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const maria: PacienteResumo = {
  id: 'p-1', nome: 'Maria Alves', status: 'internado', dataAdmissao: '2026-10-01', ambienteId: 'a-1', ambienteNome: 'Quarto 101',
  situacao: 'stable', ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
};
const dipirona = {
  id: 'r-1', pacienteId: 'p-1', tipo: 'alergia', descricao: 'dipirona', gravidade: 'grave', ativo: true, autorNome: 'Ana Souza',
  criadoEm: '2026-11-20T10:00:00Z', inativadoEm: null,
};
const rotas = (extras: Array<[RegExp, unknown]> = []): Array<[RegExp, unknown]> => [
  ...extras,
  [/^PATCH .*\/api\/pacientes\/p-1/, { ...maria, nome: 'Maria Alves Souza' }],
  [/^GET .*\/api\/pacientes\/p-1\/riscos/, [dipirona]],
  [/^GET .*\/api\/ambientes/, []],
];

/*
 * O prontuário busca evoluções, riscos e prescrições ao abrir (`void carregarProntuario()`); a alergia grave
 * aparece num alerta no topo. Editar o cadastro busca tudo de novo e mostra o nome novo.
 */
describe('Prontuário (PEP)', () => {
  it('ao abrir: busca o prontuário e avisa, no topo, da alergia grave', async () => {
    const api = fetchFalso(rotas());
    render(<PEPScreen patient={maria} onBack={() => {}} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Alergia grave: dipirona.');
    expect(chamadas(api, /\/api\/pacientes\/p-1\/riscos/)).toBe(1);
    expect(chamadas(api, /\/api\/pacientes\/p-1\/evolucoes/)).toBe(1);
    expect(chamadas(api, /\/api\/pacientes\/p-1\/prescricoes/)).toBe(1);
  });

  it('editar o cadastro: manda a alteração, mostra o nome novo, avisa e busca o prontuário de novo', async () => {
    const api = fetchFalso(rotas());
    render(<PEPScreen patient={maria} onBack={() => {}} />);
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: /Editar paciente/ }));
    const nome = await screen.findByLabelText(/^Nome/);
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Maria Alves Souza');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Cadastro atualizado.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Maria Alves Souza' })).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /\/api\/pacientes\/p-1\/riscos/)).toBe(2));
    const envio = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ nome: 'Maria Alves Souza' });
  });
});
