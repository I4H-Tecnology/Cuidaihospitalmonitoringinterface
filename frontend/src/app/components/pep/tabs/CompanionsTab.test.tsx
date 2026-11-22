import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import type { AcompanhanteResumo, PacienteResumo } from '@/app/data/api';
import { CompanionsTab } from './CompanionsTab';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const paciente: PacienteResumo = {
  id: 'p-1', nome: 'Maria Alves', status: 'internado', dataAdmissao: '2026-10-01', situacao: 'stable', ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
};
const rosa: AcompanhanteResumo = {
  id: 'ac-1', pacienteId: 'p-1', nome: 'Rosa Alves', documento: '12345678900', ativo: true,
  expiraEm: new Date(Date.now() + 3 * 86_400_000).toISOString(), revogadoEm: null, criadoEm: '2026-11-20T10:00:00Z',
};
const criado = { ...rosa, id: 'ac-2', nome: 'Pedro Alves', tokenQrcode: 'token-secreto-do-qr' };

describe('Prontuário › Acompanhantes', () => {
  it('abre buscando os acompanhantes do paciente e conta os acessos ativos', async () => {
    const api = fetchFalso([[/^GET .*\/api\/pacientes\/p-1\/acompanhantes/, [rosa]]]);
    render(<CompanionsTab paciente={paciente} />);

    expect(await screen.findByText('Rosa Alves')).toBeInTheDocument();
    expect(screen.getByText(/1 acesso ativo\./)).toBeInTheDocument();
    expect(chamadas(api, /^GET .*\/acompanhantes/)).toBe(1);
  });

  it('novo acompanhante: gera o QR Code uma vez e busca a lista de novo', async () => {
    const api = fetchFalso([
      [/^POST .*\/api\/acompanhantes/, criado],
      [/^GET .*\/api\/pacientes\/p-1\/acompanhantes/, [rosa]],
    ]);
    render(<CompanionsTab paciente={paciente} />);
    await screen.findByText('Rosa Alves');

    await userEvent.click(screen.getByRole('button', { name: /Novo acompanhante/ }));
    const janela = await screen.findByRole('dialog');
    await userEvent.type(within(janela).getByLabelText(/Nome/), 'Pedro Alves');
    await userEvent.type(within(janela).getByLabelText(/Documento/), '98765432100');
    await userEvent.click(within(janela).getByRole('button', { name: /Gerar QR Code/ }));

    expect(await within(janela).findByText('Acesso criado')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/acompanhantes/)).toBe(2));
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/acompanhantes'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ pacienteId: 'p-1', nome: 'Pedro Alves', documento: '98765432100', validadeHoras: 72 });
  });

  it('revogar: pede confirmação; confirmando, revoga, busca de novo e avisa', async () => {
    const api = fetchFalso([
      [/^POST .*\/api\/acompanhantes\/ac-1\/revogar/, { ok: true }],
      [/^GET .*\/api\/pacientes\/p-1\/acompanhantes/, [rosa]],
    ]);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CompanionsTab paciente={paciente} />);
    await screen.findByText('Rosa Alves');

    await userEvent.click(screen.getByRole('button', { name: /Revogar/ }));
    expect(chamadas(api, /\/revogar/)).toBe(0);

    confirmar.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /Revogar/ }));

    expect(await screen.findByText('Acesso de Rosa Alves revogado.')).toBeInTheDocument();
    expect(chamadas(api, /^POST .*\/ac-1\/revogar/)).toBe(1);
    expect(chamadas(api, /^GET .*\/acompanhantes/)).toBe(2);
  });

  it('paciente sem internação: não dá para criar acesso novo', async () => {
    fetchFalso([[/^GET .*\/api\/pacientes\/p-1\/acompanhantes/, []]]);
    render(<CompanionsTab paciente={{ ...paciente, status: 'alta' }} />);
    await screen.findByText('Nenhum acompanhante cadastrado para este paciente.');

    expect(screen.getByRole('button', { name: /Novo acompanhante/ })).toBeDisabled();
  });
});
