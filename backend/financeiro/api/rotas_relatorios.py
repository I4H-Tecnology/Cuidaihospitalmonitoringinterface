"""Visão geral, DRE, fluxo de caixa realizado e projetado, inadimplência."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import Depends

from ..servicos import relatorios
from ..servicos.contexto import Contexto
from .base import competencia_da_query, novo_router


def criar(pode):
    r = novo_router()

    @r.get("/painel", summary="Visão geral: saldos, vencimentos, resultado do mês, indicadores e alertas")
    def painel(ctx: Contexto = Depends(pode("relatorios:ver"))):
        return relatorios.painel(ctx)

    @r.get("/indicadores")
    def indicadores(ctx: Contexto = Depends(pode("relatorios:ver"))):
        return relatorios.indicadores(ctx)

    @r.get("/relatorios/dre", summary="DRE gerencial mês a mês (competência ou caixa)")
    def dre(
        de: str | None = None,
        ate: str | None = None,
        regime: str = "competencia",
        centroCustoId: str | None = None,
        ctx: Contexto = Depends(pode("relatorios:ver")),
    ):
        fim = competencia_da_query(ate, ctx.hoje.replace(day=1))
        inicio = competencia_da_query(de, fim.replace(month=1))
        return relatorios.dre(ctx, inicio, fim, regime, centroCustoId)

    @r.get("/relatorios/fluxo-caixa", summary="Entradas e saídas realizadas")
    def fluxo(
        de: date | None = None,
        ate: date | None = None,
        agrupamento: str = "mes",
        ctx: Contexto = Depends(pode("relatorios:ver")),
    ):
        fim = ate or ctx.hoje
        return relatorios.fluxo_caixa(ctx, de or (fim - timedelta(days=180)).replace(day=1), fim, agrupamento)

    @r.get("/relatorios/fluxo-projetado", summary="Projeção do saldo com o lançado e o previsível")
    def projetado(
        dias: int = 90,
        agrupamento: str = "semana",
        incluirVencidos: bool = True,
        ctx: Contexto = Depends(pode("relatorios:ver")),
    ):
        return relatorios.fluxo_projetado(ctx, dias, agrupamento, incluirVencidos)

    @r.get("/relatorios/inadimplencia", summary="Vencido por faixa de atraso e por pessoa")
    def inadimplencia(tipo: str = "receber", ctx: Contexto = Depends(pode("relatorios:ver"))):
        return relatorios.inadimplencia(ctx, tipo)

    return r
