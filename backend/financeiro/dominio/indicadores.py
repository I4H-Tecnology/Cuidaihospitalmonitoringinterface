"""Indicadores de saúde financeira, cada um com a pergunta que responde.

Todos recebem números já somados (quem soma é `servicos/relatorios.py`) e
devolvem None quando a conta não faz sentido — sem receita não existe margem,
sem saída não existe fôlego. "Não dá para calcular" é resposta; zero inventado
não é.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from .dinheiro import ZERO, arredondar

UMA_CASA = Decimal("0.1")


def capital_de_giro(disponivel: Decimal, a_receber: Decimal, a_pagar: Decimal) -> Decimal:
    """Quanto sobra se todo mundo pagar e a empresa pagar todo mundo.

    Disponível + a receber − a pagar, no mesmo horizonte. Negativo quer dizer
    que as contas já assumidas não cabem no que existe e no que vai entrar.
    """
    return arredondar(disponivel + a_receber - a_pagar)


def folego_de_caixa(disponivel: Decimal, saidas_mensais: list[Decimal]) -> Decimal | None:
    """Quantos meses o caixa aguenta sem nenhuma entrada, na média de saídas recente."""
    saidas = [s for s in saidas_mensais if s > 0]
    if not saidas:
        return None
    media = sum(saidas, ZERO) / len(saidas)
    return arredondar(disponivel / media, UMA_CASA) if disponivel > 0 else Decimal("0.0")


def ponto_de_equilibrio(receita: Decimal, custos_variaveis: Decimal, custos_fixos: Decimal) -> Decimal | None:
    """Receita mínima para empatar: custos fixos ÷ margem de contribuição.

    Margem de contribuição = (receita − custos variáveis) ÷ receita. Depende de
    as categorias estarem marcadas como fixas ou variáveis.
    """
    if receita <= 0:
        return None
    margem = (receita - custos_variaveis) / receita
    if margem <= 0:
        return None
    return arredondar(custos_fixos / margem)


def prazo_medio(pares: list[tuple[date, date, Decimal]]) -> Decimal | None:
    """Prazo médio, em dias, ponderado por valor: (emissão, liquidação, valor).

    Aplicado a contas a receber é o PMR; a contas a pagar, o PMP. PMR maior que
    PMP quer dizer que a empresa paga antes de receber e financia o cliente
    com o próprio caixa.
    """
    total = sum((valor for _, _, valor in pares), ZERO)
    if total <= 0:
        return None
    dias = sum(((liquidado - emitido).days * valor for emitido, liquidado, valor in pares), ZERO)
    return arredondar(dias / total, UMA_CASA)


def percentual(parte: Decimal, todo: Decimal) -> Decimal | None:
    if todo <= 0:
        return None
    return arredondar(parte / todo * 100, UMA_CASA)
