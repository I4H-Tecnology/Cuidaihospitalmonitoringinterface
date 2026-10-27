"""Servidor HTTP que publica o vídeo anotado e o estado da detecção.

O pipeline roda numa thread própria e vai deixando o último quadro anotado
disponível. O servidor apenas entrega o que existe — nunca espera o
processamento, e por isso um cliente lento não segura a análise.

Três rotas importam:

  GET /stream   MJPEG (multipart/x-mixed-replace). É o mesmo formato que
                câmera IP usa, então o navegador exibe com um <img> comum,
                sem WebRTC, sem WebSocket e sem biblioteca no frontend.

  GET /estado   JSON com quem está em cena, o estado de cada um, a latência e
                o estado da captura (capturando / reconectando / parado).

  GET /health   Diagnóstico para quem opera: fps real, latência p95, quadros
                processados, uptime, reconexões, clipes em disco, expurgo.

A fonte pode cair — cabo, switch, câmera que reinicia. Quando isso acontece a
thread NÃO morre: ela espera com backoff exponencial e tenta de novo, e o
estado exposto diz exatamente em que pé está (RF30, RN15, RNF16, RNF17).

Este serviço roda NATIVO no Windows quando a fonte é webcam: container no
Windows não enxerga dispositivo de vídeo. Com câmera IP, roda no container.
"""

from __future__ import annotations

import logging
import os
import statistics
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import cv2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import publicador as pub
from .clipes import GravadorDeClipes, GravadorInativo
from .config import Config, Fonte
from .fonte_video import EsperaDeReconexao
from .pipeline import PipelineDeteccao, ResultadoQuadro
from .regras import Estado

logger = logging.getLogger(__name__)

VERSAO = "0.2.0"

CORES = {
    Estado.NORMAL: (120, 200, 120),
    Estado.CAINDO: (60, 190, 245),
    Estado.CAIDO: (60, 60, 235),
}

# Estados da captura. São os três que a operação precisa distinguir: tudo bem,
# a fonte caiu e estamos tentando, e desistimos / fomos desligados.
INICIANDO = "iniciando"
CAPTURANDO = "capturando"
RECONECTANDO = "reconectando"
PARADO = "parado"


@dataclass
class Ultimo:
    """O quadro mais recente, compartilhado entre a thread do pipeline e o HTTP.

    Um lock simples basta: o produtor escreve raramente (8 vezes por segundo) e
    os leitores só copiam a referência. Fila seria complexidade sem ganho.
    """

    jpeg: bytes | None = None
    estado: dict = field(default_factory=dict)
    trava: threading.Lock = field(default_factory=threading.Lock)

    def publicar(self, jpeg: bytes, estado: dict) -> None:
        with self.trava:
            self.jpeg = jpeg
            self.estado = estado

    def ler(self) -> tuple[bytes | None, dict]:
        with self.trava:
            return self.jpeg, dict(self.estado)


