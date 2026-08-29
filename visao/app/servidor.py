"""Servidor HTTP que publica o vídeo anotado e o estado da detecção.

O pipeline roda numa thread própria e vai deixando o último quadro anotado
disponível. O servidor apenas entrega o que existe — nunca espera o
processamento, e por isso um cliente lento não segura a análise.

Duas rotas importam:

  GET /stream   MJPEG (multipart/x-mixed-replace). É o mesmo formato que
                câmera IP usa, então o navegador exibe com um <img> comum,
                sem WebRTC, sem WebSocket e sem biblioteca no frontend.

  GET /estado   JSON com quem está em cena, o estado de cada um e a latência.
                O <img> do MJPEG não consegue devolver dado estruturado, então
                o texto vem por aqui.

Este serviço roda NATIVO no Windows quando a fonte é webcam: container no
Windows não enxerga dispositivo de vídeo. Com câmera IP, roda no container.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field

import cv2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import Config
from .pipeline import PipelineDeteccao, ResultadoQuadro
from .regras import Estado

logger = logging.getLogger(__name__)

CORES = {
    Estado.NORMAL: (120, 200, 120),
    Estado.CAINDO: (60, 190, 245),
    Estado.CAIDO: (60, 60, 235),
}


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


class ServicoVisao:
    """Roda o pipeline em segundo plano e mantém o último quadro publicado."""

    def __init__(self, cfg: Config, pasta_pesos=None) -> None:
        self.cfg = cfg
        self.pasta_pesos = pasta_pesos
        self.ultimo = Ultimo()
        self.rodando = False
        self.erro: str | None = None
        self.ocorrencias_totais = 0
        self._thread: threading.Thread | None = None

    def _laco(self) -> None:
        pipeline = PipelineDeteccao(self.cfg, pasta_pesos=self.pasta_pesos)
        try:
            for resultado in pipeline.executar():
                if not self.rodando:
                    break
                self.ocorrencias_totais += len(resultado.ocorrencias)
                for r in resultado.ocorrencias:
                    logger.warning(
                        "OCORRÊNCIA — pessoa #%s: %s", r.pessoa.id_rastreio, r.avaliacao.motivo
                    )

                # Qualidade 75: o suficiente para inspecionar a cena sem
                # inflar a banda de um stream contínuo.
                ok, buffer = cv2.imencode(".jpg", anotar(resultado), [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ok:
                    self.ultimo.publicar(buffer.tobytes(), resumir(resultado))
        except Exception as erro:  # noqa: BLE001
            self.erro = str(erro)
            logger.exception("Pipeline parou")
        finally:
            pipeline.fechar()
            self.rodando = False

    def iniciar(self) -> None:
        if self.rodando:
            return
        self.rodando = True
        self.erro = None
        self._thread = threading.Thread(target=self._laco, name="pipeline", daemon=True)
        self._thread.start()

    def parar(self) -> None:
        self.rodando = False
        if self._thread is not None:
            self._thread.join(timeout=5)


def criar_app(cfg: Config, pasta_pesos=None) -> FastAPI:
    servico = ServicoVisao(cfg, pasta_pesos)
    app = FastAPI(title="MedSignal — serviço de visão", version="0.1.0")

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

    @app.on_event("startup")
    def _subir() -> None:
        servico.iniciar()

    @app.on_event("shutdown")
    def _descer() -> None:
        servico.parar()

    @app.get("/health")
    def health():
        return {
            "status": "erro" if servico.erro else ("ok" if servico.rodando else "parado"),
            "erro": servico.erro,
            "fonte": cfg.descrever_fonte(),
            "modo_teste": cfg.modo_teste,
            "ocorrencias": servico.ocorrencias_totais,
        }

    @app.get("/estado")
    def estado():
        _, dados = servico.ultimo.ler()
        return {
            "rodando": servico.rodando,
            "erro": servico.erro,
            "fonte": cfg.descrever_fonte(),
            "modo_teste": cfg.modo_teste,
            "ocorrencias_totais": servico.ocorrencias_totais,
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
