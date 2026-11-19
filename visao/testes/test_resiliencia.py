"""Testes da parte que sobrevive à queda da fonte, sem câmera nem modelo.

    visao/.venv/Scripts/python.exe -m unittest discover -s visao/testes -t .

O pipeline é substituído por um falso que entrega alguns quadros e então
"perde a fonte". O que se verifica é o serviço em volta dele: o backoff, a
máquina de estados capturando → reconectando → capturando, o ping que só sai
com captura viva, o buffer do clipe e o expurgo.
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))

from visao.app import clipes, servidor  # noqa: E402
from visao.app.config import Config, Fonte  # noqa: E402
from visao.app.fonte_video import EsperaDeReconexao, Quadro  # noqa: E402
from visao.app.pipeline import ResultadoQuadro  # noqa: E402
from visao.app.publicador import JANELA_DE_CAPTURA_VIVA, Publicador, PublicadorInativo  # noqa: E402


def config_de_teste(**extras) -> Config:
    return Config(modo_teste=True, fonte=Fonte.ARQUIVO, arquivo="x.mp4", camera_id="", api_login="", api_senha="", clipes_ativos=False, **extras)


def quadro(indice: int) -> ResultadoQuadro:
    imagem = np.zeros((48, 64, 3), dtype=np.uint8)
    return ResultadoQuadro(quadro=Quadro(imagem=imagem, indice=indice, timestamp=time.time()), ms_total=12.0)


class PipelineFalso:
    """Entrega `por_rodada` quadros e então falha, `falhas` vezes; depois entrega para sempre."""

    def __init__(self, por_rodada: int = 3, falhas: int = 1, erro: str = "câmera caiu") -> None:
        self.por_rodada = por_rodada
        self.falhas = falhas
        self.erro = erro
        self.rodadas = 0
        self.reinicios = 0
        self.fechado = False
        self.sinal_de_falha = threading.Event()

    def executar(self, cfg=None):
        self.rodadas += 1
        for i in range(self.por_rodada):
            yield quadro(i + 1)
            time.sleep(0.01)
        if self.rodadas <= self.falhas:
            self.sinal_de_falha.set()
            raise RuntimeError(self.erro)
        while True:
            yield quadro(0)
            time.sleep(0.01)

    def reiniciar(self, limiares=None):
        self.reinicios += 1

    def fechar(self):
        self.fechado = True


class PipelineQueAcaba(PipelineFalso):
    """Entrega 2 quadros e encerra sem exceção na primeira rodada; depois, para sempre."""

    def executar(self, cfg=None):
        self.rodadas += 1
        for i in range(2):
            yield quadro(i + 1)
        if self.rodadas == 1:
            self.sinal_de_falha.set()
            return
        while True:
            yield quadro(0)
            time.sleep(0.01)


def esperar(condicao, timeout: float = 5.0) -> bool:
    fim = time.monotonic() + timeout
    while time.monotonic() < fim:
        if condicao():
            return True
        time.sleep(0.02)
    return False


class Backoff(unittest.TestCase):
    def test_dobra_ate_o_teto(self):
        espera = EsperaDeReconexao(inicial=1.0, maxima=60.0)
        self.assertEqual([espera.proxima() for _ in range(8)], [1, 2, 4, 8, 16, 32, 60, 60])
        self.assertEqual(espera.tentativa, 8)

    def test_zerar_recomeca_do_inicio(self):
        espera = EsperaDeReconexao(inicial=1.0, maxima=60.0)
        espera.proxima(); espera.proxima()
        espera.zerar()
        self.assertEqual(espera.proxima(), 1.0)
        self.assertEqual(espera.tentativa, 1)


class ReconexaoDaFonte(unittest.TestCase):
    def servico(self, pipeline: PipelineFalso) -> servidor.ServicoVisao:
        return servidor.ServicoVisao(
            config_de_teste(),
            fabrica_pipeline=lambda: pipeline,
            espera=EsperaDeReconexao(inicial=0.05, maxima=0.1),
            publicador=PublicadorInativo(),
            gravador=clipes.GravadorInativo(),
        )

    def test_fonte_cai_vira_reconectando_e_volta_sozinha(self):
        pipeline = PipelineFalso(por_rodada=3, falhas=1)
        servico = self.servico(pipeline)
        servico.iniciar()
        try:
            self.assertTrue(esperar(lambda: pipeline.sinal_de_falha.is_set()))
            self.assertTrue(esperar(lambda: servico.estado_fonte == servidor.RECONECTANDO))
            captura = servico.captura()
            self.assertEqual(captura["estado"], "reconectando")
            self.assertEqual(captura["tentativa"], 1)
            self.assertEqual(captura["erro"], "câmera caiu")
            self.assertIsNotNone(captura["proxima_tentativa_em_s"])
            self.assertEqual(servico.status(), "degradado")

            # Sem reiniciar o processo, a captura volta.
            self.assertTrue(esperar(lambda: servico.estado_fonte == servidor.CAPTURANDO))
            self.assertEqual(servico.reconexoes, 1)
            self.assertEqual(servico.quedas_da_fonte, 1)
            self.assertEqual(pipeline.reinicios, 1)
            self.assertIsNone(servico.erro)
            self.assertEqual(servico.status(), "ok")
            self.assertTrue(servico.rodando)
        finally:
            servico.parar()
        self.assertEqual(servico.estado_fonte, servidor.PARADO)
        self.assertTrue(pipeline.fechado)

    def test_fim_de_stream_ao_vivo_conta_como_queda_e_reconecta(self):
        # Webcam ou RTSP que "acaba" é fonte que caiu: entra no backoff.
        pipeline = PipelineQueAcaba()
        cfg = Config(modo_teste=True, fonte=Fonte.WEBCAM, camera_id="", api_login="", api_senha="", clipes_ativos=False)
        servico = servidor.ServicoVisao(
            cfg, fabrica_pipeline=lambda: pipeline, espera=EsperaDeReconexao(inicial=0.05, maxima=0.1),
            publicador=PublicadorInativo(), gravador=clipes.GravadorInativo(),
        )
        servico.iniciar()
        try:
            self.assertTrue(esperar(lambda: servico.quedas_da_fonte >= 1))
            self.assertTrue(esperar(lambda: servico.estado_fonte == servidor.CAPTURANDO))
            self.assertEqual(servico.reconexoes, 1)
        finally:
            servico.parar()

    def test_fim_de_arquivo_recomeca_em_laco_sem_contar_queda(self):
        # Arquivo de demonstração que termina recomeça do início: não é queda,
        # não há backoff, e o pipeline é reiniciado para zerar o rastreio.
        pipeline = PipelineQueAcaba()
        servico = self.servico(pipeline)   # config_de_teste() é Fonte.ARQUIVO
        servico.iniciar()
        try:
            self.assertTrue(esperar(lambda: pipeline.rodadas >= 2))
            self.assertTrue(esperar(lambda: servico.estado_fonte == servidor.CAPTURANDO))
            self.assertEqual(servico.quedas_da_fonte, 0)
            self.assertEqual(servico.reconexoes, 0)
            self.assertEqual(pipeline.reinicios, 1)
        finally:
            servico.parar()

    def test_falhas_seguidas_sem_quadro_contam_tentativas_e_uma_queda_so(self):
        # Três aberturas falham em sequência, sem nenhum quadro entre elas: é
        # UMA queda com três tentativas, e o backoff cresce a cada uma.
        pipeline = PipelineFalso(por_rodada=0, falhas=3)
        servico = self.servico(pipeline)
        servico.iniciar()
        try:
            self.assertTrue(esperar(lambda: servico.tentativa >= 3, timeout=5))
            self.assertTrue(esperar(lambda: servico.estado_fonte == servidor.CAPTURANDO))
            self.assertEqual(servico.quedas_da_fonte, 1)
            self.assertEqual(servico.reconexoes, 1)
            self.assertEqual(pipeline.reinicios, 3)
            self.assertEqual(servico.tentativa, 0)
        finally:
            servico.parar()

    def test_quadro_entre_falhas_zera_o_backoff(self):
        # Cada rodada entrega um quadro antes de cair: cada queda é nova, e a
        # espera recomeça do início em vez de acumular.
        pipeline = PipelineFalso(por_rodada=1, falhas=3)
        servico = self.servico(pipeline)
        servico.iniciar()
        try:
            self.assertTrue(esperar(lambda: servico.reconexoes >= 3, timeout=5))
            self.assertEqual(servico.quedas_da_fonte, 3)
            self.assertLessEqual(servico.tentativa, 1)
        finally:
            servico.parar()

    def test_parar_durante_o_backoff_nao_trava(self):
        pipeline = PipelineFalso(por_rodada=1, falhas=100)
        servico = servidor.ServicoVisao(
            config_de_teste(),
            fabrica_pipeline=lambda: pipeline,
            espera=EsperaDeReconexao(inicial=30.0, maxima=60.0),
            publicador=PublicadorInativo(),
            gravador=clipes.GravadorInativo(),
        )
        servico.iniciar()
        self.assertTrue(esperar(lambda: servico.estado_fonte == servidor.RECONECTANDO))
        inicio = time.monotonic()
        servico.parar()
        self.assertLess(time.monotonic() - inicio, 3.0)
        self.assertFalse(servico.rodando)

    def test_health_expoe_metricas_que_mudam(self):
        pipeline = PipelineFalso(por_rodada=1000, falhas=0)
        servico = self.servico(pipeline)
        servico.iniciar()
        try:
            self.assertTrue(esperar(lambda: servico.quadros_processados >= 10))
            m = servico.metricas()
            self.assertGreaterEqual(m["quadros_processados"], 10)
            self.assertIsNotNone(m["fps_real"])
            self.assertEqual(m["latencia_p95_ms"], 12.0)
            self.assertGreater(m["uptime_s"], 0)
            self.assertEqual(servico.captura()["estado"], "capturando")
            self.assertLess(servico.captura()["ultimo_quadro_ha_s"], 2.0)
        finally:
            servico.parar()


class PingSoComCapturaViva(unittest.TestCase):
    def publicador(self) -> Publicador:
        cfg = Config(modo_teste=True, fonte=Fonte.ARQUIVO, arquivo="x.mp4", camera_id="cam-1", api_login="svc", api_senha="x", clipes_ativos=False)
        return Publicador(cfg, pasta_fila=Path(tempfile.mkdtemp()))

    def test_sem_quadro_nao_pinga(self):
        p = self.publicador()
        self.assertFalse(p.captura_viva())

    def test_quadro_recente_autoriza_e_quadro_velho_nao(self):
        p = self.publicador()
        agora = 1000.0
        p.marcar_quadro(agora - 1)
        self.assertTrue(p.captura_viva(agora))
        p.marcar_quadro(agora - JANELA_DE_CAPTURA_VIVA - 1)
        self.assertFalse(p.captura_viva(agora))

    def test_laco_suprime_o_ping_com_a_fonte_morta(self):
        p = self.publicador()
        pings = []
        p._pingar = lambda: pings.append(time.time())  # type: ignore[method-assign]
        p._rodando = True
        t = threading.Thread(target=p._laco, daemon=True)
        t.start()
        try:
            time.sleep(1.3)
            self.assertEqual(pings, [])
            self.assertGreaterEqual(p.pings_suprimidos, 1)
            p.marcar_quadro(time.time())
            self.assertTrue(esperar(lambda: len(pings) == 1, timeout=3))
        finally:
            p._rodando = False
            t.join(timeout=3)
        self.assertTrue(p.estado()["pingando"])

    def test_callback_recebe_o_id_da_api(self):
        p = self.publicador()
        recebidos = []
        p.ao_registrar = lambda chave, oid: recebidos.append((chave, oid))

        class Resposta:
            status_code = 201

            @staticmethod
            def json():
                return {"id": "abc-123", "alertaId": "al-1"}

        p._cliente.post = lambda *a, **k: Resposta()  # type: ignore[method-assign]
        self.assertTrue(p._enviar({"chaveEvento": "cam:1:99"}))
        self.assertEqual(recebidos, [("cam:1:99", "abc-123")])


class ClipeDeEvidencia(unittest.TestCase):
    def gravador(self, **extras) -> clipes.GravadorDeClipes:
        pasta = Path(tempfile.mkdtemp()) / "clipes"
        return clipes.GravadorDeClipes(pasta=pasta, fps=8.0, segundos_antes=0.5, segundos_depois=0.5, retencao_horas=24.0, **extras)

    def imagem(self, valor: int) -> np.ndarray:
        return np.full((48, 64, 3), valor, dtype=np.uint8)

    def test_grava_antes_e_depois_e_renomeia_com_o_id(self):
        g = self.gravador()
        for i in range(10):
            g.registrar_quadro(self.imagem(i))          # buffer guarda os últimos 4
        self.assertTrue(g.iniciar("cam:1:1700000000"))
        self.assertFalse(g.iniciar("cam:1:1700000000"))  # já em andamento
        for i in range(4):
            g.registrar_quadro(self.imagem(100 + i))    # 4 quadros do "depois"
        provisorio = g.pasta / "cam-1-1700000000.mp4"
        self.assertTrue(esperar(lambda: provisorio.exists() and g.gravados == 1, timeout=20), g.ultimo_erro)
        self.assertGreater(provisorio.stat().st_size, 0)

        g.nomear("cam:1:1700000000", "0f0e0d0c-1111-2222-3333-444444444444")
        definitivo = g.pasta / "0f0e0d0c-1111-2222-3333-444444444444.mp4"
        self.assertTrue(definitivo.exists())
        self.assertFalse(provisorio.exists())
        estado = g.estado()
        self.assertEqual(estado["clipes_em_disco"], 1)
        self.assertEqual(estado["ultimo_clipe"], definitivo.name)

    def test_id_que_chega_antes_da_gravacao_da_o_nome_definitivo(self):
        g = self.gravador()
        g.registrar_quadro(self.imagem(1))
        g.iniciar("cam:1:5")
        g.nomear("cam:1:5", "id-final")
        for i in range(4):
            g.registrar_quadro(self.imagem(i))
        self.assertTrue(esperar(lambda: (g.pasta / "id-final.mp4").exists(), timeout=20), g.ultimo_erro)

    def test_expurgo_apaga_so_o_que_passou_da_retencao(self):
        g = self.gravador()
        g.pasta.mkdir(parents=True)
        velho = g.pasta / "velho.mp4"
        novo = g.pasta / "novo.mp4"
        velho.write_bytes(b"x")
        novo.write_bytes(b"x")
        ha_25h = time.time() - 25 * 3600
        os.utime(velho, (ha_25h, ha_25h))
        removidos = g.expurgar()
        self.assertEqual(removidos, ["velho.mp4"])
        self.assertTrue(novo.exists())
        estado = g.estado()
        self.assertIsNotNone(estado["ultimo_expurgo"])
        self.assertEqual(estado["ultimo_expurgo_removeu"], 1)
        self.assertEqual(estado["clipes_em_disco"], 1)

    def test_nao_fecha_o_stdin_do_ffmpeg_antes_do_communicate(self):
        # No Linux, Popen.communicate() começa por stdin.flush(), que estoura
        # "flush of closed file" se o stdin já foi fechado à mão. No Windows o
        # caminho é outro e nunca estourou, então este teste imita o Linux com
        # um processo falso, para a falha aparecer em qualquer sistema.
        class ProcessoComoNoLinux:
            def __init__(self, comando, **_):
                self.destino = Path(comando[-1])
                self.stdin = io.BytesIO()
                self.returncode = 0

            def communicate(self, input=None, timeout=None):
                self.stdin.flush()            # ValueError se já foi fechado
                self.stdin.close()
                self.destino.write_bytes(b"mp4")
                return b"", b""

        destino = Path(tempfile.mkdtemp()) / "clipe.mp4"
        quadros = [self.imagem(i) for i in range(3)]
        with mock.patch.object(clipes, "_ffmpeg", return_value="ffmpeg-falso"), \
                mock.patch.object(clipes.subprocess, "Popen", ProcessoComoNoLinux):
            codec = clipes.escrever_mp4(destino, quadros, fps=8.0)
        self.assertEqual(codec, "h264")
        self.assertTrue(destino.exists())

    def test_nome_seguro_nao_deixa_barra_nem_dois_pontos(self):
        self.assertEqual(clipes.nome_seguro("cam:1:../../x"), "cam-1-..-..-x")
        self.assertEqual(clipes.nome_seguro("///"), "clipe")

    def test_retencao_acima_de_24h_e_recusada_na_config(self):
        cfg = config_de_teste(clipes_retencao_horas=48.0)
        with self.assertRaises(ValueError):
            cfg.validar()


if __name__ == "__main__":
    unittest.main()
