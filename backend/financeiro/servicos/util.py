"""Consultas pequenas que vários serviços repetem."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from ..banco import Consulta
from ..dominio.calendario import Calendario
from ..erros import NaoEncontrado, RegraDeNegocio


def categoria_do_sistema(db: Consulta, org_id: str, chave: str) -> str:
    """Id da categoria que o módulo usa para `chave` (ex.: 'fin.juros_pagos')."""
    linha = db.um(
        "SELECT id FROM financeiro.categoria WHERE organizacao_id = %s AND sistema = %s",
        (org_id, chave),
    )
    if not linha:
        # Só acontece se alguém apagou direto no banco: o provisionamento cria todas.
        raise RegraDeNegocio(f"Categoria do sistema '{chave}' não existe nesta empresa.")
    return str(linha["id"])


def pessoa_do_sistema(db: Consulta, org_id: str, chave: str) -> str:
    linha = db.um(
        "SELECT id FROM financeiro.pessoa WHERE organizacao_id = %s AND sistema = %s",
        (org_id, chave),
    )
    if not linha:
        raise RegraDeNegocio(f"Cadastro do sistema '{chave}' não existe nesta empresa.")
    return str(linha["id"])


def exigir_da_empresa(db: Consulta, tabela: str, org_id: str, registro_id: str | None, rotulo: str) -> dict:
    """A linha, se for desta empresa. De outra empresa responde igual a inexistente."""
    if not registro_id:
        raise NaoEncontrado(f"{rotulo} não encontrado(a).")
    linha = db.um(
        f"SELECT * FROM financeiro.{tabela} WHERE id = %s AND organizacao_id = %s",  # nosec B608 - tabela vem do código, nunca da requisição
        (registro_id, org_id),
    )
    if not linha:
        raise NaoEncontrado(f"{rotulo} não encontrado(a).")
    return linha


def calendario_da_empresa(db: Consulta, org_id: str) -> Calendario:
    datas = db.todos("SELECT data FROM financeiro.feriado WHERE organizacao_id = %s", (org_id,))
    return Calendario(feriados_extras={linha["data"] for linha in datas})


def fechado_ate(db: Consulta, org_id: str) -> date | None:
    return db.valor("SELECT fechado_ate FROM financeiro.organizacao WHERE id = %s", (org_id,))


def exigir_periodo_aberto(db: Consulta, org_id: str, data: date, o_que: str = "Lançamento") -> None:
    """Mesma regra dos gatilhos, conferida antes para a mensagem sair mais clara."""
    limite = fechado_ate(db, org_id)
    if limite and data <= limite:
        raise RegraDeNegocio(
            f"{o_que} em {data:%d/%m/%Y} cai no período fechado (até {limite:%d/%m/%Y})."
        )


def texto(valor: str | None) -> str | None:
    """Tira espaço das pontas; vazio vira None."""
    if valor is None:
        return None
    valor = valor.strip()
    return valor or None


def positivo(valor: Decimal, rotulo: str = "O valor") -> Decimal:
    if valor is None or valor <= 0:
        raise RegraDeNegocio(f"{rotulo} deve ser maior que zero.")
    return valor
