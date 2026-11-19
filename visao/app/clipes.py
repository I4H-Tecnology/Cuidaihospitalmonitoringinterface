"""Clipe de evidência por ocorrência, com expurgo em 24 horas.

RNF05 e RN08 dizem que vídeo e imagem ficam retidos por no máximo 24 horas;
RN09 diz que depois disso o vídeo é excluído e a ocorrência fica. Este módulo
é o que faz essas três frases existirem:

  - um **buffer circular** guarda os últimos segundos de vídeo, o tempo todo;
  - quando a ocorrência dispara, o buffer vira o "antes", os quadros seguintes
    viram o "depois", e o clipe é gravado em disco com o id da ocorrência;
  - uma **rotina de expurgo** apaga o que passou da retenção, no boot e de
    hora em hora.

O registro da ocorrência mora no banco e nunca é tocado por aqui (RNF18). Se
o clipe sumiu, a tela mostra a ocorrência sem vídeo — não um erro.

Os quadros gravados são os ANOTADOS (caixa, esqueleto, estado): é o que o
operador viu no momento, e é o que explica por que o sistema alertou.
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

EXTENSAO = ".mp4"
# A expurgação roda de hora em hora: a retenção é de 24 h, e uma hora de folga
# é irrelevante para a LGPD e evita varrer o disco a cada quadro.
INTERVALO_DE_EXPURGO = 3600.0


def nome_seguro(texto: str) -> str:
    """Só letras, dígitos, ponto, hífen e sublinhado — o resto vira hífen."""
    return re.sub(r"[^A-Za-z0-9._-]+", "-", texto).strip("-") or "clipe"


# ---------------------------------------------------------------------------
# Escrita do arquivo
# ---------------------------------------------------------------------------


def _ffmpeg() -> str | None:
    """Binário do ffmpeg: o que vem no pacote imageio-ffmpeg, ou o do sistema."""
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return shutil.which("ffmpeg")


def escrever_mp4(caminho: Path, quadros: list[np.ndarray], fps: float) -> str:
    """Grava os quadros (BGR) em MP4 e devolve o codec usado.

    H.264 via ffmpeg é o que o navegador toca num <video>. O OpenCV puro só
    consegue mp4v no Windows, que o Chrome não reproduz — fica como último
    recurso, para o clipe existir mesmo sem ffmpeg, ainda que só abra num
    player de desktop.
    """
    if not quadros:
        raise ValueError("nenhum quadro para gravar")
    altura, largura = quadros[0].shape[:2]
    # yuv420p exige dimensões pares.
    largura -= largura % 2
    altura -= altura % 2
    caminho.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg = _ffmpeg()
    if ffmpeg:
        comando = [
            ffmpeg, "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{largura}x{altura}", "-r", f"{fps:.3f}",
            "-i", "-",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(caminho),
        ]
        processo = subprocess.Popen(comando, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        assert processo.stdin is not None
        try:
            for quadro in quadros:
                processo.stdin.write(np.ascontiguousarray(quadro[:altura, :largura]).tobytes())
        except BrokenPipeError:
            # O ffmpeg encerrou antes do fim. O código de saída e o stderr,
            # lidos abaixo, dizem por quê, e o OpenCV entra como último recurso.
            pass
        except BaseException:
            processo.kill()
            processo.communicate()
            raise
        # Não feche o stdin aqui. No Linux, communicate() começa por
        # stdin.flush() e estoura "flush of closed file" se ele já foi fechado;
        # no Windows o caminho é outro (threads) e nunca reclamou. O próprio
        # communicate() fecha o stdin e lê o stderr até o fim.
        _, erro = processo.communicate(timeout=120)
        if processo.returncode == 0 and caminho.exists():
            return "h264"
        logger.error("ffmpeg falhou (%s): %s", processo.returncode, erro.decode(errors="replace").strip())

    import cv2

    escritor = cv2.VideoWriter(str(caminho), cv2.VideoWriter_fourcc(*"mp4v"), fps, (largura, altura))
    try:
        for quadro in quadros:
            escritor.write(np.ascontiguousarray(quadro[:altura, :largura]))
    finally:
        escritor.release()
    return "mp4v"


# ---------------------------------------------------------------------------
# Expurgo
# ---------------------------------------------------------------------------


def expurgar(pasta: Path, retencao_horas: float, agora: float | None = None) -> list[str]:
    """Apaga os clipes mais velhos que a retenção. Devolve os nomes removidos.

    Usa a data de modificação do arquivo, que é o instante em que o clipe
    terminou de ser gravado — poucos segundos depois da ocorrência.
    """
    agora = time.time() if agora is None else agora
    limite = agora - retencao_horas * 3600
    removidos: list[str] = []
    if not pasta.exists():
        return removidos
    for arquivo in pasta.glob(f"*{EXTENSAO}"):
        try:
            if arquivo.stat().st_mtime < limite:
                arquivo.unlink()
                removidos.append(arquivo.name)
        except OSError as erro:
            logger.error("Não consegui apagar %s: %s", arquivo.name, erro)
    return removidos


def inventario(pasta: Path) -> tuple[int, int]:
    """(quantidade, bytes) dos clipes em disco."""
    if not pasta.exists():
        return 0, 0
    arquivos = list(pasta.glob(f"*{EXTENSAO}"))
    return len(arquivos), sum(a.stat().st_size for a in arquivos if a.exists())


# ---------------------------------------------------------------------------
# Gravador
# ---------------------------------------------------------------------------


@dataclass
class _ClipeEmAndamento:
    chave: str
    quadros: list[np.ndarray]
    faltam: int          # quadros do "depois" ainda por chegar
    iniciado_em: float


@dataclass
class GravadorDeClipes:
    """Buffer circular + gravação por ocorrência + expurgo periódico."""

    pasta: Path
    fps: float = 8.0
    segundos_antes: float = 5.0
    segundos_depois: float = 5.0
    retencao_horas: float = 24.0

    ultimo_expurgo: float | None = None
    ultimo_expurgo_removeu: int = 0
    ultimo_clipe: str | None = None
    ultimo_erro: str | None = None
    gravados: int = 0

    _buffer: deque = field(default_factory=deque, repr=False)
    _em_andamento: dict[str, _ClipeEmAndamento] = field(default_factory=dict, repr=False)
    _nomes: dict[str, str] = field(default_factory=dict, repr=False)   # chave -> id da ocorrência
    _trava: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _rodando: bool = False
    _thread: threading.Thread | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        self._buffer = deque(maxlen=max(1, int(round(self.segundos_antes * self.fps))))
        self.pasta = Path(self.pasta)

    # -- quadros ----------------------------------------------------------

    def registrar_quadro(self, imagem: np.ndarray) -> None:
        """Chamado a cada quadro processado, esteja gravando ou não."""
        copia = imagem.copy()
        prontos: list[_ClipeEmAndamento] = []
        with self._trava:
            self._buffer.append(copia)
            for clipe in list(self._em_andamento.values()):
                clipe.quadros.append(copia)
                clipe.faltam -= 1
                if clipe.faltam <= 0:
                    prontos.append(clipe)
                    del self._em_andamento[clipe.chave]
        for clipe in prontos:
            # Codificar leva centenas de ms; fora da thread do pipeline.
            threading.Thread(target=self._gravar, args=(clipe,), name="clipe", daemon=True).start()

    def iniciar(self, chave: str) -> bool:
        """Começa um clipe para a ocorrência `chave`. False se já há um."""
        with self._trava:
            if chave in self._em_andamento:
                return False
            self._em_andamento[chave] = _ClipeEmAndamento(
                chave=chave,
                quadros=list(self._buffer),
                faltam=max(1, int(round(self.segundos_depois * self.fps))),
                iniciado_em=time.time(),
            )
        logger.info("Clipe iniciado", extra={"chave": chave, "quadros_antes": len(self._buffer)})
        return True

    def nomear(self, chave: str, ocorrencia_id: str) -> None:
        """Associa a chave do evento ao id que a API devolveu.

        Pode chegar antes ou depois de o clipe ser gravado: se o arquivo já
        existe com o nome provisório, é renomeado; senão, o nome definitivo
        é usado na hora de gravar.
        """
        with self._trava:
            self._nomes[chave] = ocorrencia_id
        provisorio = self.pasta / f"{nome_seguro(chave)}{EXTENSAO}"
        definitivo = self.pasta / f"{nome_seguro(ocorrencia_id)}{EXTENSAO}"
        if provisorio.exists() and not definitivo.exists():
            try:
                provisorio.rename(definitivo)
                self.ultimo_clipe = definitivo.name
            except OSError as erro:
                logger.error("Não consegui renomear %s: %s", provisorio.name, erro)

    def _gravar(self, clipe: _ClipeEmAndamento) -> None:
        with self._trava:
            nome = self._nomes.get(clipe.chave) or clipe.chave
        destino = self.pasta / f"{nome_seguro(nome)}{EXTENSAO}"
        try:
            codec = escrever_mp4(destino, clipe.quadros, self.fps)
            self.gravados += 1
            self.ultimo_clipe = destino.name
            self.ultimo_erro = None
            logger.info(
                "Clipe gravado",
                extra={
                    "arquivo": destino.name,
                    "quadros": len(clipe.quadros),
                    "segundos": round(len(clipe.quadros) / self.fps, 1),
                    "codec": codec,
                    "bytes": destino.stat().st_size,
                },
            )
        except Exception as erro:  # noqa: BLE001
            self.ultimo_erro = str(erro)
            logger.exception("Falha ao gravar o clipe %s", destino.name)

    # -- expurgo ----------------------------------------------------------

    def expurgar(self) -> list[str]:
        removidos = expurgar(self.pasta, self.retencao_horas)
        self.ultimo_expurgo = time.time()
        self.ultimo_expurgo_removeu = len(removidos)
        if removidos:
            logger.info("Expurgo de clipes", extra={"removidos": removidos, "retencao_horas": self.retencao_horas})
        return removidos

    def iniciar_expurgo_periodico(self) -> None:
        """Roda o expurgo agora e depois de hora em hora, numa thread própria."""
        if self._rodando:
            return
        self.pasta.mkdir(parents=True, exist_ok=True)
        self._rodando = True
        self._thread = threading.Thread(target=self._laco_de_expurgo, name="expurgo", daemon=True)
        self._thread.start()

    def parar(self) -> None:
        self._rodando = False

    def _laco_de_expurgo(self) -> None:
        proximo = time.monotonic()
        while self._rodando:
            if time.monotonic() >= proximo:
                proximo = time.monotonic() + INTERVALO_DE_EXPURGO
                try:
                    self.expurgar()
                except Exception:  # noqa: BLE001
                    logger.exception("Expurgo falhou; tenta de novo na próxima hora")
            time.sleep(1.0)

    # -- observabilidade --------------------------------------------------

    def estado(self) -> dict:
        quantidade, tamanho = inventario(self.pasta)
        with self._trava:
            gravando = len(self._em_andamento)
        return {
            "ativo": True,
            "pasta": str(self.pasta),
            "clipes_em_disco": quantidade,
            "bytes_em_disco": tamanho,
            "gravando_agora": gravando,
            "gravados_desde_o_boot": self.gravados,
            "ultimo_clipe": self.ultimo_clipe,
            "retencao_horas": self.retencao_horas,
            "ultimo_expurgo": (
                datetime.fromtimestamp(self.ultimo_expurgo, tz=timezone.utc).isoformat(timespec="seconds")
                if self.ultimo_expurgo
                else None
            ),
            "ultimo_expurgo_removeu": self.ultimo_expurgo_removeu,
            "ultimo_erro": self.ultimo_erro,
        }


class GravadorInativo:
    """No lugar do gravador quando VISAO_CLIPES=false."""

    def registrar_quadro(self, imagem) -> None:
        pass

    def iniciar(self, chave: str) -> bool:
        return False

    def nomear(self, chave: str, ocorrencia_id: str) -> None:
        pass

    def iniciar_expurgo_periodico(self) -> None:
        pass

    def parar(self) -> None:
        pass

    def estado(self) -> dict:
        return {"ativo": False, "motivo": "VISAO_CLIPES=false"}
