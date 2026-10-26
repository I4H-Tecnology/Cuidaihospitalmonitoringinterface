"""Que dia é hoje para a empresa.

O servidor costuma rodar em UTC. Às 22h de Brasília já é o dia seguinte em
UTC, e "vence hoje" viraria "venceu ontem" três horas antes da hora. O fuso
vem de FINANCEIRO_FUSO (padrão America/Sao_Paulo); sem a base de fusos no
sistema, cai para UTC−3, que é o horário de Brasília desde o fim do horário
de verão (2019).
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore


def _fuso():
    nome = os.environ.get("FINANCEIRO_FUSO", "America/Sao_Paulo")
    if ZoneInfo is not None:
        try:
            return ZoneInfo(nome)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return timezone(timedelta(hours=-3))


FUSO = _fuso()


def hoje() -> date:
    return datetime.now(FUSO).date()
