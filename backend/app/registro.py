"""Configuração de log do backend.

Mesmas duas variáveis e o mesmo formato JSON do serviço de visão
(`visao/app/registro.py`): quem agrega os logs vê os dois serviços iguais.

    LOG_LEVEL=INFO|DEBUG|WARNING     (padrão INFO)
    LOG_FORMATO=json|texto           (padrão json)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

SERVICO = "api"


class FormatadorJson(logging.Formatter):
    CAMPOS_PADRAO = set(vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys()) | {"message", "asctime"}

    def format(self, registro: logging.LogRecord) -> str:
        dados = {
            "ts": datetime.fromtimestamp(registro.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "nivel": registro.levelname,
            "servico": SERVICO,
            "logger": registro.name,
            "msg": registro.getMessage(),
        }
        for chave, valor in vars(registro).items():
            if chave not in self.CAMPOS_PADRAO and not chave.startswith("_"):
                dados[chave] = valor
        if registro.exc_info:
            dados["excecao"] = self.formatException(registro.exc_info)
        return json.dumps(dados, ensure_ascii=False, default=str)


def nivel_e_formato() -> tuple[str, str]:
    return (
        os.environ.get("LOG_LEVEL", "INFO").upper(),
        os.environ.get("LOG_FORMATO", "json").strip().lower(),
    )


def configurar() -> None:
    nivel, formato = nivel_e_formato()
    handler = logging.StreamHandler()
    if formato == "json":
        handler.setFormatter(FormatadorJson())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-8s %(name)s | %(message)s", datefmt="%H:%M:%S")
        )
    raiz = logging.getLogger()
    raiz.handlers[:] = [handler]
    raiz.setLevel(nivel)
