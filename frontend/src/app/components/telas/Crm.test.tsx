import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chamadas, fetchFalso } from '@/test/telas';
import { AgendaScreen, CampanhasScreen, ExamesScreen, LembretesScreen } from './Crm';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const aoNavegar = () => {};
const hojeAs = (hora: number) => {
  const d = new Date();
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
};

const paciente = { id: 'p-1', nome: 'Ana Paula Souza', ambienteNome: 'Quarto 101', status: 'internado' };

/*
 * Depois de salvar, a tela tem de (1) fechar a janela, (2) avisar o que aconteceu e (3) buscar a lista
 * de novo. O terceiro passo é um `void recarregar()` dentro do callback `aoMudar`/`aoCriar`: sem ele
 * a ação dá certo no servidor e a tela continua mostrando o estado velho.
 */
describe('Agenda do paciente', () => {
  const agendamento = {
    id: 'a-1', pacienteId: 'p-1', pacienteNome: 'Ana Paula Souza', ambienteNome: 'Quarto 101', tipo: 'consulta',
    titulo: 'Consulta cardiologia', inicio: hojeAs(10), fim: null, local: null, profissional: null, observacao: null,
    status: 'agendado', criadoPorNome: null,
  };
  const rotas: Array<[RegExp, unknown]> = [
    [/^GET .*\/api\/agenda/, [agendamento]],
    [/^PATCH .*\/api\/agenda\/a-1/, { ...agendamento, status: 'cancelado' }],
    [/^POST .*\/api\/agenda/, agendamento],
    [/^GET .*\/api\/pacientes/, [paciente]],
  ];

  it('cancelar um compromisso: fecha a janela, avisa e busca a agenda de novo', async () => {
    const api = fetchFalso(rotas);
    render(<AgendaScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Consulta cardiologia/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.click(within(janela).getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Compromisso cancelado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(chamadas(api, /^PATCH .*\/api\/agenda\/a-1/)).toBe(1);
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/agenda/)).toBe(2));
  });

  it('agendar um compromisso novo: manda os dados, fecha a janela, avisa e busca a agenda de novo', async () => {
    const api = fetchFalso(rotas);
    render(<AgendaScreen onNavigate={aoNavegar} />);
    await screen.findByRole('button', { name: /Consulta cardiologia/ });
    await userEvent.click(screen.getByRole('button', { name: `Agendar em ${new Date().toLocaleDateString('pt-BR')}` }));
    const janela = await screen.findByRole('dialog');

    await userEvent.selectOptions(await within(janela).findByLabelText('Paciente *'), 'p-1');
    await userEvent.type(within(janela).getByLabelText(/O quê/), 'Fisioterapia respiratória');
    await userEvent.click(within(janela).getByRole('button', { name: 'Agendar' }));

    expect(await screen.findByText('Compromisso agendado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/api/agenda'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ pacienteId: 'p-1', tipo: 'consulta', titulo: 'Fisioterapia respiratória' });
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/agenda/)).toBe(2));
  });

  it('sem escolher o paciente, não envia e diz o que falta', async () => {
    const api = fetchFalso(rotas);
    render(<AgendaScreen onNavigate={aoNavegar} />);
    await screen.findByRole('button', { name: /Consulta cardiologia/ });
    await userEvent.click(screen.getByRole('button', { name: `Agendar em ${new Date().toLocaleDateString('pt-BR')}` }));
    const janela = await screen.findByRole('dialog');

    await userEvent.click(within(janela).getByRole('button', { name: 'Agendar' }));

    expect(await within(janela).findByText('Escolha o paciente.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});

describe('Lembretes', () => {
  const lembrete = {
    id: 'l-1', titulo: 'Trocar curativo', descricao: null, pacienteId: null, pacienteNome: null,
    proximaEm: new Date(Date.now() + 3 * 3600_000).toISOString(), recorrencia: 'nenhuma', ativo: true,
    ultimaConclusaoEm: null, ultimaConclusaoPor: null,
  };
  const rotas: Array<[RegExp, unknown]> = [
    [/^GET .*\/api\/lembretes/, [lembrete]],
    [/^POST .*\/api\/lembretes\/l-1\/concluir/, lembrete],
    [/^POST .*\/api\/lembretes\/l-1\/desativar/, { ok: true }],
    [/^POST .*\/api\/lembretes$/, lembrete],
    [/^GET .*\/api\/pacientes/, [paciente]],
  ];

  it('concluir: avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<LembretesScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Concluir/ }));

    expect(await screen.findByText('"Trocar curativo" concluído.')).toBeInTheDocument();
    expect(chamadas(api, /^POST .*\/l-1\/concluir/)).toBe(1);
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/lembretes/)).toBe(2));
  });

  it('desativar: avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<LembretesScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText('"Trocar curativo" desativado.')).toBeInTheDocument();
    expect(chamadas(api, /^POST .*\/l-1\/desativar/)).toBe(1);
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/lembretes/)).toBe(2));
  });

  it('novo lembrete: manda os dados, fecha a janela, avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<LembretesScreen onNavigate={aoNavegar} />);
    await screen.findByText('Trocar curativo');
    await userEvent.click(screen.getByRole('button', { name: /Novo lembrete/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.type(within(janela).getByLabelText('Tarefa *'), 'Reavaliar risco de queda');
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar lembrete' }));

    expect(await screen.findByText('Lembrete criado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/lembretes'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ titulo: 'Reavaliar risco de queda', recorrencia: 'nenhuma' });
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/lembretes/)).toBe(2));
  });

  it('tarefa curta demais: não envia', async () => {
    const api = fetchFalso(rotas);
    render(<LembretesScreen onNavigate={aoNavegar} />);
    await screen.findByText('Trocar curativo');
    await userEvent.click(screen.getByRole('button', { name: /Novo lembrete/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.type(within(janela).getByLabelText('Tarefa *'), 'ab');
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar lembrete' }));

    expect(await within(janela).findByText('Descreva a tarefa.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});

describe('Comunicação de exames', () => {
  const exame = {
    id: 'e-1', pacienteId: 'p-1', pacienteNome: 'Ana Paula Souza', exame: 'Hemograma completo', dataExame: '2026-11-18',
    resultado: 'Tudo dentro do esperado.', destinatario: 'Maria (filha)', canal: 'telefone',
    comunicadoEm: new Date().toISOString(), cienciaEm: null,
  };
  const rotas: Array<[RegExp, unknown]> = [
    [/^POST .*\/api\/exames/, exame],
    [/^GET .*\/api\/exames/, []],
    [/^GET .*\/api\/pacientes/, [paciente]],
  ];

  it('registrar a comunicação: manda os dados, fecha a janela, avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<ExamesScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Comunicar exame/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.selectOptions(await within(janela).findByLabelText('Paciente *'), 'p-1');
    await userEvent.type(within(janela).getByLabelText('Exame *'), 'Hemograma completo');
    await userEvent.type(within(janela).getByLabelText(/Resultado, em palavras simples/), 'Tudo dentro do esperado.');
    await userEvent.type(within(janela).getByLabelText('Comunicado a *'), 'Maria (filha)');
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar comunicação' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Comunicação registrada.')).toBeInTheDocument();
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/api/exames'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ pacienteId: 'p-1', exame: 'Hemograma completo', destinatario: 'Maria (filha)', canal: 'telefone' });
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/exames/)).toBe(2));
  });

  it('faltando campo, não envia e diz o que preencher', async () => {
    const api = fetchFalso(rotas);
    render(<ExamesScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Comunicar exame/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.selectOptions(await within(janela).findByLabelText('Paciente *'), 'p-1');
    await userEvent.click(within(janela).getByRole('button', { name: 'Registrar comunicação' }));

    expect(await within(janela).findByText('Preencha exame, resultado e a quem foi comunicado.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});

describe('Campanhas de saúde', () => {
  const campanha = {
    id: 'c-1', titulo: 'Vacinação contra gripe', descricao: null, tipo: 'vacinacao', inicio: '2026-11-01', fim: '2026-12-31',
    metaParticipantes: 10, encerradaEm: null, criadoPorNome: null, participantes: [],
  };
  const rotas: Array<[RegExp, unknown]> = [
    [/^GET .*\/api\/campanhas/, [campanha]],
    [/^POST .*\/api\/campanhas\/c-1\/encerrar/, { ...campanha, encerradaEm: new Date().toISOString() }],
    [/^POST .*\/api\/campanhas\/c-1\/participantes/, { ...campanha, participantes: [{ pacienteId: 'p-1', pacienteNome: 'Ana Paula Souza', registradoEm: new Date().toISOString(), registradoPorNome: null }] }],
    [/^POST .*\/api\/campanhas$/, { ...campanha, id: 'c-2', titulo: 'Semana da prevenção de quedas' }],
    [/^GET .*\/api\/pacientes/, [paciente]],
  ];

  it('encerrar a campanha aberta: avisa e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<CampanhasScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Vacinação contra gripe/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.click(within(janela).getByRole('button', { name: 'Encerrar campanha' }));

    expect(await screen.findByText('Campanha encerrada.')).toBeInTheDocument();
    expect(chamadas(api, /^POST .*\/c-1\/encerrar/)).toBe(1);
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/campanhas/)).toBe(2));
  });

  it('registrar quem participou: avisa a quantidade e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<CampanhasScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Vacinação contra gripe/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.click(await within(janela).findByRole('checkbox', { name: /Ana Paula Souza/ }));
    await userEvent.click(within(janela).getByRole('button', { name: /Registrar 1 participante/ }));

    expect(await screen.findByText('1 participante(s) registrado(s).')).toBeInTheDocument();
    const envio = api.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/c-1/participantes'));
    expect(JSON.parse(String(envio?.[1]?.body))).toMatchObject({ pacienteIds: ['p-1'] });
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/campanhas/)).toBe(2));
  });

  it('criar campanha: avisa, abre a campanha criada e busca a lista de novo', async () => {
    const api = fetchFalso(rotas);
    render(<CampanhasScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova campanha/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.type(within(janela).getByLabelText('Nome *'), 'Semana da prevenção de quedas');
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar campanha' }));

    expect(await screen.findByText('Campanha "Semana da prevenção de quedas" criada.')).toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: /Semana da prevenção de quedas/ })).toBeInTheDocument();
    await waitFor(() => expect(chamadas(api, /^GET .*\/api\/campanhas/)).toBe(2));
  });

  it('nome curto: não envia', async () => {
    const api = fetchFalso(rotas);
    render(<CampanhasScreen onNavigate={aoNavegar} />);
    await userEvent.click(await screen.findByRole('button', { name: /Nova campanha/ }));
    const janela = await screen.findByRole('dialog');

    await userEvent.type(within(janela).getByLabelText('Nome *'), 'ab');
    await userEvent.click(within(janela).getByRole('button', { name: 'Criar campanha' }));

    expect(await within(janela).findByText('Dê um nome à campanha.')).toBeInTheDocument();
    expect(chamadas(api, /^POST /)).toBe(0);
  });
});
