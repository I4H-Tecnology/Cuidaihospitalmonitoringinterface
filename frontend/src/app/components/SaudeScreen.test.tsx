import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { erroHttp, fetchFalso } from '@/test/telas';
import { SaudeScreen } from './SaudeScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const saudeApi = {
  status: 'ok', versao: '1.4.0', hora_servidor: '2026-11-22T12:00:00Z', uptime_s: 3700, banco: { ok: true, latencia_ms: 12, erro: null },
  canal_alertas: { ouvintes_desta_clinica: 2, ouvintes_total: 3 }, cameras: { total: 3, conectadas: 2, janela_de_ping: '90 s' },
  ocorrencias: { ultimas_24h: 5, abertas: 1 },
  clipes: { pasta: '/clipes', pasta_existe: true, clipes_em_disco: 4, bytes_em_disco: 2048, retencao_horas: 24, ultimo_expurgo: null, ultimo_expurgo_removeu: 0 },
  log: { nivel: 'INFO', formato: 'json' },
};

/*
 * A tela consulta a API e o serviço de visão assim que abre (`void consultarApi()` e `void consultarVisao()`)
 * e depois a cada poucos segundos. O que cada um responde — ou o fato de não responder — aparece na hora.
 */
describe('Saúde do sistema', () => {
  it('ao abrir: mostra o que a API e o banco responderam e que o serviço de visão está fora do ar', async () => {
    const api = fetchFalso([
      [/\/api\/saude/, saudeApi],
      [/\/health/, () => erroHttp(503, 'fora')],
    ]);
    render(<SaudeScreen />);

    expect(await screen.findByText('conectado · 12 ms')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument(); // câmeras conectadas / cadastradas
    expect(await screen.findAllByText('serviço fora do ar')).not.toHaveLength(0);
    expect(screen.getByText('porta 8001 não responde')).toBeInTheDocument();
    expect(api.mock.calls.some(([url]) => String(url).includes('/health'))).toBe(true);
  });

  it('a API não responder: diz que está fora do ar em vez de mostrar números', async () => {
    fetchFalso([
      [/\/api\/saude/, () => erroHttp(500, 'Banco indisponível.')],
      [/\/health/, () => erroHttp(503, 'fora')],
    ]);
    render(<SaudeScreen />);

    expect(await screen.findByText('fora do ar')).toBeInTheDocument();
    expect(screen.queryByText('conectado · 12 ms')).toBeNull();
  });

  it('serviço de visão capturando: mostra o estado e a fonte que ele informou', async () => {
    fetchFalso([
      [/\/api\/saude/, saudeApi],
      [/\/health/, {
        status: 'ok', versao: '0.9', uptime_s: 120, fonte: 'rtsp://camera-101', estado_da_fonte: 'conectada', fps_alvo: 10, fps_real: 9.8,
        latencia_media_ms: 40, latencia_p95_ms: 90, latencia_max_ms: 150, quadros_processados: 1200, ocorrencias: 2, modo_teste: false,
        captura: { quedas_da_fonte: 0, reconexoes: 0, ultimo_quadro_ha_s: 0.2 },
        publicacao: { ativo: true, registradas: 2, aguardando_em_disco: 0, pingando: true, ultimo_erro: null },
        clipes: { ativo: true, gravando_agora: 0, gravados_desde_o_boot: 2, ultimo_clipe: null, bytes_em_disco: 0, clipes_em_disco: 0, ultimo_erro: null, retencao_horas: 24 },
      }],
    ]);
    render(<SaudeScreen />);

    expect(await screen.findByText('capturando')).toBeInTheDocument();
    expect(screen.getByText('rtsp://camera-101')).toBeInTheDocument();
  });
});
