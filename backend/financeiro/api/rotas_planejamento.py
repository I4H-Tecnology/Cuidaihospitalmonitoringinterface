"""Orçamento anual por categoria, e o comparativo com o realizado."""

from __future__ import annotations

from fastapi import Depends

from ..servicos import planejamento
from ..servicos.contexto import Contexto
from .base import novo_router
from .esquemas import CopiaOrcamento, OrcamentoEntrada


def criar(pode):
    r = novo_router()

    @r.get("/orcamento/{ano}")
    def obter(ano: int, centroCustoId: str | None = None, ctx: Contexto = Depends(pode("planejamento:ver"))):
        return planejamento.obter(ctx, ano, centroCustoId)

    @r.put("/orcamento/{ano}", summary="Grava as linhas enviadas (12 meses cada; zero apaga)")
    def salvar(ano: int, entrada: OrcamentoEntrada, ctx: Contexto = Depends(pode("planejamento:editar"))):
        return planejamento.salvar(ctx, ano, [l.campos() for l in entrada.linhas])

    @r.post("/orcamento/{ano}/copia", summary="Monta o ano a partir do orçado ou do realizado de outro, com reajuste")
    def copiar(ano: int, entrada: CopiaOrcamento, ctx: Contexto = Depends(pode("planejamento:editar"))):
        return planejamento.copiar(ctx, entrada.ano_origem, ano, entrada.base, entrada.reajuste)

    @r.get("/orcamento/{ano}/comparativo", summary="Planejado × realizado de um mês (padrão: o atual), com o acumulado do ano até ele")
    def comparativo(ano: int, centroCustoId: str | None = None, mes: int | None = None,
                    ctx: Contexto = Depends(pode("planejamento:ver", "relatorios:ver"))):
        return planejamento.comparativo(ctx, ano, centroCustoId, mes)

    return r
