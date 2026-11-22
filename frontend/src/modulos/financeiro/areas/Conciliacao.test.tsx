import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvedorFinanceiro } from '../contexto';
import { Conciliacao } from './Conciliacao';
import type { ClienteFinanceiro } from '../api/cliente';

/*
 * Conciliação bancária: depois de aceitar as sugestões fortes, importar o extrato, lançar uma linha ou ignorá-la,
 * a tela busca as pendências de novo (`void pendencias.recarregar()`); lançar também recarrega as contas,
 * categorias e centros. Cada teste monta duas linhas do banco e, na segunda busca, devolve a lista já resolvida.
 */

const conta = { id: 'c-1', nome: 'Banco X', tipo: 'corrente', banco: 'X', agencia: null, numero: null, ativa: true, saldo: '1000.00', ultimoMovimento: null };
const categoria = {
  id: 'cat-1', paiId: null, grupo: 'despesa_fin', grupoRotulo: 'Despesas financeiras', natureza: 'despesa', codigo: null,
  nome: 'Tarifas bancárias', comportamento: 'variavel', sistema: null, ativa: true, usos: 0,
};
const tarifa = { id: 'l-1', data: '2026-11-10', valor: '-150.00', descricao: 'TARIFA MANUTENCAO', documento: null, sugestao: null, alternativas: [] };
const pix = {
  id: 'l-2', data: '2026-11-11', valor: '320.00', descricao: 'PIX Maria', documento: null, alternativas: [],
  sugestao: { id: 'm-1', tipo: 'movimento', data: '2026-11-11', valor: '320.00', descricao: 'Mensalidade Maria', pontuacao: 90, motivos: ['valor igual'] },
};
const pendencias = (linhas: unknown[]) => ({ conta: { id: 'c-1', nome: 'Banco X' }, linhas, ultimaImportacao: null, saldoSistemaNaData: null, diferenca: null });

function montar(extras: Record<string, unknown> = {}) {
  const api = {
    sessao: vi.fn().mockResolvedValue({ permissoes: ['operacao:criar', 'operacao:editar'] }),
    contas: vi.fn().mockResolvedValue([conta]),
    categorias: vi.fn().mockResolvedValue([categoria]),
    centros: vi.fn().mockResolvedValue([]),
    pendencias: vi.fn().mockResolvedValueOnce(pendencias([tarifa, pix])).mockResolvedValue(pendencias([])),
    ...extras,
  } as unknown as ClienteFinanceiro & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <ProvedorFinanceiro api={api} navegar={() => {}}>
      <Conciliacao />
    </ProvedorFinanceiro>,
  );
  return api;
}
const aguardarPendencias = () => screen.findByText('TARIFA MANUTENCAO');
const resolvido = () => screen.findByText('Nada para conciliar nesta conta.');
const linhaDe = (texto: string) => within(screen.getByText(texto).closest('tr')!);

