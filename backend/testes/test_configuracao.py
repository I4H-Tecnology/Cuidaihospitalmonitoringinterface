"""Configuração obrigatória: o backend não sobe com segredo padrão no código."""

import importlib.util
import os
import unittest
from pathlib import Path
from unittest import mock

import app.db

CAMINHO_DO_DB = Path(app.db.__file__)


def carregar_db_com_ambiente(ambiente: dict) -> None:
    """Executa uma cópia isolada de app/db.py com o ambiente dado.

    Não mexe no módulo `app.db` já importado pelos outros testes.
    """
    spec = importlib.util.spec_from_file_location("db_isolado", CAMINHO_DO_DB)
    modulo = importlib.util.module_from_spec(spec)
    with mock.patch.dict(os.environ, ambiente, clear=True):
        spec.loader.exec_module(modulo)


class DatabaseUrlObrigatoria(unittest.TestCase):
    def test_sem_database_url_o_modulo_se_recusa_a_carregar(self):
        with self.assertRaises(RuntimeError) as contexto:
            carregar_db_com_ambiente({})
        self.assertIn("DATABASE_URL", str(contexto.exception))

    def test_database_url_vazia_tambem_e_recusada(self):
        with self.assertRaises(RuntimeError):
            carregar_db_com_ambiente({"DATABASE_URL": ""})

    def test_com_database_url_o_modulo_carrega_e_nao_conecta(self):
        carregar_db_com_ambiente({"DATABASE_URL": "postgresql://teste@localhost:5432/teste"})

    def test_o_codigo_nao_guarda_senha_de_banco(self):
        # O padrão que o SonarQube apontou: usuario:senha@host escrito no fonte.
        texto = CAMINHO_DO_DB.read_text(encoding="utf-8")
        self.assertNotIn("medsignal:medsignal@", texto)


if __name__ == "__main__":
    unittest.main()
