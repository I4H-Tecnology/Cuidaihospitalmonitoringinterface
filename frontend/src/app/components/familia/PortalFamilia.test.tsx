import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, erroHttp, fetchFalso } from '@/test/telas';
import { PortalFamilia } from './PortalFamilia';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });

const amanha = new Date(Date.now() + 86_400_000).toISOString();
const sessao = { token: 'tok-familia', expiraEm: amanha };
const painel = {
  acompanhanteNome: 'Rosa Alves', pacienteNome: 'Maria Alves', ambienteNome: 'Quarto 101', clinicaNome: 'Clínica Teste', expiraEm: amanha,
  termo: { versao: '1', texto: 'Termo de confidencialidade.' }, termoAceito: true, cameraConectada: true, videoDisponivel: true,
};
const rotas = (extras: Array<[RegExp, unknown]> = []): Array<[RegExp, unknown]> => [
  ...extras,
  [/^POST .*\/api\/familia\/entrar/, sessao],
  [/^POST .*\/api\/familia\/video\/ingresso/, { ingresso: 'ing-1' }],
  [/^GET .*\/api\/familia\/painel/, painel],
  [/^GET .*\/api\/familia\/extras/, { mensagensNovas: 0, examesPendentes: 0, avaliouEm: null }],
  [/^GET .*\/api\/familia\/sugestoes/, ['Qual o horário de visita?']],
  [/^GET .*\/api\/familia\/mensagens/, []],
];

