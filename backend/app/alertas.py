"""Central de alertas em tempo real (RF15, RNF07, RNF08).

A RFC promete alerta no painel em até 5 segundos. Polling a cada 15s não
cumpre isso, e polling a cada 1s desperdiça banco. WebSocket resolve os dois:
o servidor empurra no instante em que a ocorrência nasce.

DOIS PONTOS QUE EXPLICAM O DESENHO

**Autenticação pela primeira mensagem, não pela URL.** O navegador não deixa
mandar cabeçalho `Authorization` ao abrir um WebSocket, e o atalho difundido é
`?token=...` na query string. Isso põe a credencial no log de acesso do
servidor, no histórico do navegador e no cabeçalho Referer. Aqui a conexão
abre sem credencial, o cliente manda o token como primeira mensagem, e quem
não se identificar a tempo é desconectado.

**A ponte entre thread e event loop.** A rota que registra a ocorrência é
síncrona — o FastAPI a executa num threadpool. Empurrar para um WebSocket de
lá exige agendar no event loop, e é isso que `publicar` faz. Chamar a corrotina
direto não funcionaria, e criar um loop novo por chamada quebraria a conexão.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

from fastapi import WebSocket

from .seguranca import identificar_por_token

logger = logging.getLogger(__name__)

# Quanto o servidor espera pelo token depois que a conexão abre. Curto de
# propósito: conexão anônima pendurada é recurso preso à toa.
SEGUNDOS_PARA_AUTENTICAR = 10.0


class CentralDeAlertas:
    """Mantém quem está ouvindo, por clínica, e empurra os eventos."""

    def __init__(self) -> None:
        self._ouvintes: dict[str, set[WebSocket]] = {}
        self._trava = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def registrar_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Guarda o event loop do servidor, no startup."""
        self._loop = loop

    # -- conexões ---------------------------------------------------------

    async def entrar(self, ws: WebSocket, tenant: str) -> None:
        with self._trava:
            self._ouvintes.setdefault(tenant, set()).add(ws)
        logger.info("Painel conectado (%s). Ouvintes: %d", tenant, self.quantos(tenant))

    def sair(self, ws: WebSocket, tenant: str) -> None:
        with self._trava:
            grupo = self._ouvintes.get(tenant)
            if grupo:
                grupo.discard(ws)
                if not grupo:
                    del self._ouvintes[tenant]

    def quantos(self, tenant: str | None = None) -> int:
        with self._trava:
            if tenant is None:
                return sum(len(g) for g in self._ouvintes.values())
            return len(self._ouvintes.get(tenant, ()))

    # -- envio ------------------------------------------------------------

    def publicar(self, tenant: str, evento: dict[str, Any]) -> int:
        """Empurra um evento para os painéis daquela clínica.

        Chamada de rota síncrona, então agenda no event loop em vez de
        aguardar. Devolve para quantos ouvintes tentou entregar — zero é
        normal e não é erro: pode não haver ninguém com o painel aberto.

        Nunca levanta. Um alerta que não chega ao painel é ruim; uma exceção
        aqui derrubaria o registro da ocorrência, que é muito pior.
        """
        with self._trava:
            destinos = list(self._ouvintes.get(tenant, ()))
        if not destinos or self._loop is None:
            return 0

        try:
            asyncio.run_coroutine_threadsafe(
                self._entregar(destinos, tenant, evento), self._loop
            )
        except Exception:  # noqa: BLE001
            logger.exception("Falha ao agendar o envio do alerta")
            return 0
        return len(destinos)

    async def _entregar(
        self, destinos: list[WebSocket], tenant: str, evento: dict[str, Any]
    ) -> None:
        for ws in destinos:
            try:
                await ws.send_json(evento)
            except Exception:  # noqa: BLE001
                # Conexão morta que ainda não foi coletada. Tira da lista em
                # vez de tentar de novo no próximo alerta.
                self.sair(ws, tenant)


central = CentralDeAlertas()


async def autenticar_conexao(ws: WebSocket) -> tuple[str, str] | None:
    """Recebe o token pela primeira mensagem e confirma quem é.

    Devolve (tenant, nome) ou None se a identificação falhar. Quem falha é
    desconectado com um código próprio, para o cliente saber que o problema é
    credencial e não rede — reconectar em laço com token inválido não resolve.
    """
    try:
        primeira = await asyncio.wait_for(
            ws.receive_json(), timeout=SEGUNDOS_PARA_AUTENTICAR
        )
    except (asyncio.TimeoutError, Exception):  # noqa: BLE001
        await ws.close(code=4401, reason="Identifique-se com um token.")
        return None

    token = (primeira or {}).get("token") if isinstance(primeira, dict) else None
    if not token:
        await ws.close(code=4401, reason="Mensagem de identificação sem token.")
        return None

    usuario = identificar_por_token(token)
    if usuario is None:
        await ws.close(code=4401, reason="Token inválido ou expirado.")
        return None

    return usuario.tenant, usuario.nome
