"""Tarefas periódicas que o hospedeiro agenda.

    asyncio.create_task(tarefas.laco_de_recorrencias(banco))

Sem isto a geração de recorrências ainda acontece — ao criar a recorrência e
pelo botão "Gerar próximos lançamentos" —, mas o aluguel do mês que vem só
apareceria em contas a pagar quando alguém lembrasse de clicar.
"""

from __future__ import annotations

import asyncio
import logging

from .banco import Banco
from .relogio import hoje
from .servicos import recorrencias

logger = logging.getLogger("financeiro.tarefas")


async def laco_de_recorrencias(banco: Banco, intervalo_horas: float = 6) -> None:
    while True:
        try:
            gerados = await asyncio.to_thread(recorrencias.gerar_para_todas, banco, hoje())
            if gerados:
                logger.info("Recorrências: %s lançamento(s) gerado(s)", gerados)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - a tarefa não pode morrer por um erro de uma empresa
            logger.exception("Falha ao gerar recorrências")
        await asyncio.sleep(intervalo_horas * 3600)
