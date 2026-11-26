import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fetchFalso } from '@/test/telas';
import { AlertsScreen } from './AlertsScreen';

// Suíte inteira rodando junto deixa a máquina lenta: o prazo padrão de 5 s derrubava um teste de vez em quando.
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/app/contexts/AuthContext', async () => (await import('@/test/telas')).moduloDeAutenticacao());

afterEach(() => vi.unstubAllGlobals());

const agora = () => new Date().toISOString();

const real = {
  id: 'o-real', tipoEvento: 'queda', status: 'pendente', dataHora: agora(), ambienteId: 'a-1', ambienteNome: 'Quarto 102',
  pacienteNome: 'Maria Alves', cameraIdentificador: 'CAM-QUARTO102', alertaNivel: 'critico', alertaStatus: 'enviado', temClipe: false,
};

const ensaio = {
  id: 'o-ensaio', tipoEvento: 'permanencia_solo', status: 'encerrada', dataHora: '2026-01-15T13:10:16.000Z', ambienteId: 'a-2', ambienteNome: 'Quarto 101',
  pacienteNome: null, cameraIdentificador: 'CAM-QUARTO101', alertaNivel: 'critico', alertaStatus: 'ciente', temClipe: true, ensaio: true,
  observacao: 'ENSAIO CONTROLADO · DADOS DE DEMONSTRAÇÃO. Registro de teste feito pelo autor; NÃO houve atendimento real.',
};

/** O número de um indicador do topo: o rótulo também existe em botões de filtro, então só vale o <p>. */
const valorDoIndicador = (rotulo: string) => {
  const p = screen.getAllByText(rotulo).find((el) => el.tagName === 'P');
  if (!p?.previousElementSibling) throw new Error(`indicador "${rotulo}" não encontrado`);
  return p.previousElementSibling;
};

/* Registros de ensaio controlado: aparecem na lista, com selo, e não entram em nenhum número. */
describe('Alertas clínicos: registros de ensaio controlado', () => {
  it('o registro de ensaio aparece na lista com o selo e com o aviso do servidor', async () => {
    fetchFalso([[/^GET .*\/api\/ocorrencias/, [real, ensaio]]]);
    render(<AlertsScreen />);

    expect(await screen.findByText('ENSAIO CONTROLADO')).toBeInTheDocument(); // o selo (texto exato)
    expect(screen.getByText(/Registro de teste feito pelo autor; NÃO houve atendimento real/)).toBeInTheDocument();
    expect(screen.getAllByText('ENSAIO CONTROLADO')).toHaveLength(1); // só o do ensaio, não o da ocorrência real
  });

  it('a ciência pré-marcada do ensaio não vira "sem ciência", e a ocorrência real continua mostrando', async () => {
    fetchFalso([[/^GET .*\/api\/ocorrencias/, [real, ensaio]]]);
    render(<AlertsScreen />);

    await screen.findByText('ENSAIO CONTROLADO');
    expect(screen.getAllByText('sem ciência')).toHaveLength(1);
  });

  it('os indicadores contam só a operação: o ensaio não entra nem no Total', async () => {
    fetchFalso([[/^GET .*\/api\/ocorrencias/, [real, ensaio]]]);
    render(<AlertsScreen />);

    await screen.findByText('ENSAIO CONTROLADO');
    expect(valorDoIndicador('Total')).toHaveTextContent('1');
    expect(valorDoIndicador('Pendentes')).toHaveTextContent('1');
    expect(valorDoIndicador('Quedas confirmadas')).toHaveTextContent('0');
  });

  it('sem registro de ensaio não aparece selo nenhum', async () => {
    fetchFalso([[/^GET .*\/api\/ocorrencias/, [real]]]);
    render(<AlertsScreen />);

    await screen.findByText('Maria Alves');
    expect(screen.queryByText('ENSAIO CONTROLADO')).not.toBeInTheDocument();
    expect(valorDoIndicador('Total')).toHaveTextContent('1');
  });
});
