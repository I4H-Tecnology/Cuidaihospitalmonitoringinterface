"""Captura de frames, com a fonte trocável por configuração.

Webcam, câmera IP e arquivo entram pela mesma interface. Quem consome o
pipeline não sabe (nem precisa saber) de onde o frame veio — é isso que
permite trocar RTSP por vídeo gravado no dia da apresentação mexendo só no
`.env`, sem tocar em código.
"""

from __future__ import annotations

import logging
import platform
import time
from dataclasses import dataclass
from typing import Iterator

import cv2
import numpy as np

from .config import Config, Fonte

logger = logging.getLogger(__name__)


@dataclass
class Quadro:
    """Um frame já amostrado e redimensionado."""

    imagem: np.ndarray
    indice: int
    timestamp: float

    @property
    def altura(self) -> int:
        return self.imagem.shape[0]

    @property
    def largura(self) -> int:
        return self.imagem.shape[1]


class FonteVideo:
    """Abre a fonte, entrega frames na taxa alvo e fecha sozinha."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._cap: cv2.VideoCapture | None = None
        self._indice = 0

    # -- abertura ---------------------------------------------------------

    def _alvo_do_opencv(self):
        if self.cfg.fonte is Fonte.WEBCAM:
            return self.cfg.webcam_indice
        if self.cfg.fonte is Fonte.RTSP:
            return self.cfg.rtsp_url
        return self.cfg.arquivo

    def _backend(self) -> int:
        """No Windows, o backend padrão (MSMF) leva vários segundos para abrir
        a webcam e às vezes falha calado. DirectShow abre na hora."""
        if self.cfg.fonte is Fonte.WEBCAM and platform.system() == "Windows":
            return cv2.CAP_DSHOW
        if self.cfg.fonte is Fonte.RTSP:
            return cv2.CAP_FFMPEG
        return cv2.CAP_ANY

    def abrir(self) -> None:
        alvo = self._alvo_do_opencv()
        logger.info("Abrindo %s", self.cfg.descrever_fonte())

        cap = cv2.VideoCapture(alvo, self._backend())
        if not cap.isOpened():
            cap.release()
            raise RuntimeError(self._mensagem_de_falha())

        if self.cfg.fonte is not Fonte.ARQUIVO:
            # Buffer curto: em stream ao vivo, frame acumulado é frame velho, e
            # frame velho vira alerta atrasado.
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        self._cap = cap
        logger.info(
            "Fonte aberta: %dx%d a %.0f fps declarados",
            int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            cap.get(cv2.CAP_PROP_FPS) or 0,
        )

    def _mensagem_de_falha(self) -> str:
        if self.cfg.fonte is Fonte.WEBCAM:
            return (
                f"Não foi possível abrir a webcam de índice {self.cfg.webcam_indice}.\n"
                "  - Outro programa pode estar usando a câmera (Teams, Meet, navegador).\n"
                "  - Verifique Privacidade e Segurança > Câmera nas Configurações do Windows.\n"
                "  - Se houver mais de uma câmera, tente outro VISAO_WEBCAM_INDICE (1, 2...).\n"
                "  - Dentro de container no Windows a webcam NÃO é visível: rode nativo."
            )
        if self.cfg.fonte is Fonte.RTSP:
            return (
                "Não foi possível abrir o stream RTSP.\n"
                "  - Confira usuário, senha, IP e caminho em VISAO_RTSP_URL.\n"
                "  - Teste antes com: ffplay <url> ou VLC.\n"
                "  - A câmera precisa estar na mesma rede que este processo."
            )
        return f"Não foi possível abrir o arquivo de vídeo: {self.cfg.arquivo}"

    # -- leitura ----------------------------------------------------------

    def _redimensionar(self, imagem: np.ndarray) -> np.ndarray:
        altura, largura = imagem.shape[:2]
        if largura <= self.cfg.largura:
            return imagem
        escala = self.cfg.largura / largura
        return cv2.resize(
            imagem, (self.cfg.largura, int(altura * escala)), interpolation=cv2.INTER_AREA
        )

    def quadros(self) -> Iterator[Quadro]:
        """Gera frames respeitando VISAO_FPS_ALVO.

        Em fonte ao vivo, descarta o excedente lendo e jogando fora — segurar o
        frame no buffer atrasaria o alerta. Em arquivo, apenas pula.
        """
        if self._cap is None:
            self.abrir()
        assert self._cap is not None

        if self.cfg.fonte is Fonte.ARQUIVO:
            if self.cfg.arquivo_tempo_real:
                yield from self._quadros_no_ritmo_do_relogio()
            else:
                yield from self._quadros_em_tempo_de_video()
            return

        intervalo = 1.0 / self.cfg.fps_alvo
        proximo = time.monotonic()

        while True:
            ok, imagem = self._cap.read()
            if not ok:
                logger.info("Fim do stream após %d quadros", self._indice)
                return

            agora = time.monotonic()
            if agora < proximo:
                # Ainda não é hora deste frame. Em fonte ao vivo o descarte é
                # de propósito: frame velho vira alerta atrasado.
                continue
            proximo = agora + intervalo

            self._indice += 1
            yield Quadro(
                imagem=self._redimensionar(imagem),
                indice=self._indice,
                timestamp=time.time(),
            )

    def _quadros_no_ritmo_do_relogio(self) -> Iterator[Quadro]:
        """Arquivo que se comporta como câmera: o vídeo anda no ritmo do relógio.

        A posição no arquivo é função do tempo que passou, não de quantos
        quadros o processador conseguiu ler. Quem demora mais que o intervalo
        perde quadros, como numa câmera, e o vídeo não fica em câmera lenta;
        quem tem folga espera, e o vídeo não corre. Os quadros pulados são só
        avançados (`grab`), sem decodificar. Só o entregue é decodificado.

        Sem isso, o arquivo era lido na velocidade da decodificação, e o vídeo
        passava dezenas de vezes mais rápido que o real em máquina rápida (e em
        câmera lenta em máquina lenta).
        """
        assert self._cap is not None
        fps_arquivo = float(self._cap.get(cv2.CAP_PROP_FPS) or 0.0)
        if fps_arquivo <= 0:
            # Sem metadado de fps não há como casar quadro com relógio. Assume
            # a taxa alvo, o palpite que não inventa tempo.
            logger.warning("Arquivo sem fps declarado; assumindo %.1f fps", self.cfg.fps_alvo)
            fps_arquivo = self.cfg.fps_alvo

        intervalo = 1.0 / self.cfg.fps_alvo
        inicio = time.monotonic()
        proximo = inicio
        consumidos = 0  # quadros do arquivo já passados (descartados ou entregues)

        while True:
            espera = proximo - time.monotonic()
            if espera > 0:
                time.sleep(espera)
            agora = time.monotonic()

            # Quadro do arquivo que corresponde a este instante.
            alvo = int((agora - inicio) * fps_arquivo)
            while consumidos < alvo:
                if not self._cap.grab():
                    logger.info("Fim do stream após %d quadros", self._indice)
                    return
                consumidos += 1

            ok, imagem = self._cap.read()
            if not ok:
                logger.info("Fim do stream após %d quadros", self._indice)
                return
            consumidos += 1

            # Nunca antes da hora do próximo quadro do arquivo (alvo > fps do arquivo).
            proximo = max(agora + intervalo, inicio + consumidos / fps_arquivo)

            self._indice += 1
            yield Quadro(
                imagem=self._redimensionar(imagem),
                indice=self._indice,
                timestamp=time.time(),
            )

    def _quadros_em_tempo_de_video(self) -> Iterator[Quadro]:
        """Lê um arquivo sem esperar o relógio, com timestamp em segundos de vídeo.

        A amostragem é por passo fixo de quadros (fps do arquivo / fps alvo),
        não por relógio de parede: assim o mesmo arquivo produz sempre a mesma
        sequência de quadros, com os mesmos timestamps — condição para o
        resultado da avaliação ser replicável.
        """
        assert self._cap is not None
        fps_arquivo = float(self._cap.get(cv2.CAP_PROP_FPS) or 0.0)
        if fps_arquivo <= 0:
            # Contêiner sem metadado de fps. Assume que já está na taxa alvo:
            # é o melhor palpite que não inventa tempo.
            logger.warning("Arquivo sem fps declarado; assumindo %.1f fps", self.cfg.fps_alvo)
            fps_arquivo = self.cfg.fps_alvo
        passo = max(1, int(round(fps_arquivo / self.cfg.fps_alvo)))
        logger.info("Lendo 1 a cada %d quadros (%.1f fps -> %.1f fps)", passo, fps_arquivo, fps_arquivo / passo)

        lidos = 0
        while True:
            ok, imagem = self._cap.read()
            if not ok:
                logger.info("Fim do arquivo após %d quadros lidos, %d entregues", lidos, self._indice)
                return
            posicao = lidos
            lidos += 1
            if posicao % passo != 0:
                continue
            self._indice += 1
            yield Quadro(
                imagem=self._redimensionar(imagem),
                indice=self._indice,
                timestamp=posicao / fps_arquivo,
            )

    # -- ciclo de vida ----------------------------------------------------

    def fechar(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
            logger.info("Fonte fechada")

    def __enter__(self) -> "FonteVideo":
        self.abrir()
        return self

    def __exit__(self, *_) -> None:
        self.fechar()


class EsperaDeReconexao:
    """Backoff exponencial para quando a fonte cai: 1 s, 2 s, 4 s... até o teto.

    Insistir a cada segundo contra uma câmera que reinicia só atrasa o reboot
    dela; esperar um minuto fixo deixa o monitoramento cego por um minuto a
    mais que o necessário. Dobrar até o teto atende os dois casos.
    """

    def __init__(self, inicial: float = 1.0, maxima: float = 60.0) -> None:
        self.inicial = inicial
        self.maxima = maxima
        self.tentativa = 0

    def proxima(self) -> float:
        """Devolve quanto esperar antes da próxima tentativa, e conta uma."""
        espera = min(self.inicial * (2 ** self.tentativa), self.maxima)
        self.tentativa += 1
        return espera

    def zerar(self) -> None:
        self.tentativa = 0


def listar_webcams(maximo: int = 5) -> list[int]:
    """Descobre quais índices de webcam respondem nesta máquina."""
    backend = cv2.CAP_DSHOW if platform.system() == "Windows" else cv2.CAP_ANY
    encontrados = []
    for i in range(maximo):
        cap = cv2.VideoCapture(i, backend)
        if cap.isOpened():
            ok, _ = cap.read()
            if ok:
                encontrados.append(i)
        cap.release()
    return encontrados
