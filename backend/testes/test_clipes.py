"""Testes da retenção do clipe de evidência: 24 h na RFC, 30 dias só em modo de teste.

    python -m unittest discover -s backend/testes -t backend

O backend também expurga os clipes (no boot e de hora em hora), então a regra
precisa ser a mesma do serviço de visão: sem MEDSIGNAL_MODO_TESTE o teto é 24 h
e nenhuma variável o aumenta. Sem banco e sem arquivo: só a conta da retenção.
"""

from __future__ import annotations

import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from app import clipes
from app.clipes import retencao_em_horas


class RetencaoDoClipe(unittest.TestCase):
    def test_sem_modo_de_teste_o_teto_e_24h_e_nao_ha_como_aumentar(self):
        self.assertEqual(retencao_em_horas(False, "24"), 24.0)
        for pedido in ("25", "48", "480", "9999"):
            self.assertEqual(retencao_em_horas(False, pedido), 24.0, f"pedido {pedido} h vazou do teto")

    def test_pode_pedir_menos_que_o_teto(self):
        self.assertEqual(retencao_em_horas(False, "6"), 6.0)
        self.assertEqual(retencao_em_horas(True, "6"), 6.0)

    def test_modo_de_teste_aceita_20_dias_e_trava_em_30(self):
        self.assertEqual(retencao_em_horas(True, "480"), 480.0)   # 20 dias
        self.assertEqual(retencao_em_horas(True, "720"), 720.0)   # 30 dias
        self.assertEqual(retencao_em_horas(True, "9999"), 720.0)

    def test_valor_ausente_invalido_ou_nao_positivo_cai_em_24h(self):
        # "nan" e "inf" são os perigosos: passariam por min() e virariam retenção indefinida.
        for pedido in (None, "", "abc", "0", "-5", "nan", "inf", "-inf"):
            for modo in (False, True):
                self.assertEqual(retencao_em_horas(modo, pedido), 24.0, f"{pedido!r} em modo_teste={modo}")

    def test_numero_tambem_vale_alem_de_texto(self):
        self.assertEqual(retencao_em_horas(True, 480), 480.0)
        self.assertEqual(retencao_em_horas(False, 480), 24.0)


class ExpurgoUsaARetencaoEfetiva(unittest.TestCase):
    """O expurgo do backend apaga pelo teto vigente, não por um 24 fixo."""

    def _clipe(self, pasta: Path, nome: str, horas_atras: float) -> Path:
        caminho = pasta / f"{nome}.mp4"
        caminho.write_bytes(b"x")
        quando = time.time() - horas_atras * 3600
        os.utime(caminho, (quando, quando))
        return caminho

    def test_com_retencao_de_20_dias_um_clipe_de_10_dias_fica_e_um_de_21_sai(self):
        with tempfile.TemporaryDirectory() as t:
            pasta = Path(t)
            novo = self._clipe(pasta, "dez-dias", 10 * 24)
            velho = self._clipe(pasta, "vinte-e-um-dias", 21 * 24)
            with mock.patch.object(clipes, "PASTA", pasta), mock.patch.object(clipes, "RETENCAO_HORAS", 480.0):
                removidos = clipes.expurgar()
            self.assertTrue(novo.exists(), "clipe de 10 dias não podia ser apagado com retenção de 20 dias")
            self.assertFalse(velho.exists(), "clipe de 21 dias devia ter saído")
            self.assertEqual(removidos, ["vinte-e-um-dias.mp4"])

    def test_com_retencao_padrao_de_24h_um_clipe_de_dois_dias_sai(self):
        with tempfile.TemporaryDirectory() as t:
            pasta = Path(t)
            dois_dias = self._clipe(pasta, "dois-dias", 48)
            with mock.patch.object(clipes, "PASTA", pasta), mock.patch.object(clipes, "RETENCAO_HORAS", 24.0):
                clipes.expurgar()
            self.assertFalse(dois_dias.exists())


