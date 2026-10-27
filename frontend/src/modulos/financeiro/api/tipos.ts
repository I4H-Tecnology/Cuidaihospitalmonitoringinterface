/**
 * O formato das respostas da API do financeiro (backend/financeiro/api).
 * Dinheiro é sempre `Dinheiro` (texto "1234.56"); datas, texto AAAA-MM-DD.
 */

import type { Dinheiro } from '../util/dinheiro';

export type Id = string;
export type Recurso = 'operacao' | 'cadastros' | 'pessoal' | 'capital' | 'planejamento' | 'relatorios' | 'configuracoes';
export type Acao = 'ver' | 'criar' | 'editar' | 'excluir';
export type TipoTitulo = 'pagar' | 'receber';

export interface Sessao {
  versao: string;
  hoje: string;
  usuario: { ref: string; nome: string };
  organizacao: { id: Id; nome: string; fechadoAte: string | null };
  permissoes: string[];
}

export interface Grupo {
  chave: string;
  rotulo: string;
  natureza: 'receita' | 'despesa';
  linhaDre: string | null;
  atividade: 'operacional' | 'investimento' | 'financiamento';
}

export interface Conta {
  id: Id;
  nome: string;
  tipo: 'caixa' | 'corrente' | 'poupanca' | 'investimento' | 'cartao_credito' | 'outro';
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  ativa: boolean;
  saldo: Dinheiro;
  ultimoMovimento: string | null;
}

export interface Categoria {
  id: Id;
  paiId: Id | null;
  grupo: string;
  grupoRotulo: string;
  natureza: 'receita' | 'despesa';
  codigo: string | null;
  nome: string;
  comportamento: 'fixo' | 'variavel';
  sistema: string | null;
  ativa: boolean;
  usos: number;
}

export interface CentroCusto {
  id: Id;
  paiId: Id | null;
  codigo: string | null;
  nome: string;
  ativo: boolean;
}

export interface Pessoa {
  id: Id;
  tipo: 'fisica' | 'juridica';
  nome: string;
  nomeFantasia: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  chavePix: string | null;
  banco?: string | null;
  agencia?: string | null;
  contaBancaria?: string | null;
  endereco?: string | null;
  cliente: boolean;
  fornecedor: boolean;
  referenciaExterna: string | null;
  observacao?: string | null;
  ativa: boolean;
  sistema: string | null;
  colaborador?: boolean;
  socio?: boolean;
  resumo?: { aReceber: Dinheiro; aPagar: Dinheiro; vencidoAReceber: Dinheiro; titulos: number };
}

export interface Pagina<T> {
  total: number;
  itens: T[];
}

export interface Recorrencia {
  id: Id;
  tipo: TipoTitulo;
  descricao: string;
  valor: Dinheiro;
  categoriaId: Id;
  categoriaNome: string;
  centroCustoId: Id | null;
  centroCustoNome: string | null;
  pessoaId: Id | null;
  pessoaNome: string | null;
  frequencia: string;
  diaVencimento: number | null;
  inicio: string;
  fim: string | null;
  geradoAte: string | null;
  ativa: boolean;
  gerados: number;
  proximaOcorrencia: string | null;
}

export interface ParcelaLista {
  id: Id;
  numero: number;
  totalParcelas: number;
  vencimento: string;
  valor: Dinheiro;
  valorPago: Dinheiro;
  saldo: Dinheiro;
  status: 'aberta' | 'parcial' | 'paga' | 'cancelada';
  vencida: boolean;
  tituloId: Id;
  /** Número sequencial do título na empresa ("Título 42"). */
  tituloNumero: number;
  tipo: TipoTitulo;
  descricao: string;
  documento: string | null;
  competencia: string;
  origem: string;
  pessoaId: Id | null;
  pessoaNome: string | null;
  categoriaNome: string | null;
  categorias: number;
  ultimoPagamento: string | null;
}

export interface ListaParcelas {
  quantidade: number;
  valor: Dinheiro;
  saldo: Dinheiro;
  itens: ParcelaLista[];
}

export interface ResumoTitulos {
  vencido: Dinheiro;
  vencidoQuantidade: number;
  hoje: Dinheiro;
  hojeQuantidade: number;
  proximos7: Dinheiro;
  proximos30: Dinheiro;
  liquidadoNoMes: Dinheiro;
}

export interface Baixa {
  id: Id;
  parcelaId: Id;
  data: string;
  valor: Dinheiro;
  juros: Dinheiro;
  multa: Dinheiro;
  desconto: Dinheiro;
  forma: string;
  observacao: string | null;
  estornadaEm: string | null;
  motivoEstorno: string | null;
  criadoPor: string | null;
  contaNome: string;
  conciliada: boolean;
}

