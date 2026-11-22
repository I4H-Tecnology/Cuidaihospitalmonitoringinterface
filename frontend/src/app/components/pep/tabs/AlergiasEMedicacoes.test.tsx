import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import type { PacienteResumo, PrescricaoResumo, RiscoResumo } from '@/app/data/api';
import { AllergiesTab } from './AllergiesTab';
import { MedicationsTab } from './MedicationsTab';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const paciente: PacienteResumo = {
  id: 'p-1', nome: 'Maria Alves', status: 'internado', dataAdmissao: '2026-10-01T10:00:00Z', medicoResponsavel: 'Dr. Paulo Reis',
  situacao: 'stable', ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
};
const alergia: RiscoResumo = {
  id: 'r-1', pacienteId: 'p-1', tipo: 'alergia', descricao: 'dipirona', gravidade: 'grave', ativo: true,
  autorNome: 'Ana Souza', criadoEm: '2026-11-20T10:00:00Z', inativadoEm: null,
};
const prescricao: PrescricaoResumo = {
  id: 'pr-1', pacienteId: 'p-1', medicamento: 'losartana 50 mg', posologia: '1 comprimido, 2x ao dia', medicoPrescritor: 'Dr. Paulo Reis',
  observacao: null, ativo: true, autorNome: 'Ana Souza', criadoEm: '2026-11-20T10:00:00Z', inativadoEm: null,
};
const postado = (api: ReturnType<typeof fetchFalso>, fim: string) => {
  const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith(fim));
  return JSON.parse(String(envio?.[1]?.body));
};

/*
 * Os formulários do prontuário (alergias e medicações): o foco vai para o primeiro campo ao abrir, cada campo
 * tem rótulo ligado a ele, e depois de salvar ou inativar a aba avisa o prontuário (`aoMudar`) para recarregar.
 */
describe('Prontuário: alergias e riscos', () => {
  const abrir = (riscos: RiscoResumo[] = [alergia]) => {
    const aoMudar = vi.fn(async () => {});
    render(<AllergiesTab paciente={paciente} riscos={riscos} carregando={false} aoMudar={aoMudar} />);
    return aoMudar;
  };

  it('registrar: o foco vai para a descrição, manda os dados, fecha e avisa o prontuário', async () => {
    const api = fetchFalso([[/^POST .*\/api\/riscos/, { ok: true }]]);
    const aoMudar = abrir();

    await userEvent.click(screen.getByRole('button', { name: /Registrar/ }));
    const descricao = screen.getByLabelText('Descrição');
    expect(descricao).toHaveFocus();
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'risco');
    expect(descricao).toHaveAttribute('placeholder', 'Ex.: risco de queda ao levantar à noite');
    await userEvent.type(descricao, 'risco de queda');
    await userEvent.selectOptions(screen.getByLabelText('Gravidade'), 'grave');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalledTimes(1));
    expect(postado(api, '/api/riscos')).toMatchObject({ pacienteId: 'p-1', tipo: 'risco', descricao: 'risco de queda', gravidade: 'grave' });
    expect(screen.queryByLabelText('Descrição')).toBeNull();
  });

  it('descrição curta demais: avisa e não envia', async () => {
    const api = fetchFalso();
    const aoMudar = abrir();
    await userEvent.click(screen.getByRole('button', { name: /Registrar/ }));

    await userEvent.type(screen.getByLabelText('Descrição'), 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Descreva a alergia ou o risco.');
    expect(chamadas(api, /^POST /)).toBe(0);
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('a API recusar: mostra o motivo e não avisa o prontuário', async () => {
    fetchFalso([[/^POST .*\/api\/riscos/, () => erroHttp(400, 'Registro duplicado.')]]);
    const aoMudar = abrir();
    await userEvent.click(screen.getByRole('button', { name: /Registrar/ }));
    await userEvent.type(screen.getByLabelText('Descrição'), 'dipirona');

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Registro duplicado.');
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('inativar: só depois de confirmar, e então avisa o prontuário', async () => {
    const api = fetchFalso([[/^POST .*\/api\/riscos\/r-1\/inativar/, { ok: true }]]);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const aoMudar = abrir();

    await userEvent.click(screen.getByRole('button', { name: /Inativar/ }));
    expect(chamadas(api, /\/inativar/)).toBe(0);

    confirmar.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /Inativar/ }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalledTimes(1));
    expect(chamadas(api, /^POST .*\/api\/riscos\/r-1\/inativar/)).toBe(1);
  });
});

describe('Prontuário: medicações', () => {
  const abrir = (prescricoes: PrescricaoResumo[] = [prescricao]) => {
    const aoMudar = vi.fn(async () => {});
    render(<MedicationsTab paciente={paciente} prescricoes={prescricoes} carregando={false} aoMudar={aoMudar} />);
    return aoMudar;
  };

  it('prescrever: o foco vai para o medicamento, o médico já vem preenchido, manda os dados e avisa o prontuário', async () => {
    const api = fetchFalso([[/^POST .*\/api\/prescricoes/, { ok: true }]]);
    const aoMudar = abrir();

    await userEvent.click(screen.getByRole('button', { name: /Nova prescrição/ }));
    const medicamento = screen.getByLabelText('Medicamento *');
    expect(medicamento).toHaveFocus();
    expect(screen.getByLabelText('Médico que receitou')).toHaveValue('Dr. Paulo Reis');
    await userEvent.type(medicamento, 'dipirona 500 mg');
    await userEvent.type(screen.getByLabelText('Posologia'), '1 comprimido, 6/6 h');
    await userEvent.type(screen.getByLabelText('Observação'), 'se dor ou febre');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalledTimes(1));
    expect(postado(api, '/api/prescricoes')).toMatchObject({
      pacienteId: 'p-1', medicamento: 'dipirona 500 mg', posologia: '1 comprimido, 6/6 h', medicoPrescritor: 'Dr. Paulo Reis', observacao: 'se dor ou febre',
    });
    expect(screen.queryByLabelText('Medicamento *')).toBeNull();
  });

  it('medicamento em branco: avisa e não envia', async () => {
    const api = fetchFalso();
    const aoMudar = abrir();
    await userEvent.click(screen.getByRole('button', { name: /Nova prescrição/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o medicamento.');
    expect(chamadas(api, /^POST /)).toBe(0);
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('suspender: só depois de confirmar, e então avisa o prontuário', async () => {
    const api = fetchFalso([[/^POST .*\/api\/prescricoes\/pr-1\/inativar/, { ok: true }]]);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const aoMudar = abrir();

    await userEvent.click(screen.getByRole('button', { name: /Suspender/ }));
    expect(chamadas(api, /\/inativar/)).toBe(0);

    confirmar.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /Suspender/ }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalledTimes(1));
    expect(chamadas(api, /^POST .*\/api\/prescricoes\/pr-1\/inativar/)).toBe(1);
  });
});
