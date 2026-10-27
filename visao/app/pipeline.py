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
        # Um MediaPipe POR PESSOA. Em modo vídeo ele usa os landmarks do quadro
        # anterior para achar o corpo no próximo; com um só para todos, o
        # recorte da enfermeira herdava a pose da paciente e vice-versa.
        # `estimador` é carregado no preparar() e vai para a primeira pessoa,
        # para ela não pagar a inicialização no meio do vídeo.
        self.estimador = EstimadorPose()
        self._poses: dict[int, EstimadorPose] = {}
        self._visto_no_quadro: dict[int, int] = {}
        self._quadros = 0
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

        self._quadros += 1
        for id_ativo in ids_ativos:
            self._visto_no_quadro[id_ativo] = self._quadros
        self._liberar_poses()

        t0 = time.monotonic()
        for pessoa in pessoas:
            recorte = pessoa.recortar(quadro.imagem)
            pose = self._pose_de(pessoa.id_rastreio).estimar(recorte, deslocamento=(pessoa.x1, pessoa.y1))
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

    # Quadros sem ver a pessoa antes de fechar o MediaPipe dela (~2 s a 8 fps).
    # Detecção de quem está deitado pisca; recriar a cada piscada custaria a
    # inicialização do modelo de novo e jogaria fora a continuidade da pose.
    QUADROS_PARA_LIBERAR_POSE = 16

    def _pose_de(self, id_rastreio: int) -> EstimadorPose:
        estimador = self._poses.get(id_rastreio)
        if estimador is None:
            if self.estimador not in self._poses.values():
                estimador = self.estimador
            else:
                estimador = EstimadorPose()
                estimador.carregar()
            self._poses[id_rastreio] = estimador
        return estimador

    def _liberar_poses(self) -> None:
        for id_antigo in list(self._poses):
            if self._quadros - self._visto_no_quadro.get(id_antigo, 0) > self.QUADROS_PARA_LIBERAR_POSE:
                estimador = self._poses.pop(id_antigo)
                self._visto_no_quadro.pop(id_antigo, None)
                if estimador is self.estimador:
                    # O pré-carregado volta limpo para a próxima pessoa.
                    estimador.fechar()
                    estimador.carregar()
                else:
                    estimador.fechar()

    def _fechar_poses(self) -> None:
        for estimador in self._poses.values():
            if estimador is not self.estimador:
                estimador.fechar()
        self._poses.clear()
        self._visto_no_quadro.clear()

    def reiniciar(self, limiares: Limiares | None = None) -> None:
        """Esquece tudo o que foi visto, mantendo os modelos carregados.

        Serve para encadear vários vídeos no mesmo processo — o arnês de
        avaliação faz isso — sem que as pessoas do clipe anterior continuem
        sendo procuradas no novo, e sem pagar de novo o carregamento dos
        modelos. Se `limiares` vier, a camada de regras passa a usá-los.
        """
        self.detector.reiniciar_rastreio()
        # O MediaPipe em modo vídeo reaproveita a detecção anterior; fechar e
        # reabrir é o jeito de apagar essa memória.
        self._fechar_poses()
        self.estimador.fechar()
        self.estimador.carregar()
        self.extrator = ExtratorCaracteristicas()
        self.classificador = ClassificadorQuedas(limiares or self.classificador.limiares)

    def executar(
        self, limite_quadros: int | None = None, cfg: Config | None = None
    ) -> Iterator[ResultadoQuadro]:
        """Roda o pipeline sobre a fonte configurada (ou sobre `cfg`, se vier)."""
        self.preparar()
        with FonteVideo(cfg or self.cfg) as fonte:
            for quadro in fonte.quadros():
                yield self.processar_quadro(quadro)
                if limite_quadros is not None and quadro.indice >= limite_quadros:
                    return

    def fechar(self) -> None:
        self._fechar_poses()
        self.estimador.fechar()
