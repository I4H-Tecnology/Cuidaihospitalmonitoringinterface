import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import { AltaTransferenciaScreen, ChecklistsScreen, EscalasScreen, InternacoesScreen } from './Operacional';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const aoNavegar = () => {};
const hoje = new Date().toLocaleDateString('sv-SE'); // mesmo formato que a tela usa para o dia

const maria = {
  id: 'p-1', nome: 'Maria Alves', status: 'internado', dataAdmissao: '2026-11-01', ambienteId: 'a-1', ambienteNome: 'Quarto 101',
  situacao: 'stable', ocorrenciasAbertas: 0, quedasConfirmadas: 0, totalOcorrencias: 0,
};
const ambientes = [
  { id: 'a-1', nome: 'Quarto 101', tipo: 'quarto', cameras: 1, pacienteNome: 'Maria Alves' },
  { id: 'a-2', nome: 'Quarto 102', tipo: 'quarto', cameras: 1, pacienteNome: null },
];
const semMovimentacao = { movimentacoes: [], censo: [], semAmbiente: 0 };

/*
 * Depois de admitir, transferir, dar saída, escalar ou concluir um checklist, a tela busca os dados de novo
 * (`void recarregar()`): é isso que faz a pessoa ver o resultado sem apertar "Atualizar".
 */
describe('Internações: nova admissão', () => {
  it('admitir: manda os dados, fecha, avisa e busca pacientes e movimentações de novo', async () => {
    const api = fetchFalso([
      [/^POST .*\/api\/pacientes$/, { ...maria, id: 'p-9', nome: 'Carlos Dias' }],
      [/^GET .*\/api\/pacientes\?/, [maria]],
      [/^GET .*\/api\/movimentacoes/, semMovimentacao],
      [/^GET .*\/api\/ambientes/, ambientes],
    ]);
    render(<InternacoesScreen onNavigate={aoNavegar} />);
    await screen.findByText('Maria Alves');

    await userEvent.click(screen.getByRole('button', { name: /Nova admissão/ }));
    await userEvent.type(await screen.findByLabelText(/^Nome/), 'Carlos Dias');
    await userEvent.click(screen.getByRole('button', { name: 'Admitir paciente' }));

    expect(await screen.findByText('Carlos Dias admitido(a).')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/pacientes\?/)).toBe(2));
    expect(chamadas(api, /^GET .*\/api\/movimentacoes/)).toBe(2);
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/pacientes'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ nome: 'Carlos Dias' });
  });
});

describe('Alta e transferência', () => {
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/pacientes\/p-1\/transferir/, { ok: true }],
    [/^POST .*\/api\/pacientes\/p-1\/alta/, { acessosRevogados: 2 }],
    [/^GET .*\/api\/pacientes\?/, [maria]],
    [/^GET .*\/api\/movimentacoes/, semMovimentacao],
    [/^GET .*\/api\/ambientes/, ambientes],
  ];

  it('transferir: manda destino e motivo, avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<AltaTransferenciaScreen onNavigate={aoNavegar} />);
    await screen.findByText('Maria Alves');

    await userEvent.click(screen.getByRole('button', { name: /Transferir/ }));
    const janela = await screen.findByRole('dialog');
    await within(janela).findByRole('option', { name: /Quarto 102/ }); // as opções vêm da API
    expect(within(janela).queryByRole('option', { name: /Quarto 101/ })).toBeNull(); // o ambiente de hoje não é destino
    await userEvent.selectOptions(within(janela).getByLabelText('Destino *'), 'a-2');
    await userEvent.type(within(janela).getByLabelText('Motivo *'), 'Mais perto do posto');
    await userEvent.click(within(janela).getByRole('button', { name: 'Transferir' }));

    expect(await screen.findByText('Maria Alves transferido(a) para Quarto 102.')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/pacientes\?/)).toBe(2));
    expect(chamadas(api, /^GET .*\/api\/movimentacoes/)).toBe(2);
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/transferir'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ ambienteId: 'a-2', motivo: 'Mais perto do posto' });
  });

  it.each([
    ['sem destino', async (j: HTMLElement) => { await userEvent.type(within(j).getByLabelText('Motivo *'), 'Mais perto do posto'); }, 'Escolha o ambiente de destino.'],
    ['sem motivo', async (j: HTMLElement) => {
      await within(j).findByRole('option', { name: /Quarto 102/ });
      await userEvent.selectOptions(within(j).getByLabelText('Destino *'), 'a-2');
    }, 'Informe o motivo.'],
  ])('transferir %s: avisa e não envia', async (_nome, preencher, mensagem) => {
    const api = fetchFalso(rotas);
    render(<AltaTransferenciaScreen onNavigate={aoNavegar} />);
    await screen.findByText('Maria Alves');
    await userEvent.click(screen.getByRole('button', { name: /Transferir/ }));
    const janela = await screen.findByRole('dialog');

    await preencher(janela);
    await userEvent.click(within(janela).getByRole('button', { name: 'Transferir' }));

    expect(await within(janela).findByText(mensagem)).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });

  it('dar saída: registra, conta os acessos da família encerrados e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<AltaTransferenciaScreen onNavigate={aoNavegar} />);
    await screen.findByText('Maria Alves');

    await userEvent.click(screen.getByRole('button', { name: /Saída/ }));
    const janela = await screen.findByRole('dialog');
    await userEvent.click(within(janela).getByRole('radio', { name: /Transferência para outro serviço/ }));
    await userEvent.type(within(janela).getByLabelText('Observação'), 'Levada ao hospital X');
    await userEvent.click(within(janela).getByRole('button', { name: 'Confirmar saída' }));

    expect(await screen.findByText('Saída de Maria Alves registrada; 2 acesso(s) da família encerrado(s).')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/pacientes\?/)).toBe(2));
    expect(chamadas(api, /^GET .*\/api\/movimentacoes/)).toBe(2);
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/alta'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ motivo: 'transferido', observacao: 'Levada ao hospital X' });
  });
});

