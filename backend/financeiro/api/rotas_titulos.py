"""Contas a pagar e a receber, pagamentos, caixa e transferências."""

from __future__ import annotations

from datetime import date

from fastapi import Depends

from ..servicos import movimentos, titulos
from ..servicos.contexto import Contexto
from .base import novo_router
from .esquemas import (
    AjusteSaldoEntrada,
    BaixaEmLote,
    BaixaEntrada,
    Motivo,
    ParcelaAlteracao,
    ReparcelamentoEntrada,
    TituloEntrada,
    TransferenciaEntrada,
)


def criar(pode):
    r = novo_router()

    @r.get("/parcelas", summary="Contas a pagar ou a receber, por parcela")
    def parcelas(
        tipo: str,
        situacao: str = "aberto",
        de: date | None = None,
        ate: date | None = None,
        pessoaId: str | None = None,
        categoriaId: str | None = None,
        centroCustoId: str | None = None,
        busca: str | None = None,
        limite: int = 100,
        deslocamento: int = 0,
        ctx: Contexto = Depends(pode("operacao:ver")),
    ):
        return titulos.listar_parcelas(
            ctx, tipo, situacao, de, ate, pessoaId, categoriaId, centroCustoId, busca, limite, deslocamento
        )

    @r.get("/parcelas/resumo")
    def resumo(tipo: str, ctx: Contexto = Depends(pode("operacao:ver", "relatorios:ver"))):
        return titulos.resumo(ctx, tipo)

    @r.patch("/parcelas/{parcela_id}", summary="Muda vencimento ou código de barras de parcela em aberto")
    def alterar_parcela(parcela_id: str, entrada: ParcelaAlteracao, ctx: Contexto = Depends(pode("operacao:editar"))):
        return titulos.alterar_parcela(ctx, parcela_id, entrada.campos())

    @r.post("/parcelas/{parcela_id}/baixas", status_code=201, summary="Registra pagamento (ou recebimento)")
    def baixar(parcela_id: str, entrada: BaixaEntrada, ctx: Contexto = Depends(pode("operacao:criar"))):
        return titulos.baixar(ctx, parcela_id, entrada.campos())

    @r.post("/parcelas/baixas-em-lote", summary="Quita o saldo de várias parcelas")
    def baixar_varias(entrada: BaixaEmLote, ctx: Contexto = Depends(pode("operacao:criar"))):
        return titulos.baixar_varias(ctx, entrada.parcela_ids, entrada.conta_id, entrada.data, entrada.forma)

    @r.post("/baixas/{baixa_id}/estorno", summary="Estorna um pagamento (lança o dinheiro de volta)")
    def estornar(baixa_id: str, entrada: Motivo, ctx: Contexto = Depends(pode("operacao:excluir"))):
        return titulos.estornar_baixa(ctx, baixa_id, entrada.motivo, entrada.data)

    @r.post("/titulos", status_code=201)
    def criar_titulo(entrada: TituloEntrada, ctx: Contexto = Depends(pode("operacao:criar"))):
        return titulos.criar(ctx, entrada.campos())

    @r.get("/titulos/{titulo_id}")
    def obter(titulo_id: str, ctx: Contexto = Depends(pode("operacao:ver"))):
        return titulos.obter(ctx, titulo_id)

    @r.patch("/titulos/{titulo_id}")
    def editar(titulo_id: str, entrada: TituloEntrada, ctx: Contexto = Depends(pode("operacao:editar"))):
        return titulos.editar(ctx, titulo_id, entrada.campos())

    @r.put(
        "/titulos/{titulo_id}/parcelas",
        summary="Refaz as parcelas em aberto (reparcelamento): altera, cria e exclui; as pagas ficam",
    )
    def reparcelar(titulo_id: str, entrada: ReparcelamentoEntrada, ctx: Contexto = Depends(pode("operacao:editar"))):
        # Excluir parcela pede também operacao:excluir: quem confere é o serviço,
        # porque só ele sabe se o plano novo exclui alguma.
        return titulos.reparcelar(ctx, titulo_id, [p.campos() for p in entrada.parcelas], entrada.motivo)

    @r.post("/titulos/{titulo_id}/cancelamento")
    def cancelar(titulo_id: str, entrada: Motivo, ctx: Contexto = Depends(pode("operacao:excluir"))):
        return titulos.cancelar(ctx, titulo_id, entrada.motivo)

    # ------------------------------------------------------------ caixa
    @r.get("/contas/{conta_id}/extrato")
    def extrato(conta_id: str, de: date | None = None, ate: date | None = None, ctx: Contexto = Depends(pode("operacao:ver"))):
        return movimentos.extrato(ctx, conta_id, de, ate)

    @r.post("/contas/{conta_id}/ajuste-saldo")
    def ajustar(conta_id: str, entrada: AjusteSaldoEntrada, ctx: Contexto = Depends(pode("operacao:editar"))):
        return movimentos.ajustar_saldo(ctx, conta_id, entrada.campos())

    @r.post("/transferencias", status_code=201)
    def transferir(entrada: TransferenciaEntrada, ctx: Contexto = Depends(pode("operacao:criar"))):
        return movimentos.transferir(ctx, entrada.campos())

    @r.post("/transferencias/{transferencia_id}/estorno")
    def estornar_transferencia(transferencia_id: str, entrada: Motivo, ctx: Contexto = Depends(pode("operacao:excluir"))):
        return movimentos.estornar_transferencia(ctx, transferencia_id, entrada.motivo)

    return r
