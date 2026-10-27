import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuloFinanceiro } from './ModuloFinanceiro';
import { criarClienteFinanceiro } from './api/cliente';

beforeAll(() => {
  // O ResponsiveContainer do recharts mede o elemento; o jsdom não tem ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const TODAS = ['operacao', 'cadastros', 'pessoal', 'capital', 'planejamento', 'relatorios', 'configuracoes']
  .flatMap((r) => ['ver', 'criar', 'editar', 'excluir'].map((a) => `${r}:${a}`));

const sessao = (permissoes = TODAS) => ({
  versao: '1.0.0', hoje: '2026-09-15', usuario: { ref: 'u1', nome: 'Ana' },
  organizacao: { id: 'o1', nome: 'Clínica Teste', fechadoAte: null }, permissoes,
});

const resumo = { vencido: '100.00', vencidoQuantidade: 1, hoje: '0.00', hojeQuantidade: 0, proximos7: '50.00', proximos30: '300.00', liquidadoNoMes: '0.00' };

const painel = {
  hoje: '2026-09-15', fechadoAte: null,
  contas: [{ id: 'c1', nome: 'Banco Teste', tipo: 'corrente', banco: null, agencia: null, numero: null, ativa: true, saldo: '1234.56', ultimoMovimento: null }],
  saldoTotal: '1234.56', receber: resumo, pagar: resumo,
  resultadoMes: { receitas: '1000.00', despesas: '400.00', resultado: '600.00', mes: '2026-09-01' },
  grafico: [{ mes: '2026-08-01', entradas: '1000.00', saidas: '800.00', tipo: 'realizado' }],
  menorSaldoProjetado: { valor: '100.00', data: '2026-10-01' },
  indicadores: {
    disponivel: '1234.56', cartaoCredito: '0.00', aReceber90Dias: '0.00', aPagar90Dias: '0.00', capitalDeGiro: '1234.56',
    folegoMeses: '2.5', inadimplenciaPercentual: null, prazoMedioRecebimento: null, prazoMedioPagamento: null,
    pontoDeEquilibrioMensal: null, receitaMediaMensal: '0.00',
  },
  proximosVencimentos: [],
  alertas: [{ nivel: 'atencao', mensagem: '1 conta(s) a pagar vencida(s).', area: 'pagar' }],
};

function apiFalsa(permissoes = TODAS) {
  const respostas: Record<string, unknown> = {
    '/sessao': sessao(permissoes),
    '/painel': painel,
    '/parcelas/resumo': resumo,
    '/contas': painel.contas,
    '/categorias': [],
    '/centros-custo': [],
    '/parcelas': {
      quantidade: 1, valor: '300.00', saldo: '300.00',
      itens: [{
        id: 'p1', numero: 1, totalParcelas: 1, vencimento: '2026-09-10', valor: '300.00', valorPago: '0.00', saldo: '300.00',
        status: 'aberta', vencida: true, tituloId: 't1', tipo: 'pagar', descricao: 'Aluguel de setembro', documento: null,
        competencia: '2026-09-01', origem: 'manual', pessoaId: null, pessoaNome: 'Imobiliária', categoriaNome: 'Aluguel e condomínio',
        categorias: 1, ultimoPagamento: null,
      }],
    },
  };
  const fetch = vi.fn(async (url: string) => {
    const caminho = new URL(url, 'http://teste').pathname.replace('/api/financeiro', '');
    if (!(caminho in respostas)) return new Response(JSON.stringify({ error: 'não simulado' }), { status: 404 });
    return new Response(JSON.stringify(respostas[caminho]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { cliente: criarClienteFinanceiro({ fetch: fetch as unknown as typeof globalThis.fetch, obterToken: () => 'token-teste' }), fetch };
}

describe('ModuloFinanceiro', () => {
  it('mostra a visão geral com dinheiro em real e os alertas', async () => {
    const { cliente, fetch } = apiFalsa();
    const navegar = vi.fn();
    render(<ModuloFinanceiro cliente={cliente} area="visao-geral" aoNavegar={navegar} />);
    expect(await screen.findByText('Saldo em contas')).toBeInTheDocument();
    expect(screen.getAllByText(/1\.234,56/).length).toBeGreaterThan(0);
    const alerta = screen.getByText('1 conta(s) a pagar vencida(s).').closest('div')!.parentElement!;
    await userEvent.click(within(alerta).getByRole('button', { name: /ver/i }));
    expect(navegar).toHaveBeenCalledWith('pagar');
    // O token do hospedeiro vai em todas as chamadas.
    const [, opcoes] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((opcoes.headers as Record<string, string>).Authorization).toBe('Bearer token-teste');
  });

  it('lista contas a pagar com a situação e o valor', async () => {
    const { cliente } = apiFalsa();
    render(<ModuloFinanceiro cliente={cliente} area="pagar" aoNavegar={() => {}} />);
    expect(await screen.findByText('Aluguel de setembro')).toBeInTheDocument();
    expect(screen.getByText('Vencida')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument();
  });

  it('esconde as ações sem permissão e bloqueia a área sem acesso', async () => {
    const { cliente } = apiFalsa(['operacao:ver']);
    const { unmount } = render(<ModuloFinanceiro cliente={cliente} area="pagar" aoNavegar={() => {}} />);
    expect(await screen.findByText('Aluguel de setembro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nova conta a pagar/i })).not.toBeInTheDocument();
    unmount();

    render(<ModuloFinanceiro cliente={cliente} area="pessoal" aoNavegar={() => {}} />);
    await waitFor(() => expect(screen.getByText('Acesso não liberado')).toBeInTheDocument());
  });
});
