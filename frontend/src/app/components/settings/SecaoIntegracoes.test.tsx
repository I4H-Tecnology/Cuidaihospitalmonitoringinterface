import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { erroHttp, fetchFalso } from '@/test/telas';
import { SecaoIntegracoes } from './SecaoIntegracoes';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const saude = {
  status: 'ok', versao: '1.4.0', hora_servidor: '2026-11-22T12:00:00Z', uptime_s: 3700, banco: { ok: true, latencia_ms: 12, erro: null },
  canal_alertas: { ouvintes_desta_clinica: 2, ouvintes_total: 3 }, cameras: { total: 3, conectadas: 2, janela_de_ping: '90 s' },
  ocorrencias: { ultimas_24h: 5, abertas: 1 },
  clipes: { pasta: '/clipes', pasta_existe: true, clipes_em_disco: 4, bytes_em_disco: 2048, retencao_horas: 24, ultimo_expurgo: null, ultimo_expurgo_removeu: 0 },
  log: { nivel: 'INFO', formato: 'json' },
};

/** O selo de estado ("No ar", "Fora do ar"...) ao lado do título do cartão. */
const estadoDe = (titulo: string) => within(screen.getByRole('heading', { name: titulo }).parentElement as HTMLElement);

/* O estado de cada integração é medido ao abrir: a API pelo `/api/saude`, o serviço de visão pelo `/estado` (`void fetchServicoPadrao()`). */
describe('Configurações › Integrações', () => {
  it('serviço de visão respondendo: o cartão dele e o da API aparecem "No ar"', async () => {
    fetchFalso([
      [/\/api\/saude/, saude],
      [/\/estado/, { publicacao: { camera_id: 'CAM-1' } }],
    ]);
    render(<SecaoIntegracoes />);

    await waitFor(() => expect(estadoDe('Serviço de visão (padrão)').getByText('No ar')).toBeInTheDocument());
    expect(estadoDe('API REST').getByText('No ar')).toBeInTheDocument();
  });

  it('serviço de visão sem resposta: o cartão dele aparece "Fora do ar" e o da API continua "No ar"', async () => {
    fetchFalso([
      [/\/api\/saude/, saude],
      [/\/estado/, () => erroHttp(503, 'fora')],
    ]);
    render(<SecaoIntegracoes />);

    await waitFor(() => expect(estadoDe('Serviço de visão (padrão)').getByText('Fora do ar')).toBeInTheDocument());
    expect(estadoDe('API REST').getByText('No ar')).toBeInTheDocument();
  });

  it('perfil sem acesso ao monitoramento: o cartão da API aparece "Sem acesso ao estado"', async () => {
    fetchFalso([
      [/\/api\/saude/, () => erroHttp(403, 'Proibido.')],
      [/\/estado/, () => erroHttp(503, 'fora')],
    ]);
    render(<SecaoIntegracoes />);

    await waitFor(() => expect(estadoDe('API REST').getByText('Sem acesso ao estado')).toBeInTheDocument());
  });
});
