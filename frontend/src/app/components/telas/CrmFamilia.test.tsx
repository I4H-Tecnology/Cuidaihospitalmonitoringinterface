import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import { ChatbotScreen, MensagensScreen, NpsScreen } from './CrmFamilia';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const aoNavegar = () => {};
const corpoDoPost = (api: ReturnType<typeof fetchFalso>, fim: string) => {
  const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith(fim));
  return JSON.parse(String(envio?.[1]?.body));
};

describe('Mensagens: conversa com a família', () => {
  const conversa = {
    pacienteId: 'p-1', pacienteNome: 'Maria Alves', ambienteNome: 'Quarto 101', acompanhantesAtivos: 1, naoLidas: 0,
    ultimaTexto: null, ultimaAutor: null, ultimaEm: null,
  };
  const nova = { id: 'm-1', autor: 'equipe', autorNome: 'Ana Souza', texto: 'Dona Maria passou bem o dia.', lidaEm: null, criadoEm: '2026-11-22T10:00:00Z' };
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/mensagens/, nova],
    [/^GET .*\/api\/mensagens\/conversas/, [conversa]],
    [/^GET .*\/api\/pacientes\/p-1\/mensagens/, []],
  ];
  const abrirConversa = async () => {
    const api = fetchFalso(rotas);
    render(<MensagensScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Maria Alves/ }));
    const campo = await screen.findByLabelText('Mensagem para a família');
    return { api, campo };
  };

  it('Enter envia a mensagem: ela aparece na conversa, o campo esvazia e a lista de conversas é buscada de novo', async () => {
    const { api, campo } = await abrirConversa();
    const antes = chamadas(api, /^GET .*\/api\/mensagens\/conversas/);

    await userEvent.type(campo, 'Dona Maria passou bem o dia.{Enter}');

    expect(await screen.findByText('Dona Maria passou bem o dia.', { selector: 'p' })).toBeInTheDocument();
    expect(campo).toHaveValue('');
    expect(corpoDoPost(api, '/api/mensagens')).toMatchObject({ pacienteId: 'p-1', texto: 'Dona Maria passou bem o dia.' });
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/mensagens\/conversas/)).toBeGreaterThan(antes));
  });

  it('Shift+Enter só quebra a linha: nada é enviado', async () => {
    const { api, campo } = await abrirConversa();

    await userEvent.type(campo, 'primeira linha{Shift>}{Enter}{/Shift}segunda linha');

    expect(campo).toHaveValue('primeira linha\nsegunda linha');
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('Enter com o campo em branco não envia', async () => {
    const { api, campo } = await abrirConversa();

    await userEvent.type(campo, '   {Enter}');

    expect(chamadas(api, /^POST /)).toBe(0);
  });
});

