"""Detecção e rastreamento de pessoas com YOLOv8.

Responde a duas perguntas por quadro: quantas pessoas estão em cena, e qual
delas é qual ao longo do tempo. A segunda importa tanto quanto a primeira —
sem identidade estável não existe análise temporal, e sem análise temporal não
existe detecção de queda, só detecção de "pessoa deitada".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# Na COCO, com que o YOLOv8 vem treinado, a classe 0 é "person". É a única que
# interessa: qualquer outra coisa em cena é ruído para este problema.
CLASSE_PESSOA = 0


@dataclass(frozen=True)
class Pessoa:
    """Uma pessoa detectada num quadro."""

    id_rastreio: int
    x1: float
    y1: float
    x2: float
    y2: float
    confianca: float

    @property
    def largura(self) -> float:
        return self.x2 - self.x1

    @property
    def altura(self) -> float:
        return self.y2 - self.y1

    @property
    def centro(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)

    @property
    def razao_aspecto(self) -> float:
        """Largura dividida por altura.

        De pé, uma pessoa é bem mais alta que larga (~0,4). Caída, a caixa
        inverte e passa de 1. É a feature mais barata de calcular e uma das
        mais informativas — mas sozinha confunde queda com pessoa agachada ou
        deitada de propósito, por isso é uma entre cinco.
        """
        return self.largura / self.altura if self.altura > 0 else 0.0

    def recortar(self, imagem: np.ndarray, margem: float = 0.08) -> np.ndarray:
        """Recorta a região da pessoa, com folga.

        A margem existe porque o MediaPipe precisa de contexto ao redor do
        corpo; recorte justo na caixa degrada os landmarks das extremidades.
        """
        h, w = imagem.shape[:2]
        mx, my = self.largura * margem, self.altura * margem
        x1 = max(0, int(self.x1 - mx))
        y1 = max(0, int(self.y1 - my))
        x2 = min(w, int(self.x2 + mx))
        y2 = min(h, int(self.y2 + my))
        return imagem[y1:y2, x1:x2]


class DetectorPessoas:
    """YOLOv8n com rastreamento por ByteTrack.

    O modelo `n` (nano) é proposital: o problema aqui é achar uma pessoa
    inteira em cena, não distinguir raças de cachorro. Modelo maior custaria
    latência sem ganhar recall no que importa.

    Roda na GPU NVIDIA quando o torch instalado tem CUDA, em meia precisão
    (FP16), e cai para a CPU sozinho quando não tem. Na CPU o YOLO era quase
    toda a latência do quadro — centenas de ms, com picos acima de 1 s —, e é
    isso que punha em risco os 5 s do RNF07.
    """

    def __init__(
        self,
        peso: str = "yolov8n.pt",
        confianca_minima: float = 0.4,
        pasta_pesos: Path | None = None,
    ) -> None:
        self.confianca_minima = confianca_minima
        self._peso = peso
        self._pasta_pesos = pasta_pesos
        self._modelo = None
        # Definidos em carregar(). "cpu" ou "cuda:0"; o /health mostra a
        # descrição, para ninguém achar que está na GPU quando não está.
        self.dispositivo = "cpu"
        self.descricao_dispositivo = "cpu"
        self._meia_precisao = False

    def carregar(self) -> None:
        """Carrega sob demanda: importar ultralytics custa segundos, e quem só
        quer testar a câmera não deve pagar por isso."""
        if self._modelo is not None:
            return

        import torch
        from ultralytics import YOLO

        if torch.cuda.is_available():
            self.dispositivo = "cuda:0"
            self._meia_precisao = True
            self.descricao_dispositivo = f"cuda:0 ({torch.cuda.get_device_name(0)}, FP16)"
        else:
            # Torch sem CUDA (o build +cpu) ou máquina sem GPU NVIDIA. Funciona,
            # só que várias vezes mais devagar: o README explica como instalar.
            self.dispositivo = "cpu"
            self._meia_precisao = False
            self.descricao_dispositivo = "cpu"

        caminho = self._peso
        if self._pasta_pesos is not None:
            self._pasta_pesos.mkdir(parents=True, exist_ok=True)
            local = self._pasta_pesos / self._peso
            # Na primeira execução o peso é baixado; nas seguintes vem do disco.
            caminho = str(local) if local.exists() else self._peso

        logger.info("Carregando YOLOv8 (%s) em %s", caminho, self.descricao_dispositivo)
        self._modelo = YOLO(caminho)

        if self._pasta_pesos is not None:
            destino = self._pasta_pesos / self._peso
            origem = Path(getattr(self._modelo, "ckpt_path", "") or "")
            if origem.exists() and not destino.exists():
                import shutil

                shutil.copy2(origem, destino)
                logger.info("Peso guardado em %s", destino)

        if self.dispositivo != "cpu":
            # Na GPU, contexto CUDA, kernels e conversão para FP16 só acontecem
            # na primeira inferência — medido: 24 s no primeiro quadro. Pagar
            # aqui, com um quadro vazio, tira esse custo do vídeo e da métrica
            # de latência. predict, e não track, para não semear o rastreador.
            self._modelo.predict(
                np.zeros((384, 640, 3), dtype=np.uint8),
                device=self.dispositivo,
                half=self._meia_precisao,
                verbose=False,
            )

    def detectar(self, imagem: np.ndarray) -> list[Pessoa]:
        """Detecta e rastreia pessoas, mantendo o id entre quadros.

        `persist=True` faz o rastreador tratar as chamadas como uma sequência
        contínua. Sem isso cada quadro vira um vídeo novo, os ids reiniciam e a
        análise temporal perde o fio.
        """
        self.carregar()
        assert self._modelo is not None

        resultados = self._modelo.track(
            imagem,
            persist=True,
            classes=[CLASSE_PESSOA],
            conf=self.confianca_minima,
            tracker="bytetrack.yaml",
            device=self.dispositivo,
            half=self._meia_precisao,
            verbose=False,
        )
        if not resultados:
            return []

        caixas = resultados[0].boxes
        if caixas is None or caixas.id is None:
            # Sem id de rastreio o quadro não serve para análise temporal.
            return []

        pessoas: list[Pessoa] = []
        for coords, id_rastreio, confianca in zip(
            caixas.xyxy.tolist(), caixas.id.int().tolist(), caixas.conf.tolist()
        ):
            x1, y1, x2, y2 = coords
            pessoas.append(
                Pessoa(
                    id_rastreio=int(id_rastreio),
                    x1=x1, y1=y1, x2=x2, y2=y2,
                    confianca=float(confianca),
                )
            )
        return pessoas

    def reiniciar_rastreio(self) -> None:
        """Zera o rastreador. Necessário ao trocar de vídeo — senão as pessoas
        do clipe anterior continuam sendo procuradas no novo."""
        if self._modelo is not None and hasattr(self._modelo, "predictor"):
            predictor = self._modelo.predictor
            if predictor is not None and hasattr(predictor, "trackers"):
                for t in predictor.trackers:
                    t.reset()
