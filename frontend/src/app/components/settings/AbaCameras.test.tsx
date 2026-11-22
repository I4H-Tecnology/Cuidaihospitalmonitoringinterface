import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import { AbaCameras } from './AbaCameras';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const ambiente = { id: 'a-1', nome: 'Quarto 101', tipo: 'quarto', cameras: 1, pacienteNome: null };
const camera = {
  id: 'c-1', identificador: 'CAM-QUARTO101', urlStream: 'rtsp://***@192.168.0.10:554/stream', status: 'ativa', conectada: true,
  ultimoPing: null, ambienteId: 'a-1', ambienteNome: 'Quarto 101', ambienteTipo: 'quarto', pacienteId: null, pacienteNome: null,
  ocorrencias24h: 0, ultimaOcorrencia: null, visaoUrl: null,
};
const rotas: Array<[RegExp, unknown]> = [
  [/^GET .*\/api\/cameras/, [camera]],
  [/^GET .*\/api\/ambientes/, [ambiente]],
  [/^POST .*\/api\/cameras/, { ...camera, id: 'c-2', identificador: 'CAM-SALA-TV' }],
  [/^PATCH .*\/api\/cameras\/c-1/, { ...camera, identificador: 'CAM-QUARTO101-B' }],
];

async function abrirModalNovo() {
  render(<AbaCameras />);
  await screen.findByText('CAM-QUARTO101');
  await userEvent.click(screen.getByRole('button', { name: /Adicionar Dispositivo/ }));
  return screen.findByRole('dialog');
}

/*
 * O formulário de câmera tem rótulos ligados aos campos (`htmlFor`/`id`): quem usa leitor de tela, ou
 * clica no texto do rótulo, cai no campo certo. E depois de salvar, `void carregar()` atualiza a lista.
 */
describe('Câmeras: formulário', () => {
  it('clicar no texto do rótulo leva o foco ao campo dele', async () => {
    fetchFalso(rotas);
    const janela = await abrirModalNovo();

    await userEvent.click(within(janela).getByText('ID do Dispositivo *'));
    expect(within(janela).getByLabelText('ID do Dispositivo *')).toHaveFocus();

    await userEvent.click(within(janela).getByText('Vídeo ao vivo (serviço de visão)'));
    expect(within(janela).getByLabelText('Vídeo ao vivo (serviço de visão)')).toHaveFocus();
  });

  it('cadastrar: manda os dados, fecha a janela, avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    const janela = await abrirModalNovo();

    await userEvent.type(within(janela).getByLabelText('ID do Dispositivo *'), 'CAM-SALA-TV');
    await userEvent.type(within(janela).getByPlaceholderText(/rtsp:\/\//), 'rtsp://u:p@192.168.0.20:554/stream');
    await userEvent.click(within(janela).getByRole('button', { name: 'Adicionar Dispositivo' }));

    expect(await screen.findByText('Câmera CAM-SALA-TV cadastrada.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/cameras'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ ambienteId: 'a-1', identificador: 'CAM-SALA-TV', urlStream: 'rtsp://u:p@192.168.0.20:554/stream' });
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/cameras/)).toBe(2));
  });

  it('editar: a URL do stream em branco mantém a atual, e a lista é buscada de novo', async () => {
    const api = fetchFalso(rotas);
    render(<AbaCameras />);
    await screen.findByText('CAM-QUARTO101');
    await userEvent.click(screen.getByTitle('Editar'));
    const janela = await screen.findByRole('dialog');

    const id = within(janela).getByLabelText('ID do Dispositivo *');
    await userEvent.clear(id);
    await userEvent.type(id, 'CAM-QUARTO101-B');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Câmera CAM-QUARTO101-B atualizada.')).toBeInTheDocument();
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'PATCH' && String(url).includes('/api/cameras/c-1'));
    const corpo = JSON.parse(String(envio?.[1]?.body));
    expect(corpo).toMatchObject({ identificador: 'CAM-QUARTO101-B', ambienteId: 'a-1' });
    expect(corpo).not.toHaveProperty('urlStream'); // em branco = manter a atual
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/cameras/)).toBe(2));
  });

  it.each([
    ['sem ID', async (j: HTMLElement) => { await userEvent.click(within(j).getByRole('button', { name: 'Adicionar Dispositivo' })); }, 'Informe o ID da câmera.'],
    ['sem URL do stream', async (j: HTMLElement) => {
      await userEvent.type(within(j).getByLabelText('ID do Dispositivo *'), 'CAM-X');
      await userEvent.click(within(j).getByRole('button', { name: 'Adicionar Dispositivo' }));
    }, 'Informe a URL do stream (RTSP ou HTTP).'],
    ['endereço do vídeo sem http', async (j: HTMLElement) => {
      await userEvent.type(within(j).getByLabelText('ID do Dispositivo *'), 'CAM-X');
      await userEvent.type(within(j).getByPlaceholderText(/rtsp:\/\//), 'rtsp://u:p@10.0.0.1/s');
      await userEvent.type(within(j).getByLabelText('Vídeo ao vivo (serviço de visão)'), 'localhost:8002');
      await userEvent.click(within(j).getByRole('button', { name: 'Adicionar Dispositivo' }));
    }, 'O endereço do vídeo ao vivo começa com http:// ou https://.'],
  ])('não cadastra %s e diz o que corrigir', async (_nome, preencher, mensagem) => {
    const api = fetchFalso(rotas);
    const janela = await abrirModalNovo();

    await preencher(janela);

    expect(await within(janela).findByRole('alert')).toHaveTextContent(mensagem);
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('sensor e tablet aparecem desabilitados, com o motivo, e o tipo continua Câmera', async () => {
    fetchFalso(rotas);
    const janela = await abrirModalNovo();
    const tipo = within(janela).getByLabelText('Tipo *') as HTMLSelectElement;

    const sensor = within(janela).getByRole('option', { name: /Sensor/ });
    const tablet = within(janela).getByRole('option', { name: /Tablet/ });
    expect(sensor).toBeDisabled();
    expect(sensor).toHaveAttribute('title', expect.stringContaining('a detecção de queda é feita pela câmera'));
    expect(tablet).toBeDisabled();

    await userEvent.selectOptions(tipo, 'sensor'); // tentativa de escolher: o navegador não deixa
    expect(tipo.value).toBe('camera');
    expect(within(janela).getByRole('button', { name: 'Adicionar Dispositivo' })).toBeEnabled();
  });

  it('editando, o tipo fica travado', async () => {
    fetchFalso(rotas);
    render(<AbaCameras />);
    await screen.findByText('CAM-QUARTO101');
    await userEvent.click(screen.getByTitle('Editar'));
    const janela = await screen.findByRole('dialog');

    expect(within(janela).getByLabelText('Tipo *')).toBeDisabled();
  });
});
