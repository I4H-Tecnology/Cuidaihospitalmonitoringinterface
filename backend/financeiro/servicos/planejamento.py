"""Orçamento: o planejado por categoria e mês, contra o realizado.

O realizado é o da competência (a DRE), não o do caixa: orçamento responde
"gastamos mais do que o planejado para setembro?", e o gasto de setembro é o
que pertence a setembro, pago quando for.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from ..dominio.demonstrativos import GRUPOS
from ..dominio.dinheiro import ZERO, arredondar, dinheiro, somar
from ..dominio.indicadores import percentual
from ..erros import RegraDeNegocio
from .contexto import Contexto
from .relatorios import _competencia_por_mes_e_categoria
from .util import exigir_da_empresa

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _meses(ano: int) -> list[date]:
    return [date(ano, m, 1) for m in range(1, 13)]


def obter(ctx: Contexto, ano: int, centro_custo_id: str | None = None) -> dict:
    with ctx.ler() as db:
        linhas = db.todos(
            """
            SELECT o.categoria_id, o.centro_custo_id, o.competencia, o.valor,
                   c.nome, c.grupo, c.natureza, cc.nome AS centro_custo_nome
              FROM financeiro.orcamento o
              JOIN financeiro.categoria c ON c.id = o.categoria_id
              LEFT JOIN financeiro.centro_custo cc ON cc.id = o.centro_custo_id
             WHERE o.organizacao_id = %s AND extract(year FROM o.competencia) = %s
               AND (%s::uuid IS NULL OR o.centro_custo_id = %s::uuid)
            """,
            (ctx.org_id, ano, centro_custo_id, centro_custo_id),
        )
    agrupado: dict[tuple, dict] = {}
    for l in linhas:
        chave = (str(l["categoria_id"]), str(l["centro_custo_id"]) if l["centro_custo_id"] else None)
        item = agrupado.setdefault(chave, {
            "categoria_id": chave[0], "centro_custo_id": chave[1], "nome": l["nome"], "grupo": l["grupo"],
            "grupo_rotulo": GRUPOS[l["grupo"]].rotulo, "natureza": l["natureza"],
            "centro_custo_nome": l["centro_custo_nome"], "valores": [ZERO] * 12,
        })
        item["valores"][l["competencia"].month - 1] = l["valor"]
    ordem = {g: i for i, g in enumerate(GRUPOS)}
    itens = sorted(agrupado.values(), key=lambda i: (ordem[i["grupo"]], i["nome"].lower()))
    for item in itens:
        item["total"] = somar(item["valores"])
    return {"ano": ano, "meses": _meses(ano), "linhas": itens}


def salvar(ctx: Contexto, ano: int, linhas: list[dict]) -> dict:
    """Grava as linhas enviadas (12 valores cada). Valor zero apaga o mês."""
    if not 2000 <= ano <= 2100:
        raise RegraDeNegocio("Ano inválido.")
    with ctx.escrever("Orçamento") as db:
        for linha in linhas:
            categoria = exigir_da_empresa(db, "categoria", ctx.org_id, linha.get("categoria_id"), "Categoria")
            if not GRUPOS[categoria["grupo"]].linha_dre:
                raise RegraDeNegocio(f"{categoria['nome']} não é receita nem despesa do resultado; não entra no orçamento.")
            centro = linha.get("centro_custo_id") or None
            if centro:
                exigir_da_empresa(db, "centro_custo", ctx.org_id, centro, "Centro de custo")
            valores = linha.get("valores") or []
            if len(valores) != 12:
                raise RegraDeNegocio("Cada linha do orçamento precisa dos 12 meses.")
            for mes, bruto in zip(_meses(ano), valores):
                valor = dinheiro(bruto or 0)
                if valor < 0:
                    raise RegraDeNegocio("Orçamento não tem valor negativo: receita e despesa são positivas.")
                if valor == 0:
                    db.executar(
                        """
                        DELETE FROM financeiro.orcamento WHERE organizacao_id = %s AND competencia = %s
                           AND categoria_id = %s AND COALESCE(centro_custo_id, %s::uuid) = COALESCE(%s::uuid, %s::uuid)
                        """,
                        (ctx.org_id, mes, categoria["id"], ZERO_UUID, centro, ZERO_UUID),
                    )
                    continue
                db.executar(
                    """
                    INSERT INTO financeiro.orcamento (organizacao_id, competencia, categoria_id, centro_custo_id, valor)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (organizacao_id, competencia, categoria_id,
                                 COALESCE(centro_custo_id, '00000000-0000-0000-0000-000000000000'::uuid))
                    DO UPDATE SET valor = EXCLUDED.valor
                    """,
                    (ctx.org_id, mes, categoria["id"], centro, valor),
                )
    return obter(ctx, ano)


def copiar(ctx: Contexto, ano_origem: int, ano_destino: int, base: str, reajuste: Decimal) -> dict:
    """Monta o orçamento de um ano a partir do anterior: o orçado ou o realizado, com reajuste em %."""
    if base not in ("orcado", "realizado"):
        raise RegraDeNegocio("Base: orcado ou realizado.")
    fator = 1 + Decimal(str(reajuste or 0)) / 100
    if base == "orcado":
        origem = obter(ctx, ano_origem)["linhas"]
        linhas = [
            {"categoria_id": l["categoria_id"], "centro_custo_id": l["centro_custo_id"],
             "valores": [arredondar(v * fator) for v in l["valores"]]}
            for l in origem
        ]
    else:
        with ctx.ler() as db:
            realizado = _competencia_por_mes_e_categoria(db, ctx.org_id, date(ano_origem, 1, 1), date(ano_origem, 12, 1), None)
            categorias = {str(c["id"]): c for c in db.todos(
                "SELECT id, grupo FROM financeiro.categoria WHERE organizacao_id = %s", (ctx.org_id,)
            )}
        por_categoria: dict[str, list[Decimal]] = defaultdict(lambda: [ZERO] * 12)
        for (mes, categoria_id), valor in realizado.items():
            if GRUPOS[categorias[categoria_id]["grupo"]].linha_dre:
                por_categoria[categoria_id][mes.month - 1] += abs(valor)
        linhas = [
            {"categoria_id": c, "centro_custo_id": None, "valores": [arredondar(v * fator) for v in valores]}
            for c, valores in por_categoria.items()
        ]
    return salvar(ctx, ano_destino, linhas)


def mes_de_referencia(ano: int, hoje: date) -> int:
    """O mês que o comparativo mostra se ninguém escolher: o atual no ano
    corrente, dezembro num ano que já acabou, janeiro num que não começou."""
    if ano == hoje.year:
        return hoje.month
    return 12 if ano < hoje.year else 1


def comparativo(ctx: Contexto, ano: int, centro_custo_id: str | None = None, mes: int | None = None) -> dict:
    """Orçado × realizado por categoria e mês.

    A diferença e o alerta são de um mês (`mes`; sem ele, o de referência),
    com o acumulado do ano até ele ao lado. O total do ano não serve para
    isso: em setembro ele compararia doze meses planejados com nove
    realizados, e toda despesa pareceria dentro e toda receita, abaixo.
    """
    referencia = mes or mes_de_referencia(ano, ctx.hoje)
    if not 1 <= referencia <= 12:
        raise RegraDeNegocio("Mês inválido: de 1 a 12.")
    # Despesa acima do planejado já é fato; receita abaixo só vira alerta
    # quando o mês acaba, porque até lá ela ainda pode entrar.
    mes_encerrado = date(ano, referencia, 1) < ctx.hoje.replace(day=1)
    orcamento = obter(ctx, ano, centro_custo_id)
    with ctx.ler() as db:
        realizado = _competencia_por_mes_e_categoria(db, ctx.org_id, date(ano, 1, 1), date(ano, 12, 1), centro_custo_id)
        categorias = {str(c["id"]): c for c in db.todos(
            "SELECT id, nome, grupo, natureza FROM financeiro.categoria WHERE organizacao_id = %s", (ctx.org_id,)
        )}
    linhas: dict[str, dict] = {}
    for item in orcamento["linhas"]:
        alvo = linhas.setdefault(item["categoria_id"], _linha_vazia(categorias[item["categoria_id"]]))
        alvo["orcado"] = [a + b for a, b in zip(alvo["orcado"], item["valores"])]
    for (competencia, categoria_id), valor in realizado.items():
        cat = categorias[categoria_id]
        if not GRUPOS[cat["grupo"]].linha_dre:
            continue
        alvo = linhas.setdefault(categoria_id, _linha_vazia(cat))
        # Realizado em módulo, como o orçado: receita e despesa positivas.
        alvo["realizado"][competencia.month - 1] += valor if cat["natureza"] == "receita" else -valor
    ordem = {g: i for i, g in enumerate(GRUPOS)}
    saida = []
    for linha in sorted(linhas.values(), key=lambda l: (ordem[l["grupo"]], l["nome"].lower())):
        linha["realizado"] = [arredondar(v) for v in linha["realizado"]]
        linha["total_orcado"] = somar(linha["orcado"])
        linha["total_realizado"] = somar(linha["realizado"])
        linha["acumulado_orcado"] = somar(linha["orcado"][:referencia])
        linha["acumulado_realizado"] = somar(linha["realizado"][:referencia])
        no_mes = linha["orcado"][referencia - 1], linha["realizado"][referencia - 1]
        linha["variacao"] = no_mes[1] - no_mes[0]
        linha["variacao_percentual"] = percentual(linha["variacao"], no_mes[0]) if no_mes[0] else None
        linha["desfavoravel"] = (
            no_mes[1] > no_mes[0] if linha["natureza"] == "despesa" else (mes_encerrado and no_mes[1] < no_mes[0])
        )
        saida.append(linha)

    def resumo(meses: slice) -> dict:
        def total(natureza: str, campo: str) -> Decimal:
            return somar(v for l in saida if l["natureza"] == natureza for v in l[campo][meses])

        receitas = total("receita", "orcado"), total("receita", "realizado")
        despesas = total("despesa", "orcado"), total("despesa", "realizado")
        return {
            "receitas_orcadas": receitas[0],
            "receitas_realizadas": receitas[1],
            "despesas_orcadas": despesas[0],
            "despesas_realizadas": despesas[1],
            "resultado_orcado": receitas[0] - despesas[0],
            "resultado_realizado": receitas[1] - despesas[1],
        }

    return {
        "ano": ano,
        "mes": referencia,
        "mes_encerrado": mes_encerrado,
        "meses": _meses(ano),
        "linhas": saida,
        "resumo": resumo(slice(referencia - 1, referencia)),
        "acumulado": resumo(slice(0, referencia)),
    }


def _linha_vazia(cat: dict) -> dict:
    return {
        "categoria_id": str(cat["id"]), "nome": cat["nome"], "grupo": cat["grupo"],
        "grupo_rotulo": GRUPOS[cat["grupo"]].rotulo, "natureza": cat["natureza"],
        "orcado": [ZERO] * 12, "realizado": [ZERO] * 12,
    }