class PastaDeEnsaio(unittest.TestCase):
    """Os clipes de ensaio controlado ficam FORA do expurgo sem mexer na retenção dos demais."""

    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        base = Path(self._t.name)
        self.normal = base / "normal"
        self.ensaio = base / "ensaio"
        self.normal.mkdir()
        self.ensaio.mkdir()
        self.addCleanup(self._t.cleanup)

    def _arquivo(self, pasta: Path, nome: str, horas_atras: float = 0.0) -> Path:
        caminho = pasta / f"{nome}.mp4"
        caminho.write_bytes(b"x")
        quando = time.time() - horas_atras * 3600
        os.utime(caminho, (quando, quando))
        return caminho

    def test_a_pasta_so_vale_em_modo_de_teste_e_se_configurada(self):
        self.assertIsNone(clipes.pasta_de_ensaio(False, "/dados/ensaio"))
        self.assertIsNone(clipes.pasta_de_ensaio(True, None))
        self.assertIsNone(clipes.pasta_de_ensaio(True, "   "))
        self.assertEqual(clipes.pasta_de_ensaio(True, "/dados/ensaio"), Path("/dados/ensaio"))

    def test_sem_a_pasta_o_clipe_de_ensaio_nao_e_servido(self):
        self._arquivo(self.ensaio, "oc-1")
        with mock.patch.object(clipes, "PASTA", self.normal), mock.patch.object(clipes, "PASTA_ENSAIO", None):
            self.assertFalse(clipes.tem_clipe("oc-1"))
            self.assertEqual(clipes.caminho_do_clipe("oc-1"), self.normal / "oc-1.mp4")

    def test_com_a_pasta_o_clipe_de_ensaio_e_servido(self):
        de_ensaio = self._arquivo(self.ensaio, "oc-1")
        with mock.patch.object(clipes, "PASTA", self.normal), mock.patch.object(clipes, "PASTA_ENSAIO", self.ensaio):
            self.assertTrue(clipes.tem_clipe("oc-1"))
            self.assertEqual(clipes.caminho_do_clipe("oc-1"), de_ensaio)

    def test_a_pasta_normal_tem_prioridade(self):
        normal = self._arquivo(self.normal, "oc-1")
        self._arquivo(self.ensaio, "oc-1")
        with mock.patch.object(clipes, "PASTA", self.normal), mock.patch.object(clipes, "PASTA_ENSAIO", self.ensaio):
            self.assertEqual(clipes.caminho_do_clipe("oc-1"), normal)

    def test_sem_clipe_em_lugar_nenhum_devolve_o_caminho_normal(self):
        with mock.patch.object(clipes, "PASTA", self.normal), mock.patch.object(clipes, "PASTA_ENSAIO", self.ensaio):
            self.assertEqual(clipes.caminho_do_clipe("oc-9"), self.normal / "oc-9.mp4")
            self.assertFalse(clipes.tem_clipe("oc-9"))

    def test_nome_com_tentativa_de_sair_da_pasta_continua_barrado(self):
        with mock.patch.object(clipes, "PASTA", self.normal), mock.patch.object(clipes, "PASTA_ENSAIO", self.ensaio):
            caminho = clipes.caminho_do_clipe("../../etc/passwd")
            self.assertEqual(caminho.parent, self.normal)

    def test_o_expurgo_nunca_toca_a_pasta_de_ensaio(self):
        velho_ensaio = self._arquivo(self.ensaio, "oc-ensaio", horas_atras=24 * 400)
        velho_normal = self._arquivo(self.normal, "oc-normal", horas_atras=48)
        recente_normal = self._arquivo(self.normal, "oc-recente", horas_atras=1)
        with mock.patch.object(clipes, "PASTA", self.normal), \
                mock.patch.object(clipes, "PASTA_ENSAIO", self.ensaio), \
                mock.patch.object(clipes, "RETENCAO_HORAS", 24.0):
            removidos = clipes.expurgar()
        self.assertEqual(removidos, ["oc-normal.mp4"])
        self.assertTrue(velho_ensaio.exists(), "o clipe de ensaio foi expurgado")
        self.assertFalse(velho_normal.exists(), "a retencao dos clipes comuns deixou de valer")
        self.assertTrue(recente_normal.exists())

    def test_a_retencao_dos_demais_nao_muda_com_a_pasta_de_ensaio(self):
        # Com 20 dias configurados (modo de teste), a pasta normal segue a regra dela.
        self.assertEqual(clipes.retencao_em_horas(True, "480"), 480.0)
        self.assertEqual(clipes.retencao_em_horas(False, "480"), 24.0)
        self.assertEqual(clipes.retencao_em_horas(True, "24"), 24.0)
        self.assertEqual(clipes.retencao_em_horas(True, None), 24.0)

    def test_estado_informa_a_pasta_de_ensaio(self):
        self._arquivo(self.ensaio, "a")
        self._arquivo(self.ensaio, "b")
        with mock.patch.object(clipes, "PASTA", self.normal), mock.patch.object(clipes, "PASTA_ENSAIO", self.ensaio):
            e = clipes.estado()
        self.assertEqual(e["ensaio"], {"ativo": True, "pasta": str(self.ensaio), "clipes": 2})
        self.assertEqual(e["clipes_em_disco"], 0)  # os de ensaio não entram na conta dos comuns
        with mock.patch.object(clipes, "PASTA", self.normal), mock.patch.object(clipes, "PASTA_ENSAIO", None):
            self.assertEqual(clipes.estado()["ensaio"], {"ativo": False, "pasta": None, "clipes": 0})


if __name__ == "__main__":
    unittest.main()
