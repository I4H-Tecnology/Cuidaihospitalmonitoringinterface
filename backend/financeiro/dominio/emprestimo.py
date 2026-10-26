"""Empréstimos e financiamentos: cronograma Price ou SAC, com carência.

  Price  parcela fixa; no começo quase tudo é juros, no fim quase tudo é
         amortização. É o do financiamento de veículo e do crédito pessoal.
  SAC    amortização fixa; a parcela começa alta e cai todo mês. Paga menos
         juros no total. É o comum em financiamento imobiliário.

Cada parcela sai com juros e amortização separados porque vão para lugares
diferentes: juros é despesa financeira e entra na DRE; amortização só devolve
o principal — sai do caixa, mas não é despesa. Tratar a parcela inteira como
despesa faria o resultado da empresa parecer pior do que é.

`prazo` conta só as parcelas que amortizam. Com carência, as parcelas de
carência vêm antes e são a mais.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from .calendario import somar_meses
from .dinheiro import CEM, ZERO, arredondar, dinheiro

SISTEMAS = ("price", "sac")


@dataclass(frozen=True)
class ParcelaDoCronograma:
    numero: int
    vencimento: date
    saldo_inicial: Decimal
    juros: Decimal
    amortizacao: Decimal
    valor: Decimal
    saldo_final: Decimal
    carencia: bool = False


def cronograma(
    sistema: str,
    principal,
    taxa_mensal,
    prazo: int,
    primeiro_vencimento: date,
    carencia: int = 0,
    juros_na_carencia: str = "pagos",
) -> list[ParcelaDoCronograma]:
    """Parcelas do empréstimo.

    `taxa_mensal` em % ao mês (1,5 = 1,5%). Na carência os juros são 'pagos'
    (parcela só de juros) ou 'capitalizados' (sem parcela; o saldo cresce).
    A última parcela absorve o arredondamento, para o saldo terminar em zero.
    """
    if sistema not in SISTEMAS:
        raise ValueError(f"Sistema de amortização desconhecido: {sistema!r}.")
    if prazo < 1:
        raise ValueError("O prazo deve ter pelo menos uma parcela.")
    if carencia < 0:
        raise ValueError("Carência não pode ser negativa.")
    if juros_na_carencia not in ("pagos", "capitalizados"):
        raise ValueError("Juros na carência devem ser 'pagos' ou 'capitalizados'.")

    saldo = dinheiro(principal)
    if saldo <= 0:
        raise ValueError("O valor emprestado deve ser positivo.")
    taxa = Decimal(str(taxa_mensal)) / CEM
    if taxa < 0:
        raise ValueError("Taxa de juros não pode ser negativa.")

    dia = primeiro_vencimento.day
    parcelas: list[ParcelaDoCronograma] = []
    numero = 0

    for _ in range(carencia):
        numero += 1
        juros = arredondar(saldo * taxa)
        vencimento = somar_meses(primeiro_vencimento, numero - 1, dia)
        if juros_na_carencia == "pagos":
            parcelas.append(ParcelaDoCronograma(numero, vencimento, saldo, juros, ZERO, juros, saldo, True))
        else:
            novo = saldo + juros
            parcelas.append(ParcelaDoCronograma(numero, vencimento, saldo, juros, ZERO, ZERO, novo, True))
            saldo = novo

    if sistema == "price":
        if taxa == 0:
            prestacao = arredondar(saldo / prazo)
        else:
            prestacao = arredondar(saldo * taxa / (1 - (1 + taxa) ** -prazo))
    amortizacao_sac = arredondar(saldo / prazo)

    for i in range(prazo):
        numero += 1
        vencimento = somar_meses(primeiro_vencimento, numero - 1, dia)
        juros = arredondar(saldo * taxa)
        ultima = i == prazo - 1
        if ultima:
            amortizacao = saldo
        elif sistema == "price":
            amortizacao = prestacao - juros
        else:
            amortizacao = amortizacao_sac
        valor = amortizacao + juros
        parcelas.append(
            ParcelaDoCronograma(numero, vencimento, saldo, juros, amortizacao, valor, saldo - amortizacao)
        )
        saldo -= amortizacao

    return parcelas


def custo_total(parcelas: list[ParcelaDoCronograma]) -> dict[str, Decimal]:
    juros = sum((p.juros for p in parcelas if not (p.carencia and p.valor == 0)), ZERO)
    pago = sum((p.valor for p in parcelas), ZERO)
    return {"juros": arredondar(juros), "total_pago": arredondar(pago)}
