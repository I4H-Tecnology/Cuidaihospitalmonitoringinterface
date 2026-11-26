import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { chamadas, fetchComFalha, fetchFalso } from '@/test/telas';
import { DashboardScreen } from './DashboardScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const paciente = (id: string, nome: string, situacao: string) => ({
  id, nome, status: 'internado', dataAdmissao: '2026-10-01', ambienteNome: 'Quarto 101', situacao, ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
});

/* O painel busca pacientes e câmeras ao abrir (`void carregar()`): os contadores do topo vêm dessa resposta. */
describe('Visão geral (painel)', () => {
  it('ao abrir: busca e mostra o total de internados e quantos estão em situação crítica', async () => {
    const api = fetchFalso([
      [/^GET .*\/api\/pacientes/, [paciente('p-1', 'Maria Alves', 'critical'), paciente('p-2', 'João Prado', 'stable'), paciente('p-3', 'Rosa Lima', 'stable')]],
      [/^GET .*\/api\/cameras/, []],
    ]);
    render(<DashboardScreen onNavigate={() => {}} />);

    expect(await screen.findByText('1 em situação crítica')).toBeInTheDocument();
    expect(screen.getByText('Pacientes internados').parentElement).toHaveTextContent('3');
    expect(chamadas(api, /^GET .*\/api\/pacientes/)).toBe(1);
    expect(chamadas(api, /^GET .*\/api\/cameras/)).toBe(1);
  });

  it('a API falhar: mostra o motivo no topo, sem números inventados', async () => {
    fetchComFalha('Banco indisponível.');
    render(<DashboardScreen onNavigate={() => {}} />);

    expect(await screen.findByText('Não foi possível carregar os dados do painel.')).toBeInTheDocument();
  });

  it('um registro de ensaio controlado aparece em "Últimas ocorrências" com o aviso e sem paciente', async () => {
    fetchFalso([
      [/^GET .*\/api\/pacientes/, []],
      [/^GET .*\/api\/cameras/, []],
      [/^GET .*\/api\/ocorrencias/, [{
        id: 'o-ensaio', tipoEvento: 'permanencia_solo', status: 'encerrada', dataHora: new Date().toISOString(),
        ambienteId: 'a1', ambienteNome: 'Quarto 101', cameraIdentificador: 'CAM-QUARTO101', ensaio: true,
      }]],
    ]);
    render(<DashboardScreen onNavigate={() => {}} />);

    expect(await screen.findByText('Permanência no chão · ENSAIO CONTROLADO')).toBeInTheDocument();
    expect(screen.getByText('Registro de demonstração (sem paciente)')).toBeInTheDocument();
  });
});