export interface ParcelaDetalhe {
  id: Id;
  numero: number;
  vencimento: string;
  valor: Dinheiro;
  valorPago: Dinheiro;
  saldo: Dinheiro;
  status: ParcelaLista['status'];
  vencida: boolean;
  codigoBarras: string | null;
  baixas: Baixa[];
}

/** Uma parcela do plano enviado ao reparcelar. */
export interface ParcelaDoPlano {
  id?: Id;
  vencimento: string;
  valor: Dinheiro;
  codigoBarras?: string | null;
}

export interface Historico {
  tabela: string;
  registroId: Id | null;
  operacao: 'INSERT' | 'UPDATE' | 'DELETE';
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  usuarioNome: string | null;
  motivo: string | null;
  em: string;
}

export interface Titulo {
  id: Id;
  /** Número sequencial na empresa, dado pelo banco; não muda. */
  numero: number;
  tipo: TipoTitulo;
  pessoaId: Id | null;
  pessoaNome: string | null;
  descricao: string;
  documento: string | null;
  competencia: string;
  dataEmissao: string;
  valorTotal: Dinheiro;
  origem: string;
  observacao: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  criadoPor: string | null;
  parcelas: ParcelaDetalhe[];
  rateio: Array<{
    id: Id; categoriaId: Id; categoriaNome: string; grupo: string;
    centroCustoId: Id | null; centroCustoNome: string | null; valor: Dinheiro;
  }>;
  historico: Historico[];
  saldo: Dinheiro;
  editavel: boolean;
  temBaixa: boolean;
}

export interface Movimento {
  id: Id;
  data: string;
  valor: Dinheiro;
  tipo: 'saldo_inicial' | 'baixa' | 'estorno' | 'transferencia' | 'ajuste';
  descricao: string;
  baixaId: Id | null;
  transferenciaId: Id | null;
  tituloId: Id | null;
  pessoaNome: string | null;
  contaContrapartida: string | null;
  conciliado: boolean;
  saldo: Dinheiro;
}

export interface Extrato {
  conta: { id: Id; nome: string; tipo: string };
  de: string;
  ate: string;
  saldoAnterior: Dinheiro;
  entradas: Dinheiro;
  saidas: Dinheiro;
  saldoFinal: Dinheiro;
  movimentos: Movimento[];
}

export interface LinhaDre {
  chave: string;
  rotulo: string;
  valor: Dinheiro;
  tipo: 'linha' | 'subtotal' | 'resultado';
  percentual: string | null;
}

export interface Dre {
  de: string;
  ate: string;
  regime: 'competencia' | 'caixa';
  linhas: LinhaDre[];
  meses: Array<{ mes: string; linhas: LinhaDre[] }>;
  categorias: Array<{
    categoriaId: Id; nome: string; grupo: string; linhaDre: string;
    natureza: string; comportamento: string; valor: Dinheiro;
  }>;
  observacao: string | null;
}

export interface PeriodoFluxo {
  inicio: string;
  fim: string;
  entradas: Dinheiro;
  saidas: Dinheiro;
  ajustes: Dinheiro;
  resultado: Dinheiro;
  saldoInicial: Dinheiro;
  saldoFinal: Dinheiro;
  operacional: Dinheiro;
  investimento: Dinheiro;
  financiamento: Dinheiro;
}

export interface FluxoCaixa {
  de: string;
  ate: string;
  agrupamento: string;
  saldoInicial: Dinheiro;
  saldoFinal: Dinheiro;
  periodos: PeriodoFluxo[];
  categorias: Array<{
    categoriaId: Id; nome: string; grupo: string; grupoRotulo: string; atividade: string;
    natureza: string; valores: Dinheiro[]; total: Dinheiro;
  }>;
  atividades: Record<string, string>;
  totais: Record<string, Dinheiro>;
}

export interface FluxoProjetado {
  hoje: string;
  ate: string;
  agrupamento: string;
  saldoAtual: Dinheiro;
  vencidos: { receber: Dinheiro; pagar: Dinheiro };
  incluiuVencidos: boolean;
  periodos: Array<{
    inicio: string; fim: string; saldoInicial: Dinheiro; entradas: Dinheiro;
    saidas: Dinheiro; saldoFinal: Dinheiro; estimado: Dinheiro;
  }>;
  itens: Array<{ data: string; valor: Dinheiro; origem: string; descricao: string; vencido: boolean }>;
  menorSaldo: { valor: Dinheiro; data: string };
}

