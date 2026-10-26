"""A API HTTP do módulo, pronta para montar em qualquer aplicação FastAPI.

    from financeiro.api import criar_router
    app.include_router(criar_router(banco, obter_operador))

`obter_operador` é uma dependência FastAPI do HOSPEDEIRO que devolve um
`financeiro.acesso.Operador` — é ali que ele autentica do jeito dele. Tudo o
que vem depois (empresa, permissão, transação, auditoria) é do módulo.
"""

from __future__ import annotations

from typing import Callable

from fastapi import APIRouter, Depends

from ..acesso import Operador
from ..banco import Banco
from ..erros import SemPermissao
from ..relogio import hoje
from ..servicos import organizacao
from ..servicos.contexto import Contexto
from . import (
    rotas_cadastros,
    rotas_capital,
    rotas_conciliacao,
    rotas_configuracoes,
    rotas_pessoal,
    rotas_planejamento,
    rotas_relatorios,
    rotas_titulos,
)
from .base import RespostaFinanceira, RotaFinanceira


def criar_router(
    banco: Banco,
    obter_operador: Callable[..., Operador],
    prefixo: str = "/api/financeiro",
) -> APIRouter:
    def contexto(operador: Operador = Depends(obter_operador)) -> Contexto:
        return Contexto(banco, operador, organizacao.resolver(banco, operador), hoje())

    def pode(*exigencias: str):
        """Dependência que exige AO MENOS UMA das permissões 'recurso:acao'.

        Listar contas e categorias, por exemplo, serve a quem lança conta a
        pagar, a quem faz a folha e a quem lê relatório: basta ver qualquer
        uma dessas partes para poder preencher o formulário.
        """

        def verificar(ctx: Contexto = Depends(contexto)) -> Contexto:
            for exigencia in exigencias:
                recurso, acao = exigencia.split(":")
                if ctx.operador.pode(recurso, acao):
                    return ctx
            raise SemPermissao("Seu perfil não tem acesso a esta parte do financeiro.")

        return verificar

    router = APIRouter(prefix=prefixo, route_class=RotaFinanceira, default_response_class=RespostaFinanceira)
    router.include_router(rotas_configuracoes.criar(pode, contexto), tags=["financeiro: empresa e configurações"])
    router.include_router(rotas_cadastros.criar(pode), tags=["financeiro: cadastros"])
    router.include_router(rotas_titulos.criar(pode), tags=["financeiro: contas a pagar e a receber, caixa"])
    router.include_router(rotas_pessoal.criar(pode), tags=["financeiro: pessoal e folha"])
    router.include_router(rotas_capital.criar(pode), tags=["financeiro: capital"])
    router.include_router(rotas_planejamento.criar(pode), tags=["financeiro: orçamento"])
    router.include_router(rotas_relatorios.criar(pode), tags=["financeiro: relatórios"])
    router.include_router(rotas_conciliacao.criar(pode), tags=["financeiro: conciliação bancária"])
    return router
