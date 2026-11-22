import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fetchComFalha, fetchFalso } from '@/test/telas';
import { BedsRoomsScreen } from './BedsRoomsScreen';
import { PatientsScreen } from './PatientsScreen';
import { EvolucoesScreen } from './clinica/EvolucoesScreen';
import { RiscosScreen } from './clinica/RiscosScreen';
import { LinhaDoTempoScreen } from './clinica/LinhaDoTempoScreen';
import { ContratosScreen } from './ContratosScreen';
import { ComprasScreen } from './ComprasScreen';
import { PatientListScreen } from './pep/PatientListScreen';
import { AppPacienteScreen } from './AppPacienteScreen';
import { AbaCameras } from './settings/AbaCameras';
import { AbaClinica } from './settings/AbaClinica';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

/*
 * Cada tela busca os dados ao abrir por uma função `carregar()` que o código solta com `void`
 * (a promessa não é esperada). Isso só é seguro se a função nunca rejeitar: falha da API vira
 * mensagem na tela e o carregamento termina. Estes testes abrem a tela com a API respondendo bem
 * e com a API recusando, e conferem as duas coisas.
 */
// `erro` é o texto que a tela mostra quando a API recusa (umas repetem a mensagem da API, outras têm a sua).
const telas: Array<{ nome: string; ui: () => ReactElement; erro: RegExp }> = [
  { nome: 'Ambientes e câmeras', ui: () => <BedsRoomsScreen />, erro: /Não foi possível carregar os ambientes/ },
  { nome: 'Pacientes', ui: () => <PatientsScreen aoAbrirPaciente={() => {}} />, erro: /Não foi possível carregar os pacientes/ },
  { nome: 'Evoluções', ui: () => <EvolucoesScreen aoAbrirPaciente={() => {}} />, erro: /Não foi possível carregar as evoluções/ },
  { nome: 'Riscos', ui: () => <RiscosScreen aoAbrirPaciente={() => {}} />, erro: /Não foi possível carregar alergias e riscos/ },
  { nome: 'Linha do tempo', ui: () => <LinhaDoTempoScreen aoAbrirPaciente={() => {}} />, erro: /Não foi possível carregar/ },
  { nome: 'Contratos', ui: () => <ContratosScreen />, erro: /Banco indisponível\./ },
  { nome: 'Compras', ui: () => <ComprasScreen />, erro: /Banco indisponível\./ },
  { nome: 'Lista de prontuários', ui: () => <PatientListScreen onSelectPatient={() => {}} />, erro: /Não foi possível carregar os pacientes/ },
  { nome: 'App do acompanhante (acessos)', ui: () => <AppPacienteScreen />, erro: /Banco indisponível\./ },
  { nome: 'Configurações › Câmeras', ui: () => <AbaCameras />, erro: /Não foi possível carregar as câmeras/ },
  { nome: 'Configurações › Clínica', ui: () => <AbaClinica />, erro: /Não foi possível carregar|Banco indisponível/ },
];

afterEach(() => vi.unstubAllGlobals());

describe.each(telas)('$nome', ({ ui, erro }) => {
  it('busca os dados ao abrir e não quebra com resposta vazia', async () => {
    const api = fetchFalso();
    render(ui());
    await waitFor(() => expect(api).toHaveBeenCalled());
  });

  it('API recusando: mostra o motivo na tela', async () => {
    const api = fetchComFalha('Banco indisponível.');
    render(ui());
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect((await screen.findAllByText(erro)).length).toBeGreaterThan(0);
  });
});
