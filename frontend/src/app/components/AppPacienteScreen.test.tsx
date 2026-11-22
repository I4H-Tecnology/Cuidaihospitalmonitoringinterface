import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { AppPacienteScreen } from './AppPacienteScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const acesso = {
  id: 'ac-1', pacienteId: 'p-1', nome: 'Rosa Alves', documento: '12345678900', ativo: true,
  expiraEm: new Date(Date.now() + 3 * 86_400_000).toISOString(), revogadoEm: null, criadoEm: '2026-11-20T10:00:00Z',
  pacienteNome: 'Maria Alves', ambienteNome: 'Quarto 101', termoAceitoEm: null, ultimoAcessoEm: null,
};
const maria = { id: 'p-1', nome: 'Maria Alves', status: 'internado', dataAdmissao: '2026-10-01', situacao: 'stable', ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0 };

describe('App do acompanhante: acessos da clínica', () => {
  it('revogar: confirma, avisa e busca os acessos de novo', async () => {
    const api = fetchFalso([
      [/^POST .*\/api\/acompanhantes\/ac-1\/revogar/, { ok: true }],
      [/^GET .*\/api\/acompanhantes/, [acesso]],
    ]);
    render(<AppPacienteScreen />);
    await screen.findByText('Rosa Alves');

    await userEvent.click(screen.getByRole('button', { name: 'Revogar' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('button', { name: 'Revogar acesso' }));

    expect(await screen.findByText(/Acesso de Rosa Alves revogado\./)).toBeInTheDocument();
    expect(chamadas(api, /^POST .*\/ac-1\/revogar/)).toBe(1);
    expect(chamadas(api, /^GET .*\/api\/acompanhantes/)).toBe(2);
  });

  it('a API recusar a revogação: mostra o motivo na janela e não busca de novo', async () => {
    const api = fetchFalso([
      [/^POST .*\/revogar/, () => erroHttp(409, 'O acesso já foi revogado.')],
      [/^GET .*\/api\/acompanhantes/, [acesso]],
    ]);
    render(<AppPacienteScreen />);
    await screen.findByText('Rosa Alves');

    await userEvent.click(screen.getByRole('button', { name: 'Revogar' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('button', { name: 'Revogar acesso' }));

    expect(await within(janela).findByText('O acesso já foi revogado.')).toBeInTheDocument();
    expect(chamadas(api, /^GET .*\/api\/acompanhantes/)).toBe(1);
  });

  it('novo acesso: escolhe o paciente, cria e, ao fechar o QR Code, busca os acessos de novo', async () => {
    const api = fetchFalso([
      [/^POST .*\/api\/acompanhantes/, { ...acesso, id: 'ac-2', nome: 'Pedro Alves', tokenQrcode: 'token-do-qr' }],
      [/^GET .*\/api\/acompanhantes/, [acesso]],
      [/^GET .*\/api\/pacientes/, [maria]],
    ]);
    render(<AppPacienteScreen />);
    await screen.findByText('Rosa Alves');

    await userEvent.click(screen.getByRole('button', { name: /Novo acesso/ }));
    const escolha = await screen.findByRole('dialog');
    await within(escolha).findByRole('option', { name: 'Maria Alves' });
    await userEvent.selectOptions(within(escolha).getByLabelText('Paciente'), 'p-1');
    await userEvent.click(within(escolha).getByRole('button', { name: 'Continuar' }));
    const modal = await screen.findByRole('dialog', { name: /Novo acompanhante/ });
    await userEvent.type(within(modal).getByLabelText(/Nome/), 'Pedro Alves');
    await userEvent.type(within(modal).getByLabelText(/Documento/), '98765432100');
    await userEvent.click(within(modal).getByRole('button', { name: /Gerar QR Code/ }));
    await within(modal).findByText('Acesso criado');
    expect(chamadas(api, /^GET .*\/api\/acompanhantes/)).toBe(1); // ainda não buscou: o QR Code está na tela

    await userEvent.click(within(modal).getByRole('button', { name: 'Fechar' }));

    await vi.waitFor(() => expect(chamadas(api, /^GET .*\/api\/acompanhantes/)).toBe(2));
  });
});
