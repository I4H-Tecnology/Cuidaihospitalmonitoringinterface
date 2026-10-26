"""Sócios e capital social, empréstimos, investimentos e patrimônio."""

from __future__ import annotations

from fastapi import Depends

from ..servicos import capital
from ..servicos.contexto import Contexto
from .base import novo_router
from .esquemas import (
    AtivoEntrada,
    AtualizacaoInvestimento,
    BaixaDeBem,
    EmprestimoEntrada,
    Motivo,
    OperacaoSocio,
    SocioEntrada,
)


def criar(pode):
    r = novo_router()

    @r.get("/capital/resumo", summary="Capital social, lucros, dívidas, investimentos e patrimônio num quadro só")
    def resumo(ctx: Contexto = Depends(pode("capital:ver"))):
        return capital.resumo_do_capital(ctx)

    # ------------------------------------------------------------ sócios
    @r.get("/socios")
    def socios(ctx: Contexto = Depends(pode("capital:ver"))):
        return capital.listar_socios(ctx)

    @r.post("/socios", status_code=201)
    def criar_socio(entrada: SocioEntrada, ctx: Contexto = Depends(pode("capital:criar"))):
        return capital.salvar_socio(ctx, entrada.campos())

    @r.patch("/socios/{socio_id}")
    def editar_socio(socio_id: str, entrada: SocioEntrada, ctx: Contexto = Depends(pode("capital:editar"))):
        return capital.salvar_socio(ctx, entrada.campos(), socio_id)

    @r.post("/socios/{socio_id}/operacoes", status_code=201, summary="Aporte, integralização, distribuição ou devolução")
    def operacao(socio_id: str, entrada: OperacaoSocio, ctx: Contexto = Depends(pode("capital:criar"))):
        return capital.operacao_de_socio(ctx, socio_id, entrada.campos())

    # ------------------------------------------------------------ empréstimos
    @r.post("/emprestimos/simulacao", summary="Cronograma Price ou SAC, sem gravar nada")
    def simular(entrada: EmprestimoEntrada, ctx: Contexto = Depends(pode("capital:ver"))):
        return capital.simular(entrada.campos())

    @r.get("/emprestimos")
    def emprestimos(ctx: Contexto = Depends(pode("capital:ver"))):
        return capital.listar_emprestimos(ctx)

    @r.post("/emprestimos", status_code=201)
    def criar_emprestimo(entrada: EmprestimoEntrada, ctx: Contexto = Depends(pode("capital:criar"))):
        return capital.criar_emprestimo(ctx, entrada.campos())

    @r.get("/emprestimos/{emp_id}")
    def emprestimo(emp_id: str, ctx: Contexto = Depends(pode("capital:ver"))):
        return capital.obter_emprestimo(ctx, emp_id)

    @r.post("/emprestimos/{emp_id}/cancelamento")
    def cancelar(emp_id: str, entrada: Motivo, ctx: Contexto = Depends(pode("capital:excluir"))):
        return capital.cancelar_emprestimo(ctx, emp_id, entrada.motivo)

    # ------------------------------------------------------------ investimentos
    @r.get("/investimentos")
    def investimentos(ctx: Contexto = Depends(pode("capital:ver"))):
        return capital.listar_investimentos(ctx)

    @r.post("/investimentos/{conta_id}/atualizacao", summary="Informa o saldo atual; a diferença vira rendimento")
    def atualizar(conta_id: str, entrada: AtualizacaoInvestimento, ctx: Contexto = Depends(pode("capital:editar"))):
        return capital.atualizar_investimento(ctx, conta_id, entrada.campos())

    # ------------------------------------------------------------ patrimônio
    @r.get("/ativos")
    def ativos(incluirBaixados: bool = True, ctx: Contexto = Depends(pode("capital:ver"))):
        return capital.listar_ativos(ctx, incluirBaixados)

    @r.post("/ativos", status_code=201)
    def criar_ativo(entrada: AtivoEntrada, ctx: Contexto = Depends(pode("capital:criar"))):
        return capital.criar_ativo(ctx, entrada.campos())

    @r.patch("/ativos/{ativo_id}")
    def editar_ativo(ativo_id: str, entrada: AtivoEntrada, ctx: Contexto = Depends(pode("capital:editar"))):
        return capital.editar_ativo(ctx, ativo_id, entrada.campos())

    @r.post("/ativos/{ativo_id}/baixa", summary="Venda, perda ou descarte do bem")
    def baixar(ativo_id: str, entrada: BaixaDeBem, ctx: Contexto = Depends(pode("capital:excluir"))):
        return capital.baixar_ativo(ctx, ativo_id, entrada.campos())

    @r.get("/ativos/{ativo_id}/depreciacao")
    def depreciacao(ativo_id: str, ctx: Contexto = Depends(pode("capital:ver"))):
        return capital.cronograma_do_ativo(ctx, ativo_id)

    return r
