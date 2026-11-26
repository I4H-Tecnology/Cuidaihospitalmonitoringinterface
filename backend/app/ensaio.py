"""Registros de ENSAIO CONTROLADO: o que são e como o resto do sistema os reconhece.

Um registro de ensaio é uma ocorrência que o detector gerou num TESTE do autor, com a webcam do
notebook, e que foi trazida à demonstração em produção (sem câmera lá) junto com o clipe de 10 s.
Não é detecção ao vivo em produção, não mede desempenho e não houve atendimento real.

Como eles são reconhecidos: pela chave de evento em `stub_evento_publicado`, que começa com
PREFIXO_CHAVE. Não há coluna nova e portanto não há migração de banco. A mesma regra serve a três
usos, que por isso moram aqui:

  - o importador (registros_de_ensaio.py) grava a chave `ensaio:<id da ocorrência>`;
  - as ESTATÍSTICAS excluem esses registros (sem_ensaio), porque uma ciência pré-marcada ou um
    encerramento sem atendimento entrariam nas médias de "tempo até ciência" e "tempo de
    encerramento" como se alguém tivesse respondido;
  - a API informa `ensaio: true` (eh_ensaio), e a tela os marca como ensaio controlado.

Eles continuam aparecendo na lista de Alertas Clínicos, que é o objetivo.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from psycopg import sql

PREFIXO_CHAVE = "ensaio:"

# Só identificadores simples entram nos fragmentos SQL abaixo: o alias vem sempre de uma constante
# deste código, nunca do cliente, mas a checagem impede que um descuido futuro vire injeção.
_ALIAS = re.compile(r"[a-z_][a-z0-9_]*")


def chave_do_registro(ocorrencia_id: str) -> str:
    return f"{PREFIXO_CHAVE}{ocorrencia_id}"


def _alias(alias: str) -> str:
    if not _ALIAS.fullmatch(alias):
        raise ValueError(f"alias SQL inválido: {alias!r}")
    return alias


# Os fragmentos abaixo são objetos `psycopg.sql`, não texto: quem os usa os COMPÕE com
# `sql.SQL("... {}").format(...)`, em vez de interpolar texto numa f-string. O alias vira
# identificador (aspas feitas pelo driver) e o prefixo vira literal (escapado pelo driver), então
# nada aqui depende de o texto estar "limpo". O `psycopg` é importado só dentro das funções para
# que o importador e o gerador do pacote continuem validando em qualquer Python, sem o driver.

def eh_ensaio(alias: str = "o") -> "sql.Composable":
    """Expressão SQL booleana: a ocorrência `alias` é um registro de ensaio.

    starts_with() em vez de LIKE 'ensaio:%': as consultas passam parâmetros, e um `%` solto no texto
    do SQL é lido pelo psycopg como início de marcador de parâmetro.
    """
    from psycopg import sql  # import tardio (ver acima)

    return sql.SQL(
        "EXISTS (SELECT 1 FROM stub_evento_publicado ev "
        "WHERE ev.ocorrencia_id = {alias}.id AND starts_with(ev.chave, {prefixo}))"
    ).format(alias=sql.Identifier(_alias(alias)), prefixo=sql.Literal(PREFIXO_CHAVE))


def sem_ensaio(alias: str = "o") -> "sql.Composable":
    """Filtro SQL: exclui os registros de ensaio de contagens e métricas."""
    from psycopg import sql  # import tardio (ver acima)

    return sql.SQL("NOT {}").format(eh_ensaio(alias))
