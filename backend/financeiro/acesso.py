"""Quem está chamando, de qual empresa, e o que pode fazer.

Esta é a única coisa que o módulo exige do sistema que o hospeda. O
hospedeiro autentica do jeito dele (sessão, JWT, o que for) e entrega um
`Operador`; o módulo nunca lê token, cookie nem tabela de usuário.

As permissões são pares "recurso:ação" com vocabulário próprio do módulo, para
não depender de como cada hospedeiro organiza o RBAC dele. Quem hospeda traduz
(ver `app/integracao_financeiro.py` no MedSignal, ou o claim `permissoes` do
JWT no modo serviço).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .erros import SemPermissao

# recurso -> o que ele cobre. A ordem é a do menu.
RECURSOS: dict[str, str] = {
    "operacao": "Contas a pagar e a receber, pagamentos, caixa, transferências e conciliação",
    "cadastros": "Contas, plano de contas, centros de custo, pessoas, recorrências e feriados",
    "pessoal": "Colaboradores e folha de pagamento (salário é dado pessoal)",
    "capital": "Sócios, empréstimos, investimentos e patrimônio",
    "planejamento": "Orçamento",
    "relatorios": "Visão geral, DRE, fluxo de caixa, inadimplência e indicadores",
    "configuracoes": "Parâmetros da empresa, tabelas de imposto, fechamento de período e auditoria",
}

ACOES = ("ver", "criar", "editar", "excluir")


@dataclass(frozen=True)
class Operador:
    """Quem opera o financeiro nesta chamada.

    usuario_ref       id do usuário no hospedeiro (vai para a auditoria)
    usuario_nome      nome legível (também para a auditoria)
    organizacao_ref   id da empresa no hospedeiro (vira `organizacao.chave_externa`)
    organizacao_nome  nome da empresa, usado ao provisioná-la na primeira vez
    permissoes        {"operacao:ver", "operacao:criar", ...}
    """

    usuario_ref: str
    usuario_nome: str
    organizacao_ref: str
    organizacao_nome: str
    permissoes: frozenset[str] = field(default_factory=frozenset)

    def pode(self, recurso: str, acao: str) -> bool:
        return f"{recurso}:{acao}" in self.permissoes

    def exigir(self, recurso: str, acao: str) -> None:
        if recurso not in RECURSOS or acao not in ACOES:
            raise ValueError(f"Permissão desconhecida: {recurso}:{acao}")
        if not self.pode(recurso, acao):
            raise SemPermissao(f"Seu perfil não permite {acao} em {recurso} no financeiro.")


def todas_as_permissoes() -> frozenset[str]:
    return frozenset(f"{r}:{a}" for r in RECURSOS for a in ACOES)
