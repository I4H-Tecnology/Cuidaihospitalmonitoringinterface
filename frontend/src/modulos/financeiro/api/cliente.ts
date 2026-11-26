/**
 * Cliente da API do financeiro.
 *
 *   const api = criarClienteFinanceiro({
 *     baseUrl: 'https://api.minhaempresa.com',
 *     obterToken: () => sessao.token,
 *     aoPerderSessao: () => irParaLogin(),
 *   });
 *
 * O cliente não sabe onde o token mora nem como o hospedeiro faz login: só
 * pergunta a `obterToken` a cada chamada. É isso que deixa esta pasta ser
 * copiada para outro projeto sem mudar uma linha.
 */

import type * as T from './tipos';

export class ErroFinanceiro extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ErroFinanceiro';
  }
}

export interface OpcoesDoCliente {
  /** Origem da API, sem barra no fim. Vazio = mesma origem da página. */
  baseUrl?: string;
  /** Caminho onde o router do financeiro está montado. */
  prefixo?: string;
  obterToken?: () => string | null | undefined;
  /** Chamado quando a API responde 401: a sessão acabou. */
  aoPerderSessao?: () => void;
  fetch?: typeof fetch;
}

type Consulta = Record<string, string | number | boolean | null | undefined>;

// Sem regex: `/\/+$/` tem custo quadrático numa entrada cheia de barras (S8786).
function semBarraFinal(url: string): string {
  let fim = url.length;
  while (fim > 0 && url[fim - 1] === '/') fim -= 1;
  return url.slice(0, fim);
}

export type ClienteFinanceiro = ReturnType<typeof criarClienteFinanceiro>;

