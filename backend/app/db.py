"""Acesso ao Postgres.

Um pool simples: este backend é um andaime para destravar o login local, não
tem ambição de produção. O backend definitivo usa SQLAlchemy, conforme a RFC.
"""

import os
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

# Sem valor padrão, de propósito: uma URL com senha escrita aqui é senha
# publicada no repositório (e o SonarQube a aponta como BLOCKER, S6698). O
# docker-compose.yml monta a URL a partir de POSTGRES_* do .env.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL não definida. Com Docker, ela vem do docker-compose.yml "
        "(POSTGRES_USER, POSTGRES_PASSWORD e POSTGRES_DB, no .env). Fora dele, "
        "exporte-a, por exemplo: postgresql://usuario:senha@localhost:5432/medsignal"
    )

# open=False evita que o import trave se o banco ainda estiver subindo;
# o pool conecta na primeira consulta.
pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=5, open=False, kwargs={"row_factory": dict_row})


def abrir_pool() -> None:
    pool.open()
    pool.wait(timeout=30)


def fechar_pool() -> None:
    pool.close()


@contextmanager
def cursor():
    with pool.connection() as conn:
        with conn.cursor() as cur:
            yield cur


def buscar_um(sql: str, params: tuple = ()) -> dict | None:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def buscar_todos(sql: str, params: tuple = ()) -> list[dict]:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def executar(sql: str, params: tuple = ()) -> int:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount
