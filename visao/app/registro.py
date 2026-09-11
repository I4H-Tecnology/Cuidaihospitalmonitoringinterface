"""Configuração de log do serviço de visão.

Log estruturado em JSON, uma linha por evento, para que o que o serviço diz
possa ser lido por máquina (agregador, grep, jq) sem parser próprio. O nível
vem do ambiente, e o formato também — em desenvolvimento, `LOG_FORMATO=texto`
devolve a linha legível.

    LOG_LEVEL=INFO|DEBUG|WARNING     (padrão INFO)
    LOG_FORMATO=json|texto           (padrão json)

O backend lê as mesmas duas variáveis, com o mesmo formato de saída: os dois
serviços aparecem iguais em quem os agrega.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

SERVICO = "visao"


class FormatadorJson(logging.Formatter):
    """Uma linha JSON por registro, com campos fixos e o que vier em `extra`."""

    CAMPOS_PADRAO = set(vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys()) | {"message", "asctime"}

    def format(self, registro: logging.LogRecord) -> str:
        dados = {
            "ts": datetime.fromtimestamp(registro.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "nivel": registro.levelname,
            "servico": SERVICO,
            "logger": registro.name,
            "msg": registro.getMessage(),
        }
        # Campos passados por `logger.info("...", extra={"quadros": 10})` viram
        # chaves próprias, em vez de sumirem na string da mensagem.
        for chave, valor in vars(registro).items():
            if chave not in self.CAMPOS_PADRAO and not chave.startswith("_"):
                dados[chave] = valor
        if registro.exc_info:
            dados["excecao"] = self.formatException(registro.exc_info)
        return json.dumps(dados, ensure_ascii=False, default=str)


def configurar(nivel_padrao: str = "INFO", formato_padrao: str = "json") -> None:
    """Aplica nível e formato do ambiente ao logger raiz."""
    nivel = os.environ.get("LOG_LEVEL", nivel_padrao).upper()
    formato = os.environ.get("LOG_FORMATO", formato_padrao).strip().lower()

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
    # Barulhentos e sem valor operacional neste serviço.
    logging.getLogger("ultralytics").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("torch").setLevel(logging.WARNING)