beforeEach(() => {
  window.history.replaceState(null, '', '/familia'); // sem código na barra de endereço (replaceState não dispara hashchange)
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

/*
 * O portal da família abre sozinho em três situações: com o código do QR Code na barra de endereço, com a sessão
 * que já estava guardada, e quando o link do QR é colado numa aba que já estava aberta. As três terminam num
 * `void ...()` (a promessa não é esperada), então o que se confere é o resultado na tela.
 */
describe('Portal da família: entrada', () => {
  it('com o código do QR Code na barra: entra sozinho e tira o código da barra de endereço', async () => {
    window.history.replaceState(null, '', '/familia#c=CODIGO-QR');
    const api = fetchFalso(rotas());
    render(<PortalFamilia />);

    expect(await screen.findByRole('heading', { name: 'Maria Alves' })).toBeInTheDocument();
    const entrada = api.mock.calls.find(([url]) => String(url).includes('/api/familia/entrar'));
    expect(JSON.parse(String(entrada?.[1]?.body))).toEqual({ codigo: 'CODIGO-QR' });
    expect(window.location.hash).toBe(''); // o código não fica no histórico nem num print
  });

  it('com a sessão guardada: abre o painel sem pedir o código de novo', async () => {
    sessionStorage.setItem('medsignal-familia', JSON.stringify(sessao));
    const api = fetchFalso(rotas());
    render(<PortalFamilia />);

    expect(await screen.findByRole('heading', { name: 'Maria Alves' })).toBeInTheDocument();
    expect(chamadas(api, /^POST .*\/api\/familia\/entrar/)).toBe(0);
    const painelPedido = api.mock.calls.find(([url]) => String(url).includes('/api/familia/painel'));
    expect(JSON.stringify(painelPedido?.[1]?.headers)).toContain('Bearer tok-familia');
  });

  it('sem código nem sessão: pede o código; colar o link do QR numa aba aberta entra com o código novo', async () => {
    const api = fetchFalso(rotas());
    render(<PortalFamilia />);
    await screen.findByLabelText('Código do acesso');

    window.location.hash = '#c=CODIGO-NOVO'; // o mesmo que abrir o link do QR nesta aba

    expect(await screen.findByRole('heading', { name: 'Maria Alves' })).toBeInTheDocument();
    const entrada = api.mock.calls.find(([url]) => String(url).includes('/api/familia/entrar'));
    expect(JSON.parse(String(entrada?.[1]?.body))).toEqual({ codigo: 'CODIGO-NOVO' });
  });

  it('código recusado: mostra o motivo e continua pedindo o código', async () => {
    fetchFalso(rotas([[/^POST .*\/api\/familia\/entrar/, () => erroHttp(401, 'Código inválido ou vencido.')]]));
    render(<PortalFamilia />);

    await userEvent.type(await screen.findByLabelText('Código do acesso'), 'ERRADO');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido ou vencido.');
    expect(screen.getByLabelText('Código do acesso')).toBeInTheDocument();
  });

  it('acesso revogado pela clínica: a tela diz que o acesso acabou e some o painel', async () => {
    sessionStorage.setItem('medsignal-familia', JSON.stringify(sessao));
    fetchFalso(rotas([[/^GET .*\/api\/familia\/painel/, () => erroHttp(401, 'O acesso foi encerrado pela clínica.')]]));
    render(<PortalFamilia />);

    expect(await screen.findByRole('heading', { name: 'Acesso encerrado' })).toBeInTheDocument();
    expect(screen.getByText('O acesso foi encerrado pela clínica.')).toBeInTheDocument();
    expect(sessionStorage.getItem('medsignal-familia')).toBeNull();
  });
});

describe('Portal da família: câmera e abas', () => {
  const entrarNoPainel = async (extras: Array<[RegExp, unknown]> = []) => {
    sessionStorage.setItem('medsignal-familia', JSON.stringify(sessao));
    const api = fetchFalso(rotas(extras));
    render(<PortalFamilia />);
    await screen.findByRole('heading', { name: 'Maria Alves' });
    return api;
  };

  it('vídeo disponível: pede o ingresso e mostra o vídeo ao vivo', async () => {
    const api = await entrarNoPainel();

    const video = await screen.findByAltText('Vídeo ao vivo do quarto do paciente');

    expect(video.getAttribute('src')).toContain('/api/familia/video?ingresso=ing-1');
    expect(chamadas(api, /^POST .*\/api\/familia\/video\/ingresso/)).toBe(1);
  });

  it('vídeo indisponível: explica e não pede ingresso', async () => {
    const api = await entrarNoPainel([[/^GET .*\/api\/familia\/painel/, { ...painel, videoDisponivel: false }]]);

    expect(await screen.findByText('O vídeo deste quarto não está disponível agora.')).toBeInTheDocument();
    expect(chamadas(api, /\/video\/ingresso/)).toBe(0);
  });

  it('aba Mensagens: busca as mensagens ao abrir e envia a nova buscando de novo', async () => {
    const mensagem = { id: 'm-1', autor: 'equipe', autorNome: 'Ana Souza', texto: 'Dona Maria passou bem a noite.', criadoEm: '2026-11-22T08:00:00Z' };
    const api = await entrarNoPainel([[/^POST .*\/api\/familia\/mensagens/, { ok: true }], [/^GET .*\/api\/familia\/mensagens/, [mensagem]]]);

    await userEvent.click(screen.getByRole('button', { name: /Mensagens/ }));
    expect(await screen.findByText('Dona Maria passou bem a noite.')).toBeInTheDocument();
    expect(chamadas(api, /^GET .*\/api\/familia\/mensagens/)).toBe(1);

    await userEvent.type(screen.getByLabelText('Sua mensagem'), 'Obrigada, vou passar à tarde.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/familia\/mensagens/)).toBe(2));
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/familia/mensagens'));
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ texto: 'Obrigada, vou passar à tarde.' });
  });

  it('aba Dúvidas: a pergunta digitada recebe a resposta pronta; sem resposta, oferece falar com a equipe', async () => {
    const respostas = [{ resposta: 'Das 14h às 16h.', pergunta: 'Qual o horário de visita?' }, { resposta: null, pergunta: null }];
    await entrarNoPainel([[/^POST .*\/api\/familia\/duvida/, () => respostas.shift()]]);

    await userEvent.click(screen.getByRole('button', { name: /Dúvidas/ }));
    const campo = await screen.findByLabelText('Sua dúvida');
    await userEvent.type(campo, 'que horas posso visitar?{Enter}');

    expect(await screen.findByText('Das 14h às 16h.')).toBeInTheDocument();
    expect(campo).toHaveValue('');

    await userEvent.type(campo, 'posso levar um bolo?');
    await userEvent.click(screen.getByRole('button', { name: 'Perguntar' }));

    expect(await screen.findByText(/Não encontrei uma resposta pronta/)).toBeInTheDocument();
  });
});
