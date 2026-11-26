"""Clipes de evidência do lado da API: onde estão, se existem, e o expurgo.

O serviço de visão grava `<id da ocorrência>.mp4` numa pasta que este
backend enxerga (bind mount no compose: `./visao/dados/clipes`). A API só
serve o arquivo — com autenticação e isolamento por clínica — e garante a
retenção de 24 h (RNF05, RN09; até 30 dias em modo de teste) mesmo que o
serviço de visão esteja fora do ar: o expurgo roda aqui também, no boot e de
hora em hora.

Este módulo não toca no banco: a ocorrência sobrevive ao clipe (RNF18).
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

PASTA = Path(os.environ.get("CLIPES_DIR", "dados/clipes"))

# Teto da RFC (RNF05, RN08): 24 h. Em MODO DE TESTE (demonstração, sem paciente
# real) sobe para 30 dias, para a banca poder rever o clipe do alerta. É uma
# exceção deliberada do TCC: sem MEDSIGNAL_MODO_TESTE=true o teto é 24 h e não
# há variável que o aumente. O serviço de visão aplica a mesma regra.
RETENCAO_MAXIMA_HORAS = 24.0
RETENCAO_MAXIMA_EM_TESTE_HORAS = 30 * 24.0


def retencao_em_horas(modo_teste: bool, pedido: str | float | None) -> float:
    """Retenção efetiva: o pedido (CLIPES_RETENCAO_HORAS), limitado ao teto do modo.

    Valor ausente, inválido ou não positivo cai no teto da RFC, nunca acima do
    teto do modo: um erro de digitação não pode virar retenção indefinida.
    """
    teto = RETENCAO_MAXIMA_EM_TESTE_HORAS if modo_teste else RETENCAO_MAXIMA_HORAS
    try:
        horas = float(pedido) if pedido is not None else RETENCAO_MAXIMA_HORAS
    except (TypeError, ValueError):
        return RETENCAO_MAXIMA_HORAS
    # nan e inf passariam por min() e virariam retenção indefinida (o expurgo
    # nunca apagaria nada): tratados como valor inválido.
    if not math.isfinite(horas) or horas <= 0:
        return RETENCAO_MAXIMA_HORAS
    return min(horas, teto)


def pasta_de_ensaio(modo_teste: bool, pedido: str | None) -> Path | None:
    """Pasta SOMENTE DE LEITURA com os clipes de ensaio controlado, ou None.

    Só existe em modo de teste: fora dele o pedido é ignorado e nenhum clipe fora da pasta normal é
    servido. Fica de fora do expurgo (ele só varre PASTA), e é por isso que os clipes de ensaio
    não expiram sem mexer na retenção dos clipes comuns. Ver ensaio.py.
    """
    texto = (pedido or "").strip()
    if not modo_teste or not texto:
        return None
    return Path(texto)


MODO_TESTE = os.environ.get("MEDSIGNAL_MODO_TESTE", "").strip().lower() in {"1", "true", "t", "sim", "yes", "on"}
RETENCAO_HORAS = retencao_em_horas(MODO_TESTE, os.environ.get("CLIPES_RETENCAO_HORAS", "24"))
PASTA_ENSAIO = pasta_de_ensaio(MODO_TESTE, os.environ.get("CLIPES_ENSAIO_DIR"))
INTERVALO_DE_EXPURGO_S = 3600.0
EXTENSAO = ".mp4"

_ultimo_expurgo: float | None = None
_ultimo_expurgo_removeu = 0


def nome_seguro(texto: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", texto).strip("-") or "clipe"


def caminho_do_clipe(ocorrencia_id: str) -> Path:
    """Onde está o clipe da ocorrência.

    Primeiro a pasta normal, onde a retenção vale. Só se o clipe não estiver lá, e só em modo de
    teste, a pasta de ensaio (somente leitura, sem expurgo). Se nenhum existe, devolve o caminho
    da pasta normal: quem chama decide pelo `is_file()`, como sempre.
    """
    nome = f"{nome_seguro(str(ocorrencia_id))}{EXTENSAO}"
    normal = PASTA / nome
    if normal.is_file() or PASTA_ENSAIO is None:
        return normal
    de_ensaio = PASTA_ENSAIO / nome
    return de_ensaio if de_ensaio.is_file() else normal


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
    de_ensaio = list(PASTA_ENSAIO.glob(f"*{EXTENSAO}")) if PASTA_ENSAIO is not None and PASTA_ENSAIO.exists() else []
    return {
        "ensaio": {
            "ativo": PASTA_ENSAIO is not None,
            "pasta": str(PASTA_ENSAIO) if PASTA_ENSAIO is not None else None,
            "clipes": len(de_ensaio),
        },
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
