"""Datas do financeiro: competência, meses, feriados e dia útil.

Dois "dias úteis" diferentes, e confundir os dois dá multa ou salário atrasado:

  - BANCÁRIO (vencimento de guia, DARF, boleto): segunda a sexta, fora feriado
    nacional e fora os dias em que banco não abre mesmo sem ser feriado por
    lei — segunda e terça de Carnaval e Corpus Christi. Tributo que vence em
    dia não útil é ANTECIPADO para o dia útil anterior (FGTS Digital, DCTFWeb,
    IRRF): pagar no dia seguinte já é atraso.
  - TRABALHISTA (5º dia útil do salário, CLT art. 459 §1º): segunda a SÁBADO,
    fora domingo e feriado. O sábado conta — é o entendimento do Ministério do
    Trabalho para o prazo do salário.

Feriado estadual e municipal não tem como ser deduzido de regra: cada empresa
cadastra os seus, e eles entram como `feriados_extras`.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta
from functools import lru_cache


# --------------------------------------------------------------------------
# Competência e aritmética de meses
# --------------------------------------------------------------------------

def competencia(dia: date) -> date:
    """A competência é o mês, representado pelo dia 1. 17/09/2026 -> 01/09/2026."""
    return dia.replace(day=1)


def ler_competencia(texto: str) -> date:
    """'2026-09' -> date(2026, 9, 1). Recusa qualquer outro formato."""
    try:
        ano, mes = texto.strip().split("-")
        return date(int(ano), int(mes), 1)
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"Competência inválida: {texto!r}. Use AAAA-MM.") from exc


def escrever_competencia(dia: date) -> str:
    return f"{dia.year:04d}-{dia.month:02d}"


def ultimo_dia_do_mes(dia: date) -> date:
    return dia.replace(day=calendar.monthrange(dia.year, dia.month)[1])


def somar_meses(dia: date, meses: int, dia_desejado: int | None = None) -> date:
    """Soma meses mantendo o dia, ou o último dia quando o mês é mais curto.

    31/01 + 1 mês = 28/02 (ou 29). Com `dia_desejado`, o dia é recalculado a
    partir do mês de destino — sem isso, uma conta com vencimento dia 31
    grudaria no 28 depois de passar por fevereiro.
    """
    indice = dia.year * 12 + (dia.month - 1) + meses
    ano, mes = divmod(indice, 12)
    mes += 1
    alvo = dia_desejado if dia_desejado is not None else dia.day
    return date(ano, mes, min(alvo, calendar.monthrange(ano, mes)[1]))


def meses_entre(inicio: date, fim: date) -> list[date]:
    """Competências de `inicio` a `fim`, inclusive, como dias 1."""
    atual, ultimo = competencia(inicio), competencia(fim)
    saida = []
    while atual <= ultimo:
        saida.append(atual)
        atual = somar_meses(atual, 1)
    return saida


# --------------------------------------------------------------------------
# Feriados
# --------------------------------------------------------------------------

def pascoa(ano: int) -> date:
    """Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano)."""
    a = ano % 19
    b, c = divmod(ano, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    ell = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ell) // 451
    mes, dia = divmod(h + ell - 7 * m + 114, 31)
    return date(ano, mes, dia + 1)


_FIXOS = {
    (1, 1): "Confraternização Universal",
    (4, 21): "Tiradentes",
    (5, 1): "Dia do Trabalho",
    (9, 7): "Independência do Brasil",
    (10, 12): "Nossa Senhora Aparecida",
    (11, 2): "Finados",
    (11, 15): "Proclamação da República",
    (11, 20): "Dia Nacional de Zumbi e da Consciência Negra",
    (12, 25): "Natal",
}


@lru_cache(maxsize=64)
def feriados_nacionais(ano: int) -> dict[date, str]:
    feriados = {date(ano, m, d): nome for (m, d), nome in _FIXOS.items()}
    if ano < 2024:
        # A Consciência Negra virou feriado nacional com a Lei 14.759/2023.
        feriados.pop(date(ano, 11, 20), None)
    feriados[pascoa(ano) - timedelta(days=2)] = "Paixão de Cristo"
    return feriados


@lru_cache(maxsize=64)
def dias_sem_expediente_bancario(ano: int) -> dict[date, str]:
    """Feriados nacionais mais os dias em que banco fecha sem ser feriado em lei."""
    dias = dict(feriados_nacionais(ano))
    p = pascoa(ano)
    dias[p - timedelta(days=48)] = "Carnaval (segunda-feira)"
    dias[p - timedelta(days=47)] = "Carnaval (terça-feira)"
    dias[p + timedelta(days=60)] = "Corpus Christi"
    return dias


@dataclass
class Calendario:
    """Calendário de uma empresa: o nacional mais os feriados que ela cadastrou."""

    feriados_extras: set[date] = field(default_factory=set)

    def eh_dia_util_bancario(self, dia: date) -> bool:
        return (
            dia.weekday() < 5
            and dia not in dias_sem_expediente_bancario(dia.year)
            and dia not in self.feriados_extras
        )

    def eh_dia_util_trabalhista(self, dia: date) -> bool:
        return (
            dia.weekday() < 6
            and dia not in feriados_nacionais(dia.year)
            and dia not in self.feriados_extras
        )

    def antecipar_para_dia_util(self, dia: date) -> date:
        """Vencimento de tributo: se cair em dia sem banco, vale o dia útil anterior."""
        while not self.eh_dia_util_bancario(dia):
            dia -= timedelta(days=1)
        return dia

    def prorrogar_para_dia_util(self, dia: date) -> date:
        """Vencimento de boleto comum: se cair em dia sem banco, vale o próximo."""
        while not self.eh_dia_util_bancario(dia):
            dia += timedelta(days=1)
        return dia

    def enesimo_dia_util_trabalhista(self, ano: int, mes: int, n: int) -> date:
        """O n-ésimo dia útil trabalhista do mês (5º dia útil = prazo do salário)."""
        dia, contados = date(ano, mes, 1), 0
        while True:
            if self.eh_dia_util_trabalhista(dia):
                contados += 1
                if contados == n:
                    return dia
            dia += timedelta(days=1)

    def dias_uteis_e_descansos(self, mes: date) -> tuple[int, int]:
        """(dias úteis, domingos e feriados) do mês — a base do reflexo no DSR."""
        uteis = descansos = 0
        dia = competencia(mes)
        fim = ultimo_dia_do_mes(dia)
        while dia <= fim:
            if self.eh_dia_util_trabalhista(dia):
                uteis += 1
            else:
                descansos += 1
            dia += timedelta(days=1)
        return uteis, descansos
