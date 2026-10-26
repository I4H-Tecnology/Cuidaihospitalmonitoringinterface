"""Colaboradores, rubricas, folha de pagamento, holerites e custo de pessoal."""

from __future__ import annotations

from fastapi import Depends

from ..servicos import pessoal
from ..servicos.contexto import Contexto
from .base import competencia_da_query, novo_router
from .esquemas import (
    AjusteContabilidade,
    ColaboradorEntrada,
    FixoEntrada,
    FolhaEntrada,
    LancamentoFolha,
    Motivo,
    RubricaEntrada,
)


def criar(pode):
    r = novo_router()

    # ------------------------------------------------------------ colaboradores
    @r.get("/colaboradores")
    def colaboradores(incluirDesligados: bool = False, ctx: Contexto = Depends(pode("pessoal:ver"))):
        return pessoal.listar_colaboradores(ctx, incluirDesligados)

    @r.get("/colaboradores/{colaborador_id}")
    def colaborador(colaborador_id: str, ctx: Contexto = Depends(pode("pessoal:ver"))):
        return pessoal.obter_colaborador(ctx, colaborador_id)

    @r.post("/colaboradores", status_code=201)
    def criar_colaborador(entrada: ColaboradorEntrada, ctx: Contexto = Depends(pode("pessoal:criar"))):
        return pessoal.criar_colaborador(ctx, entrada.campos())

    @r.patch("/colaboradores/{colaborador_id}")
    def editar_colaborador(colaborador_id: str, entrada: ColaboradorEntrada, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.editar_colaborador(ctx, colaborador_id, entrada.campos())

    @r.post("/colaboradores/{colaborador_id}/fixos", status_code=201, summary="Item que entra todo mês no holerite")
    def criar_fixo(colaborador_id: str, entrada: FixoEntrada, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.salvar_fixo(ctx, colaborador_id, entrada.campos())

    @r.patch("/colaboradores/{colaborador_id}/fixos/{fixo_id}")
    def editar_fixo(colaborador_id: str, fixo_id: str, entrada: FixoEntrada, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.salvar_fixo(ctx, colaborador_id, entrada.campos(), fixo_id)

    @r.delete("/colaboradores/{colaborador_id}/fixos/{fixo_id}")
    def remover_fixo(colaborador_id: str, fixo_id: str, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.remover_fixo(ctx, colaborador_id, fixo_id)

    # ------------------------------------------------------------ rubricas
    @r.get("/rubricas")
    def rubricas(ctx: Contexto = Depends(pode("pessoal:ver"))):
        return pessoal.listar_rubricas(ctx)

    @r.post("/rubricas", status_code=201)
    def criar_rubrica(entrada: RubricaEntrada, ctx: Contexto = Depends(pode("pessoal:criar"))):
        return pessoal.salvar_rubrica(ctx, entrada.campos())

    @r.patch("/rubricas/{rubrica_id}")
    def editar_rubrica(rubrica_id: str, entrada: RubricaEntrada, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.salvar_rubrica(ctx, entrada.campos(), rubrica_id)

    # ------------------------------------------------------------ folha
    @r.get("/folhas")
    def folhas(ano: int | None = None, ctx: Contexto = Depends(pode("pessoal:ver"))):
        return pessoal.listar_folhas(ctx, ano)

    @r.post("/folhas", status_code=201, summary="Cria a folha do mês e já calcula")
    def criar_folha(entrada: FolhaEntrada, ctx: Contexto = Depends(pode("pessoal:criar"))):
        return pessoal.criar_folha(ctx, entrada.campos())

    @r.get("/folhas/{folha_id}")
    def folha(folha_id: str, ctx: Contexto = Depends(pode("pessoal:ver"))):
        return pessoal.obter_folha(ctx, folha_id)

    @r.delete("/folhas/{folha_id}")
    def excluir_folha(folha_id: str, ctx: Contexto = Depends(pode("pessoal:excluir"))):
        pessoal.excluir_folha(ctx, folha_id)
        return {"ok": True}

    @r.post("/folhas/{folha_id}/recalculo")
    def recalcular(folha_id: str, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.recalcular(ctx, folha_id)

    @r.post("/folhas/{folha_id}/lancamentos", status_code=201, summary="Hora extra, falta, comissão... e recalcula")
    def lancar(folha_id: str, entrada: LancamentoFolha, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.lancar(ctx, folha_id, entrada.campos())

    @r.delete("/folhas/{folha_id}/lancamentos/{item_id}")
    def remover_lancamento(folha_id: str, item_id: str, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.remover_lancamento(ctx, folha_id, item_id)

    @r.post("/folhas/{folha_id}/fechamento", summary="Fecha a folha e gera as contas a pagar")
    def fechar(folha_id: str, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.fechar(ctx, folha_id)

    @r.post("/folhas/{folha_id}/reabertura", summary="Reabre e cancela as contas geradas (se nenhuma foi paga)")
    def reabrir(folha_id: str, entrada: Motivo, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.reabrir(ctx, folha_id, entrada.motivo)

    @r.get("/holerites/{holerite_id}")
    def holerite(holerite_id: str, ctx: Contexto = Depends(pode("pessoal:ver"))):
        return pessoal.obter_holerite(ctx, holerite_id)

    @r.put("/holerites/{holerite_id}/ajuste", summary="Valores da contabilidade (prevalecem sobre o cálculo)")
    def ajustar(holerite_id: str, entrada: AjusteContabilidade, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.ajustar(ctx, holerite_id, entrada.campos())

    @r.delete("/holerites/{holerite_id}/ajuste")
    def remover_ajuste(holerite_id: str, ctx: Contexto = Depends(pode("pessoal:editar"))):
        return pessoal.remover_ajuste(ctx, holerite_id)

    @r.get("/pessoal/custos", summary="Custo de pessoal da competência, com provisão de férias e 13º")
    def custos(competencia: str | None = None, ctx: Contexto = Depends(pode("pessoal:ver"))):
        return pessoal.custos(ctx, competencia_da_query(competencia))

    return r
