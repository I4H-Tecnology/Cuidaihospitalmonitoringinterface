"""Testes do modo de teste EFETIVO que o painel mostra na faixa "MODO DE TESTE".

    python -m unittest discover -s backend/testes -t backend

O painel pergunta ao backend (GET /api/modo-de-teste) em vez de ler uma variável gravada no
build. Aqui se prova que: a resposta acompanha o valor que o backend usa de verdade; a rota é
pública (a faixa aparece antes do login); e os arquivos de compose passam a MESMA variável ao
backend (e, na VPS, também ao serviço de visão), em vez de um 'true' escrito no arquivo.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path
from unittest import mock

from app import clipes
from app.main import app
from app.rotas import painel

RAIZ = Path(__file__).resolve().parents[2]


class RespostaDoBackend(unittest.TestCase):
    def test_ligado_o_backend_informa_ligado(self):
        with mock.patch.object(clipes, "MODO_TESTE", True):
            self.assertEqual(painel.modo_de_teste(), {"modoTeste": True})

    def test_desligado_o_backend_informa_desligado(self):
        with mock.patch.object(clipes, "MODO_TESTE", False):
            self.assertEqual(painel.modo_de_teste(), {"modoTeste": False})

    def test_a_resposta_e_o_mesmo_valor_que_governa_a_retencao_e_a_importacao(self):
        # Uma variável só: o que o painel mostra é o que o sistema usa.
        for valor in (True, False):
            with mock.patch.object(clipes, "MODO_TESTE", valor):
                self.assertIs(painel.modo_de_teste()["modoTeste"], clipes.MODO_TESTE)

    def test_a_rota_existe_e_e_publica(self):
        rotas = [r for r in painel.router.routes if getattr(r, "path", None) == "/api/modo-de-teste"]
        self.assertEqual(len(rotas), 1)
        self.assertEqual(rotas[0].methods, {"GET"})
        self.assertEqual(rotas[0].dependant.dependencies, [], "a faixa aparece antes do login: sem autenticação")

    def test_a_rota_esta_registrada_no_app(self):
        # Pelo OpenAPI, que independe de como a versão do FastAPI guarda os roteadores incluídos.
        self.assertIn("get", app.openapi()["paths"]["/api/modo-de-teste"])


class ComposePassaAMesmaVariavel(unittest.TestCase):
    """Se alguém voltar a escrever 'true' no arquivo, o painel e o backend poderiam divergir."""

    def linhas(self, caminho: str) -> list[str]:
        return (RAIZ / caminho).read_text(encoding="utf-8").splitlines()

    def test_producao_backend_e_visao_leem_a_variavel_com_padrao_ligado(self):
        achadas = [l.strip() for l in self.linhas("deploy/docker-compose.prod.yml") if l.strip().startswith("MEDSIGNAL_MODO_TESTE:")]
        self.assertEqual(len(achadas), 2, "backend e visão")
        for linha in achadas:
            self.assertEqual(linha, "MEDSIGNAL_MODO_TESTE: ${MEDSIGNAL_MODO_TESTE:-true}")

    def test_desenvolvimento_o_backend_recebe_a_flag(self):
        texto = "\n".join(self.linhas("docker-compose.yml"))
        backend = re.search(r"^  backend:\n(.*?)^  \S", texto, re.S | re.M)
        self.assertIsNotNone(backend)
        self.assertIn("MEDSIGNAL_MODO_TESTE: ${MEDSIGNAL_MODO_TESTE", backend.group(1))

    def test_nao_resta_variavel_de_build_para_a_faixa(self):
        for caminho in ("docker-compose.yml", "deploy/docker-compose.prod.yml", "frontend/vite.config.ts", "frontend/Dockerfile"):
            self.assertNotIn("VITE_MODO_TESTE", (RAIZ / caminho).read_text(encoding="utf-8"), caminho)


if __name__ == "__main__":
    unittest.main()
