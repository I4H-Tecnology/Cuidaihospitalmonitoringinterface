"""Importação de extrato (OFX/CSV) e conciliação com o caixa."""

from __future__ import annotations

from fastapi import Depends

from ..erros import RegraDeNegocio
from ..servicos import conciliacao
from ..servicos.contexto import Contexto
from .base import novo_router
from .esquemas import ConciliarEntrada, ImportacaoExtrato, LancamentoDoExtrato, Motivo


def criar(pode):
    r = novo_router()

    @r.post("/contas/{conta_id}/extratos", status_code=201, summary="Importa OFX ou CSV (em base64)")
    def importar(conta_id: str, entrada: ImportacaoExtrato, ctx: Contexto = Depends(pode("operacao:criar"))):
        return conciliacao.importar(ctx, conta_id, entrada.campos())

    @r.get("/contas/{conta_id}/conciliacao", summary="Linhas pendentes com o par sugerido")
    def pendencias(conta_id: str, ctx: Contexto = Depends(pode("operacao:ver"))):
        return conciliacao.pendencias(ctx, conta_id)

    @r.get("/contas/{conta_id}/conciliacao/historico")
    def historico(conta_id: str, limite: int = 100, ctx: Contexto = Depends(pode("operacao:ver"))):
        return conciliacao.historico(ctx, conta_id, limite)

    @r.post("/contas/{conta_id}/conciliacao/sugestoes-fortes", summary="Aceita os pares fortes com movimento já lançado")
    def fortes(conta_id: str, ctx: Contexto = Depends(pode("operacao:editar"))):
        return conciliacao.conciliar_sugestoes_fortes(ctx, conta_id)

    @r.post("/extrato-linhas/{linha_id}/conciliacao")
    def conciliar(linha_id: str, entrada: ConciliarEntrada, ctx: Contexto = Depends(pode("operacao:editar"))):
        if entrada.movimento_id:
            return conciliacao.conciliar(ctx, linha_id, entrada.movimento_id)
        if entrada.parcela_id:
            # Baixar é criar pagamento: exige também permissão de criar.
            if not ctx.operador.pode("operacao", "criar"):
                raise RegraDeNegocio("Conciliar com conta em aberto registra o pagamento: seu perfil não permite.")
            return conciliacao.conciliar_com_parcela(ctx, linha_id, entrada.parcela_id)
        raise RegraDeNegocio("Informe o movimento ou a parcela.")

    @r.post("/extrato-linhas/{linha_id}/lancamento", status_code=201, summary="Lança a partir da linha e concilia")
    def lancar(linha_id: str, entrada: LancamentoDoExtrato, ctx: Contexto = Depends(pode("operacao:criar"))):
        return conciliacao.criar_lancamento(ctx, linha_id, entrada.campos())

    @r.post("/extrato-linhas/{linha_id}/ignorar")
    def ignorar(linha_id: str, entrada: Motivo, ctx: Contexto = Depends(pode("operacao:editar"))):
        return conciliacao.ignorar(ctx, linha_id, entrada.motivo)

    @r.post("/extrato-linhas/{linha_id}/desfazer")
    def desfazer(linha_id: str, ctx: Contexto = Depends(pode("operacao:editar"))):
        return conciliacao.desfazer(ctx, linha_id)

    return r
