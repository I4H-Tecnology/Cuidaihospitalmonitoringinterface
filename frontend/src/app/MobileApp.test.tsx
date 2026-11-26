import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { chamadas, fetchFalso } from '@/test/telas';
import { MobileApp } from './MobileApp';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const paciente = (id: string, nome: string, situacao: string) => ({
  id, nome, status: 'internado', dataAdmissao: '2026-10-01', ambienteNome: 'Quarto 101', situacao, ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
});

/* O app do enfermeiro busca os pacientes ao abrir (`void carregar()`) e mostra quantos estão internados e quantos críticos. */
describe('App do enfermeiro (mobile)', () => {
  it('ao abrir: busca os pacientes e mostra a lista com a contagem de críticos', async () => {
    const api = fetchFalso([[/^GET .*\/api\/pacientes/, [paciente('p-1', 'Maria Alves', 'critical'), paciente('p-2', 'João Prado', 'stable')]]]);
    render(<MobileApp />);

    expect(await screen.findByText('Maria Alves')).toBeInTheDocument();
    expect(screen.getByText('João Prado')).toBeInTheDocument();
    expect(screen.getByText('2 internados · 1 crítico')).toBeInTheDocument();
    expect(chamadas(api, /^GET .*\/api\/pacientes/)).toBe(1);
  });

  it('sem pacientes internados: diz isso', async () => {
    fetchFalso([[/^GET .*\/api\/pacientes/, []]]);
    render(<MobileApp />);

    expect(await screen.findByText('Nenhum paciente internado.')).toBeInTheDocument();
  });
});
