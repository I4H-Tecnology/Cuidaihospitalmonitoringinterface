"""Migrações do schema `financeiro`.

Os arquivos NNNN_nome.sql desta pasta são aplicados em ordem, uma vez cada,
e registrados em `financeiro.migracao`. Regras:

  - cada arquivo roda numa transação: se falhar no meio, nada dele fica;
  - arquivo já aplicado não pode mudar (o checksum confere). Migração aplicada
    é história; correção vira arquivo novo;
  - duas instâncias subindo juntas não migram em dobro: um advisory lock do
    Postgres faz a segunda esperar a primeira.

Uso, de qualquer projeto que tenha um pool psycopg:

    from financeiro.migracoes import migrar
    migrar(pool)

Ou pela linha de comando:

    python -m financeiro.migracoes postgresql://usuario:senha@host/banco
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

from psycopg.rows import dict_row

PASTA = Path(__file__).parent
# Número arbitrário, fixo: identifica o lock deste módulo no Postgres.
_TRAVA = 6_184_730_021

_NOME = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")


def arquivos() -> list[tuple[int, str, str]]:
    """(versão, nome do arquivo, SQL) em ordem de versão."""
    lista = []
    for caminho in sorted(PASTA.glob("*.sql")):
        casou = _NOME.match(caminho.name)
        if not casou:
            raise RuntimeError(f"Arquivo de migração com nome fora do padrão NNNN_nome.sql: {caminho.name}")
        lista.append((int(casou.group(1)), caminho.name, caminho.read_text(encoding="utf-8")))
    versoes = [v for v, _, _ in lista]
    if len(versoes) != len(set(versoes)):
        raise RuntimeError("Duas migrações com o mesmo número.")
    return lista


def _soma(sql: str) -> str:
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


def migrar(pool) -> list[str]:
    """Aplica as migrações pendentes. Devolve os nomes das que foram aplicadas agora."""
    with pool.connection() as conn:
        autocommit_antes = conn.autocommit
        # Fora de transação implícita: cada arquivo abre a sua, explícita, e o
        # lock de sessão vale até ser solto, não até o fim de uma transação.
        conn.commit()
        conn.autocommit = True
        try:
            conn.execute("SELECT pg_advisory_lock(%s)", (_TRAVA,))
            try:
                return _aplicar(conn)
            finally:
                conn.execute("SELECT pg_advisory_unlock(%s)", (_TRAVA,))
        finally:
            conn.autocommit = autocommit_antes


def _aplicar(conn) -> list[str]:
    conn.execute("CREATE SCHEMA IF NOT EXISTS financeiro")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS financeiro.migracao (
          versao      integer PRIMARY KEY,
          nome        text NOT NULL,
          checksum    text NOT NULL,
          aplicada_em timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT versao, nome, checksum FROM financeiro.migracao")
        aplicadas = {linha["versao"]: linha for linha in cur.fetchall()}

    novas: list[str] = []
    for versao, nome, sql in arquivos():
        soma = _soma(sql)
        if versao in aplicadas:
            if aplicadas[versao]["checksum"] != soma:
                raise RuntimeError(
                    f"A migração {nome} mudou depois de aplicada. Não edite migração aplicada: "
                    "crie um arquivo novo com a correção."
                )
            continue
        with conn.transaction():
            conn.execute(sql)
            conn.execute(
                "INSERT INTO financeiro.migracao (versao, nome, checksum) VALUES (%s, %s, %s)",
                (versao, nome, soma),
            )
        novas.append(nome)
    return novas


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("uso: python -m financeiro.migracoes postgresql://usuario:senha@host/banco")
        sys.exit(2)
    from psycopg_pool import ConnectionPool

    with ConnectionPool(sys.argv[1], min_size=1, max_size=1) as p:
        aplicadas_agora = migrar(p)
    print("Aplicadas:", ", ".join(aplicadas_agora) if aplicadas_agora else "nenhuma (já estava atualizado)")