def anotar(resultado: ResultadoQuadro):
    """Desenha caixa, esqueleto e estado sobre o quadro."""
    imagem = resultado.quadro.imagem.copy()

    for r in resultado.pessoas:
        cor = CORES[r.estado]
        p = r.pessoa
        cv2.rectangle(imagem, (int(p.x1), int(p.y1)), (int(p.x2), int(p.y2)), cor, 2)

        rotulo = f"#{p.id_rastreio} {r.estado.value}"
        if r.avaliacao:
            rotulo += f" {r.avaliacao.confianca:.2f}"
        cv2.putText(
            imagem, rotulo, (int(p.x1), max(14, int(p.y1) - 6)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, cor, 2, cv2.LINE_AA,
        )

        if r.pose is not None:
            for (x, y), vis in zip(r.pose.pontos, r.pose.visibilidade):
                if vis >= r.pose.LIMIAR_VISIVEL:
                    cv2.circle(imagem, (int(x), int(y)), 2, cor, -1)

    return imagem


def resumir(resultado: ResultadoQuadro) -> dict:
    """Estado em JSON, para o frontend exibir sem decodificar imagem."""
    return {
        "quadro": resultado.quadro.indice,
        "timestamp": resultado.quadro.timestamp,
        "latencia_ms": round(resultado.ms_total, 1),
        "latencia_deteccao_ms": round(resultado.ms_deteccao, 1),
        "latencia_pose_ms": round(resultado.ms_pose, 1),
        "pessoas": [
            {
                "id": r.pessoa.id_rastreio,
                "estado": r.estado.value,
                "confianca": r.avaliacao.confianca if r.avaliacao else None,
                "impedimento": r.impedimento,
                "caixa": {
                    "x1": round(r.pessoa.x1), "y1": round(r.pessoa.y1),
                    "x2": round(r.pessoa.x2), "y2": round(r.pessoa.y2),
                },
                "caracteristicas": (
                    {
                        "angulo_tronco": round(r.caracteristicas.angulo_tronco, 1),
                        "razao_aspecto": round(r.caracteristicas.razao_aspecto, 2),
                        "razao_altura": round(r.caracteristicas.razao_altura, 2),
                        "velocidade_queda": round(r.caracteristicas.velocidade_queda, 2),
                    }
                    if r.caracteristicas
                    else None
                ),
            }
            for r in resultado.pessoas
        ],
        "caidos": len(resultado.caidos),
        "ocorrencias_neste_quadro": len(resultado.ocorrencias),
    }


def _p95(valores: list[float]) -> float | None:
    if not valores:
        return None
    ordenados = sorted(valores)
    return ordenados[min(len(ordenados) - 1, int(round(0.95 * (len(ordenados) - 1))))]


def criar_gravador(cfg: Config, raiz: Path | None = None):
    if not cfg.clipes_ativos:
        return GravadorInativo()
    if cfg.clipes_pasta:
        pasta = Path(cfg.clipes_pasta)
    else:
        pasta = (raiz or Path(__file__).resolve().parents[1]) / "dados" / "clipes"
    return GravadorDeClipes(
        pasta=pasta,
        fps=cfg.fps_alvo,
        segundos_antes=cfg.clipes_segundos_antes,
        segundos_depois=cfg.clipes_segundos_depois,
        retencao_horas=cfg.clipes_retencao_horas,
    )


class ServicoVisao:
    """Roda o pipeline em segundo plano, sobrevive à queda da fonte e expõe o estado."""

    def __init__(
        self,
        cfg: Config,
        pasta_pesos=None,
        fabrica_pipeline: Callable[[], PipelineDeteccao] | None = None,
        espera: EsperaDeReconexao | None = None,
        gravador=None,
        publicador=None,
    ) -> None:
        self.cfg = cfg
        self.pasta_pesos = pasta_pesos
        self.ultimo = Ultimo()
        self.rodando = False
        self.erro: str | None = None
        self.ocorrencias_totais = 0
        self.publicador = publicador if publicador is not None else pub.criar(cfg)
        self.gravador = gravador if gravador is not None else criar_gravador(cfg)
        # A API devolve o id da ocorrência; é ele que dá nome ao clipe.
        self.publicador.ao_registrar = self.gravador.nomear
        self._fabrica = fabrica_pipeline or (lambda: PipelineDeteccao(cfg, pasta_pesos=pasta_pesos))
        self._espera = espera or EsperaDeReconexao()
        self._thread: threading.Thread | None = None

        # -- estado da captura (parte A) ----------------------------------
        self.estado_fonte = PARADO
        self.tentativa = 0
        self.proxima_tentativa_em: float | None = None
        self.ultimo_quadro_em: float | None = None
        self.reconexoes = 0          # quantas vezes a fonte caiu e voltou
        self.quedas_da_fonte = 0     # quantas vezes caiu (voltando ou não)

        # -- métricas (parte C) --------------------------------------------
        self.iniciado_em: float | None = None
        self.quadros_processados = 0
        self._latencias: deque[float] = deque(maxlen=240)   # ~30 s a 8 fps
        self._chegadas: deque[float] = deque(maxlen=64)
        self._trava = threading.Lock()
        # Onde o YOLO roda ("cuda:0 (…, FP16)" ou "cpu"). Só se sabe depois
        # que o pipeline carrega os modelos, no primeiro quadro.
        self.dispositivo: str | None = None

    # -- laço principal ---------------------------------------------------

    def _laco(self) -> None:
        pipeline = self._fabrica()
        try:
            while self.rodando:
                motivo = None
                try:
                    self._capturar(pipeline)
                    motivo = "a fonte encerrou o stream"
                except Exception as erro:  # noqa: BLE001
                    motivo = str(erro) or erro.__class__.__name__
                    logger.warning("Captura interrompida: %s", motivo)
                if not self.rodando:
                    break

                if motivo == "a fonte encerrou o stream" and self.cfg.fonte is Fonte.ARQUIVO:
                    # Arquivo que chegou ao fim não é câmera que caiu: é a
                    # demonstração rodando em laço. Recomeça do início, sem
                    # backoff e sem contar como queda — se o arquivo sumiu, a
                    # reabertura falha e aí sim entra o caminho de reconexão.
                    logger.info("Arquivo terminou; recomeçando do início")
                    pipeline.reiniciar()
                    continue

                # A fonte caiu. Não morre: espera com backoff e tenta de novo.
                segundos = self._espera.proxima()
                with self._trava:
                    if self.estado_fonte != RECONECTANDO:
                        self.quedas_da_fonte += 1
                    self.estado_fonte = RECONECTANDO
                    self.tentativa = self._espera.tentativa
                    self.proxima_tentativa_em = time.time() + segundos
                    self.erro = motivo
                logger.warning(
                    "Fonte indisponível (%s). Tentativa %d em %.0fs",
                    motivo, self._espera.tentativa, segundos,
                    extra={"tentativa": self._espera.tentativa, "espera_s": segundos},
                )
                self._dormir(segundos)
                if not self.rodando:
                    break
                try:
                    pipeline.reiniciar()
                except Exception:  # noqa: BLE001
                    logger.exception("Falha ao reiniciar o pipeline; tentando mesmo assim")
        finally:
            try:
                pipeline.fechar()
            finally:
                with self._trava:
                    self.estado_fonte = PARADO
                    self.proxima_tentativa_em = None
                self.rodando = False

    def _capturar(self, pipeline: PipelineDeteccao) -> None:
        """Consome a fonte até ela acabar ou falhar. Só volta quando isso acontece."""
        with self._trava:
            if self.estado_fonte == PARADO:
                self.estado_fonte = INICIANDO
        for resultado in pipeline.executar():
            if not self.rodando:
                return
            agora = time.time()
            with self._trava:
                if self.estado_fonte != CAPTURANDO:
                    if self.estado_fonte == RECONECTANDO:
                        self.reconexoes += 1
                        logger.info("Fonte voltou após %d tentativa(s)", self.tentativa)
                    self.estado_fonte = CAPTURANDO
                    self.erro = None
                    self.tentativa = 0
                    self.proxima_tentativa_em = None
                    self._espera.zerar()
                    self.dispositivo = getattr(
                        getattr(pipeline, "detector", None), "descricao_dispositivo", None
                    )
                    # O fps é medido sobre as últimas chegadas; contar o tempo
                    # em que a fonte esteve fora derrubaria o número por
                    # minutos depois de a captura já ter voltado ao normal.
                    self._chegadas.clear()
                self.ultimo_quadro_em = agora
                self.quadros_processados += 1
                self._latencias.append(resultado.ms_total)
                self._chegadas.append(agora)
            self.publicador.marcar_quadro(agora)

            self.ocorrencias_totais += len(resultado.ocorrencias)
            for r in resultado.ocorrencias:
                logger.warning(
                    "OCORRÊNCIA — pessoa #%s: %s", r.pessoa.id_rastreio, r.avaliacao.motivo
                )
                # Enfileira e volta na hora. O registro é assunto da thread
                # do publicador; aqui o próximo quadro já está esperando.
                self.publicador.registrar(r)
                self.gravador.iniciar(pub.montar_evento(self.cfg, r)["chaveEvento"])

            imagem = anotar(resultado)
            self.gravador.registrar_quadro(imagem)
            # Qualidade 75: o suficiente para inspecionar a cena sem
            # inflar a banda de um stream contínuo.
            ok, buffer = cv2.imencode(".jpg", imagem, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if ok:
                self.ultimo.publicar(buffer.tobytes(), resumir(resultado))

    def _dormir(self, segundos: float) -> None:
        """Espera em passos curtos, para `parar()` não ficar preso no backoff."""
        fim = time.monotonic() + segundos
        while self.rodando and time.monotonic() < fim:
            time.sleep(min(0.1, max(0.0, fim - time.monotonic())))

    # -- ciclo de vida ----------------------------------------------------

    def iniciar(self) -> None:
        if self.rodando:
            return
        self.rodando = True
        self.erro = None
        self.iniciado_em = time.time()
        self.publicador.iniciar()
        self.gravador.iniciar_expurgo_periodico()
        self._thread = threading.Thread(target=self._laco, name="pipeline", daemon=True)
        self._thread.start()

    def parar(self) -> None:
        self.rodando = False
        if self._thread is not None:
            self._thread.join(timeout=5)
        self.gravador.parar()
        self.publicador.parar()

    # -- observabilidade --------------------------------------------------

    def captura(self) -> dict:
        """Estado da fonte, para o /estado e o /health."""
        agora = time.time()
        with self._trava:
            return {
                "estado": self.estado_fonte,
                "tentativa": self.tentativa,
                "proxima_tentativa_em_s": (
                    round(max(0.0, self.proxima_tentativa_em - agora), 1)
                    if self.proxima_tentativa_em
                    else None
                ),
                "ultimo_quadro_ha_s": (
                    round(agora - self.ultimo_quadro_em, 1) if self.ultimo_quadro_em else None
                ),
                "reconexoes": self.reconexoes,
                "quedas_da_fonte": self.quedas_da_fonte,
                "erro": self.erro,
            }

    def metricas(self) -> dict:
        with self._trava:
            latencias = list(self._latencias)
            chegadas = list(self._chegadas)
            quadros = self.quadros_processados
        fps = None
        if len(chegadas) >= 2 and chegadas[-1] > chegadas[0]:
            fps = round((len(chegadas) - 1) / (chegadas[-1] - chegadas[0]), 2)
        return {
            "dispositivo": self.dispositivo,
            "fps_real": fps,
            "fps_alvo": self.cfg.fps_alvo,
            "latencia_media_ms": round(statistics.mean(latencias), 1) if latencias else None,
            "latencia_p95_ms": round(_p95(latencias), 1) if latencias else None,
            "latencia_max_ms": round(max(latencias), 1) if latencias else None,
            "quadros_processados": quadros,
            "uptime_s": round(time.time() - self.iniciado_em, 1) if self.iniciado_em else None,
        }

    def status(self) -> str:
        if not self.rodando:
            return "parado"
        if self.estado_fonte == RECONECTANDO:
            return "degradado"
        if self.estado_fonte == CAPTURANDO:
            return "ok"
        return "iniciando"


def criar_app(cfg: Config, pasta_pesos=None, servico: ServicoVisao | None = None) -> FastAPI:
    servico = servico or ServicoVisao(cfg, pasta_pesos)

    @asynccontextmanager
    async def ciclo_de_vida(_: FastAPI):
        servico.iniciar()
        yield
        servico.parar()

    app = FastAPI(title="MedSignal — serviço de visão", version=VERSAO, lifespan=ciclo_de_vida)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            o.strip()
            for o in os.environ.get(
                "CORS_ORIGINS", "http://localhost:5173,http://localhost:8080"
            ).split(",")
            if o.strip()
        ],
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        """Tudo o que permite diagnosticar o serviço sem acessar a máquina."""
        captura = servico.captura()
        return {
            "status": servico.status(),
            "versao": VERSAO,
            "erro": servico.erro,
            "fonte": cfg.descrever_fonte(),
            "modo_teste": cfg.modo_teste,
            "estado_da_fonte": captura["estado"],
            "captura": captura,
            **servico.metricas(),
            "ocorrencias": servico.ocorrencias_totais,
            "clipes": servico.gravador.estado(),
            "publicacao": servico.publicador.estado(),
        }

    @app.get("/estado")
    def estado():
        _, dados = servico.ultimo.ler()
        return {
            "rodando": servico.rodando,
            "erro": servico.erro,
            "fonte": cfg.descrever_fonte(),
            "modo_teste": cfg.modo_teste,
            "captura": servico.captura(),
            "fps_real": servico.metricas()["fps_real"],
            "ocorrencias_totais": servico.ocorrencias_totais,
            "publicacao": servico.publicador.estado(),
            **dados,
        }

    @app.get("/stream")
    def stream():
        """MJPEG contínuo. O navegador consome direto num <img src>."""

        def quadros():
            intervalo = 1.0 / max(cfg.fps_alvo, 1.0)
            ultimo_enviado = None
            while True:
                jpeg, _ = servico.ultimo.ler()
                if jpeg is not None and jpeg is not ultimo_enviado:
                    ultimo_enviado = jpeg
                    yield (
                        b"--quadro\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
                        + jpeg + b"\r\n"
                    )
                time.sleep(intervalo / 2)

        return StreamingResponse(
            quadros(), media_type="multipart/x-mixed-replace; boundary=quadro"
        )

    return app
