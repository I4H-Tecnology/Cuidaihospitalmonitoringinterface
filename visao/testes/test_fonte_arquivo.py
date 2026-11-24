"""Testes do ritmo de um ARQUIVO de vídeo usado como câmera (demonstração em laço).

    visao/.venv/Scripts/python.exe -m unittest discover -s visao/testes -t .

O defeito que estes testes impedem: no modo "tempo real", o arquivo era lido na
velocidade da decodificação e os quadros que sobravam até o próximo instante eram
jogados fora. Em máquina rápida o vídeo passava dezenas de vezes mais rápido que
o real; em máquina lenta, em câmera lenta. Aqui o relógio e a captura são falsos:
nada dorme de verdade e nada é decodificado, então o teste é exato e instantâneo.

O que se verifica é a relação entre o instante em que o quadro é entregue e a
posição dele no arquivo (índice / fps do arquivo): as duas têm de andar juntas.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))

from visao.app import fonte_video  # noqa: E402
from visao.app.config import Config, Fonte  # noqa: E402
from visao.app.fonte_video import FonteVideo  # noqa: E402

INICIO = 1000.0  # o relógio falso não começa em zero, para pegar conta feita sem descontar o início


class RelogioFalso:
    """Substitui o módulo `time` dentro de fonte_video: dormir só avança o relógio."""

    def __init__(self) -> None:
        self.t = INICIO

    def monotonic(self) -> float:
        return self.t

    def time(self) -> float:
        return 1_700_000_000.0 + self.t

    def sleep(self, segundos: float) -> None:
        if segundos > 0:
            self.t += segundos


class CapturaFalsa:
    """Um arquivo de `total` quadros a `fps` quadros por segundo, que conta o que foi feito."""

    def __init__(self, fps: float, total: int) -> None:
        self.fps = fps
        self.total = total
        self.proximo = 0  # índice do próximo quadro que grab()/read() consome
        self.grabs = 0
        self.reads = 0
        self.ultimo_lido = -1

    def get(self, propriedade: int) -> float:
        return self.fps if propriedade == cv2.CAP_PROP_FPS else 0.0

    def grab(self) -> bool:
        if self.proximo >= self.total:
            return False
        self.proximo += 1
        self.grabs += 1
        return True

    def read(self):
        if self.proximo >= self.total:
            return False, None
        self.ultimo_lido = self.proximo
        self.proximo += 1
        self.reads += 1
        return True, np.zeros((240, 320, 3), dtype=np.uint8)


def configuracao(fps_alvo: float) -> Config:
    return Config(
        modo_teste=True, fonte=Fonte.ARQUIVO, arquivo="demo.mp4", arquivo_tempo_real=True,
        fps_alvo=fps_alvo, camera_id="", api_login="", api_senha="", clipes_ativos=False,
    )


def correr(*, fps_alvo: float, custo_s: float, duracao_s: float, fps_arquivo: float = 30.0,
           total: int = 100_000):
    """Consome a fonte por `duracao_s` de relógio, gastando `custo_s` de processamento por quadro.

    Devolve (entregas, captura): cada entrega é (segundos desde o início, índice do quadro no arquivo).
    """
    relogio = RelogioFalso()
    captura = CapturaFalsa(fps_arquivo, total)
    fonte = FonteVideo(configuracao(fps_alvo))
    fonte._cap = captura  # já "aberta": quadros() não tenta abrir o arquivo
    entregas: list[tuple[float, int]] = []
    with mock.patch.object(fonte_video, "time", relogio):
        for _ in fonte.quadros():
            entregas.append((relogio.t - INICIO, captura.ultimo_lido))
            relogio.t += custo_s  # o YOLO e a pose gastando tempo
            if relogio.t - INICIO >= duracao_s:
                break
    return entregas, captura


class ArquivoNoRitmoDoRelogio(unittest.TestCase):
    def assertVideoNoRitmo(self, entregas, fps_arquivo, tolerancia_s):
        for relogio, indice in entregas:
            video = indice / fps_arquivo
            self.assertAlmostEqual(
                video, relogio, delta=tolerancia_s,
                msg=f"o quadro {indice} é do segundo {video:.2f} do vídeo, mas saiu aos {relogio:.2f} s",
            )

    def test_maquina_rapida_nao_faz_o_video_correr(self):
        # 50 ms de processamento para um intervalo de 200 ms: sobra tempo, e é aí que o
        # defeito antigo passava o vídeo dezenas de vezes mais rápido.
        entregas, _ = correr(fps_alvo=5, custo_s=0.05, duracao_s=20)
        self.assertVideoNoRitmo(entregas, 30.0, tolerancia_s=1 / 30)
        self.assertGreater(entregas[-1][1] / 30.0, 19.0)  # andou ~20 s de vídeo em 20 s, não 600

    def test_maquina_lenta_perde_quadros_mas_nao_fica_em_camera_lenta(self):
        # 700 ms por quadro (o notebook do ensaio): o defeito antigo andava 0,05x.
        entregas, _ = correr(fps_alvo=5, custo_s=0.7, duracao_s=20)
        self.assertVideoNoRitmo(entregas, 30.0, tolerancia_s=1 / 30)
        self.assertGreater(entregas[-1][1] / 30.0, 19.0)

    def test_entrega_no_maximo_a_taxa_alvo(self):
        entregas, _ = correr(fps_alvo=5, custo_s=0.0, duracao_s=20)
        self.assertAlmostEqual(len(entregas) / 20.0, 5.0, delta=0.3)

    def test_so_decodifica_o_quadro_que_entrega(self):
        entregas, captura = correr(fps_alvo=5, custo_s=0.05, duracao_s=20)
        self.assertEqual(captura.reads, len(entregas))
        # os outros ~25 de cada 30 quadros só foram avançados
        self.assertGreater(captura.grabs, 4 * captura.reads)

    def test_nao_entrega_quadro_antes_da_hora(self):
        # alvo (8 fps) acima do fps do arquivo (5 fps): não pode inventar tempo.
        entregas, _ = correr(fps_alvo=8, custo_s=0.0, duracao_s=10, fps_arquivo=5.0)
        for relogio, indice in entregas:
            self.assertLessEqual(indice / 5.0, relogio + 1e-9, f"quadro {indice} entregue adiantado")
        self.assertAlmostEqual(len(entregas) / 10.0, 5.0, delta=0.3)

    def test_fim_do_arquivo_encerra_o_gerador(self):
        # 3 s de vídeo: depois disso a fonte "encerrou o stream" (o serviço então recomeça em laço).
        entregas, captura = correr(fps_alvo=5, custo_s=0.0, duracao_s=60, total=90)
        self.assertLessEqual(len(entregas), 16)
        self.assertEqual(captura.proximo, captura.total)

    def test_sem_fps_declarado_nao_divide_por_zero(self):
        entregas, _ = correr(fps_alvo=5, custo_s=0.0, duracao_s=4, fps_arquivo=0.0)
        self.assertGreaterEqual(len(entregas), 15)


if __name__ == "__main__":
    unittest.main()
