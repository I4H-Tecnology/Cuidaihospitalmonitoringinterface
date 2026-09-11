"""Leva a ocorrência detectada até a API.

Até esta fase o pipeline via a queda e escrevia uma linha de log. Aqui ele
passa a registrar: RF13 (registrar automaticamente) e RF14 (com data, horário,
ambiente, paciente e tipo de evento).

Três garantias que valem a complexidade deste arquivo:

  **Nunca segura o pipeline.** O envio sai numa thread própria, alimentada por
  uma fila. Se a API demorar cinco segundos, o vídeo continua a 8 fps — um
  monitor que trava a análise para falar com a rede deixa de monitorar
  exatamente quando mais importa.

  **Não perde evento com a API fora do ar.** O que falha vai para uma fila em
  disco e é reenviado quando ela voltar (RNF16). Ocorrência perdida é queda que
  nunca aconteceu, do ponto de vista de quem for auditar depois.

  **Não duplica.** Cada evento carrega uma chave derivada da câmera, da pessoa
  rastreada e do instante em que ela chegou ao chão. Reenviar a mesma coisa
  duas vezes devolve a mesma ocorrência, e o servidor não cria nada novo.

A autenticação é a mesma de um humano: o serviço faz login e recebe um JWT.
Reaproveitar o que já existe custa menos código e abre menos superfície do que
inventar um token estático sem prazo de validade só para máquina.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .config import Config
from .pipeline import ResultadoPessoa

logger = logging.getLogger(__name__)

# Curto de propósito: se a API não respondeu nesse tempo, ela está com problema
# e insistir só atrasa o próximo evento. O que falhar vai para o disco.
TEMPO_LIMITE = httpx.Timeout(5.0, connect=3.0)

# A fila em memória é um respiro para picos, não um armazém. Cheia, o evento
# vai direto para o disco em vez de bloquear quem está produzindo.
TAMANHO_DA_FILA = 100

# De quanto em quanto tempo a thread tenta reenviar o que ficou em disco.
INTERVALO_DE_REENVIO = 30.0

# Sinal de vida da câmera (RF30, RN15). A API considera desconectada a que fica
# 90s sem ping, então bater a cada 30s dá margem para duas falhas seguidas de
# rede antes de o painel acusar problema.
INTERVALO_DE_PING = 30.0

# O ping só sai se houve quadro capturado há menos que isto. Sem esta regra, o
# processo vivo com a câmera morta continuaria pingando, e o painel mostraria
# "conectada" para uma câmera que não enxerga nada — mentira silenciosa, o
# pior estado possível para um monitor.
JANELA_DE_CAPTURA_VIVA = 10.0


@dataclass
class ContextoCamera:
    """Onde esta câmera está, segundo o cadastro."""

    camera_id: str
    identificador: str
    tenant: str
    ambiente_id: str
    ambiente_nome: str
    paciente_id: str | None
    paciente_nome: str | None

    def descrever(self) -> str:
        onde = f"{self.identificador} em {self.ambiente_nome}"
        return f"{onde}, paciente {self.paciente_nome}" if self.paciente_nome else onde


def montar_evento(cfg: Config, r: ResultadoPessoa) -> dict:
    """Traduz o resultado do pipeline para o corpo que a API espera.

    A tradução do vocabulário mora aqui, e não em `regras.py`: a camada de
    regras conhece queda e postura, não os valores do CHECK de uma tabela.
    """
    avaliacao = r.avaliacao
    assert avaliacao is not None, "só ocorrência gerada chega aqui"

    # O instante do evento é quando a pessoa chegou ao chão — não agora, alguns
    # segundos depois, quando o limiar de permanência foi cruzado.
    quando = avaliacao.inicio_caido or time.time()

    return {
        "tenantId": cfg.tenant,
        "cameraId": cfg.camera_id,
        # Vimos o movimento acontecer, ou a pessoa já estava no chão quando
        # entrou em cena? O schema separa os dois casos, e a diferença importa
        # para quem for analisar o histórico depois.
        "tipoEvento": "queda" if avaliacao.viu_transicao else "permanencia_solo",
        "confianca": round(float(avaliacao.confianca), 3),
        "dataHora": datetime.fromtimestamp(quando, tz=timezone.utc).isoformat(),
        "motivo": avaliacao.motivo or None,
        # Estável entre tentativas porque sai do evento, não do envio.
        "chaveEvento": f"{cfg.camera_id}:{r.pessoa.id_rastreio}:{quando:.0f}",
    }


class Publicador:
    """Fila, thread de envio e reserva em disco."""

    def __init__(self, cfg: Config, pasta_fila: Path | None = None) -> None:
        self.cfg = cfg
        self.pasta_fila = pasta_fila or (Path(__file__).resolve().parents[1] / "dados" / "fila")
        self.contexto: ContextoCamera | None = None
        self.ultimo_erro: str | None = None
        self.enviadas = 0
        self.duplicadas = 0
        self.em_disco = 0
        self.ultimo_ping: float | None = None
        self.ultimo_quadro_em: float | None = None
        self.pings_suprimidos = 0
        # Chamado com (chave_do_evento, id_da_ocorrencia) quando a API confirma
        # o registro. É como o clipe de evidência recebe o nome definitivo.
        self.ao_registrar = None

        self._fila: queue.Queue[dict] = queue.Queue(maxsize=TAMANHO_DA_FILA)
        self._thread: threading.Thread | None = None
        self._rodando = False
        self._token: str | None = None
        self._cliente = httpx.Client(base_url=cfg.api_url, timeout=TEMPO_LIMITE)

    # -- ciclo de vida ----------------------------------------------------

    def iniciar(self) -> None:
        """Autentica, resolve o cadastro da câmera e sobe a thread de envio.

        Falha aqui não derruba o pipeline: sem contexto o serviço segue
        detectando e mostrando na tela, e os eventos ficam em disco esperando.
        Vídeo no ar sem registro é ruim; sem vídeo é pior.
        """
        if self._rodando:
            return
        self.pasta_fila.mkdir(parents=True, exist_ok=True)
        self.em_disco = len(list(self.pasta_fila.glob("*.json")))

        try:
            self._autenticar()
            self.contexto = self._buscar_contexto()
            logger.info("Publicando ocorrências de: %s", self.contexto.descrever())
            if self.contexto.paciente_id is None:
                logger.warning(
                    "Nenhum paciente internado neste ambiente — a ocorrência será "
                    "registrada sem vínculo de paciente."
                )
        except Exception as erro:  # noqa: BLE001
            self.ultimo_erro = str(erro)
            logger.error("Não foi possível falar com a API agora: %s", erro)

        self._rodando = True
        self._thread = threading.Thread(target=self._laco, name="publicador", daemon=True)
        self._thread.start()

    def parar(self) -> None:
        self._rodando = False
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._cliente.close()

    # -- entrada ----------------------------------------------------------

    def marcar_quadro(self, timestamp: float) -> None:
        """O serviço avisa que capturou um quadro. É o que autoriza o ping."""
        self.ultimo_quadro_em = timestamp

    def captura_viva(self, agora: float | None = None) -> bool:
        """Houve quadro há menos de JANELA_DE_CAPTURA_VIVA segundos?"""
        if self.ultimo_quadro_em is None:
            return False
        agora = time.time() if agora is None else agora
        return (agora - self.ultimo_quadro_em) <= JANELA_DE_CAPTURA_VIVA

    def registrar(self, r: ResultadoPessoa) -> None:
        """Enfileira uma ocorrência. Retorna na hora, sempre."""
        evento = montar_evento(self.cfg, r)
        try:
            self._fila.put_nowait(evento)
        except queue.Full:
            # Fila cheia significa API lenta há um tempo. O disco aguenta.
            self._guardar(evento)

    # -- autenticação -----------------------------------------------------

    def _autenticar(self) -> None:
        resposta = self._cliente.post(
            "/api/auth/login",
            json={
                "tenant": self.cfg.tenant,
                "username": self.cfg.api_login,
                "password": self.cfg.api_senha,
            },
        )
        if resposta.status_code != 200:
            detalhe = resposta.json().get("error", resposta.text)
            raise RuntimeError(f"login do serviço recusado ({resposta.status_code}): {detalhe}")
        self._token = resposta.json()["token"]

    def _cabecalho(self) -> dict:
        return {"Authorization": f"Bearer {self._token}"} if self._token else {}

    def _buscar_contexto(self) -> ContextoCamera:
        resposta = self._cliente.get(
            f"/api/cameras/{self.cfg.camera_id}/contexto", headers=self._cabecalho()
        )
        if resposta.status_code == 404:
            raise RuntimeError(
                f"Câmera {self.cfg.camera_id} não existe no cadastro desta clínica. "
                "Confira VISAO_CAMERA_ID e VISAO_TENANT."
            )
        resposta.raise_for_status()
        d = resposta.json()
        return ContextoCamera(
            camera_id=d["cameraId"],
            identificador=d["identificador"],
            tenant=d["tenantId"],
            ambiente_id=d["ambienteId"],
            ambiente_nome=d["ambienteNome"],
            paciente_id=d.get("pacienteId"),
            paciente_nome=d.get("pacienteNome"),
        )

    # -- envio ------------------------------------------------------------

    def _enviar(self, evento: dict) -> bool:
        """Tenta entregar um evento. False manda para o disco."""
        try:
            resposta = self._cliente.post(
                "/api/ocorrencias", json=evento, headers=self._cabecalho()
            )
            # Token de 8 horas expira em plantão longo. Renova uma vez e repete;
            # insistir além disso seria marretar a API com credencial ruim.
            if resposta.status_code == 401:
                self._autenticar()
                resposta = self._cliente.post(
                    "/api/ocorrencias", json=evento, headers=self._cabecalho()
                )

            if resposta.status_code in (200, 201):
                corpo = resposta.json()
                if corpo.get("duplicada"):
                    self.duplicadas += 1
                else:
                    self.enviadas += 1
                    logger.info(
                        "Ocorrência registrada: %s (alerta %s)",
                        corpo.get("id"), corpo.get("alertaId"),
                    )
                self.ultimo_erro = None
                if self.ao_registrar is not None and corpo.get("id"):
                    try:
                        self.ao_registrar(evento["chaveEvento"], str(corpo["id"]))
                    except Exception:  # noqa: BLE001
                        logger.exception("Callback de registro falhou")
                return True

            # 4xx que não seja 401 é evento malformado: reenviar não conserta,
            # e ficaria girando no disco para sempre. Registra e descarta.
            if 400 <= resposta.status_code < 500:
                self.ultimo_erro = f"API recusou o evento ({resposta.status_code}): {resposta.text}"
                logger.error("%s | evento: %s", self.ultimo_erro, evento)
                return True

            self.ultimo_erro = f"API respondeu {resposta.status_code}"
            return False
        except Exception as erro:  # noqa: BLE001
            self.ultimo_erro = str(erro)
            return False

    def _pingar(self) -> None:
        """Avisa a API que esta câmera continua de pé.

        Falha aqui é silenciosa de propósito: perder um ping não é evento para
        o operador, e o próximo resolve. O que importa é nunca deixar a exceção
        derrubar a thread que também entrega as ocorrências.
        """
        try:
            resposta = self._cliente.post(
                f"/api/cameras/{self.cfg.camera_id}/ping", headers=self._cabecalho()
            )
            if resposta.status_code == 401:
                self._autenticar()
                resposta = self._cliente.post(
                    f"/api/cameras/{self.cfg.camera_id}/ping", headers=self._cabecalho()
                )
            if resposta.status_code == 200:
                self.ultimo_ping = time.time()
        except Exception:  # noqa: BLE001
            pass

    # -- reserva em disco -------------------------------------------------

    def _guardar(self, evento: dict) -> None:
        caminho = self.pasta_fila / f"{uuid.uuid4().hex}.json"
        try:
            caminho.write_text(json.dumps(evento, ensure_ascii=False), encoding="utf-8")
            self.em_disco += 1
            logger.warning("Ocorrência guardada em disco para reenvio: %s", caminho.name)
        except OSError as erro:
            # Último recurso: o log é a única cópia que sobra.
            logger.error("Falha ao guardar ocorrência (%s). Evento: %s", erro, evento)

    def _drenar_disco(self) -> None:
        for caminho in sorted(self.pasta_fila.glob("*.json")):
            try:
                evento = json.loads(caminho.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                logger.error("Arquivo de fila ilegível, removendo: %s", caminho.name)
                caminho.unlink(missing_ok=True)
                self.em_disco = max(0, self.em_disco - 1)
                continue

            if not self._enviar(evento):
                # Ainda fora do ar. Para por aqui e tenta de novo depois — não
                # adianta varrer a pasta inteira contra uma API que não responde.
                return
            caminho.unlink(missing_ok=True)
            self.em_disco = max(0, self.em_disco - 1)

    # -- thread -----------------------------------------------------------

    def _laco(self) -> None:
        proximo_reenvio = time.monotonic()
        proximo_ping = time.monotonic()
        while self._rodando:
            try:
                evento = self._fila.get(timeout=1.0)
            except queue.Empty:
                evento = None

            if evento is not None:
                if not self._enviar(evento):
                    self._guardar(evento)

            agora = time.monotonic()
            if agora >= proximo_ping:
                if self.captura_viva():
                    proximo_ping = agora + INTERVALO_DE_PING
                    self._pingar()
                else:
                    # Não avança o relógio: assim que a captura voltar, o ping
                    # sai no segundo seguinte, e o painel vê a câmera voltar.
                    self.pings_suprimidos += 1

            if agora >= proximo_reenvio:
                proximo_reenvio = agora + INTERVALO_DE_REENVIO
                if self.em_disco:
                    self._drenar_disco()

    # -- observabilidade --------------------------------------------------

    def estado(self) -> dict:
        """O que o /estado e o /health mostram sobre a publicação."""
        return {
            "ativo": True,
            "camera": self.contexto.descrever() if self.contexto else None,
            "ambiente_id": self.contexto.ambiente_id if self.contexto else None,
            "paciente_id": self.contexto.paciente_id if self.contexto else None,
            "registradas": self.enviadas,
            "duplicadas": self.duplicadas,
            "aguardando_em_disco": self.em_disco,
            "ultimo_ping": self.ultimo_ping,
            "pingando": self.captura_viva(),
            "pings_suprimidos": self.pings_suprimidos,
            "ultimo_erro": self.ultimo_erro,
        }


class PublicadorInativo:
    """Fica no lugar do publicador quando não há câmera configurada.

    Evita `if publicador is not None` espalhado por quem chama: o serviço trata
    os dois casos igual, e a diferença aparece só no /estado.
    """

    contexto = None
    ao_registrar = None

    def iniciar(self) -> None:
        logger.info("VISAO_CAMERA_ID não definido: detectando sem registrar ocorrência.")

    def marcar_quadro(self, timestamp: float) -> None:
        pass

    def parar(self) -> None:
        pass

    def registrar(self, r: ResultadoPessoa) -> None:
        pass

    def estado(self) -> dict:
        return {"ativo": False, "motivo": "VISAO_CAMERA_ID não definido"}


def criar(cfg: Config, pasta_fila: Path | None = None):
    return Publicador(cfg, pasta_fila) if cfg.publica_ocorrencias else PublicadorInativo()
