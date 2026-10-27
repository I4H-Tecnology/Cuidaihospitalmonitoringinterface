"""Caixa e bancos: extrato por conta, transferências e ajuste de saldo."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from ..dominio.dinheiro import ZERO, dinheiro
from ..erros import NaoEncontrado, RegraDeNegocio
from .contexto import Contexto
from .util import exigir_da_empresa, exigir_periodo_aberto, texto


def extrato(ctx: Contexto, conta_id: str, de: date | None = None, ate: date | None = None) -> dict:
    """Movimentos da conta no período, com saldo acumulado linha a linha."""
    ate = ate or ctx.hoje
    de = de or ate.replace(day=1)
    if de > ate:
        raise RegraDeNegocio("A data inicial é depois da final.")
    with ctx.ler() as db:
        conta = exigir_da_empresa(db, "conta", ctx.org_id, conta_id, "Conta")
        anterior = db.valor(
            "SELECT COALESCE(sum(valor), 0) FROM financeiro.movimento WHERE conta_id = %s AND data < %s",
            (conta_id, de),
        )
        linhas = db.todos(
            """
            SELECT m.id, m.data, m.valor, m.tipo, m.descricao, m.baixa_id, m.transferencia_id,
                   m.criado_por, m.criado_em,
                   t.id AS titulo_id, pe.nome AS pessoa_nome,
                   outra.nome AS conta_contrapartida,
                   EXISTS (SELECT 1 FROM financeiro.extrato_linha e WHERE e.movimento_id = m.id) AS conciliado
              FROM financeiro.movimento m
              LEFT JOIN financeiro.baixa b ON b.id = m.baixa_id
              LEFT JOIN financeiro.parcela p ON p.id = b.parcela_id
              LEFT JOIN financeiro.titulo t ON t.id = p.titulo_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
              LEFT JOIN financeiro.movimento par ON par.transferencia_id = m.transferencia_id AND par.id <> m.id
              LEFT JOIN financeiro.conta outra ON outra.id = par.conta_id
             WHERE m.conta_id = %s AND m.data BETWEEN %s AND %s
             ORDER BY m.data, m.criado_em, m.id
            """,
            (conta_id, de, ate),
        )
    saldo = Decimal(anterior)
    entradas = saidas = ZERO
    for linha in linhas:
        saldo += linha["valor"]
        linha["saldo"] = saldo
        # Transferência não é entrada nem saída da empresa, e saldo inicial é
        # o ponto de partida, não dinheiro que entrou.
        if linha["tipo"] not in ("transferencia", "saldo_inicial"):
            if linha["valor"] > 0:
                entradas += linha["valor"]
            else:
                saidas += -linha["valor"]
    return {
        "conta": {"id": conta["id"], "nome": conta["nome"], "tipo": conta["tipo"]},
        "de": de,
        "ate": ate,
        "saldo_anterior": Decimal(anterior),
        "entradas": entradas,
        "saidas": saidas,
        "saldo_final": saldo,
        "movimentos": linhas,
    }


def transferir(ctx: Contexto, dados: dict) -> dict:
    """Dinheiro de uma conta para outra da própria empresa: duas pernas, mesmo id.

    Não é receita nem despesa — por isso fica fora da DRE e do total de
    entradas e saídas. Aplicar e resgatar investimento é isto também.
    """
    origem_id, destino_id = dados.get("conta_origem_id"), dados.get("conta_destino_id")
    if not origem_id or not destino_id or origem_id == destino_id:
        raise RegraDeNegocio("Escolha duas contas diferentes.")
    valor = dinheiro(dados.get("valor"))
    if valor <= 0:
        raise RegraDeNegocio("O valor deve ser maior que zero.")
    data = dados.get("data") or ctx.hoje
    with ctx.escrever() as db:
        origem = exigir_da_empresa(db, "conta", ctx.org_id, origem_id, "Conta de origem")
        destino = exigir_da_empresa(db, "conta", ctx.org_id, destino_id, "Conta de destino")
        for conta in (origem, destino):
            if not conta["ativa"]:
                raise RegraDeNegocio(f"A conta {conta['nome']} está inativa.")
        exigir_periodo_aberto(db, ctx.org_id, data, "A transferência")
        transferencia_id = _lancar_transferencia(
            db, ctx.org_id, ctx.autor, origem, destino, data, valor, texto(dados.get("descricao"))
        )
    return {"transferencia_id": transferencia_id}


def _lancar_transferencia(db, org_id, autor, origem, destino, data, valor, descricao=None, estorno_de=None) -> str:
    transferencia_id = str(uuid.uuid4())
    descricao = descricao or f"Transferência {origem['nome']} → {destino['nome']}"
    for conta, sinal in ((origem, -1), (destino, 1)):
        db.executar(
            """
            INSERT INTO financeiro.movimento
              (organizacao_id, conta_id, data, valor, tipo, descricao, transferencia_id, estorno_de, criado_por)
            VALUES (%s, %s, %s, %s, 'transferencia', %s, %s, %s, %s)
            """,
            (org_id, conta["id"], data, sinal * valor, descricao[:300], transferencia_id, estorno_de, autor),
        )
    return transferencia_id


def estornar_transferencia(ctx: Contexto, transferencia_id: str, motivo: str) -> dict:
    """Lança a transferência inversa na data de hoje; a original fica no histórico."""
    motivo = texto(motivo)
    if not motivo:
        raise RegraDeNegocio("Informe o motivo do estorno.")
    with ctx.escrever(motivo) as db:
        pernas = db.todos(
            """
            SELECT m.conta_id, m.valor, m.descricao, c.nome, c.ativa
              FROM financeiro.movimento m JOIN financeiro.conta c ON c.id = m.conta_id
             WHERE m.transferencia_id = %s AND m.organizacao_id = %s
            """,
            (transferencia_id, ctx.org_id),
        )
        if len(pernas) != 2:
            raise NaoEncontrado("Transferência não encontrada.")
        ja_estornada = db.valor(
            "SELECT EXISTS (SELECT 1 FROM financeiro.movimento WHERE organizacao_id = %s AND estorno_de = %s)",
            (ctx.org_id, transferencia_id),
        )
        if ja_estornada:
            raise RegraDeNegocio("Esta transferência já foi estornada.")
        saida = next(p for p in pernas if p["valor"] < 0)
        entrada = next(p for p in pernas if p["valor"] > 0)
        exigir_periodo_aberto(db, ctx.org_id, ctx.hoje, "O estorno")
        novo = _lancar_transferencia(
            db, ctx.org_id, ctx.autor,
            {"id": entrada["conta_id"], "nome": entrada["nome"]},
            {"id": saida["conta_id"], "nome": saida["nome"]},
            ctx.hoje, entrada["valor"], f"Estorno: {saida['descricao']}", estorno_de=transferencia_id,
        )
    return {"transferencia_id": novo}


def ajustar_saldo(ctx: Contexto, conta_id: str, dados: dict) -> dict:
    """Acerta o saldo da conta para o valor informado, com a diferença como ajuste.

    Ajuste não tem categoria e não entra na DRE. Para tarifa ou juros que o
    banco cobrou, o certo é lançar uma despesa — o ajuste é para o que não
    tem explicação melhor, e fica marcado como tal no fluxo de caixa.
    """
    motivo = texto(dados.get("motivo"))
    if not motivo:
        raise RegraDeNegocio("Informe o motivo do ajuste.")
    data = dados.get("data") or ctx.hoje
    informado = dinheiro(dados.get("saldo_informado"))
    with ctx.escrever(motivo) as db:
        exigir_da_empresa(db, "conta", ctx.org_id, conta_id, "Conta")
        exigir_periodo_aberto(db, ctx.org_id, data, "O ajuste")
        atual = db.valor(
            "SELECT COALESCE(sum(valor), 0) FROM financeiro.movimento WHERE conta_id = %s AND data <= %s",
            (conta_id, data),
        )
        diferenca = informado - Decimal(atual)
        if diferenca == 0:
            raise RegraDeNegocio("O saldo já é esse: nada a ajustar.")
        db.executar(
            """
            INSERT INTO financeiro.movimento (organizacao_id, conta_id, data, valor, tipo, descricao, criado_por)
            VALUES (%s, %s, %s, %s, 'ajuste', %s, %s)
            """,
            (ctx.org_id, conta_id, data, diferenca, f"Ajuste de saldo: {motivo}"[:300], ctx.autor),
        )
    return {"diferenca": diferenca, "saldo": informado}


def saldo_total(ctx: Contexto, data: date | None = None) -> Decimal:
    with ctx.ler() as db:
        return Decimal(
            db.valor(
                "SELECT COALESCE(sum(valor), 0) FROM financeiro.movimento WHERE organizacao_id = %s AND data <= %s",
                (ctx.org_id, data or ctx.hoje),
            )
        )


def ultimos_dias(ctx: Contexto, dias: int = 30) -> tuple[date, date]:
    return ctx.hoje - timedelta(days=dias), ctx.hoje
