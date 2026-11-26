import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fetchComFalha, fetchFalso } from '@/test/telas';
import { AgendaScreen, LembretesScreen, ExamesScreen, CampanhasScreen } from './Crm';
import { MensagensScreen, ChatbotScreen, HistoricoAtendimentoScreen, NpsScreen } from './CrmFamilia';
import {
  IncidentesScreen, LinhaEventosScreen, AgitacaoNoturnaScreen, AusenciaScreen, ScoreRiscoScreen, SensoresScreen,
} from './Monitoramento';
import {
  InternacoesScreen, AltaTransferenciaScreen, FluxoPacienteScreen, EscalasScreen, ChecklistsScreen,
} from './Operacional';
import { IndicadoresChaveScreen, AlertasPrioritariosScreen } from './Painel';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

/*
 * Estas telas pegam os dados com `useDados` e têm um botão "Atualizar" e callbacks de "salvou" que
 * chamam `recarregar()` sem esperar (`void recarregar()`). Isso só é seguro porque `recarregar`
 * nunca rejeita (provado em useDados.test.tsx). Aqui se confere o lado da tela: abre, mostra a
 * falha da API em vez de quebrar, e o botão busca de novo.
 */
const aoNavegar = () => {};

// Telas que esperam um objeto (e não uma lista) precisam de uma resposta de exemplo para abrir.
// Sem respostas: a tela mostra o estado vazio. Com respostas ela desenha gráfico (recharts), que não mede tamanho no jsdom.
const nps = { nps: null, total: 0, promotores: 0, neutros: 0, detratores: 0, distribuicao: new Array(11).fill(0), porMes: [], respostas: [] };
const movimentacoes = { movimentacoes: [], censo: [{ ambienteId: 'a-1', nome: 'Quarto 101', tipo: 'quarto', pacientes: 1 }], semAmbiente: 0 };
const escala = { turnos: [], equipe: [] };

interface Tela {
  nome: string;
  ui: () => ReactElement;
  /** Respostas de exemplo por rota, para as telas que não abrem com lista vazia. */
  rotas?: Array<[RegExp, unknown]>;
  /** A tela mostra a falha da API? (a do histórico só lista pacientes e ignora o erro) */
  mostraFalha?: boolean;
  /** A tela tem botão "Atualizar"? */
  temAtualizar?: boolean;
}

const telas: Tela[] = [
  { nome: 'Agenda', ui: () => <AgendaScreen onNavigate={aoNavegar} /> },
  { nome: 'Lembretes', ui: () => <LembretesScreen onNavigate={aoNavegar} /> },
  { nome: 'Exames', ui: () => <ExamesScreen onNavigate={aoNavegar} /> },
  { nome: 'Campanhas', ui: () => <CampanhasScreen onNavigate={aoNavegar} /> },
  { nome: 'Mensagens da família', ui: () => <MensagensScreen onNavigate={aoNavegar} /> },
  { nome: 'Chatbot', ui: () => <ChatbotScreen onNavigate={aoNavegar} />, temAtualizar: false },
  { nome: 'Histórico de atendimento', ui: () => <HistoricoAtendimentoScreen onNavigate={aoNavegar} />, mostraFalha: false, temAtualizar: false },
  { nome: 'Satisfação (NPS)', ui: () => <NpsScreen onNavigate={aoNavegar} />, rotas: [[/\/api\/satisfacao/, nps]], temAtualizar: false },
  { nome: 'Incidentes', ui: () => <IncidentesScreen onNavigate={aoNavegar} /> },
  { nome: 'Linha de eventos', ui: () => <LinhaEventosScreen onNavigate={aoNavegar} /> },
  { nome: 'Agitação noturna', ui: () => <AgitacaoNoturnaScreen onNavigate={aoNavegar} /> },
  { nome: 'Ausência prolongada', ui: () => <AusenciaScreen onNavigate={aoNavegar} /> },
  { nome: 'Score de risco', ui: () => <ScoreRiscoScreen onNavigate={aoNavegar} /> },
  { nome: 'Sensores', ui: () => <SensoresScreen onNavigate={aoNavegar} /> },
  { nome: 'Internações', ui: () => <InternacoesScreen onNavigate={aoNavegar} /> },
  { nome: 'Alta e transferência', ui: () => <AltaTransferenciaScreen onNavigate={aoNavegar} /> },
  { nome: 'Fluxo do paciente', ui: () => <FluxoPacienteScreen onNavigate={aoNavegar} />, rotas: [[/\/api\/movimentacoes/, movimentacoes]], temAtualizar: false },
  { nome: 'Escalas', ui: () => <EscalasScreen onNavigate={aoNavegar} />, rotas: [[/\/api\/escalas/, escala]], temAtualizar: false },
  { nome: 'Checklists', ui: () => <ChecklistsScreen onNavigate={aoNavegar} /> },
  { nome: 'Indicadores-chave', ui: () => <IndicadoresChaveScreen onNavigate={aoNavegar} /> },
  { nome: 'Alertas prioritários', ui: () => <AlertasPrioritariosScreen onNavigate={aoNavegar} /> },
];

afterEach(() => vi.unstubAllGlobals());

describe.each(telas)('$nome', ({ ui, rotas, mostraFalha = true, temAtualizar = true }) => {
  it('abre e busca os dados', async () => {
    const api = fetchFalso(rotas);
    render(ui());
    await waitFor(() => expect(api).toHaveBeenCalled());
  });

  it.runIf(mostraFalha)('API recusando: mostra o motivo na tela', async () => {
    const api = fetchComFalha('Banco indisponível.');
    render(ui());
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect((await screen.findAllByText(/Banco indisponível\./)).length).toBeGreaterThan(0);
  });

  it.runIf(temAtualizar)('o botão Atualizar busca de novo', async () => {
    const api = fetchFalso(rotas);
    render(ui());
    await waitFor(() => expect(api).toHaveBeenCalled());
    const antes = api.mock.calls.length;
    const botoes = await screen.findAllByRole('button', { name: /Atualizar/i });
    await userEvent.click(botoes[0]);
    await waitFor(() => expect(api.mock.calls.length).toBeGreaterThan(antes));
  });
});
