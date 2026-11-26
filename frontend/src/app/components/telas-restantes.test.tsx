import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fetchComFalha, fetchFalso } from '@/test/telas';
import { SaudeScreen } from './SaudeScreen';
import { SecaoAmbientes } from './settings/SecaoAmbientes';
import { PEPScreen } from './pep/PEPScreen';
import { AbaClinica } from './settings/AbaClinica';
import { MonitoringScreen } from './MonitoringScreen';
import { OperationalOverviewScreen } from './OperationalOverviewScreen';
import type { PacienteResumo } from '../data/api';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

/*
 * Mais telas que buscam dados ao abrir com `void carregar()` / `void consultar…()`. O que se
 * confere aqui é que a tela abre e que o campo ou a mensagem esperados aparecem depois da busca.
 */
afterEach(() => vi.unstubAllGlobals());

const paciente = {
  id: 'p-1', nome: 'Ana Paula Souza', idade: 81, status: 'internado', dataAdmissao: '2026-11-01',
  situacao: 'stable', ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
} as PacienteResumo;

const clinica = { slug: 'clinica-teste', nome: 'Clínica Teste', cnpj: null, endereco: 'Rua das Flores, 10', telefone: '(47) 3000-0000', email: 'contato@clinica.com', ativa: true };

describe('telas que abrem buscando dados', () => {
  it('Configurações › Clínica: o formulário de edição abre com os dados da clínica', async () => {
    fetchFalso([[/\/api\/clinica/, clinica]]);
    render(<AbaClinica />);
    await userEvent.click(await screen.findByRole('button', { name: /Editar/ }));
    expect(await screen.findByLabelText(/Nome da Unidade/)).toHaveValue('Clínica Teste');
    expect(screen.getByLabelText('Endereço')).toHaveValue('Rua das Flores, 10');
    expect(screen.getByLabelText('Telefone')).toHaveValue('(47) 3000-0000');
    expect(screen.getByLabelText('E-mail')).toHaveValue('contato@clinica.com');
  });

  it('Configurações › Ambientes: busca os ambientes ao abrir', async () => {
    const api = fetchFalso();
    render(<SecaoAmbientes aoIrPara={() => {}} />);
    await waitFor(() => expect(api).toHaveBeenCalled());
  });

  it('Configurações › Ambientes: se a API recusa, mostra o motivo', async () => {
    const api = fetchComFalha('Banco indisponível.');
    render(<SecaoAmbientes aoIrPara={() => {}} />);
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect((await screen.findAllByText(/Não foi possível|Banco indisponível/)).length).toBeGreaterThan(0);
  });

  it('Prontuário: abre e busca as ocorrências do paciente', async () => {
    const api = fetchFalso();
    render(<PEPScreen patient={paciente} onBack={() => {}} />);
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect((await screen.findAllByText(/Ana Paula Souza/)).length).toBeGreaterThan(0);
  });
});
