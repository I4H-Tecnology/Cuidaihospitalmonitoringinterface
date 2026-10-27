"""Plano de contas gerencial: onde cada categoria cai na DRE e no fluxo de caixa.

Toda categoria pertence a um GRUPO, e o grupo decide duas coisas:

  - a linha da DRE (resultado) em que ela soma — ou nenhuma, quando o dinheiro
    mexe no caixa sem ser receita nem despesa: aporte de sócio, empréstimo
    recebido, amortização, compra de bem, distribuição de lucros;
  - a atividade no fluxo de caixa: operacional, investimento ou financiamento.

É essa separação que responde "a empresa deu lucro?" e "para onde foi o
dinheiro?" com números diferentes — e os dois certos. Um mês com compra de
equipamento e aporte de sócio pode ter caixa sobrando e prejuízo, ou o
contrário.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .dinheiro import ZERO, arredondar


@dataclass(frozen=True)
class Grupo:
    chave: str
    natureza: str  # receita | despesa
    rotulo: str
    linha_dre: str | None  # None = não é resultado (não entra na DRE)
    atividade: str  # operacional | investimento | financiamento


GRUPOS: dict[str, Grupo] = {
    g.chave: g
    for g in [
        Grupo("receita_operacional", "receita", "Receitas operacionais", "receita_bruta", "operacional"),
        Grupo("receita_financeira", "receita", "Receitas financeiras", "receitas_financeiras", "operacional"),
        Grupo("outras_receitas", "receita", "Outras receitas", "outras_receitas", "operacional"),
        Grupo("aporte_socio", "receita", "Aportes de sócios", None, "financiamento"),
        Grupo("captacao_emprestimo", "receita", "Empréstimos recebidos", None, "financiamento"),
        Grupo("venda_ativo", "receita", "Venda de bens", None, "investimento"),
        Grupo("deducao_receita", "despesa", "Impostos sobre o faturamento", "deducoes", "operacional"),
        Grupo("custo_direto", "despesa", "Custos diretos", "custos", "operacional"),
        Grupo("despesa_pessoal", "despesa", "Despesas com pessoal", "despesas_pessoal", "operacional"),
        Grupo("despesa_administrativa", "despesa", "Despesas administrativas", "despesas_administrativas", "operacional"),
        Grupo("despesa_comercial", "despesa", "Despesas comerciais", "despesas_comerciais", "operacional"),
        Grupo("despesa_financeira", "despesa", "Despesas financeiras", "despesas_financeiras", "operacional"),
        Grupo("outras_despesas", "despesa", "Outras despesas", "outras_despesas", "operacional"),
        Grupo("impostos_lucro", "despesa", "IRPJ e CSLL", "impostos_lucro", "operacional"),
        Grupo("compra_ativo", "despesa", "Compra de bens", None, "investimento"),
        Grupo("amortizacao_emprestimo", "despesa", "Amortização de empréstimos", None, "financiamento"),
        Grupo("retirada_socio", "despesa", "Retiradas e distribuição de lucros", None, "financiamento"),
    ]
}

ATIVIDADES = {
    "operacional": "Atividades operacionais",
    "investimento": "Atividades de investimento",
    "financiamento": "Atividades de financiamento",
}


@dataclass(frozen=True)
class LinhaDre:
    chave: str
    rotulo: str
    valor: Decimal  # com sinal: receita positiva, despesa negativa
    tipo: str  # linha | subtotal | resultado
    percentual: Decimal | None  # análise vertical: % da receita líquida


# (chave, rótulo, sinal) das linhas que vêm da soma das categorias.
_LINHAS = {
    "receita_bruta": ("Receita bruta", 1),
    "deducoes": ("(−) Impostos sobre o faturamento", -1),
    "custos": ("(−) Custos diretos", -1),
    "despesas_pessoal": ("(−) Pessoal", -1),
    "despesas_administrativas": ("(−) Administrativas", -1),
    "despesas_comerciais": ("(−) Comerciais", -1),
    "depreciacao": ("(−) Depreciação", -1),
    "receitas_financeiras": ("(+) Receitas financeiras", 1),
    "despesas_financeiras": ("(−) Despesas financeiras", -1),
    "outras_receitas": ("(+) Outras receitas", 1),
    "outras_despesas": ("(−) Outras despesas", -1),
    "impostos_lucro": ("(−) IRPJ e CSLL", -1),
}


def montar_dre(
    somas: dict[str, Decimal],
    depreciacao: Decimal = ZERO,
    resultado_venda_de_bens: Decimal = ZERO,
) -> list[LinhaDre]:
    """DRE gerencial a partir das somas por linha (valores positivos).

    `somas` vem de `linha_dre` de cada grupo. Depreciação vem do patrimônio; o
    ganho ou a perda na venda de bens entra em outras receitas ou despesas.
    """
    v = {chave: Decimal(somas.get(chave, ZERO)) for chave in _LINHAS}
    v["depreciacao"] += Decimal(depreciacao)
    if resultado_venda_de_bens > 0:
        v["outras_receitas"] += resultado_venda_de_bens
    elif resultado_venda_de_bens < 0:
        v["outras_despesas"] += -resultado_venda_de_bens

    def s(chave: str) -> Decimal:
        return v[chave] * _LINHAS[chave][1]

    receita_liquida = s("receita_bruta") + s("deducoes")
    lucro_bruto = receita_liquida + s("custos")
    ebitda = lucro_bruto + s("despesas_pessoal") + s("despesas_administrativas") + s("despesas_comerciais")
    ebit = ebitda + s("depreciacao")
    lair = ebit + s("receitas_financeiras") + s("despesas_financeiras") + s("outras_receitas") + s("outras_despesas")
    lucro = lair + s("impostos_lucro")

    def pct(valor: Decimal) -> Decimal | None:
        if receita_liquida <= 0:
            return None
        return arredondar(valor / receita_liquida * 100, Decimal("0.1"))

    def linha(chave: str) -> LinhaDre:
        valor = arredondar(s(chave))
        return LinhaDre(chave, _LINHAS[chave][0], valor, "linha", pct(valor))

    def total(chave: str, rotulo: str, valor: Decimal, tipo: str = "subtotal") -> LinhaDre:
        valor = arredondar(valor)
        return LinhaDre(chave, rotulo, valor, tipo, pct(valor))

    return [
        linha("receita_bruta"),
        linha("deducoes"),
        total("receita_liquida", "Receita líquida", receita_liquida),
        linha("custos"),
        total("lucro_bruto", "Lucro bruto", lucro_bruto),
        linha("despesas_pessoal"),
        linha("despesas_administrativas"),
        linha("despesas_comerciais"),
        total("ebitda", "Resultado operacional antes da depreciação (EBITDA)", ebitda),
        linha("depreciacao"),
        total("ebit", "Resultado operacional", ebit),
        linha("receitas_financeiras"),
        linha("despesas_financeiras"),
        linha("outras_receitas"),
        linha("outras_despesas"),
        total("lair", "Resultado antes do IR e da CSLL", lair),
        linha("impostos_lucro"),
        total("lucro_liquido", "Lucro líquido", lucro, "resultado"),
    ]


def linha_dre_do_grupo(grupo: str) -> str | None:
    return GRUPOS[grupo].linha_dre


def atividade_do_grupo(grupo: str) -> str:
    return GRUPOS[grupo].atividade
