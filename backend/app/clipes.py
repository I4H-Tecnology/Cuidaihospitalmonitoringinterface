"""Clipes de evidência do lado da API: onde estão, se existem, e o expurgo.

O serviço de visão grava `<id da ocorrência>.mp4` numa pasta que este
backend enxerga (bind mount no compose: `./visao/dados/clipes`). A API só
serve o arquivo — com autenticação e isolamento por clínica — e garante a
retenção de 24 h (RNF05, RN09) mesmo que o serviço de visão esteja fora do
ar: o expurgo roda aqui também, no boot e de hora em hora.

Este módulo não toca no banco: a ocorrência sobrevive ao clipe (RNF18).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

PASTA = Path(os.environ.get("CLIPES_DIR", "dados/clipes"))
# Teto da RFC. Não é configurável para cima de propósito.
RETENCAO_HORAS = min(24.0, float(os.environ.get("CLIPES_RETENCAO_HORAS", "24")))
INTERVALO_DE_EXPURGO_S = 3600.0
EXTENSAO = ".mp4"

_ultimo_expurgo: float | None = None
_ultimo_expurgo_removeu = 0


def nome_seguro(texto: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", texto).strip("-") or "clipe"


def caminho_do_clipe(ocorrencia_id: str) -> Path:
    return PASTA / f"{nome_seguro(str(ocorrencia_id))}{EXTENSAO}"


def tem_clipe(ocorrencia_id: str) -> bool:
    return caminho_do_clipe(ocorrencia_id).is_file()


def expurgar(agora: float | None = None) -> list[str]:
    """Apaga clipes com mais de RETENCAO_HORAS. Devolve os nomes removidos."""
    global _ultimo_expurgo, _ultimo_expurgo_removeu
    agora = time.time() if agora is None else agora
    limite = agora - RETENCAO_HORAS * 3600
    removidos: list[str] = []
    if PASTA.exists():
        for arquivo in PASTA.glob(f"*{EXTENSAO}"):
            try:
                if arquivo.stat().st_mtime < limite:
                    arquivo.unlink()
                    removidos.append(arquivo.name)
            except OSError as erro:
                logger.error("Não consegui apagar %s: %s", arquivo.name, erro)
    _ultimo_expurgo = agora
    _ultimo_expurgo_removeu = len(removidos)
    if removidos:
        logger.info("Expurgo de clipes", extra={"removidos": removidos, "retencao_horas": RETENCAO_HORAS})
    return removidos


async def laco_de_expurgo() -> None:
    """Tarefa de fundo: expurga agora e depois de hora em hora."""
    while True:
        try:
            expurgar()
        except Exception:  # noqa: BLE001
            logger.exception("Expurgo falhou; tenta de novo na próxima hora")
        await asyncio.sleep(INTERVALO_DE_EXPURGO_S)


def estado() -> dict:
    arquivos = list(PASTA.glob(f"*{EXTENSAO}")) if PASTA.exists() else []
    return {
        "pasta": str(PASTA),
        "pasta_existe": PASTA.exists(),
        "clipes_em_disco": len(arquivos),
        "bytes_em_disco": sum(a.stat().st_size for a in arquivos if a.exists()),
        "retencao_horas": RETENCAO_HORAS,
        "ultimo_expurgo": (
            datetime.fromtimestamp(_ultimo_expurgo, tz=timezone.utc).isoformat(timespec="seconds")
            if _ultimo_expurgo
            else None
        ),
        "ultimo_expurgo_removeu": _ultimo_expurgo_removeu,
    }
