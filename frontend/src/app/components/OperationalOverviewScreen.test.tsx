import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { chamadas, fetchFalso } from '@/test/telas';
import { OperationalOverviewScreen } from './OperationalOverviewScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const visao = {
  status: 'attention', criticalAlerts: 5, criticalCases: 2, occupancyRate: 83, avgResponseMinutes: 4, incidentsLast24h: 7,
  updatedAt: '2026-11-22T12:00:00Z', criticalSectors: [], insights: [],
};

/* A visão operacional busca os números ao abrir (`void loadOverview()`) e mostra o que a API respondeu. */
describe('Visão operacional', () => {
  it('ao abrir: busca e mostra os alertas, os casos críticos e a taxa de ocupação', async () => {
    const api = fetchFalso([[/\/api\/operational-overview/, visao]]);
    render(<OperationalOverviewScreen />);

    expect(await screen.findByText('83%')).toBeInTheDocument();
    expect(screen.getByText('Alertas Críticos Ativos').parentElement).toHaveTextContent('5');
    expect(screen.getByText('Casos Críticos').parentElement).toHaveTextContent('2');
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument();
    expect(chamadas(api, /\/api\/operational-overview/)).toBe(1);
  });
});
