"""Erros do módulo financeiro.

Toda recusa de regra de negócio sai como uma destas exceções, com a mensagem
já escrita para quem está na tela. A camada HTTP só traduz a classe em status;
ela nunca inventa texto. Assim a mesma regra dá a mesma mensagem venha a
chamada da API, de um teste ou de um script.
"""


class ErroFinanceiro(Exception):
    """Base. `status` é o código HTTP que a API devolve para este erro."""

    status = 422

    def __init__(self, mensagem: str):
        super().__init__(mensagem)
        self.mensagem = mensagem


class RegraDeNegocio(ErroFinanceiro):
    """O pedido é bem formado, mas a regra não deixa (ex.: pagar mais que o saldo)."""

    status = 422


class NaoEncontrado(ErroFinanceiro):
    """Não existe, ou existe em outra empresa — as duas respostas são iguais de propósito."""

    status = 404


class Conflito(ErroFinanceiro):
    """Choca com algo que já existe (ex.: código de categoria repetido)."""

    status = 409


class SemPermissao(ErroFinanceiro):
    status = 403
