"""Módulo financeiro portável.

Contas a pagar e a receber, caixa e bancos, folha de pagamento, capital
(sócios, empréstimos, investimentos, patrimônio), orçamento, relatórios e
conciliação bancária — num pacote que não sabe em qual sistema está rodando.

Quem hospeda o módulo entrega duas coisas: um pool de conexões Postgres e uma
função que diz quem está chamando (o `Operador`). O resto é daqui. O guia de
uso está em README.md, ao lado deste arquivo.

Pontos de entrada:

    financeiro.migracoes.migrar(pool)          cria/atualiza o schema `financeiro`
    financeiro.api.criar_router(banco, quem)   todas as rotas HTTP, prontas para montar
    financeiro.servidor                        o módulo como serviço próprio (JWT)
"""

__version__ = "1.0.0"
