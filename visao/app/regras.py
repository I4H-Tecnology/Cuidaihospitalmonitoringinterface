"""Camada de regras: das features para a decisão de queda.

A RFC declara *"camada de regras / classificador leve"*, e não um modelo
aprendido. A escolha tem uma vantagem que importa nesta disciplina: cada limiar
abaixo é justificável em voz alta. Um LSTM classificaria melhor nas bordas, mas
na prova de autoria você teria de defender pesos que ninguém consegue
inspecionar.

Os três estados são os mesmos que a literatura da área usa:

    NORMAL  --queda detectada-->  CAINDO  --postura mantida-->  CAIDO
       ^                             |                            |
       +------ recuperou ------------+------- levantou -----------+
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum

from .caracteristicas import Caracteristicas

logger = logging.getLogger(__name__)


class Estado(str, Enum):
    NORMAL = "normal"
    CAINDO = "caindo"
    CAIDO = "caido"


@dataclass(frozen=True)
class Limiares:
    """Os limiares da regra, todos ajustáveis e todos justificados.

    Os valores padrão são ponto de partida, calibrados na geometria do
    problema — não em dados. Depois de gravar os vídeos encenados, rode o
    arnês de avaliação e ajuste: é exatamente para isso que ele existe.
    """

    # --- postura horizontal ---------------------------------------------
    # 55° é bem além do que uma pessoa em pé alcança, inclusive inclinada para
    # amarrar o sapato (raramente passa de 45° com o tronco). Abaixo disso a
    # taxa de falso positivo sobe rápido.
    angulo_caido: float = 55.0
    # Caixa mais larga que alta. Em pé fica perto de 0,4; sentado, ~0,7.
    razao_aspecto_caido: float = 0.9
    # Metade da altura de pé. Agachar chega a ~0,6; deitar, a ~0,3.
    razao_altura_caido: float = 0.55

    # --- transição -------------------------------------------------------
    # Corpos por segundo. Sentar controlado fica em torno de 0,3/s; uma queda
    # real passa de 0,8/s com folga.
    velocidade_queda: float = 0.8

    # --- persistência ----------------------------------------------------
    # Quadros consecutivos com postura de caído antes de assumir CAIDO. A 8 fps
    # são ~0,75s: filtra o agachamento rápido sem atrasar o alerta.
    quadros_para_confirmar: int = 6
    # Quadros consecutivos em postura normal para voltar a NORMAL. Maior que o
    # anterior de propósito: sair do alerta deve ser mais difícil que entrar.
    quadros_para_recuperar: int = 10
    # Segundos em CAIDO antes de virar ocorrência. É a "permanência anormal no
    # chão" da RN10. Abaixo disso, quem deitou de propósito viraria alerta.
    segundos_para_ocorrencia: float = 3.0


@dataclass
class Avaliacao:
    """O que a regra concluiu sobre uma pessoa neste quadro."""

    estado: Estado
    confianca: float
    mudou_de_estado: bool
    deve_gerar_ocorrencia: bool
    motivo: str
    # Quando a pessoa chegou ao chão. É o instante do evento — e não o momento
    # em que o limiar de permanência foi cruzado, segundos depois. Vira a
    # data_hora da ocorrência e entra na chave que evita alerta duplicado.
    inicio_caido: float | None = None
    # True quando a queda foi vista acontecer (NORMAL → CAINDO → CAIDO). False
    # quando a pessoa já apareceu no chão: a postura sustenta o alerta, mas o
    # movimento não foi observado — e isso muda o tipo do evento registrado.
    viu_transicao: bool = False


@dataclass
class _Contexto:
    """Estado interno por pessoa rastreada."""

    estado: Estado = Estado.NORMAL
    quadros_caido: int = 0
    quadros_normal: int = 0
    inicio_caido: float | None = None
    viu_transicao: bool = False
    ocorrencia_gerada: bool = False
    historico_confianca: list[float] = field(default_factory=list)


class ClassificadorQuedas:
    """Aplica as regras e mantém a máquina de estados por pessoa."""

    def __init__(self, limiares: Limiares | None = None) -> None:
        self.limiares = limiares or Limiares()
        self._contextos: dict[int, _Contexto] = {}

    def esquecer(self, ids_ativos: set[int]) -> None:
        for antigo in set(self._contextos) - ids_ativos:
            del self._contextos[antigo]

    # -- pontuação --------------------------------------------------------

    def _pontuar_postura(self, c: Caracteristicas) -> float:
        """Quanto a postura atual parece a de alguém no chão, de 0 a 1.

        Três indícios independentes, com peso igual. Independentes é o ponto:
        oclusão parcial derruba um deles, e a soma dos outros dois ainda
        sustenta a decisão. Um único indício viraria detector de sombra.
        """
        L = self.limiares
        indicios = [
            min(c.angulo_tronco / L.angulo_caido, 1.0),
            min(c.razao_aspecto / L.razao_aspecto_caido, 1.0),
            min(max(0.0, (1.0 - c.razao_altura) / (1.0 - L.razao_altura_caido)), 1.0),
        ]
        return sum(indicios) / len(indicios)

    def _postura_de_caido(self, c: Caracteristicas) -> bool:
        L = self.limiares
        return (
            c.angulo_tronco >= L.angulo_caido
            and c.razao_aspecto >= L.razao_aspecto_caido
            and c.razao_altura <= L.razao_altura_caido
        )

    # -- máquina de estados -----------------------------------------------

    def avaliar(self, id_rastreio: int, c: Caracteristicas, timestamp: float) -> Avaliacao:
        ctx = self._contextos.setdefault(id_rastreio, _Contexto())
        L = self.limiares
        anterior = ctx.estado

        caido_agora = self._postura_de_caido(c)
        confianca = self._pontuar_postura(c)

        if caido_agora:
            ctx.quadros_caido += 1
            ctx.quadros_normal = 0
        else:
            ctx.quadros_normal += 1
            ctx.quadros_caido = 0

        motivo = ""

        if ctx.estado is Estado.NORMAL:
            if c.velocidade_queda >= L.velocidade_queda:
                ctx.estado = Estado.CAINDO
                motivo = f"descida de {c.velocidade_queda:.2f} corpos/s"
            elif ctx.quadros_caido >= L.quadros_para_confirmar:
                # Entrou em cena já no chão, ou a queda aconteceu fora do
                # enquadramento. A postura sustenta o alerta mesmo sem termos
                # visto o movimento.
                ctx.estado = Estado.CAIDO
                ctx.inicio_caido = timestamp
                ctx.viu_transicao = False
                motivo = "postura horizontal sustentada, sem transição observada"

        elif ctx.estado is Estado.CAINDO:
            if ctx.quadros_caido >= L.quadros_para_confirmar:
                ctx.estado = Estado.CAIDO
                ctx.inicio_caido = timestamp
                ctx.viu_transicao = True
                motivo = f"postura de queda mantida por {ctx.quadros_caido} quadros"
            elif ctx.quadros_normal >= L.quadros_para_recuperar:
                ctx.estado = Estado.NORMAL
                motivo = "postura normal retomada; provável agachamento"

        elif ctx.estado is Estado.CAIDO:
            if ctx.quadros_normal >= L.quadros_para_recuperar:
                ctx.estado = Estado.NORMAL
                ctx.inicio_caido = None
                ctx.viu_transicao = False
                ctx.ocorrencia_gerada = False
                motivo = "pessoa levantou"

        # A ocorrência não nasce ao entrar em CAIDO, e sim ao PERMANECER: é a
        # diferença entre "deitou" e "caiu e não levantou" (RN10).
        deve_gerar = False
        if (
            ctx.estado is Estado.CAIDO
            and ctx.inicio_caido is not None
            and not ctx.ocorrencia_gerada
            and (timestamp - ctx.inicio_caido) >= L.segundos_para_ocorrencia
        ):
            deve_gerar = True
            ctx.ocorrencia_gerada = True
            motivo = (
                f"permanência de {timestamp - ctx.inicio_caido:.1f}s no chão"
                f" (limiar {L.segundos_para_ocorrencia:.0f}s)"
            )

        mudou = ctx.estado is not anterior
        if mudou:
            logger.info("Pessoa %s: %s -> %s (%s)", id_rastreio, anterior.value, ctx.estado.value, motivo)

        ctx.historico_confianca.append(confianca)
        if len(ctx.historico_confianca) > 30:
            ctx.historico_confianca.pop(0)

        return Avaliacao(
            estado=ctx.estado,
            confianca=round(confianca, 3),
            mudou_de_estado=mudou,
            deve_gerar_ocorrencia=deve_gerar,
            motivo=motivo,
            inicio_caido=ctx.inicio_caido,
            viu_transicao=ctx.viu_transicao,
        )

    def estado_de(self, id_rastreio: int) -> Estado:
        ctx = self._contextos.get(id_rastreio)
        return ctx.estado if ctx else Estado.NORMAL
