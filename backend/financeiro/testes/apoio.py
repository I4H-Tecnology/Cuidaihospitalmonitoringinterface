"""Apoio aos testes de integração: banco descartável e contexto de operador.

Os testes de integração só rodam com FINANCEIRO_TESTE_DSN definida, e só se o
NOME do banco tiver "test" — eles apagam e recriam o schema `financeiro`, e
isso não pode acontecer num banco com dado de verdade por um DSN copiado
errado.
"""

from __future__ import annotations

import os
import unittest
from datetime import date

DSN = os.environ.get("FINANCEIRO_TESTE_DSN", "")
HOJE = date(2026, 9, 15)


def exigir_banco_de_teste() -> None:
    if not DSN:
        raise unittest.SkipTest("FINANCEIRO_TESTE_DSN não definida: testes de integração pulados.")
    nome = DSN.rsplit("/", 1)[-1].split("?", 1)[0]
    if "test" not in nome.lower():
        raise RuntimeError(f"Recusado: o banco '{nome}' não parece descartável (o nome precisa conter 'test').")


class BancoDeTeste:
    pool = None
    banco = None

    @classmethod
    def preparar(cls):
        exigir_banco_de_teste()
        if cls.pool is not None:
            return
        from psycopg_pool import ConnectionPool

        from financeiro.banco import Banco
        from financeiro.migracoes import migrar
        from financeiro.servicos import organizacao

        cls.pool = ConnectionPool(DSN, min_size=1, max_size=4, open=True)
        with cls.pool.connection() as conn:
            conn.execute("DROP SCHEMA IF EXISTS financeiro CASCADE")
        aplicadas = migrar(cls.pool)
        if not aplicadas:
            raise RuntimeError("As migrações deveriam ter rodado num schema recém-apagado.")
        if migrar(cls.pool):
            raise RuntimeError("Migrar duas vezes não pode aplicar nada na segunda.")
        organizacao.esquecer_cache()
        cls.banco = Banco(cls.pool)

    @classmethod
    def contexto(cls, empresa: str, permissoes=None, hoje: date = HOJE, usuario: str = "Teste"):
        from financeiro.acesso import Operador, todas_as_permissoes
        from financeiro.servicos import organizacao
        from financeiro.servicos.contexto import Contexto

        operador = Operador(
            usuario_ref=f"u-{usuario}", usuario_nome=usuario,
            organizacao_ref=empresa, organizacao_nome=f"Empresa {empresa}",
            permissoes=todas_as_permissoes() if permissoes is None else frozenset(permissoes),
        )
        return Contexto(cls.banco, operador, organizacao.resolver(cls.banco, operador), hoje)