export function criarClienteFinanceiro(opcoes: OpcoesDoCliente = {}) {
  const base = semBarraFinal(opcoes.baseUrl ?? '') + (opcoes.prefixo ?? '/api/financeiro');
  const buscar = opcoes.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function pedir<R>(metodo: string, caminho: string, corpo?: unknown, consulta?: Consulta): Promise<R> {
    const params = new URLSearchParams();
    for (const [chave, valor] of Object.entries(consulta ?? {})) {
      if (valor !== undefined && valor !== null && valor !== '') params.set(chave, String(valor));
    }
    const url = `${base}${caminho}${params.toString() ? `?${params}` : ''}`;
    const token = opcoes.obterToken?.();
    const resposta = await buscar(url, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    if (!resposta.ok) {
      const carga = await resposta.json().catch(() => ({}));
      if (resposta.status === 401) opcoes.aoPerderSessao?.();
      // `error` é o envelope do MedSignal e do modo serviço; `detail`, o padrão
      // do FastAPI — aceitar os dois deixa o cliente servir a qualquer hospedeiro.
      const detalhe = carga?.error ?? carga?.detail;
      const mensagem = typeof detalhe === 'string'
        ? detalhe
        : Array.isArray(detalhe)
          ? 'Dados inválidos: confira os campos.'
          : 'Não foi possível concluir a operação.';
      throw new ErroFinanceiro(mensagem, resposta.status);
    }
    return resposta.json() as Promise<R>;
  }

  const get = <R>(caminho: string, consulta?: Consulta) => pedir<R>('GET', caminho, undefined, consulta);
  const post = <R>(caminho: string, corpo: unknown = {}) => pedir<R>('POST', caminho, corpo);
  const patch = <R>(caminho: string, corpo: unknown) => pedir<R>('PATCH', caminho, corpo);
  const put = <R>(caminho: string, corpo: unknown) => pedir<R>('PUT', caminho, corpo);
  const del = <R>(caminho: string) => pedir<R>('DELETE', caminho);

  return {
    // Empresa e configurações
    sessao: () => get<T.Sessao>('/sessao'),
    grupos: () => get<{ grupos: T.Grupo[]; atividades: Record<string, string> }>('/grupos'),
    organizacao: () => get<T.Organizacao>('/organizacao'),
    salvarOrganizacao: (dados: Partial<T.Organizacao>) => patch<T.Organizacao>('/organizacao', dados),
    alterarFechamento: (fechadoAte: string | null, motivo: string) =>
      post<T.Organizacao>('/organizacao/fechamento', { fechadoAte, motivo }),
    auditoria: (filtro: { tabela?: string; registroId?: string; limite?: number } = {}) =>
      get<T.Auditoria[]>('/auditoria', filtro),
    feriados: (ano?: number) => get<T.Feriado[]>('/feriados', { ano }),
    criarFeriado: (data: string, nome: string) => post<T.Feriado>('/feriados', { data, nome }),
    removerFeriado: (id: string) => del('/feriados/' + id),
    tabelasFiscais: () => get<T.TabelaFiscal[]>('/tabelas-fiscais'),
    criarTabelaFiscal: (dados: { tipo: string; vigencia: string; fonte: string; dados: unknown }) =>
      post<T.TabelaFiscal>('/tabelas-fiscais', dados),

    // Cadastros
    contas: (consulta: { data?: string; incluirInativas?: boolean } = {}) => get<T.Conta[]>('/contas', consulta),
    criarConta: (dados: Record<string, unknown>) => post<T.Conta>('/contas', dados),
    editarConta: (id: string, dados: Record<string, unknown>) => patch<T.Conta>('/contas/' + id, dados),
    categorias: () => get<T.Categoria[]>('/categorias'),
    criarCategoria: (dados: Record<string, unknown>) => post<T.Categoria>('/categorias', dados),
    editarCategoria: (id: string, dados: Record<string, unknown>) => patch<T.Categoria>('/categorias/' + id, dados),
    centros: () => get<T.CentroCusto[]>('/centros-custo'),
    criarCentro: (dados: Record<string, unknown>) => post<T.CentroCusto>('/centros-custo', dados),
    editarCentro: (id: string, dados: Record<string, unknown>) => patch<T.CentroCusto>('/centros-custo/' + id, dados),
    pessoas: (consulta: { busca?: string; papel?: string; incluirInativas?: boolean; limite?: number; deslocamento?: number } = {}) =>
      get<T.Pagina<T.Pessoa>>('/pessoas', consulta),
    pessoa: (id: string) => get<T.Pessoa>('/pessoas/' + id),
    criarPessoa: (dados: Record<string, unknown>) => post<T.Pessoa>('/pessoas', dados),
    editarPessoa: (id: string, dados: Record<string, unknown>) => patch<T.Pessoa>('/pessoas/' + id, dados),
    importarPessoas: (pessoas: Array<{ referenciaExterna: string; nome: string; tipo?: string; observacao?: string }>) =>
      post<{ criadas: number; atualizadas: number }>('/pessoas/importar', { pessoas }),
    recorrencias: () => get<T.Recorrencia[]>('/recorrencias'),
    criarRecorrencia: (dados: Record<string, unknown>) => post<T.Recorrencia>('/recorrencias', dados),
    editarRecorrencia: (id: string, dados: Record<string, unknown>) => patch<T.Recorrencia>('/recorrencias/' + id, dados),
    gerarRecorrencias: (ate?: string) => post<{ gerados: number; ate: string }>('/recorrencias/gerar', { ate }),

    // Contas a pagar e a receber
    parcelas: (consulta: {
      tipo: T.TipoTitulo; situacao?: string; de?: string; ate?: string; pessoaId?: string;
      categoriaId?: string; centroCustoId?: string; busca?: string; limite?: number; deslocamento?: number;
    }) => get<T.ListaParcelas>('/parcelas', consulta),
    resumoTitulos: (tipo: T.TipoTitulo) => get<T.ResumoTitulos>('/parcelas/resumo', { tipo }),
    titulo: (id: string) => get<T.Titulo>('/titulos/' + id),
    criarTitulo: (dados: Record<string, unknown>) => post<T.Titulo>('/titulos', dados),
    editarTitulo: (id: string, dados: Record<string, unknown>) => patch<T.Titulo>('/titulos/' + id, dados),
    cancelarTitulo: (id: string, motivo: string) => post<T.Titulo>(`/titulos/${id}/cancelamento`, { motivo }),
    alterarParcela: (id: string, dados: Record<string, unknown>) => patch<T.Titulo>('/parcelas/' + id, dados),
    /** As parcelas em aberto como devem ficar: com `id` alteram, sem `id` entram, as que faltarem saem. */
    reparcelar: (tituloId: string, dados: { parcelas: T.ParcelaDoPlano[]; motivo?: string | null }) =>
      put<T.Titulo>(`/titulos/${tituloId}/parcelas`, dados),
    baixar: (parcelaId: string, dados: Record<string, unknown>) => post<T.Titulo>(`/parcelas/${parcelaId}/baixas`, dados),
    baixarEmLote: (dados: { parcelaIds: string[]; contaId: string; data?: string; forma?: string }) =>
      post<{ quitadas: number }>('/parcelas/baixas-em-lote', dados),
    estornarBaixa: (baixaId: string, motivo: string, data?: string) =>
      post<T.Titulo>(`/baixas/${baixaId}/estorno`, { motivo, data }),

    // Caixa
    extrato: (contaId: string, de?: string, ate?: string) => get<T.Extrato>(`/contas/${contaId}/extrato`, { de, ate }),
    transferir: (dados: Record<string, unknown>) => post<{ transferenciaId: string }>('/transferencias', dados),
    estornarTransferencia: (id: string, motivo: string) => post(`/transferencias/${id}/estorno`, { motivo }),
    ajustarSaldo: (contaId: string, dados: Record<string, unknown>) =>
      post<{ diferenca: string; saldo: string }>(`/contas/${contaId}/ajuste-saldo`, dados),

    // Conciliação
    importarExtrato: (contaId: string, dados: Record<string, unknown>) =>
      post<{ novas: number; repetidas: number; inicio: string | null; fim: string | null; saldoBanco: string | null }>(
        `/contas/${contaId}/extratos`, dados),
    pendencias: (contaId: string) => get<T.Pendencias>(`/contas/${contaId}/conciliacao`),
    conciliar: (linhaId: string, alvo: { movimentoId?: string; parcelaId?: string }) =>
      post(`/extrato-linhas/${linhaId}/conciliacao`, alvo),
    lancarDoExtrato: (linhaId: string, dados: Record<string, unknown>) => post(`/extrato-linhas/${linhaId}/lancamento`, dados),
    ignorarLinha: (linhaId: string, motivo: string) => post(`/extrato-linhas/${linhaId}/ignorar`, { motivo }),
    conciliarFortes: (contaId: string) => post<{ conciliadas: number }>(`/contas/${contaId}/conciliacao/sugestoes-fortes`),

    // Pessoal
    colaboradores: (incluirDesligados = false) => get<T.Colaborador[]>('/colaboradores', { incluirDesligados }),
    colaborador: (id: string) => get<T.Colaborador>('/colaboradores/' + id),
    criarColaborador: (dados: Record<string, unknown>) => post<T.Colaborador>('/colaboradores', dados),
    editarColaborador: (id: string, dados: Record<string, unknown>) => patch<T.Colaborador>('/colaboradores/' + id, dados),
    salvarFixo: (colaboradorId: string, dados: Record<string, unknown>, fixoId?: string) =>
      fixoId
        ? patch<T.Colaborador>(`/colaboradores/${colaboradorId}/fixos/${fixoId}`, dados)
        : post<T.Colaborador>(`/colaboradores/${colaboradorId}/fixos`, dados),
    removerFixo: (colaboradorId: string, fixoId: string) => del<T.Colaborador>(`/colaboradores/${colaboradorId}/fixos/${fixoId}`),
    rubricas: () => get<T.Rubrica[]>('/rubricas'),
    salvarRubrica: (dados: Record<string, unknown>, id?: string) =>
      id ? patch<T.Rubrica>('/rubricas/' + id, dados) : post<T.Rubrica>('/rubricas', dados),
    folhas: (ano?: number) => get<T.FolhaResumo[]>('/folhas', { ano }),
    folha: (id: string) => get<T.Folha>('/folhas/' + id),
    criarFolha: (dados: { competencia: string; tipo: string; dataPagamento?: string }) => post<T.Folha>('/folhas', dados),
    excluirFolha: (id: string) => del('/folhas/' + id),
    recalcularFolha: (id: string) => post<T.Folha>(`/folhas/${id}/recalculo`),
    lancarNaFolha: (id: string, dados: Record<string, unknown>) => post<T.Holerite>(`/folhas/${id}/lancamentos`, dados),
    removerLancamento: (folhaId: string, itemId: string) => del<T.Holerite>(`/folhas/${folhaId}/lancamentos/${itemId}`),
    fecharFolha: (id: string) => post<T.Folha>(`/folhas/${id}/fechamento`),
    reabrirFolha: (id: string, motivo: string) => post<T.Folha>(`/folhas/${id}/reabertura`, { motivo }),
    holerite: (id: string) => get<T.Holerite>('/holerites/' + id),
    ajustarHolerite: (id: string, dados: Record<string, unknown>) => put<T.Holerite>(`/holerites/${id}/ajuste`, dados),
    removerAjuste: (id: string) => del<T.Holerite>(`/holerites/${id}/ajuste`),
    custosPessoal: (competencia?: string) => get<T.CustosPessoal>('/pessoal/custos', { competencia }),

    // Capital
    resumoCapital: () => get<T.ResumoCapital>('/capital/resumo'),
    socios: () => get<T.Socios>('/socios'),
    salvarSocio: (dados: Record<string, unknown>, id?: string) =>
      id ? patch<T.Socios>('/socios/' + id, dados) : post<T.Socios>('/socios', dados),
    operacaoSocio: (id: string, dados: Record<string, unknown>) => post<T.Socios>(`/socios/${id}/operacoes`, dados),
    simularEmprestimo: (dados: Record<string, unknown>) => post<T.SimulacaoEmprestimo>('/emprestimos/simulacao', dados),
    emprestimos: () => get<{ itens: T.Emprestimo[]; totais: T.ResumoCapital['emprestimos'] }>('/emprestimos'),
    emprestimo: (id: string) => get<T.Emprestimo>('/emprestimos/' + id),
    criarEmprestimo: (dados: Record<string, unknown>) => post<T.Emprestimo>('/emprestimos', dados),
    cancelarEmprestimo: (id: string, motivo: string) => post<T.Emprestimo>(`/emprestimos/${id}/cancelamento`, { motivo }),
    investimentos: () => get<{ contas: Array<T.Conta & { aplicado: string; resgatado: string; rendimentoAcumulado: string }>; total: string }>('/investimentos'),
    atualizarInvestimento: (contaId: string, saldoInformado: string, data?: string) =>
      post(`/investimentos/${contaId}/atualizacao`, { saldoInformado, data }),
    ativos: () => get<T.Ativos>('/ativos'),
    criarAtivo: (dados: Record<string, unknown>) => post<T.Ativo>('/ativos', dados),
    editarAtivo: (id: string, dados: Record<string, unknown>) => patch<T.Ativo>('/ativos/' + id, dados),
    baixarAtivo: (id: string, dados: Record<string, unknown>) => post<T.Ativo>(`/ativos/${id}/baixa`, dados),

    // Planejamento
    orcamento: (ano: number) => get<T.Orcamento>(`/orcamento/${ano}`),
    salvarOrcamento: (ano: number, linhas: Array<{ categoriaId: string; centroCustoId?: string | null; valores: string[] }>) =>
      put<T.Orcamento>(`/orcamento/${ano}`, { linhas }),
    copiarOrcamento: (ano: number, dados: { anoOrigem: number; base: 'orcado' | 'realizado'; reajuste: string }) =>
      post<T.Orcamento>(`/orcamento/${ano}/copia`, dados),
    /** Sem `mes`, a API escolhe: o atual no ano corrente, dezembro num ano passado. */
    comparativo: (ano: number, mes?: number) => get<T.Comparativo>(`/orcamento/${ano}/comparativo`, { mes }),

    // Relatórios
    painel: () => get<T.Painel>('/painel'),
    dre: (consulta: { de?: string; ate?: string; regime?: string; centroCustoId?: string }) => get<T.Dre>('/relatorios/dre', consulta),
    fluxoCaixa: (consulta: { de?: string; ate?: string; agrupamento?: string }) => get<T.FluxoCaixa>('/relatorios/fluxo-caixa', consulta),
    fluxoProjetado: (consulta: { dias?: number; agrupamento?: string; incluirVencidos?: boolean }) =>
      get<T.FluxoProjetado>('/relatorios/fluxo-projetado', consulta),
    inadimplencia: (tipo: T.TipoTitulo) => get<T.Inadimplencia>('/relatorios/inadimplencia', { tipo }),
  };
}
