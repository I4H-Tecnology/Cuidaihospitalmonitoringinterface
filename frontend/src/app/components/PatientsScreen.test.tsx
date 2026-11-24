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

// Sem aoAbrirPaciente = quem montou a tela não abre o prontuário (o perfil da
// banca do TCC). O useAuth de teste pode tudo, então patients:edit vale.
describe('Gestão de pacientes: ficha, para quem não abre o prontuário', () => {
  const abrirMaria = async () => userEvent.click((await screen.findAllByRole('button', { name: /Maria Alves/ }))[0]);

  it('editar: sem histórico médico, troca o ambiente e não manda o histórico', async () => {
    const comVago = [...ambientes, { id: 'a-2', nome: 'Quarto 102', tipo: 'quarto', cameras: 1, pacienteNome: null }];
    const api = fetchFalso([
      [/^PATCH .*\/api\/pacientes\/p-1$/, { ...maria, ambienteId: 'a-2', ambienteNome: 'Quarto 102' }],
      [/^GET .*\/api\/pacientes\?/, [maria]],
      [/^GET .*\/api\/ambientes/, comVago],
    ]);
    render(<PatientsScreen />);
    await abrirMaria();
    await userEvent.click(screen.getByRole('button', { name: /Editar cadastro/ }));

    await screen.findByRole('heading', { name: 'Editar paciente' });
    expect(screen.queryByLabelText('Histórico médico')).toBeNull();
    await screen.findByRole('option', { name: /Quarto 102/ });
    await userEvent.selectOptions(screen.getByLabelText('Ambiente monitorado'), 'a-2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Cadastro de Maria Alves atualizado.');
    const envio = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    const corpo = JSON.parse(String(envio?.[1]?.body));
    expect(corpo).toMatchObject({ ambienteId: 'a-2' });
    expect(corpo).not.toHaveProperty('historicoMedico');
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/pacientes\?/)).toBe(2));
  });

  it('registrar saída: só a alta, e o aviso diz quantos acessos de acompanhante caíram', async () => {
    const api = fetchFalso([
      [/^POST .*\/api\/pacientes\/p-1\/alta$/, { ok: true, paciente: { ...maria, status: 'alta' }, acessosRevogados: 1 }],
      [/^GET .*\/api\/pacientes\?/, [maria]],
      [/^GET .*\/api\/ambientes/, ambientes],
    ]);
    render(<PatientsScreen />);
    await abrirMaria();
    await userEvent.click(screen.getByRole('button', { name: /Registrar saída/ }));

    expect(screen.getByRole('radio', { name: /^Alta\b/ })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /^Transferência\b/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar saída' }));

    await screen.findByText(/1 acesso\(s\) de acompanhante revogado\(s\)/);
    const envio = api.mock.calls.find(([url]) => String(url).endsWith('/alta'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ motivo: 'alta' });
  });

  it('quem abre o prontuário continua indo para ele, sem a ficha', async () => {
    fetchFalso([
      [/^GET .*\/api\/pacientes\?/, [maria]],
      [/^GET .*\/api\/ambientes/, ambientes],
    ]);
    const aoAbrir = vi.fn();
    render(<PatientsScreen aoAbrirPaciente={aoAbrir} />);
    await abrirMaria();

    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }));
    expect(screen.queryByRole('button', { name: /Editar cadastro/ })).toBeNull();
  });
});
