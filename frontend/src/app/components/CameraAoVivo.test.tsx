import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { erroHttp, fetchFalso } from '@/test/telas';
import { CameraAoVivo } from './CameraAoVivo';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => vi.unstubAllGlobals());

const estado = {
  fonte: 'rtsp://camera-101', fps_real: 9.5, latencia_ms: 80, pessoas: [], caidos: 0, modo_teste: false,
  captura: { estado: 'ok', ultimo_quadro_ha_s: 0.1 },
};

/* O quadro consulta o estado do serviço de visão assim que aparece (`void consultar()`) e mostra o que ele respondeu. */
describe('Câmera ao vivo', () => {
  it('serviço respondendo: mostra a fonte e a taxa de quadros', async () => {
    const api = fetchFalso([[/\/estado/, estado]]);
    render(<CameraAoVivo url="http://visao.teste" />);

    expect(await screen.findByText('rtsp://camera-101')).toBeInTheDocument();
    expect(screen.getByText('9.5 fps')).toBeInTheDocument();
    expect(api.mock.calls.some(([url]) => String(url) === 'http://visao.teste/estado')).toBe(true);
  });

  it('alguém no chão: mostra o alerta em destaque', async () => {
    fetchFalso([[/\/estado/, { ...estado, caidos: 1 }]]);
    render(<CameraAoVivo url="http://visao.teste" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Pessoa no chão detectada');
  });

  it('conexão recusada (modo compacto do mosaico): diz que o serviço não responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<CameraAoVivo url="http://visao.teste" compacto />);

    expect(await screen.findByText('Serviço de visão não responde')).toBeInTheDocument();
  });

  it('outro programa respondendo no endereço (erro HTTP): diz isso, em vez de "não responde"', async () => {
    fetchFalso([[/\/estado/, () => erroHttp(503, 'fora')]]);
    render(<CameraAoVivo url="http://visao.teste" compacto />);

    expect(await screen.findByText('Outro programa responde em http://visao.teste')).toBeInTheDocument();
  });
});
