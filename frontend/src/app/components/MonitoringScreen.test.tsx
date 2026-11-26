import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { chamadas, fetchComFalha, fetchFalso } from '@/test/telas';
import { MonitoringScreen } from './MonitoringScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const camera = (id: string, ambienteNome: string) => ({
  id, identificador: `CAM-${id}`, urlStream: 'rtsp://***', status: 'ativa', conectada: true, ultimoPing: null, ambienteId: `a-${id}`, ambienteNome,
  ambienteTipo: 'quarto', pacienteId: null, pacienteNome: null, ocorrencias24h: 0, ultimaOcorrencia: null, visaoUrl: null,
});

/* O monitoramento busca as câmeras ao abrir (`void carregar()`) e monta o mosaico com um quadro por quarto. */
describe('Monitoramento (mosaico de câmeras)', () => {
  it('ao abrir: busca as câmeras e mostra um quadro por quarto', async () => {
    const api = fetchFalso([[/^GET .*\/api\/cameras/, [camera('1', 'Quarto 101'), camera('2', 'Quarto 102')]]]);
    render(<MonitoringScreen />);

    expect(await screen.findByText('Quarto 101')).toBeInTheDocument();
    expect(screen.getByText('Quarto 102')).toBeInTheDocument();
    expect(chamadas(api, /^GET .*\/api\/cameras/)).toBe(1);
  });

  it('a API falhar: mostra o motivo', async () => {
    fetchComFalha('Banco indisponível.');
    render(<MonitoringScreen />);

    expect(await screen.findByText('Não foi possível carregar os dados do monitoramento.')).toBeInTheDocument();
  });
});