export interface Inadimplencia {
  tipo: TipoTitulo;
  vencidas: Array<{ rotulo: string; valor: Dinheiro; quantidade: number }>;
  aVencer: Array<{ rotulo: string; valor: Dinheiro; quantidade: number }>;
  totalVencido: Dinheiro;
  totalAVencer: Dinheiro;
  percentualVencido: string | null;
  pessoas: Array<{ pessoaId: Id | null; nome: string; vencido: Dinheiro; parcelas: number; maiorAtraso: number }>;
}

export interface Indicadores {
  disponivel: Dinheiro;
  cartaoCredito: Dinheiro;
  aReceber90Dias: Dinheiro;
  aPagar90Dias: Dinheiro;
  capitalDeGiro: Dinheiro;
  folegoMeses: string | null;
  inadimplenciaPercentual: string | null;
  prazoMedioRecebimento: string | null;
  prazoMedioPagamento: string | null;
  pontoDeEquilibrioMensal: Dinheiro | null;
  receitaMediaMensal: Dinheiro;
}

export interface Alerta {
  nivel: 'critico' | 'atencao' | 'info';
  mensagem: string;
  area: string;
}

export interface Painel {
  hoje: string;
  fechadoAte: string | null;
  contas: Conta[];
  saldoTotal: Dinheiro;
  receber: ResumoTitulos;
  pagar: ResumoTitulos;
  resultadoMes: { receitas: Dinheiro; despesas: Dinheiro; resultado: Dinheiro; mes: string };
  grafico: Array<{
    mes: string; entradas: Dinheiro; saidas: Dinheiro; tipo: 'realizado' | 'projetado';
    entradasPrevistas?: Dinheiro; saidasPrevistas?: Dinheiro;
  }>;
  menorSaldoProjetado: { valor: Dinheiro; data: string };
  indicadores: Indicadores;
  proximosVencimentos: Array<{
    id: Id; tituloId: Id; tipo: TipoTitulo; descricao: string; pessoaNome: string | null;
    vencimento: string; saldo: Dinheiro; vencida: boolean;
  }>;
  alertas: Alerta[];
}

export interface Organizacao {
  id: Id;
  nome: string;
  documento: string | null;
  regimeTributario: 'mei' | 'simples' | 'presumido' | 'real' | 'outro';
  fechadoAte: string | null;
  capitalSocial: Dinheiro;
  encargoInssPatronal: string;
  encargoRat: string;
  encargoTerceiros: string;
  fgtsAliquota: string;
  percentualAdiantamento: string;
  guiaUnicaDctfweb: boolean;
}

export interface Colaborador {
  id: Id;
  pessoaId: Id;
  nome: string;
  documento: string | null;
  email: string | null;
  chavePix: string | null;
  matricula: string | null;
  cargo: string | null;
  centroCustoId: Id | null;
  centroCustoNome: string | null;
  vinculo: 'clt' | 'aprendiz' | 'estagio' | 'prolabore' | 'pj' | 'autonomo';
  dataAdmissao: string;
  dataDesligamento: string | null;
  salarioBase: Dinheiro;
  horasMes: string;
  dependentesIrrf: number;
  ativo: boolean;
  provisaoMensal?: Dinheiro;
  fixos?: Array<{
    id: Id; rubricaId: Id; codigo: string; rubricaNome: string; tipo: string; calculo: string;
    percentual: string | null; referencia: string | null; valor: Dinheiro | null; limite: Dinheiro | null;
    credorId: Id | null; credorNome: string | null; inicio: string; fim: string | null;
  }>;
  holerites?: Array<{
    id: Id; folhaId: Id; competencia: string; tipo: string; status: string;
    totalProventos: Dinheiro; totalDescontos: Dinheiro; liquido: Dinheiro; custoTotal: Dinheiro;
  }>;
  provisao?: { ferias: Dinheiro; decimoTerceiro: Dinheiro; encargos: Dinheiro; total: Dinheiro };
}

export interface Rubrica {
  id: Id;
  codigo: string;
  nome: string;
  tipo: 'provento' | 'desconto' | 'informativo';
  calculo: 'valor' | 'percentual_salario' | 'horas' | 'dias' | 'sistema';
  percentual: string | null;
  incideInss: boolean;
  incideIrrf: boolean;
  incideFgts: boolean;
  deduzIrrf: boolean;
  entraDsr: boolean;
  credorId: Id | null;
  credorNome: string | null;
  sistema: string | null;
  ativa: boolean;
}