describe('Respostas automáticas (chatbot)', () => {
  const resposta = { id: 'r-1', pergunta: 'Qual o horário de visita?', palavrasChave: ['visita', 'horário'], resposta: 'Das 14h às 16h.', ativa: true, usos: 3 };
  const semResposta = { id: 'q-1', texto: 'posso levar bolo?', criadoEm: '2026-11-21T10:00:00Z', respondidaCom: null };
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/chatbot\/respostas/, { ...resposta, id: 'r-2' }],
    [/^PATCH .*\/api\/chatbot\/respostas\/r-1/, resposta],
    [/^GET .*\/api\/chatbot\/respostas/, [resposta]],
    [/^GET .*\/api\/chatbot\/perguntas/, [semResposta]],
  ];

  it('editar uma resposta: manda a alteração, avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<ChatbotScreen onNavigate={aoNavegar} />);
    await screen.findByText('Das 14h às 16h.');

    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const janela = await screen.findByRole('dialog', { name: 'Editar resposta' });
    const texto = within(janela).getByLabelText('Resposta *');
    await userEvent.clear(texto);
    await userEvent.type(texto, 'Das 15h às 17h.');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Resposta atualizada.')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/chatbot\/respostas/)).toBe(2));
    const envio = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ resposta: 'Das 15h às 17h.', palavrasChave: ['visita', 'horário'] });
  });

  it('criar a resposta de uma pergunta que ficou sem resposta: já vem com a pergunta e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<ChatbotScreen onNavigate={aoNavegar} />);
    await screen.findByText('Das 14h às 16h.');

    await userEvent.click(screen.getByRole('tab', { name: /Perguntas das famílias/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Criar resposta' }));
    const janela = await screen.findByRole('dialog', { name: 'Nova resposta' });
    expect(within(janela).getByLabelText('Pergunta *')).toHaveValue('posso levar bolo?');
    await userEvent.type(within(janela).getByLabelText(/^Palavras-chave/), 'bolo, comida');
    await userEvent.type(within(janela).getByLabelText('Resposta *'), 'Pode, avise a enfermagem.');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Resposta criada. O portal já usa.')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/chatbot\/respostas/)).toBe(2));
    expect(corpoDoPost(api, '/api/chatbot/respostas')).toMatchObject({ pergunta: 'posso levar bolo?', palavrasChave: ['bolo', 'comida'] });
  });

  it.each([
    ['sem pergunta', async (j: HTMLElement) => {
      await userEvent.type(within(j).getByLabelText(/^Palavras-chave/), 'bolo');
      await userEvent.type(within(j).getByLabelText('Resposta *'), 'Pode.');
    }, 'Escreva a pergunta como a família faria.'],
    ['sem palavra-chave', async (j: HTMLElement) => {
      await userEvent.type(within(j).getByLabelText('Pergunta *'), 'posso levar bolo?');
      await userEvent.type(within(j).getByLabelText('Resposta *'), 'Pode.');
    }, 'Informe pelo menos uma palavra-chave.'],
    ['sem resposta', async (j: HTMLElement) => {
      await userEvent.type(within(j).getByLabelText('Pergunta *'), 'posso levar bolo?');
      await userEvent.type(within(j).getByLabelText(/^Palavras-chave/), 'bolo');
    }, 'Escreva a resposta.'],
  ])('nova resposta %s: avisa e não envia', async (_nome, preencher, mensagem) => {
    const api = fetchFalso(rotas);
    render(<ChatbotScreen onNavigate={aoNavegar} />);
    await screen.findByText('Das 14h às 16h.');
    await userEvent.click(screen.getByRole('button', { name: /Nova resposta/ }));
    const janela = await screen.findByRole('dialog', { name: 'Nova resposta' });

    await preencher(janela);
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await within(janela).findByText(mensagem)).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});

describe('Satisfação (NPS): registrar resposta', () => {
  // Sem respostas: a tela não desenha o gráfico (o jsdom não mede tamanho).
  const vazio = { nps: null, total: 0, promotores: 0, neutros: 0, detratores: 0, distribuicao: new Array(11).fill(0), porMes: [], respostas: [] };
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/satisfacao/, { ok: true }],
    [/^GET .*\/api\/satisfacao/, vazio],
  ];

  it('registrar: manda nota, canal e comentário, avisa e busca a satisfação de novo', async () => {
    const api = fetchFalso(rotas);
    render(<NpsScreen onNavigate={aoNavegar} />);
    await screen.findByText('Nenhuma resposta no período');

    await userEvent.click(screen.getByRole('button', { name: /Registrar resposta/ }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('radio', { name: '9' }));
    await userEvent.selectOptions(within(janela).getByLabelText('Canal'), 'presencial');
    await userEvent.type(within(janela).getByLabelText('Comentário'), 'Equipe atenciosa.');
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText('Resposta registrada.')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/satisfacao/)).toBe(2));
    expect(corpoDoPost(api, '/api/satisfacao')).toMatchObject({ nota: 9, canal: 'presencial', comentario: 'Equipe atenciosa.' });
  });

  it('sem escolher a nota: avisa e não envia', async () => {
    const api = fetchFalso(rotas);
    render(<NpsScreen onNavigate={aoNavegar} />);
    await screen.findByText('Nenhuma resposta no período');
    await userEvent.click(screen.getByRole('button', { name: /Registrar resposta/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar' }));

    expect(await within(janela).findByText('Escolha a nota.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});
