"""Patrimônio: depreciação linear dos bens.

Comprar um equipamento de R$ 12.000 não é uma despesa de R$ 12.000 no mês da
compra: o dinheiro sai do caixa naquele mês, mas o custo é do uso ao longo da
vida útil. Na DRE entra a depreciação mensal; no fluxo de caixa entra a compra
(como investimento). É isso que separa "sobrou dinheiro" de "deu lucro".

Método linear, a partir do mês em que o bem começou a ser usado (mês cheio,
simplificação usual), até completar a vida útil ou até a baixa. A última
parcela absorve o arredondamento: a soma fecha no valor depreciável.

Terreno não deprecia.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from .calendario import competencia, meses_entre, somar_meses
from .dinheiro import ZERO, arredondar

# Taxas anuais de referência da Receita (IN RFB nº 1.700/2017, Anexo III).
# São SUGESTÃO para o cadastro: a vida útil real do bem é decisão da empresa
# e da contabilidade, e o campo continua editável.
CLASSES = {
    "terreno": ("Terrenos", None),
    "imovel": ("Edificações", 300),  # 4% ao ano
    "instalacoes": ("Instalações", 120),  # 10% ao ano
    "maquina": ("Máquinas e equipamentos", 120),  # 10% ao ano
    "movel": ("Móveis e utensílios", 120),  # 10% ao ano
    "veiculo": ("Veículos", 60),  # 20% ao ano
    "informatica": ("Computadores e periféricos", 60),  # 20% ao ano
    "outro": ("Outros bens", None),
}


@dataclass(frozen=True)
class Bem:
    valor_aquisicao: Decimal
    valor_residual: Decimal
    vida_util_meses: int | None
    inicio_uso: date
    baixado_em: date | None = None

    @property
    def depreciavel(self) -> Decimal:
        return max(ZERO, self.valor_aquisicao - self.valor_residual)


@dataclass(frozen=True)
class MesDeDepreciacao:
    competencia: date
    valor: Decimal
    acumulada: Decimal
    valor_contabil: Decimal


def cronograma(bem: Bem, ate: date | None = None) -> list[MesDeDepreciacao]:
    """Depreciação mês a mês, do início de uso até o fim da vida útil (ou `ate`)."""
    if not bem.vida_util_meses or bem.depreciavel == 0:
        return []
    primeiro = competencia(bem.inicio_uso)
    ultimo = somar_meses(primeiro, bem.vida_util_meses - 1)
    if bem.baixado_em:
        ultimo = min(ultimo, competencia(bem.baixado_em))
    if ate:
        ultimo = min(ultimo, competencia(ate))
    if ultimo < primeiro:
        return []

    mensal = arredondar(bem.depreciavel / bem.vida_util_meses)
    saida: list[MesDeDepreciacao] = []
    acumulada = ZERO
    fim_da_vida = somar_meses(primeiro, bem.vida_util_meses - 1)
    for mes in meses_entre(primeiro, ultimo):
        valor = bem.depreciavel - acumulada if mes == fim_da_vida else min(mensal, bem.depreciavel - acumulada)
        acumulada += valor
        saida.append(MesDeDepreciacao(mes, valor, acumulada, bem.valor_aquisicao - acumulada))
    return saida


def depreciacao_no_periodo(bem: Bem, de: date, ate: date) -> Decimal:
    inicio, fim = competencia(de), competencia(ate)
    return sum((m.valor for m in cronograma(bem, ate=fim) if m.competencia >= inicio), ZERO)


def valor_contabil_em(bem: Bem, data: date) -> Decimal:
    """Quanto o bem ainda vale nos livros no fim do mês de `data`."""
    if competencia(data) < competencia(bem.inicio_uso):
        return bem.valor_aquisicao
    meses = cronograma(bem, ate=data)
    return meses[-1].valor_contabil if meses else bem.valor_aquisicao


def resultado_da_baixa(bem: Bem, valor_venda: Decimal) -> Decimal:
    """Ganho (positivo) ou perda (negativa) ao vender ou dar baixa no bem."""
    if bem.baixado_em is None:
        raise ValueError("O bem não tem data de baixa.")
    return arredondar(valor_venda - valor_contabil_em(bem, bem.baixado_em))
