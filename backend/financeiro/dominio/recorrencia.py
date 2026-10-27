"""Contas que se repetem: aluguel, internet, mensalidade, assinatura.

A recorrência é um molde; o que vai para contas a pagar ou a receber são as
ocorrências dele, uma por vencimento. Este arquivo só responde "em que datas
esta recorrência vence até tal dia". Quem grava é o serviço, e grava com uma
chave por ocorrência — gerar duas vezes o mesmo intervalo não duplica conta.
"""

from __future__ import annotations

from datetime import date, timedelta

from .calendario import somar_meses

# frequência -> (unidade, passo)
FREQUENCIAS: dict[str, tuple[str, int]] = {
    "semanal": ("dias", 7),
    "quinzenal": ("dias", 14),
    "mensal": ("meses", 1),
    "bimestral": ("meses", 2),
    "trimestral": ("meses", 3),
    "semestral": ("meses", 6),
    "anual": ("meses", 12),
}


def ocorrencias(
    inicio: date,
    frequencia: str,
    ate: date,
    fim: date | None = None,
    dia_vencimento: int | None = None,
    depois_de: date | None = None,
) -> list[date]:
    """Vencimentos de `inicio` até `ate` (inclusive), sem passar de `fim`.

    Nas frequências por mês, `dia_vencimento` fixa o dia (31 vira o último dia
    nos meses curtos e volta a ser 31 nos longos). A primeira ocorrência é o
    primeiro vencimento a partir de `inicio`. `depois_de` descarta o que já
    foi gerado antes, para a geração continuar de onde parou.
    """
    if frequencia not in FREQUENCIAS:
        raise ValueError(f"Frequência desconhecida: {frequencia!r}.")
    unidade, passo = FREQUENCIAS[frequencia]
    limite = min(ate, fim) if fim else ate
    datas: list[date] = []

    if unidade == "dias":
        atual = inicio
        while atual <= limite:
            datas.append(atual)
            atual += timedelta(days=passo)
    else:
        dia = dia_vencimento or inicio.day
        # Primeiro vencimento: o dia pedido no mês do início, ou no mês
        # seguinte se esse dia já passou quando a recorrência começou.
        primeiro = somar_meses(inicio.replace(day=1), 0, dia)
        if primeiro < inicio:
            primeiro = somar_meses(inicio.replace(day=1), 1, dia)
        k = 0
        while True:
            atual = somar_meses(primeiro.replace(day=1), k * passo, dia)
            if atual > limite:
                break
            datas.append(atual)
            k += 1

    if depois_de is not None:
        datas = [d for d in datas if d > depois_de]
    return datas
