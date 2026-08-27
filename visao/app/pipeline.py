"""Orquestração do pipeline de detecção de quedas.

Amarra os sete estágios que a seção 5.5 da RFC descreve:

    captura → pré-processamento → inferência → pós-processamento
            → decisão → (validação) → implantação

Cada estágio é uma classe própria, testável isoladamente. Esta aqui só
coordena — deliberadamente sem regra de negócio, para que a lógica de queda
viva num lugar só, em `regras.py`.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Iterator

from .caracteristicas import Caracteristicas, ExtratorCaracteristicas
from .config import Config
from .deteccao import DetectorPessoas, Pessoa
from .fonte_video import FonteVideo, Quadro
from .pose import EstimadorPose, Pose
from .regras import Avaliacao, ClassificadorQuedas, Estado, Limiares

logger = logging.getLogger(__name__)


@dataclass
class ResultadoPessoa:
    """O que se sabe sobre uma pessoa num quadro."""

    pessoa: Pessoa
    pose: Pose | None
    caracteristicas: Caracteristicas | None
    avaliacao: Avaliacao | None

    @property
    def estado(self) -> Estado:
        return self.avaliacao.estado if self.avaliacao else Estado.NORMAL

    @property
    def impedimento(self) -> str | None:
        """O que impede a classificação desta pessoa, se algo impede.

        None quer dizer que foi classificada. Qualquer outra coisa é uma
        explicação para quem está operando — não classificar em silêncio é o
        que faz um monitor perder a confiança de quem depende dele.
        """
        if self.pose is None:
            return "pose não detectada no recorte"
        if not self.pose.confiavel:
            return self.pose.diagnostico()
        if self.caracteristicas is None:
            return "features não calculadas"
        if self.avaliacao is None:
            return "aprendendo a altura de pé desta pessoa (aguarde alguns quadros)"
        return None


@dataclass
class ResultadoQuadro:
    """Saída do pipeline para um quadro."""

    quadro: Quadro
    pessoas: list[ResultadoPessoa] = field(default_factory=list)
    ms_deteccao: float = 0.0
    ms_pose: float = 0.0
    ms_total: float = 0.0

    @property
    def ocorrencias(self) -> list[ResultadoPessoa]:
        """Quem cruzou o limiar de permanência neste quadro."""
        return [
            r for r in self.pessoas
            if r.avaliacao is not None and r.avaliacao.deve_gerar_ocorrencia
        ]

    @property
    def caidos(self) -> list[ResultadoPessoa]:
        return [r for r in self.pessoas if r.estado is Estado.CAIDO]


class PipelineDeteccao:
    """Junta detecção, pose, features e regras num fluxo só."""

    def __init__(
        self,
        cfg: Config,
        limiares: Limiares | None = None,
        pasta_pesos=None,
    ) -> None:
        self.cfg = cfg
        self.detector = DetectorPessoas(pasta_pesos=pasta_pesos)
        self.estimador = EstimadorPose()
        self.extrator = ExtratorCaracteristicas()
        self.classificador = ClassificadorQuedas(limiares)

    def preparar(self) -> None:
        """Carrega os modelos antes do primeiro quadro.

        Sem isso, o custo de carregar YOLO e MediaPipe cairia no primeiro
        quadro do vídeo e apareceria como uma latência de vários segundos que
        não existe em regime — poluindo a métrica que a RFC promete medir.
        """
        inicio = time.monotonic()
        self.detector.carregar()
        self.estimador.carregar()
        logger.info("Modelos prontos em %.1fs", time.monotonic() - inicio)

    def processar_quadro(self, quadro: Quadro) -> ResultadoQuadro:
        inicio = time.monotonic()
        resultado = ResultadoQuadro(quadro=quadro)

        t0 = time.monotonic()
        pessoas = self.detector.detectar(quadro.imagem)
        resultado.ms_deteccao = (time.monotonic() - t0) * 1000

        ids_ativos = {p.id_rastreio for p in pessoas}
        self.extrator.esquecer(ids_ativos)
        self.classificador.esquecer(ids_ativos)

        t0 = time.monotonic()
        for pessoa in pessoas:
            recorte = pessoa.recortar(quadro.imagem)
            pose = self.estimador.estimar(recorte, deslocamento=(pessoa.x1, pessoa.y1))
            caracteristicas = self.extrator.extrair(pessoa, pose, quadro.timestamp)

            avaliacao = None
            if caracteristicas is not None:
                historico = self.extrator.historico(pessoa.id_rastreio)
                # Só classifica depois de conhecer a altura de pé da pessoa.
                # Antes disso a razão de altura mente, e mentir cedo é pior do
                # que calar.
                if historico.amadurecido:
                    avaliacao = self.classificador.avaliar(
                        pessoa.id_rastreio, caracteristicas, quadro.timestamp
                    )

            resultado.pessoas.append(
                ResultadoPessoa(
                    pessoa=pessoa,
                    pose=pose,
                    caracteristicas=caracteristicas,
                    avaliacao=avaliacao,
                )
            )
        resultado.ms_pose = (time.monotonic() - t0) * 1000
        resultado.ms_total = (time.monotonic() - inicio) * 1000
        return resultado

    def executar(self, limite_quadros: int | None = None) -> Iterator[ResultadoQuadro]:
        """Roda o pipeline sobre a fonte configurada."""
        self.preparar()
        with FonteVideo(self.cfg) as fonte:
            for quadro in fonte.quadros():
                yield self.processar_quadro(quadro)
                if limite_quadros is not None and quadro.indice >= limite_quadros:
                    return

    def fechar(self) -> None:
        self.estimador.fechar()
