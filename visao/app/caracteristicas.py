"""Extração das features de queda a partir da caixa e da pose.

O problema central aqui é **escala**. Uma pessoa a dois metros da câmera ocupa
o triplo dos pixels de uma a seis metros, e nenhuma medida em pixel serve de
limiar fixo. Toda feature abaixo é ou adimensional por construção (ângulo,
razão) ou normalizada pelo próprio corpo da pessoa — nunca pelo quadro.

As cinco features implementam o que a RN10 descreve: *"alteração brusca de
postura, perda de verticalidade ou permanência anormal no chão"*.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass

import numpy as np

from .deteccao import Pessoa
from .pose import Marco, Pose


@dataclass(frozen=True)
class Caracteristicas:
    """As cinco medidas que alimentam a camada de regras."""

    angulo_tronco: float       # graus da vertical: 0 = em pé, 90 = deitado
    razao_aspecto: float       # largura/altura da caixa: <0,6 em pé, >1 caído
    razao_altura: float        # altura atual / altura de pé: 1 = normal, <0,5 = no chão
    velocidade_queda: float    # quedas de corpo por segundo (positivo = descendo)
    abertura_vertical: float   # ombro→tornozelo projetado na vertical, sobre a diagonal

    def como_vetor(self) -> np.ndarray:
        return np.array(
            [
                self.angulo_tronco,
                self.razao_aspecto,
                self.razao_altura,
                self.velocidade_queda,
                self.abertura_vertical,
            ],
            dtype=np.float32,
        )

    @staticmethod
    def nomes() -> list[str]:
        return [
            "angulo_tronco",
            "razao_aspecto",
            "razao_altura",
            "velocidade_queda",
            "abertura_vertical",
        ]


def angulo_com_a_vertical(de: np.ndarray, para: np.ndarray) -> float:
    """Ângulo em graus entre o segmento e o eixo vertical da imagem.

    Devolve 0 para um segmento perfeitamente vertical e 90 para um horizontal,
    independentemente do sentido — cair para frente e cair para trás produzem o
    mesmo número, que é o desejado: o que importa é perder a verticalidade, não
    para que lado.
    """
    dx = float(para[0] - de[0])
    dy = float(para[1] - de[1])
    if dx == 0 and dy == 0:
        return 0.0
    # atan2(|dx|, |dy|): 0 quando o deslocamento é só vertical.
    return math.degrees(math.atan2(abs(dx), abs(dy)))


class HistoricoPessoa:
    """Memória curta de uma pessoa rastreada.

    Guarda o necessário para as features temporais e para saber qual é a
    "altura de pé" daquela pessoa naquela câmera — que não dá para saber a
    priori e precisa ser aprendida em execução.
    """

    def __init__(self, janela: int = 16) -> None:
        self.alturas_caixa: deque[float] = deque(maxlen=120)
        self.historico: deque[tuple[float, float]] = deque(maxlen=janela)  # (timestamp, altura_norm)

    def registrar(self, altura_caixa: float, timestamp: float, altura_norm: float) -> None:
        if altura_caixa > 0:
            self.alturas_caixa.append(altura_caixa)
        self.historico.append((timestamp, altura_norm))

    @property
    def altura_de_pe(self) -> float:
        """Estimativa da altura da caixa com a pessoa em pé.

        Usa o percentil 90 das alturas observadas, não o máximo: o máximo é
        refém de um único quadro com caixa esticada por ruído de detecção, e um
        denominador errado contamina todas as comparações seguintes.
        """
        if not self.alturas_caixa:
            return 0.0
        return float(np.percentile(np.array(self.alturas_caixa), 90))

    def velocidade(self) -> float:
        """Taxa de descida da altura normalizada, em corpos por segundo.

        Compara o quadro atual com o mais antigo da janela em vez de com o
        anterior: entre dois quadros consecutivos o ruído de detecção domina o
        sinal, e a velocidade vira estática.
        """
        if len(self.historico) < 2:
            return 0.0
        t0, h0 = self.historico[0]
        t1, h1 = self.historico[-1]
        dt = t1 - t0
        if dt <= 0:
            return 0.0
        # Queda faz a altura normalizada DIMINUIR; invertemos para que descer
        # seja positivo, que é mais legível em limiar.
        return (h0 - h1) / dt

    @property
    def amadurecido(self) -> bool:
        """A altura de pé só é confiável depois de alguns quadros.

        Antes disso, classificar seria adivinhar: se a pessoa entra em cena já
        caída, tudo que vimos dela é a caixa deitada, e ela viraria o padrão de
        "em pé".
        """
        return len(self.alturas_caixa) >= 8


class ExtratorCaracteristicas:
    """Transforma (caixa, pose) em features, mantendo estado por pessoa."""

    def __init__(self, janela: int = 16) -> None:
        self.janela = janela
        self._por_pessoa: dict[int, HistoricoPessoa] = {}

    def historico(self, id_rastreio: int) -> HistoricoPessoa:
        if id_rastreio not in self._por_pessoa:
            self._por_pessoa[id_rastreio] = HistoricoPessoa(self.janela)
        return self._por_pessoa[id_rastreio]

    def esquecer(self, ids_ativos: set[int]) -> None:
        """Descarta quem saiu de cena, para a memória não crescer sem limite."""
        for id_antigo in set(self._por_pessoa) - ids_ativos:
            del self._por_pessoa[id_antigo]

    def extrair(self, pessoa: Pessoa, pose: Pose | None, timestamp: float) -> Caracteristicas | None:
        """Calcula as features de uma pessoa num quadro.

        Devolve None quando a pose não é confiável o bastante: é melhor não
        classificar do que classificar sobre landmark chutado — falso positivo
        de queda custa a confiança da equipe de enfermagem, e equipe que
        desconfia do alerta desliga o alerta.
        """
        if pose is None or not pose.confiavel:
            return None

        ombros = pose.centro_ombros
        quadris = pose.centro_quadris
        assert ombros is not None and quadris is not None

        # 1. Perda de verticalidade: o tronco é o segmento quadril → ombro.
        angulo = angulo_com_a_vertical(quadris, ombros)

        # 2. A caixa vira: alta e estreita em pé, baixa e larga no chão.
        razao_aspecto = pessoa.razao_aspecto

        historico = self.historico(pessoa.id_rastreio)
        altura_de_pe = historico.altura_de_pe
        razao_altura = pessoa.altura / altura_de_pe if altura_de_pe > 0 else 1.0

        # 4. Velocidade — registra antes de ler, para o quadro atual entrar.
        historico.registrar(pessoa.altura, timestamp, razao_altura)
        velocidade = historico.velocidade()

        # 5. Extensão vertical do corpo sobre a diagonal da caixa.
        #    Distingue queda de pessoa agachada: agachado encolhe a caixa mas
        #    mantém o tronco vertical; caído, ombro e tornozelo ficam quase na
        #    mesma altura e esta razão despenca.
        abertura = self._abertura_vertical(pose, pessoa)

        return Caracteristicas(
            angulo_tronco=angulo,
            razao_aspecto=razao_aspecto,
            razao_altura=razao_altura,
            velocidade_queda=velocidade,
            abertura_vertical=abertura,
        )

    @staticmethod
    def _abertura_vertical(pose: Pose, pessoa: Pessoa) -> float:
        alto = pose.centro_ombros
        baixo = pose.centro_tornozelos
        if baixo is None:
            # Tornozelo some com frequência (móvel na frente, corte do quadro).
            # O joelho é o substituto natural, um elo acima na mesma cadeia.
            baixo = pose.media(Marco.JOELHO_ESQ, Marco.JOELHO_DIR)
        if alto is None or baixo is None:
            return 0.0

        diagonal = math.hypot(pessoa.largura, pessoa.altura)
        if diagonal <= 0:
            return 0.0
        return abs(float(baixo[1] - alto[1])) / diagonal
