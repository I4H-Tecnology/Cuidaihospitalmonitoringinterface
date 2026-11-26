import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { RiscosScreen } from './RiscosScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const paciente = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id, nome, status: 'internado', dataAdmissao: '2026-10-01T10:00:00Z', ambienteNome: 'Quarto 101', situacao: 'stable',
  ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0, ...extra,
});
const risco = (id: string, pacienteId: string, pacienteNome: string, extra: Record<string, unknown> = {}) => ({
  id, pacienteId, pacienteNome, tipo: 'alergia', descricao: 'dipirona', gravidade: 'grave', ativo: true,
  autorNome: 'Ana Souza', criadoEm: '2026-11-20T10:00:00Z', inativadoEm: null, ...extra,
});

const rotas = (riscos: unknown[]): Array<[RegExp, unknown]> => [
  [/^POST .*\/api\/riscos\/[^/]+\/inativar/, { ok: true }],
  [/^POST .*\/api\/riscos/, { ok: true }],
  [/^GET .*\/api\/riscos/, riscos],
  [/^GET .*\/api\/pacientes/, [paciente('p-1', 'Maria Alves'), paciente('p-2', 'João Prado')]],
];

/*
 * Registrar uma alergia ou risco: o foco vai direto para a descrição (quem digita não precisa procurar o
 * campo), cada campo tem seu rótulo ligado a ele, e depois de salvar a lista é buscada de novo.
 */
describe('Alergias e riscos da clínica', () => {
  it('abre com os pacientes que têm alergia grave primeiro', async () => {
    fetchFalso(rotas([
      risco('r-2', 'p-2', 'João Prado', { tipo: 'risco', descricao: 'queda ao levantar', gravidade: 'leve' }),
      risco('r-1', 'p-1', 'Maria Alves'),
    ]));
    render(<RiscosScreen aoAbrirPaciente={() => {}} />);

    await screen.findByText('dipirona');
    const nomes = screen.getAllByRole('button').filter((b) => /Maria Alves|João Prado/.test(b.textContent ?? '')).map((b) => b.textContent);
    expect(nomes[0]).toContain('Maria Alves');
    expect(nomes[1]).toContain('João Prado');
    expect(screen.getByText('alergia grave')).toBeInTheDocument();
  });

  it('registrar: o foco vai para a descrição, manda os dados, fecha o formulário e busca a lista de novo', async () => {
    const api = fetchFalso(rotas([risco('r-1', 'p-1', 'Maria Alves')]));
    render(<RiscosScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText('dipirona');

    await userEvent.click(screen.getByRole('button', { name: /Registrar/ }));
    const descricao = screen.getByLabelText('Descrição');
    expect(descricao).toHaveFocus();

    await userEvent.selectOptions(screen.getByLabelText('Paciente'), 'p-2');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'risco');
    await userEvent.type(descricao, 'risco de queda à noite');
    await userEvent.selectOptions(screen.getByLabelText('Gravidade'), 'grave');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByLabelText('Descrição')).toBeNull());
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/riscos'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ pacienteId: 'p-2', tipo: 'risco', descricao: 'risco de queda à noite', gravidade: 'grave' });
    expect(chamadas(api, /^GET .*\/api\/riscos/)).toBe(2);
  });

  it.each([
    ['sem escolher o paciente', async () => { await userEvent.type(screen.getByLabelText('Descrição'), 'dipirona'); }, 'Escolha o paciente.'],
    ['com descrição curta demais', async () => {
      await userEvent.selectOptions(screen.getByLabelText('Paciente'), 'p-1');
      await userEvent.type(screen.getByLabelText('Descrição'), 'ab');
    }, 'Descreva a alergia ou o risco.'],
  ])('não registra %s e diz o que corrigir', async (_nome, preencher, mensagem) => {
    const api = fetchFalso(rotas([]));
    render(<RiscosScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText('Nenhuma alergia ou risco registrado nesta clínica.');
    await userEvent.click(screen.getByRole('button', { name: /Registrar/ }));

    await preencher();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(mensagem)).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('a API recusar o registro: mostra o motivo e mantém o formulário com o que foi digitado', async () => {
    fetchFalso([[/^POST .*\/api\/riscos/, () => erroHttp(400, 'Paciente já tem esse registro.')], ...rotas([])]);
    render(<RiscosScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText('Nenhuma alergia ou risco registrado nesta clínica.');
    await userEvent.click(screen.getByRole('button', { name: /Registrar/ }));
    await userEvent.selectOptions(screen.getByLabelText('Paciente'), 'p-1');
    await userEvent.type(screen.getByLabelText('Descrição'), 'dipirona');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Paciente já tem esse registro.')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição')).toHaveValue('dipirona');
  });

  it('inativar pede confirmação; confirmando, inativa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas([risco('r-1', 'p-1', 'Maria Alves')]));
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<RiscosScreen aoAbrirPaciente={() => {}} />);
    await screen.findByText('dipirona');

    await userEvent.click(screen.getByRole('button', { name: /Inativar/ }));
    expect(chamadas(api, /\/inativar/)).toBe(0); // recusou na confirmação: nada acontece

    confirmar.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /Inativar/ }));

    await waitFor(() => expect(chamadas(api, /^POST .*\/api\/riscos\/r-1\/inativar/)).toBe(1));
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/riscos/)).toBe(2));
  });

  it('o botão do paciente abre o prontuário dele', async () => {
    fetchFalso(rotas([risco('r-1', 'p-1', 'Maria Alves')]));
    const abrir = vi.fn();
    render(<RiscosScreen aoAbrirPaciente={abrir} />);
    await screen.findByText('dipirona');

    await userEvent.click(screen.getByRole('button', { name: /Maria Alves/ }));

    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }));
  });
});