describe('Escalas', () => {
  const escala = {
    turnos: [{ id: 't-1', usuarioId: 'u-2', usuarioNome: 'Bruno Lima', data: hoje, turno: 'manha', funcao: 'Líder' }],
    equipe: [{ id: 'u-2', nome: 'Bruno Lima', perfil: 'Enfermeiro' }, { id: 'u-3', nome: 'Carla Dias', perfil: 'Técnica' }],
  };
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/escalas/, { id: 't-9' }],
    [/^DELETE .*\/api\/escalas\/t-1/, { ok: true }],
    [/^GET .*\/api\/escalas/, escala],
  ];

  it('tirar alguém do turno: apaga e busca a escala de novo', async () => {
    const api = fetchFalso(rotas);
    render(<EscalasScreen onNavigate={aoNavegar} />);
    await screen.findByText(/Bruno/);

    await userEvent.click(screen.getByRole('button', { name: 'Tirar Bruno Lima do turno' }));

    await waitFor(() => expect(chamadas(api, /^DELETE .*\/api\/escalas\/t-1/)).toBe(1));
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/escalas/)).toBe(2));
  });

  it('escalar: escolhe o profissional e a função, manda e busca a escala de novo', async () => {
    const api = fetchFalso(rotas);
    render(<EscalasScreen onNavigate={aoNavegar} />);
    await screen.findByText(/Bruno/);

    await userEvent.click(screen.getAllByRole('button', { name: /^Escalar em/ })[0]);
    const janela = await screen.findByRole('dialog', { name: 'Escalar profissional' });
    await userEvent.selectOptions(within(janela).getByLabelText('Profissional *'), 'u-3');
    await userEvent.type(within(janela).getByLabelText('Função no turno'), 'Enfermeira líder');
    await userEvent.click(within(janela).getByRole('button', { name: 'Escalar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/api/escalas'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ usuarioId: 'u-3', funcao: 'Enfermeira líder' });
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/escalas/)).toBe(2));
  });

  it('escalar sem escolher o profissional: avisa e não envia', async () => {
    const api = fetchFalso(rotas);
    render(<EscalasScreen onNavigate={aoNavegar} />);
    await screen.findByText(/Bruno/);

    await userEvent.click(screen.getAllByRole('button', { name: /^Escalar em/ })[0]);
    const janela = await screen.findByRole('dialog', { name: 'Escalar profissional' });
    await userEvent.click(within(janela).getByRole('button', { name: 'Escalar' }));

    expect(await within(janela).findByText('Escolha o profissional.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});

describe('Checklists', () => {
  const modelo = {
    id: 'm-1', titulo: 'Passagem de plantão', descricao: null, itens: ['Conferir grades das camas', 'Câmeras com sinal'],
    frequencia: 'turno', ativo: true, ultimaExecucaoEm: null, execucoes7d: 0,
  };
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/checklists\/execucoes/, { ok: true, itensFeitos: 1, itensTotal: 2 }],
    [/^POST .*\/api\/checklists\/modelos/, { ...modelo, id: 'm-2', titulo: 'Ronda noturna' }],
    [/^PATCH .*\/api\/checklists\/modelos\/m-1/, { ...modelo, titulo: 'Passagem de plantão (nova)' }],
    [/^GET .*\/api\/checklists\/modelos/, [modelo]],
    [/^GET .*\/api\/checklists\/execucoes/, []],
  ];

  it('executar: marca o que foi feito, registra e busca modelos e histórico de novo', async () => {
    const api = fetchFalso(rotas);
    render(<ChecklistsScreen onNavigate={aoNavegar} />);
    await screen.findByText('Passagem de plantão');

    await userEvent.click(screen.getByRole('button', { name: 'Executar agora' }));
    const janela = await screen.findByRole('dialog', { name: 'Passagem de plantão' });
    await userEvent.click(within(janela).getByLabelText('Conferir grades das camas'));
    await userEvent.type(within(janela).getByLabelText('Observação sobre: Câmeras com sinal'), 'Câmera 3 sem sinal');
    await userEvent.click(within(janela).getByRole('button', { name: 'Concluir checklist' }));

    expect(await screen.findByText('Checklist registrado: 1 de 2 itens feitos.')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/checklists\/modelos/)).toBe(2));
    expect(chamadas(api, /^GET .*\/api\/checklists\/execucoes/)).toBe(2);
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/execucoes'));
    expect(JSON.parse(String(envio?.[1]?.body)).respostas).toEqual([
      { item: 'Conferir grades das camas', feito: true, observacao: null },
      { item: 'Câmeras com sinal', feito: false, observacao: 'Câmera 3 sem sinal' },
    ]);
  });

  it('criar um checklist: manda nome e itens, avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<ChecklistsScreen onNavigate={aoNavegar} />);
    await screen.findByText('Passagem de plantão');

    await userEvent.click(screen.getByRole('button', { name: /Novo checklist/ }));
    const janela = await screen.findByRole('dialog', { name: 'Novo checklist' });
    await userEvent.type(within(janela).getByLabelText('Nome *'), 'Ronda noturna');
    await userEvent.type(within(janela).getByLabelText('Itens * (um por linha)'), 'Luzes de emergência{Enter}Portas trancadas');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Checklist criado.')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/checklists\/modelos/)).toBe(2));
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/checklists/modelos'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ titulo: 'Ronda noturna', itens: ['Luzes de emergência', 'Portas trancadas'] });
  });

  it('editar um checklist: manda a alteração, avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<ChecklistsScreen onNavigate={aoNavegar} />);
    await screen.findByText('Passagem de plantão');

    await userEvent.click(screen.getByRole('tab', { name: /Todos os checklists/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Editar/ }));
    const janela = await screen.findByRole('dialog', { name: 'Editar checklist' });
    await userEvent.type(within(janela).getByLabelText('Nome *'), ' (nova)');
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Checklist atualizado.')).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/checklists\/modelos/)).toBe(2));
    const envio = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ titulo: 'Passagem de plantão (nova)' });
  });

  it.each([
    ['sem nome', async (j: HTMLElement) => { await userEvent.type(within(j).getByLabelText('Itens * (um por linha)'), 'Um item'); }, 'Dê um nome ao checklist.'],
    ['sem itens', async (j: HTMLElement) => { await userEvent.type(within(j).getByLabelText('Nome *'), 'Ronda noturna'); }, 'Escreva pelo menos um item, um por linha.'],
  ])('criar %s: avisa e não envia', async (_nome, preencher, mensagem) => {
    const api = fetchFalso(rotas);
    render(<ChecklistsScreen onNavigate={aoNavegar} />);
    await screen.findByText('Passagem de plantão');
    await userEvent.click(screen.getByRole('button', { name: /Novo checklist/ }));
    const janela = await screen.findByRole('dialog', { name: 'Novo checklist' });

    await preencher(janela);
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }));

    expect(await within(janela).findByText(mensagem)).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});
