"""Estimativa de pose com MediaPipe.

Recebe o recorte de uma pessoa e devolve os 33 landmarks do corpo. É deles que
saem as features de queda — a caixa do YOLO diz *onde* a pessoa está, a pose diz
*como* ela está, e é o "como" que distingue cair de agachar.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import IntEnum

import numpy as np

logger = logging.getLogger(__name__)


class Marco(IntEnum):
    """Índices dos landmarks do MediaPipe Pose que este projeto usa.

    São 33 no total; aqui ficam nomeados só os que entram no cálculo, para o
    código dizer `Marco.QUADRIL_ESQ` em vez de `23`.
    """

    NARIZ = 0
    OMBRO_ESQ = 11
    OMBRO_DIR = 12
    COTOVELO_ESQ = 13
    COTOVELO_DIR = 14
    QUADRIL_ESQ = 23
    QUADRIL_DIR = 24
    JOELHO_ESQ = 25
    JOELHO_DIR = 26
    TORNOZELO_ESQ = 27
    TORNOZELO_DIR = 28


@dataclass(frozen=True)
class Pose:
    """Landmarks de uma pessoa, em coordenadas do quadro inteiro (pixels)."""

    pontos: np.ndarray        # (33, 2) — x, y em pixels
    visibilidade: np.ndarray  # (33,) — 0 a 1, confiança de cada ponto

    # Abaixo disso o ponto está ocluso ou foi chutado, e usá-lo suja a feature.
    LIMIAR_VISIVEL = 0.5

    def ponto(self, marco: Marco) -> np.ndarray | None:
        if self.visibilidade[marco] < self.LIMIAR_VISIVEL:
            return None
        return self.pontos[marco]

    def media(self, a: Marco, b: Marco) -> np.ndarray | None:
        """Ponto médio entre dois marcos, tolerando a perda de um deles.

        Numa queda lateral um dos quadris some com frequência. Exigir os dois
        faria a feature evaporar justamente no momento que interessa medir.
        """
        pa, pb = self.ponto(a), self.ponto(b)
        if pa is not None and pb is not None:
            return (pa + pb) / 2
        return pa if pa is not None else pb

    @property
    def centro_ombros(self) -> np.ndarray | None:
        return self.media(Marco.OMBRO_ESQ, Marco.OMBRO_DIR)

    @property
    def centro_quadris(self) -> np.ndarray | None:
        return self.media(Marco.QUADRIL_ESQ, Marco.QUADRIL_DIR)

    @property
    def centro_tornozelos(self) -> np.ndarray | None:
        return self.media(Marco.TORNOZELO_ESQ, Marco.TORNOZELO_DIR)

    @property
    def confiavel(self) -> bool:
        """O mínimo para calcular o tronco: ombros e quadris visíveis."""
        return self.centro_ombros is not None and self.centro_quadris is not None

    def diagnostico(self) -> str:
        """Por que esta pose não serve, em uma linha.

        Existe porque a falha mais comum em campo não é o modelo errar — é o
        enquadramento não mostrar o corpo inteiro. Sem esta mensagem o sistema
        simplesmente não classifica ninguém e não diz o motivo, que é o pior
        comportamento possível num monitor.
        """
        faltando = []
        if self.centro_ombros is None:
            faltando.append("ombros")
        if self.centro_quadris is None:
            faltando.append("quadris")
        if not faltando:
            return "pose completa"
        return (
            f"{' e '.join(faltando)} fora de vista — a câmera precisa enquadrar "
            "o corpo inteiro para medir a verticalidade do tronco"
        )


class EstimadorPose:
    """Envolve o MediaPipe Pose.

    Trabalha sobre o recorte de UMA pessoa, não sobre o quadro inteiro: é o
    YOLO que resolve o caso de várias pessoas em cena, e o MediaPipe cuida de
    uma por vez. Essa divisão é a que a RFC descreve na seção 5.5.
    """

    def __init__(self, complexidade: int = 1, confianca_minima: float = 0.5) -> None:
        # complexidade 0 é mais rápida e imprecisa; 2 é lenta demais para CPU.
        self.complexidade = complexidade
        self.confianca_minima = confianca_minima
        self._pose = None

    def carregar(self) -> None:
        if self._pose is not None:
            return

        import mediapipe as mp

        logger.info("Carregando MediaPipe Pose (complexidade %d)", self.complexidade)
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False,     # vídeo: reaproveita a detecção anterior
            model_complexity=self.complexidade,
            enable_segmentation=False,   # não precisamos da máscara, custa caro
            min_detection_confidence=self.confianca_minima,
            min_tracking_confidence=self.confianca_minima,
        )

    def estimar(
        self,
        recorte: np.ndarray,
        deslocamento: tuple[float, float] = (0.0, 0.0),
    ) -> Pose | None:
        """Extrai a pose de um recorte.

        `deslocamento` é o canto superior esquerdo do recorte no quadro
        original: os landmarks voltam em coordenadas do quadro inteiro, senão
        cada pessoa teria um sistema de coordenadas próprio e comparar posições
        entre elas seria impossível.
        """
        if recorte.size == 0 or recorte.shape[0] < 32 or recorte.shape[1] < 32:
            return None

        self.carregar()
        assert self._pose is not None

        import cv2

        # O MediaPipe espera RGB; o OpenCV entrega BGR.
        resultado = self._pose.process(cv2.cvtColor(recorte, cv2.COLOR_BGR2RGB))
        if not resultado.pose_landmarks:
            return None

        altura, largura = recorte.shape[:2]
        dx, dy = deslocamento

        marcos = resultado.pose_landmarks.landmark
        pontos = np.array([[m.x * largura + dx, m.y * altura + dy] for m in marcos], dtype=np.float32)
        visibilidade = np.array([m.visibility for m in marcos], dtype=np.float32)

        return Pose(pontos=pontos, visibilidade=visibilidade)

    def fechar(self) -> None:
        if self._pose is not None:
            self._pose.close()
            self._pose = None

    def __enter__(self) -> "EstimadorPose":
        self.carregar()
        return self

    def __exit__(self, *_) -> None:
        self.fechar()
