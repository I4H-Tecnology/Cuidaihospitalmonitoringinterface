"""Corpos de requisição. Os nomes aqui viram camelCase no JSON (`valorTotal`)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field

from .base import Competencia, Entrada

# --------------------------------------------------------------------------
# Empresa e configurações
# --------------------------------------------------------------------------

class OrganizacaoEntrada(Entrada):
    nome: str | None = None
    documento: str | None = None
    regime_tributario: Literal["mei", "simples", "presumido", "real", "outro"] | None = None
    capital_social: Decimal | None = Field(default=None, ge=0)
    encargo_inss_patronal: Decimal | None = Field(default=None, ge=0, le=100)
    encargo_rat: Decimal | None = Field(default=None, ge=0, le=100)
    encargo_terceiros: Decimal | None = Field(default=None, ge=0, le=100)
    fgts_aliquota: Decimal | None = Field(default=None, ge=0, le=100)
    percentual_adiantamento: Decimal | None = Field(default=None, ge=0, le=100)
    guia_unica_dctfweb: bool | None = None


class FechamentoEntrada(Entrada):
    fechado_ate: Competencia | None = None
    motivo: str


class FeriadoEntrada(Entrada):
    data: date
    nome: str


class TabelaFiscalEntrada(Entrada):
    tipo: Literal["inss", "irrf"]
    vigencia: Competencia
    fonte: str
    dados: dict


# --------------------------------------------------------------------------
# Cadastros
# --------------------------------------------------------------------------

class ContaEntrada(Entrada):
    nome: str | None = None
    tipo: Literal["caixa", "corrente", "poupanca", "investimento", "cartao_credito", "outro"] | None = None
    banco: str | None = None
    agencia: str | None = None
    numero: str | None = None
    ativa: bool | None = None
    saldo_inicial: Decimal | None = None
    data_saldo_inicial: date | None = None


class CategoriaEntrada(Entrada):
    grupo: str | None = None
    nome: str | None = None
    codigo: str | None = None
    pai_id: str | None = None
    comportamento: Literal["fixo", "variavel"] | None = None
    ativa: bool | None = None


class CentroEntrada(Entrada):
    nome: str | None = None
    codigo: str | None = None
    pai_id: str | None = None
    ativo: bool | None = None


class PessoaEntrada(Entrada):
    tipo: Literal["fisica", "juridica"] | None = None
    nome: str | None = None
    nome_fantasia: str | None = None
    documento: str | None = None
    email: str | None = None
    telefone: str | None = None
    chave_pix: str | None = None
    banco: str | None = None
    agencia: str | None = None
    conta_bancaria: str | None = None
    endereco: str | None = None
    cliente: bool | None = None
    fornecedor: bool | None = None
    referencia_externa: str | None = None
    observacao: str | None = None
    ativa: bool | None = None


class PessoaExterna(Entrada):
    referencia_externa: str
    nome: str
    tipo: Literal["fisica", "juridica"] | None = None
    observacao: str | None = None


class ImportarPessoasEntrada(Entrada):
    pessoas: list[PessoaExterna] = Field(max_length=5000)


class RecorrenciaEntrada(Entrada):
    tipo: Literal["pagar", "receber"] | None = None
    descricao: str | None = None
    valor: Decimal | None = None
    categoria_id: str | None = None
    centro_custo_id: str | None = None
    pessoa_id: str | None = None
    frequencia: Literal["semanal", "quinzenal", "mensal", "bimestral", "trimestral", "semestral", "anual"] | None = None
    dia_vencimento: int | None = Field(default=None, ge=1, le=31)
    inicio: date | None = None
    fim: date | None = None
    ativa: bool | None = None


class GerarEntrada(Entrada):
    ate: date | None = None


# --------------------------------------------------------------------------
# Contas a pagar e a receber
# --------------------------------------------------------------------------

class ParcelaEntrada(Entrada):
    vencimento: date
    valor: Decimal
    codigo_barras: str | None = None


class RateioEntrada(Entrada):
    categoria_id: str
    centro_custo_id: str | None = None
    valor: Decimal | None = None
    percentual: Decimal | None = None


class PagamentoImediato(Entrada):
    conta_id: str
    data: date | None = None
    forma: str | None = None


class TituloEntrada(Entrada):
    tipo: Literal["pagar", "receber"] | None = None
    descricao: str | None = None
    pessoa_id: str | None = None
    documento: str | None = None
    competencia: Competencia | None = None
    data_emissao: date | None = None
    valor_total: Decimal | None = None
    parcelas: list[ParcelaEntrada] | None = Field(default=None, max_length=360)
    quantidade_parcelas: int | None = Field(default=None, ge=1, le=360)
    primeiro_vencimento: date | None = None
    rateio: list[RateioEntrada] | None = Field(default=None, max_length=50)
    observacao: str | None = None
    pagamento: PagamentoImediato | None = None


class ParcelaAlteracao(Entrada):
    vencimento: date | None = None
    codigo_barras: str | None = None
    motivo: str | None = None


class ParcelaDoPlano(Entrada):
    """Uma parcela do plano novo: com `id`, a que já existe; sem, uma nova."""

    id: str | None = None
    vencimento: date
    valor: Decimal
    codigo_barras: str | None = None


class ReparcelamentoEntrada(Entrada):
    """As parcelas em aberto como devem ficar. As pagas não vêm: não mudam."""

    parcelas: list[ParcelaDoPlano] = Field(max_length=360)
    motivo: str | None = None


class BaixaEntrada(Entrada):
    conta_id: str
    data: date | None = None
    valor: Decimal | None = None
    juros: Decimal | None = Field(default=None, ge=0)
    multa: Decimal | None = Field(default=None, ge=0)
    desconto: Decimal | None = Field(default=None, ge=0)
    forma: str | None = None
    observacao: str | None = None


class BaixaEmLote(Entrada):
    parcela_ids: list[str] = Field(min_length=1, max_length=200)
    conta_id: str
    data: date | None = None
    forma: str | None = None


class Motivo(Entrada):
    motivo: str
    data: date | None = None


# --------------------------------------------------------------------------
# Caixa
# --------------------------------------------------------------------------

class TransferenciaEntrada(Entrada):
    conta_origem_id: str
    conta_destino_id: str
    valor: Decimal
    data: date | None = None
    descricao: str | None = None


class AjusteSaldoEntrada(Entrada):
    saldo_informado: Decimal
    data: date | None = None
    motivo: str


# --------------------------------------------------------------------------
# Pessoal
# --------------------------------------------------------------------------

class ColaboradorEntrada(Entrada):
    pessoa_id: str | None = None
    pessoa: PessoaEntrada | None = None
    vinculo: Literal["clt", "aprendiz", "estagio", "prolabore", "pj", "autonomo"] | None = None
    salario_base: Decimal | None = Field(default=None, ge=0)
    data_admissao: date | None = None
    data_desligamento: date | None = None
    matricula: str | None = None
    cargo: str | None = None
    centro_custo_id: str | None = None
    horas_mes: Decimal | None = Field(default=None, gt=0)
    dependentes_irrf: int | None = Field(default=None, ge=0, le=30)
    referencia_externa: str | None = None


class FixoEntrada(Entrada):
    rubrica_id: str
    referencia: Decimal | None = None
    valor: Decimal | None = None
    limite: Decimal | None = None
    credor_id: str | None = None
    inicio: date | None = None
    fim: date | None = None


class RubricaEntrada(Entrada):
    codigo: str | None = None
    nome: str | None = None
    tipo: Literal["provento", "desconto", "informativo"] | None = None
    calculo: Literal["valor", "percentual_salario", "horas", "dias"] | None = None
    percentual: Decimal | None = None
    incide_inss: bool | None = None
    incide_irrf: bool | None = None
    incide_fgts: bool | None = None
    deduz_irrf: bool | None = None
    entra_dsr: bool | None = None
    credor_id: str | None = None
    ativa: bool | None = None


class FolhaEntrada(Entrada):
    competencia: Competencia
    tipo: Literal["mensal", "adiantamento"] = "mensal"
    data_pagamento: date | None = None
    observacao: str | None = None


class LancamentoFolha(Entrada):
    colaborador_id: str
    rubrica_id: str
    referencia: Decimal | None = None
    valor: Decimal | None = None


class AjusteContabilidade(Entrada):
    inss: Decimal | None = None
    irrf: Decimal | None = None
    fgts: Decimal | None = None
    encargos_patronais: Decimal | None = None
    observacao: str | None = None


# --------------------------------------------------------------------------
# Capital
# --------------------------------------------------------------------------

class SocioEntrada(Entrada):
    pessoa_id: str | None = None
    participacao: Decimal | None = Field(default=None, gt=0, le=100)
    capital_subscrito: Decimal | None = Field(default=None, ge=0)
    data_entrada: date | None = None
    data_saida: date | None = None


class OperacaoSocio(Entrada):
    operacao: Literal["integralizacao", "aporte", "distribuicao", "devolucao"]
    valor: Decimal
    data: date | None = None
    vencimento: date | None = None
    conta_id: str | None = None
    forma: str | None = None
    descricao: str | None = None


class EmprestimoEntrada(Entrada):
    pessoa_id: str | None = None
    conta_id: str | None = None
    centro_custo_id: str | None = None
    descricao: str | None = None
    sistema: Literal["price", "sac"] = "price"
    valor_principal: Decimal
    taxa_mensal: Decimal = Field(ge=0, lt=100)
    prazo: int = Field(ge=1, le=600)
    carencia: int = Field(default=0, ge=0, le=120)
    juros_na_carencia: Literal["pagos", "capitalizados"] = "pagos"
    data_contratacao: date | None = None
    primeiro_vencimento: date
    custos_iniciais: Decimal | None = Field(default=None, ge=0)


class AtualizacaoInvestimento(Entrada):
    saldo_informado: Decimal
    data: date | None = None


class CompraDeBem(Entrada):
    pessoa_id: str | None = None
    documento: str | None = None
    vencimento: date | None = None
    conta_id: str | None = None
    data_pagamento: date | None = None


class AtivoEntrada(Entrada):
    descricao: str | None = None
    classe: Literal["terreno", "imovel", "instalacoes", "maquina", "movel", "veiculo", "informatica", "outro"] | None = None
    identificacao: str | None = None
    centro_custo_id: str | None = None
    data_aquisicao: date | None = None
    inicio_uso: date | None = None
    valor_aquisicao: Decimal | None = None
    valor_residual: Decimal | None = None
    vida_util_meses: int | None = Field(default=None, ge=1, le=1200)
    compra: CompraDeBem | None = None


class BaixaDeBem(Entrada):
    motivo: str
    data: date | None = None
    valor_venda: Decimal | None = None
    pessoa_id: str | None = None
    vencimento: date | None = None
    conta_id: str | None = None


# --------------------------------------------------------------------------
# Planejamento e conciliação
# --------------------------------------------------------------------------

class LinhaOrcamento(Entrada):
    categoria_id: str
    centro_custo_id: str | None = None
    valores: list[Decimal] = Field(min_length=12, max_length=12)


class OrcamentoEntrada(Entrada):
    linhas: list[LinhaOrcamento] = Field(max_length=500)


class CopiaOrcamento(Entrada):
    ano_origem: int
    base: Literal["orcado", "realizado"] = "realizado"
    reajuste: Decimal = Decimal("0")


class OpcoesCsv(Entrada):
    coluna_data: str | None = None
    coluna_descricao: str | None = None
    coluna_valor: str | None = None
    coluna_debito: str | None = None
    coluna_credito: str | None = None
    coluna_documento: str | None = None
    formato_data: str | None = None
    decimal: Literal[",", "."] | None = None


class ImportacaoExtrato(Entrada):
    formato: Literal["ofx", "csv"] = "ofx"
    nome_arquivo: str | None = None
    # O arquivo vai em base64 dentro do JSON: sem multipart, a API continua
    # a mesma para qualquer cliente (navegador, script, outro sistema).
    conteudo_base64: str = Field(max_length=7_500_000)
    csv: OpcoesCsv | None = None


class ConciliarEntrada(Entrada):
    movimento_id: str | None = None
    parcela_id: str | None = None


class LancamentoDoExtrato(Entrada):
    categoria_id: str
    descricao: str | None = None
    pessoa_id: str | None = None
    centro_custo_id: str | None = None