export interface FolhaResumo {
  id: Id;
  competencia: string;
  tipo: 'mensal' | 'adiantamento';
  status: 'rascunho' | 'calculada' | 'fechada';
  dataPagamento: string;
  fechadaEm: string | null;
  fechadaPor: string | null;
  colaboradores: number;
  totalProventos: Dinheiro;
  totalLiquido: Dinheiro;
  custoTotal: Dinheiro;
}

export interface HoleriteResumo {
  id: Id;
  colaboradorId: Id;
  nome: string;
  cargo: string | null;
  vinculo: string;
  salarioBase: Dinheiro;
  diasTrabalhados: number;
  centroCustoNome: string | null;
  totalProventos: Dinheiro;
  totalDescontos: Dinheiro;
  liquido: Dinheiro;
  inss: Dinheiro;
  irrf: Dinheiro;
  fgts: Dinheiro;
  encargosPatronais: Dinheiro;
  beneficios: Dinheiro;
  custoTotal: Dinheiro;
  avisos: string[];
  ajustado: boolean;
  lancamentos: number;
}

export interface Folha extends Omit<FolhaResumo, 'colaboradores' | 'totalProventos' | 'totalLiquido' | 'custoTotal'> {
  observacao: string | null;
  holerites: HoleriteResumo[];
  titulos: Array<{ id: Id; descricao: string; valorTotal: Dinheiro; canceladoEm: string | null; vencimento: string; status: string }>;
  totais: Record<string, Dinheiro>;
}

export interface Holerite extends HoleriteResumo {
  documento: string | null;
  matricula: string | null;
  dataAdmissao: string;
  dependentesIrrf: number;
  competencia: string;
  folhaTipo: string;
  folhaStatus: string;
  dataPagamento: string;
  empresaNome: string;
  empresaDocumento: string | null;
  baseInss: Dinheiro;
  baseIrrf: Dinheiro;
  baseFgts: Dinheiro;
  detalheIrrf: null | {
    rendimentos: Dinheiro; deducoesLegais: Dinheiro; simplificado: boolean; base: Dinheiro;
    aliquota: string; impostoPelaTabela: Dinheiro; reducao: Dinheiro; dispensado: boolean; imposto: Dinheiro;
  };
  ajuste: null | Record<string, string | null>;
  calculado: null | Record<string, string>;
  itens: Array<{
    id: Id; rubricaId: Id; codigo: string; nome: string; tipo: 'provento' | 'desconto' | 'informativo';
    referencia: string | null; valor: Dinheiro; origem: string; credorNome: string | null;
  }>;
}

export interface CustosPessoal {
  competencia: string;
  folhaStatus: string | null;
  colaboradores: Array<{
    colaboradorId: Id; nome: string; cargo: string | null; vinculo: string; centroCustoNome: string | null;
    salarioBase: Dinheiro; proventos: Dinheiro; encargos: Dinheiro; custoMes: Dinheiro;
    provisao: Dinheiro; custoComProvisao: Dinheiro; fonte: 'folha' | 'estimativa' | 'contrato';
  }>;
  porCentro: Array<{ centroCusto: string; pessoas: number; custoMes: Dinheiro; provisao: Dinheiro }>;
  totais: { pessoas: number; custoMes: Dinheiro; provisao: Dinheiro; custoComProvisao: Dinheiro };
}

export interface TabelaFiscal {
  id: Id;
  oficial: boolean;
  tipo: 'inss' | 'irrf';
  vigencia: string;
  dados: Record<string, unknown>;
  fonte: string;
}

export interface Socios {
  socios: Array<{
    id: Id; pessoaId: Id; nome: string; documento: string | null; participacao: string;
    capitalSubscrito: Dinheiro; dataEntrada: string; dataSaida: string | null;
    integralizado: Dinheiro; aportes: Dinheiro; distribuido: Dinheiro; devolvido: Dinheiro;
  }>;
  capitalSocial: Dinheiro;
  capitalSubscrito: Dinheiro;
  capitalIntegralizado: Dinheiro;
  aIntegralizar: Dinheiro;
  avisos: string[];
}

export interface ResumoCapital extends Omit<Socios, 'socios'> {
  resultadoAcumulado: Dinheiro;
  distribuido: Dinheiro;
  lucrosADistribuir: Dinheiro;
  emprestimos: { contratos: number; saldoDevedor: Dinheiro; principal: Dinheiro };
  investimentos: Dinheiro;
  patrimonio: { bens: number; valorAquisicao: Dinheiro; depreciacaoAcumulada: Dinheiro; valorContabil: Dinheiro; depreciacaoMensal: Dinheiro };
}

