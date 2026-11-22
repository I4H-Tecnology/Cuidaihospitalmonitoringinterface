import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fetchFalso } from '@/test/telas';
import { quandoFoi } from '@/app/data/tempo';
import { BedsRoomsScreen } from './BedsRoomsScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const haMinutos = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const camera = (id: string, ultimaOcorrencia: string | null) => ({
  id, identificador: `CAM-${id}`, urlStream: 'rtsp://***', status: 'ativa', conectada: true, ultimoPing: null, ambienteId: 'a-1', ambienteNome: 'Quarto 101',
  ambienteTipo: 'quarto', pacienteId: null, pacienteNome: null, ocorrencias24h: ultimaOcorrencia ? 1 : 0, ultimaOcorrencia, visaoUrl: null,
});

/* O cartão de cada ambiente mostra a última ocorrência entre todas as câmeras dele. */
describe('Ambientes e câmeras: última ocorrência do ambiente', () => {
  it('com duas câmeras, mostra a ocorrência mais recente das duas', async () => {
    const antiga = haMinutos(180);
    const recente = haMinutos(20);
    fetchFalso([
      [/^GET .*\/api\/cameras/, [camera('1', antiga), camera('2', recente), camera('3', null)]],
      [/^GET .*\/api\/ambientes/, [{ id: 'a-1', nome: 'Quarto 101', tipo: 'quarto', cameras: 3, pacienteNome: null }]],
    ]);
    render(<BedsRoomsScreen />);

    expect(await screen.findByText(`Última ocorrência ${quandoFoi(recente)}`)).toBeInTheDocument();
    expect(screen.queryByText(`Última ocorrência ${quandoFoi(antiga)}`)).toBeNull();
  });

  it('sem nenhuma ocorrência nas câmeras: diz que não há registro', async () => {
    fetchFalso([
      [/^GET .*\/api\/cameras/, [camera('1', null)]],
      [/^GET .*\/api\/ambientes/, [{ id: 'a-1', nome: 'Quarto 101', tipo: 'quarto', cameras: 1, pacienteNome: null }]],
    ]);
    render(<BedsRoomsScreen />);

    expect(await screen.findByText('Nenhuma ocorrência registrada')).toBeInTheDocument();
  });
});