describe('Conciliação bancária', () => {
  it('aceitar as sugestões fortes: concilia, avisa e busca as pendências de novo', async () => {
    const api = montar({ conciliarFortes: vi.fn().mockResolvedValue({ conciliadas: 1 }) });
    await aguardarPendencias();

    await userEvent.click(screen.getByRole('button', { name: /Aceitar 1 sugestão/ }));

    expect(await screen.findByText('1 linha(s) conciliada(s).')).toBeInTheDocument();
    expect(api.conciliarFortes).toHaveBeenCalledWith('c-1');
    await resolvido();
    expect(api.pendencias).toHaveBeenCalledTimes(2);
  });

  it('importar um extrato OFX: manda o arquivo, avisa quantas linhas entraram e busca as pendências de novo', async () => {
    const api = montar({ importarExtrato: vi.fn().mockResolvedValue({ novas: 3, repetidas: 1, inicio: null, fim: null, saldoBanco: null }) });
    await aguardarPendencias();

    await userEvent.click(screen.getByRole('button', { name: 'Importar extrato' }));
    const janela = await screen.findByRole('dialog');
    const importar = within(janela).getByRole('button', { name: 'Importar' });
    expect(importar).toBeDisabled(); // sem arquivo não há o que importar
    await userEvent.upload(janela.querySelector('input[type="file"]') as HTMLInputElement, new File(['OFXHEADER:100'], 'extrato.ofx'));
    await waitFor(() => expect(importar).toBeEnabled());
    await userEvent.click(importar);

    expect(await screen.findByText('3 linha(s) nova(s), 1 já importada(s) antes.')).toBeInTheDocument();
    expect(api.importarExtrato).toHaveBeenCalledWith('c-1', { formato: 'ofx', nomeArquivo: 'extrato.ofx', conteudoBase64: btoa('OFXHEADER:100') });
    await resolvido();
    expect(api.pendencias).toHaveBeenCalledTimes(2);
  });

  it('importar um CSV: pede em que coluna está cada dado e manda a escolha', async () => {
    const api = montar({ importarExtrato: vi.fn().mockResolvedValue({ novas: 2, repetidas: 0, inicio: null, fim: null, saldoBanco: null }) });
    await aguardarPendencias();

    await userEvent.click(screen.getByRole('button', { name: 'Importar extrato' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.upload(janela.querySelector('input[type="file"]') as HTMLInputElement, new File(['data;historico;montante'], 'extrato.csv'));
    const valor = await within(janela).findByLabelText('Coluna do valor');
    await userEvent.clear(valor);
    await userEvent.type(valor, 'montante');
    await userEvent.selectOptions(within(janela).getByLabelText('Formato da data'), '%Y-%m-%d');
    await userEvent.selectOptions(within(janela).getByLabelText('Separador decimal'), '.');
    await userEvent.click(within(janela).getByRole('button', { name: 'Importar' }));

    expect(await screen.findByText('2 linha(s) nova(s).')).toBeInTheDocument();
    expect(api.importarExtrato).toHaveBeenCalledWith('c-1', expect.objectContaining({
      formato: 'csv', csv: { colunaData: 'data', colunaDescricao: 'descricao', colunaValor: 'montante', formatoData: '%Y-%m-%d', decimal: '.' },
    }));
  });

  it('lançar uma linha do extrato: precisa da categoria, lança, avisa e recarrega pendências e cadastros', async () => {
    const api = montar({ lancarDoExtrato: vi.fn().mockResolvedValue({}) });
    await aguardarPendencias();

    await userEvent.click(linhaDe('TARIFA MANUTENCAO').getByRole('button', { name: 'Lançar' }));
    const janela = await screen.findByRole('dialog');
    const lancar = within(janela).getByRole('button', { name: 'Lançar' });
    expect(lancar).toBeDisabled(); // sem categoria não lança
    await userEvent.selectOptions(within(janela).getByLabelText('Categoria'), 'cat-1');
    await userEvent.click(lancar);

    expect(await screen.findByText('Lançado e conciliado.')).toBeInTheDocument();
    expect(api.lancarDoExtrato).toHaveBeenCalledWith('l-1', { categoriaId: 'cat-1', centroCustoId: null, descricao: 'TARIFA MANUTENCAO' });
    await resolvido();
    expect(api.pendencias).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(api.contas).toHaveBeenCalledTimes(2)); // os saldos mudaram
    expect(api.categorias).toHaveBeenCalledTimes(2);
    expect(api.centros).toHaveBeenCalledTimes(2);
  });

  it('ignorar uma linha: pede o motivo, manda e busca as pendências de novo', async () => {
    const api = montar({ ignorarLinha: vi.fn().mockResolvedValue({}) });
    await aguardarPendencias();

    await userEvent.click(linhaDe('TARIFA MANUTENCAO').getByRole('button', { name: 'Ignorar' }));
    const janela = await screen.findByRole('dialog');
    await userEvent.type(within(janela).getByLabelText(/Motivo/), 'Estorno da própria tarifa no mesmo dia');
    await userEvent.click(within(janela).getByRole('button', { name: 'Ignorar' }));

    await resolvido();
    expect(api.ignorarLinha).toHaveBeenCalledWith('l-1', 'Estorno da própria tarifa no mesmo dia');
    expect(api.pendencias).toHaveBeenCalledTimes(2);
  });

  it('a API recusar a conciliação das fortes: mostra o motivo e não busca de novo', async () => {
    const api = montar({ conciliarFortes: vi.fn().mockRejectedValue(new Error('Período já fechado.')) });
    await aguardarPendencias();

    await userEvent.click(screen.getByRole('button', { name: /Aceitar 1 sugestão/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Período já fechado.');
    expect(api.pendencias).toHaveBeenCalledTimes(1);
  });
});