export interface Emprestimo {
  id: Id;
  pessoaId: Id;
  credorNome: string;
  contaNome: string;
  descricao: string;
  sistema: 'price' | 'sac';
  valorPrincipal: Dinheiro;
  taxaMensal: string;
  prazo: number;
  carencia: number;
  dataContratacao: string;
  primeiroVencimento: string;
  custosIniciais: Dinheiro;
  canceladoEm: string | null;
  parcelas: number;
  parcelasPagas: number;
  proximoVencimento: string | null;
  saldoDevedor: Dinheiro;
  cronograma?: Array<{
    tituloId: Id; descricao: string; parcelaId: Id; vencimento: string; valor: Dinheiro;
    valorPago: Dinheiro; status: string; vencida: boolean; juros: Dinheiro; amortizacao: Dinheiro;
  }>;
  jurosTotais?: Dinheiro;
}

export interface SimulacaoEmprestimo {
  parcelas: Array<{
    numero: number; vencimento: string; saldoInicial: Dinheiro; juros: Dinheiro;
    amortizacao: Dinheiro; valor: Dinheiro; saldoFinal: Dinheiro; carencia: boolean;
  }>;
  juros: Dinheiro;
  totalPago: Dinheiro;
}

export interface Ativo {
  id: Id;
  descricao: string;
  classe: string;
  classeRotulo: string;
  identificacao: string | null;
  centroCustoId: Id | null;
  centroCustoNome: string | null;
  dataAquisicao: string;
  inicioUso: string;
  valorAquisicao: Dinheiro;
  valorResidual: Dinheiro;
  vidaUtilMeses: number | null;
  baixadoEm: string | null;
  motivoBaixa: string | null;
  valorVenda: Dinheiro | null;
  valorContabil: Dinheiro;
  depreciacaoAcumulada: Dinheiro;
  depreciacaoMensal: Dinheiro;
}

export interface Ativos {
  itens: Ativo[];
  totais: ResumoCapital['patrimonio'];
  classes: Record<string, { rotulo: string; vidaUtilSugerida: number | null }>;
}

export interface Orcamento {
  ano: number;
  meses: string[];
  linhas: Array<{
    categoriaId: Id; centroCustoId: Id | null; nome: string; grupo: string; grupoRotulo: string;
    natureza: 'receita' | 'despesa'; centroCustoNome: string | null; valores: Dinheiro[]; total: Dinheiro;
  }>;
}

export interface ResumoComparativo {
  receitasOrcadas: Dinheiro; receitasRealizadas: Dinheiro;
  despesasOrcadas: Dinheiro; despesasRealizadas: Dinheiro;
  resultadoOrcado: Dinheiro; resultadoRealizado: Dinheiro;
}

/** Planejado × realizado de um mês (`mes`, 1 a 12), com o acumulado do ano até ele. */
export interface Comparativo {
  ano: number;
  mes: number;
  /** Receita abaixo do planejado só vira alerta depois que o mês acaba. */
  mesEncerrado: boolean;
  meses: string[];
  linhas: Array<{
    categoriaId: Id; nome: string; grupo: string; grupoRotulo: string; natureza: 'receita' | 'despesa';
    orcado: Dinheiro[]; realizado: Dinheiro[]; totalOrcado: Dinheiro; totalRealizado: Dinheiro;
    acumuladoOrcado: Dinheiro; acumuladoRealizado: Dinheiro;
    /** Do mês de referência. */
    variacao: Dinheiro; variacaoPercentual: string | null; desfavoravel: boolean;
  }>;
  /** Só o mês de referência. */
  resumo: ResumoComparativo;
  /** De janeiro até o mês de referência. */
  acumulado: ResumoComparativo;
}

export interface SugestaoConciliacao {
  id: Id;
  tipo: 'movimento' | 'parcela';
  data: string;
  valor: Dinheiro;
  descricao: string;
  pontuacao: number;
  motivos: string[];
}

export interface Pendencias {
  conta: { id: Id; nome: string };
  linhas: Array<{
    id: Id; data: string; valor: Dinheiro; descricao: string; documento: string | null;
    sugestao: SugestaoConciliacao | null; alternativas: SugestaoConciliacao[];
  }>;
  ultimaImportacao: null | { fim: string | null; saldoFinal: Dinheiro | null; arquivo: string; importadoEm: string };
  saldoSistemaNaData: Dinheiro | null;
  diferenca: Dinheiro | null;
}

export interface Auditoria {
  id: number;
  tabela: string;
  registroId: Id | null;
  operacao: 'INSERT' | 'UPDATE' | 'DELETE';
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  usuarioNome: string | null;
  motivo: string | null;
  em: string;
}

export interface Feriado {
  id: Id | null;
  data: string;
  nome: string;
  nacional: boolean;
}
