import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../contexto';
import { HoleriteModal } from './pessoal/HoleriteModal';
import { Configuracoes } from './Configuracoes';
import type { ClienteFinanceiro } from '../api/cliente';

/*
 * Remover um lançamento da folha e remover um feriado eram "await api...(); recarregar()" sem
 * try/catch em um onClick: se a API recusasse, a rejeição ficava solta e a pessoa não via nada.
 * Os testes forçam a recusa e conferem o que a tela mostra.
 */

function fabrica(api: Record<string, unknown>) {
  return { sessao: vi.fn().mockResolvedValue({ permissoes: ['cadastros:excluir', 'configuracoes:editar'] }), ...api } as unknown as ClienteFinanceiro;
}

const itemHoleriteBase = {
  id: 'i1', rubricaId: 'r1', codigo: 'HE50', nome: 'Hora extra 50%', tipo: 'provento' as const,
  referencia: '10', valor: '200.00', origem: 'lancado', credorNome: null,
};
const holerite = {
  id: 'h1', colaboradorId: 'c1', nome: 'Maria Souza', cargo: 'Enfermeira', vinculo: 'clt', salarioBase: '3000.00',
  diasTrabalhados: 30, centroCustoNome: null, totalProventos: '3200.00', totalDescontos: '400.00', liquido: '2800.00',
  inss: '300.00', irrf: '50.00', fgts: '240.00', encargosPatronais: '0.00', beneficios: '0.00', avisos: [],
  documento: null, matricula: null, dataAdmissao: '2024-01-01', dependentesIrrf: 0, competencia: '2026-11',
  folhaTipo: 'mensal', folhaStatus: 'rascunho', dataPagamento: '2026-12-05', empresaNome: 'Clínica Teste',
  empresaDocumento: null, baseInss: '3200.00', baseIrrf: '2900.00', baseFgts: '3200.00', detalheIrrf: null,
  ajuste: null, calculado: null, itens: [itemHoleriteBase],
};

describe('HoleriteModal: remover lançamento', () => {
  it('falha da API: avisa o erro, não avisa sucesso e o item continua na tela', async () => {
    const api = fabrica({
      holerite: vi.fn().mockResolvedValue(holerite),
      rubricas: vi.fn().mockResolvedValue([]),
      removerLancamento: vi.fn().mockRejectedValue(new Error('A folha já foi fechada: não dá para remover lançamentos.')),
    });
    const mudou = vi.fn();
    render(
      <ProvedorFinanceiro api={api} navegar={() => {}}>
        <HoleriteModal holeriteId="h1" folhaId="f1" editavel aoFechar={() => {}} aoMudar={mudou} />
      </ProvedorFinanceiro>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Remover Hora extra 50%' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A folha já foi fechada: não dá para remover lançamentos.');
    expect(screen.getByText('Hora extra 50%')).toBeInTheDocument();
    expect(mudou).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sucesso: o holerite devolvido pela API entra na tela e a folha é avisada', async () => {
    const api = fabrica({
      holerite: vi.fn().mockResolvedValue(holerite),
      rubricas: vi.fn().mockResolvedValue([]),
      removerLancamento: vi.fn().mockResolvedValue({ ...holerite, itens: [] }),
    });
    const mudou = vi.fn();
    render(
      <ProvedorFinanceiro api={api} navegar={() => {}}>
        <HoleriteModal holeriteId="h1" folhaId="f1" editavel aoFechar={() => {}} aoMudar={mudou} />
      </ProvedorFinanceiro>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Remover Hora extra 50%' }));

    await vi.waitFor(() => expect(mudou).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Hora extra 50%')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Configuracoes › Feriados: remover feriado', () => {
  const feriado = { id: 'f1', data: '2026-12-08', nome: 'Aniversário da cidade', nacional: false };

  async function abrirFeriados(api: ClienteFinanceiro) {
    render(
      <ProvedorFinanceiro api={api} navegar={() => {}}>
        <Configuracoes />
      </ProvedorFinanceiro>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Feriados' }));
  }

  it('falha da API: avisa o erro e o feriado continua na lista', async () => {
    const api = fabrica({
      organizacao: () => new Promise(() => {}), // a aba "Empresa" fica carregando; não é o assunto
      feriados: vi.fn().mockResolvedValue([feriado]),
      removerFeriado: vi.fn().mockRejectedValue(new Error('Feriado em período já fechado.')),
    });
    await abrirFeriados(api);

    await userEvent.click(await screen.findByRole('button', { name: 'Remover Aniversário da cidade' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Feriado em período já fechado.');
    expect(screen.getByText('Aniversário da cidade')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sucesso: recarrega a lista, que passa a vir sem o feriado', async () => {
    const feriados = vi.fn().mockResolvedValueOnce([feriado]).mockResolvedValue([]);
    const api = fabrica({
      organizacao: () => new Promise(() => {}),
      feriados,
      removerFeriado: vi.fn().mockResolvedValue({}),
    });
    await abrirFeriados(api);

    await userEvent.click(await screen.findByRole('button', { name: 'Remover Aniversário da cidade' }));

    await vi.waitFor(() => expect(screen.queryByText('Aniversário da cidade')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
