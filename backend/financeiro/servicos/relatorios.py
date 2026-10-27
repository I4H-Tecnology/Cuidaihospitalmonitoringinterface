"""Relatórios: DRE, fluxo de caixa realizado e projetado, inadimplência e painel.

Dois regimes, duas perguntas:

  competência  "a empresa deu lucro em setembro?" — conta pelo mês a que a
               receita e a despesa pertencem, pague-se quando pagar;
  caixa        "quanto dinheiro entrou e saiu em setembro?" — conta pela data
               do pagamento.

O caixa por categoria vem das baixas: cada pagamento é repartido pelo rateio
do título (o aluguel pago cai em "Aluguel"), e juros, multa e desconto caem
nas categorias financeiras do sistema. A conta é feita sem arredondar linha a
linha e arredondada no total — por isso fecha com o extrato.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from ..dominio import indicadores as ind
from ..dominio.calendario import competencia as competencia_de
from ..dominio.calendario import meses_entre, somar_meses, ultimo_dia_do_mes
from ..dominio.demonstrativos import ATIVIDADES, GRUPOS, montar_dre
from ..dominio.dinheiro import ZERO, arredondar, somar
from ..erros import RegraDeNegocio
from . import capital, recorrencias
from .contexto import Contexto
from .util import categoria_do_sistema

# ==========================================================================
# Blocos de consulta
# ==========================================================================

# Caixa categorizado: cada baixa (e cada estorno, com sinal trocado) repartida
# pelo rateio do título. `lado`: receber soma, pagar subtrai.
_CAIXA_CATEGORIZADO = """
WITH mov AS (
  SELECT m.data, b.valor, b.juros, b.multa, b.desconto, t.id AS titulo_id, t.tipo, t.valor_total,
         CASE WHEN m.tipo = 'estorno' THEN -1 ELSE 1 END AS sinal,
         CASE WHEN t.tipo = 'receber' THEN 1 ELSE -1 END AS lado
    FROM financeiro.movimento m
    JOIN financeiro.baixa b ON b.id = m.baixa_id
    JOIN financeiro.parcela p ON p.id = b.parcela_id
    JOIN financeiro.titulo t ON t.id = p.titulo_id
   WHERE m.organizacao_id = %(org)s AND m.tipo IN ('baixa', 'estorno')
     AND m.data BETWEEN %(de)s AND %(ate)s
)
SELECT mov.data, r.categoria_id, r.centro_custo_id,
       mov.sinal * mov.lado * mov.valor * r.valor / mov.valor_total AS valor
  FROM mov JOIN financeiro.rateio r ON r.titulo_id = mov.titulo_id
UNION ALL
SELECT mov.data,
       CASE WHEN mov.tipo = 'receber' THEN %(juros_recebidos)s::uuid ELSE %(juros_pagos)s::uuid END,
       r.centro_custo_id,
       mov.sinal * mov.lado * (mov.juros + mov.multa) * r.valor / mov.valor_total
  FROM mov JOIN financeiro.rateio r ON r.titulo_id = mov.titulo_id
 WHERE mov.juros + mov.multa > 0
UNION ALL
SELECT mov.data,
       CASE WHEN mov.tipo = 'receber' THEN %(descontos_concedidos)s::uuid ELSE %(descontos_obtidos)s::uuid END,
       r.centro_custo_id,
       -mov.sinal * mov.lado * mov.desconto * r.valor / mov.valor_total
  FROM mov JOIN financeiro.rateio r ON r.titulo_id = mov.titulo_id
 WHERE mov.desconto > 0
"""


def _categorias_financeiras(db, org_id: str) -> dict:
    return {
        "juros_recebidos": categoria_do_sistema(db, org_id, "fin.juros_recebidos"),
        "juros_pagos": categoria_do_sistema(db, org_id, "fin.juros_pagos"),
        "descontos_concedidos": categoria_do_sistema(db, org_id, "fin.descontos_concedidos"),
        "descontos_obtidos": categoria_do_sistema(db, org_id, "fin.descontos_obtidos"),
    }


def _categorias(db, org_id: str) -> dict[str, dict]:
    return {
        str(c["id"]): c
        for c in db.todos(
            "SELECT id, nome, grupo, natureza, comportamento, pai_id FROM financeiro.categoria WHERE organizacao_id = %s",
            (org_id,),
        )
    }


def _caixa_por_mes_e_categoria(db, org_id: str, de: date, ate: date, centro: str | None) -> dict:
    """{(competência do pagamento, categoria_id): valor com sinal}."""
    params = {"org": org_id, "de": de, "ate": ate, **_categorias_financeiras(db, org_id)}
    filtro = "WHERE centro_custo_id = %(centro)s " if centro else ""
    sql = f"SELECT date_trunc('month', data)::date AS mes, categoria_id, sum(valor) AS valor FROM ({_CAIXA_CATEGORIZADO}) x {filtro}GROUP BY 1, 2"  # nosec B608 - só trechos fixos deste arquivo; valores vão por parâmetro
    linhas = db.todos(sql, {**params, "centro": centro})
    return {(l["mes"], str(l["categoria_id"])): Decimal(l["valor"]) for l in linhas}


def _competencia_por_mes_e_categoria(db, org_id: str, de: date, ate: date, centro: str | None) -> dict:
    """Títulos pela competência, mais juros, multas e descontos pela data da baixa."""
    filtro_centro = "AND r.centro_custo_id = %(centro)s" if centro else ""
    params = {"org": org_id, "de": de, "ate": ultimo_dia_do_mes(ate), "centro": centro}
    linhas = db.todos(
        f"""
        SELECT t.competencia AS mes, r.categoria_id,
               sum(CASE WHEN t.tipo = 'receber' THEN r.valor ELSE -r.valor END) AS valor
          FROM financeiro.titulo t JOIN financeiro.rateio r ON r.titulo_id = t.id
         WHERE t.organizacao_id = %(org)s AND t.cancelado_em IS NULL
           AND t.competencia BETWEEN %(de)s AND %(ate)s {filtro_centro}
         GROUP BY 1, 2
        """,  # nosec B608 - filtro fixo deste arquivo
        params,
    )
    resultado = {(l["mes"], str(l["categoria_id"])): Decimal(l["valor"]) for l in linhas}
    # Juros, multa e desconto não têm competência própria: nascem no pagamento.
    financeiras = set(_categorias_financeiras(db, org_id).values())
    caixa = _caixa_por_mes_e_categoria(db, org_id, de, ultimo_dia_do_mes(ate), centro)
    for (mes, categoria), valor in caixa.items():
        if categoria in financeiras:
            resultado[(mes, categoria)] = resultado.get((mes, categoria), ZERO) + valor
    return resultado


# ==========================================================================
# DRE
# ==========================================================================

def dre(
    ctx: Contexto,
    de: date,
    ate: date,
    regime: str = "competencia",
    centro_custo_id: str | None = None,
) -> dict:
    """DRE gerencial, mês a mês e no total do período."""
    de, ate = competencia_de(de), competencia_de(ate)
    if de > ate:
        raise RegraDeNegocio("O mês inicial é depois do final.")
    if len(meses_entre(de, ate)) > 36:
        raise RegraDeNegocio("Período máximo da DRE: 36 meses.")
    if regime not in ("competencia", "caixa"):
        raise RegraDeNegocio("Regime: competencia ou caixa.")
    meses = meses_entre(de, ate)
    with ctx.ler() as db:
        categorias = _categorias(db, ctx.org_id)
        if regime == "competencia":
            valores = _competencia_por_mes_e_categoria(db, ctx.org_id, de, ate, centro_custo_id)
        else:
            valores = _caixa_por_mes_e_categoria(db, ctx.org_id, de, ultimo_dia_do_mes(ate), centro_custo_id)
        patrimonio = {}
        if regime == "competencia":
            for mes in meses:
                patrimonio[mes] = _depreciacao(db, ctx.org_id, mes, centro_custo_id)

    def somas(filtro_mes) -> dict[str, Decimal]:
        linhas: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for (mes, categoria_id), valor in valores.items():
            if not filtro_mes(mes):
                continue
            cat = categorias[categoria_id]
            linha = GRUPOS[cat["grupo"]].linha_dre
            if linha:
                # Receita positiva, despesa positiva: o sinal é da DRE.
                linhas[linha] += valor if cat["natureza"] == "receita" else -valor
        return linhas

    colunas = []
    for mes in meses:
        dep_mes, vendas_mes = patrimonio.get(mes, (ZERO, ZERO))
        colunas.append({"mes": mes, "linhas": montar_dre(somas(lambda m, alvo=mes: m == alvo), dep_mes, vendas_mes)})
    dep_total = somar(p[0] for p in patrimonio.values())
    vendas_total = somar(p[1] for p in patrimonio.values())
    total = montar_dre(somas(lambda m: True), dep_total, vendas_total)

    por_categoria: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for (_, categoria_id), valor in valores.items():
        por_categoria[categoria_id] += valor
    detalhe = []
    for categoria_id, valor in por_categoria.items():
        cat = categorias[categoria_id]
        if GRUPOS[cat["grupo"]].linha_dre and arredondar(valor) != 0:
            detalhe.append({
                "categoria_id": categoria_id, "nome": cat["nome"], "grupo": cat["grupo"],
                "linha_dre": GRUPOS[cat["grupo"]].linha_dre, "natureza": cat["natureza"],
                "comportamento": cat["comportamento"], "valor": arredondar(valor),
            })
    detalhe.sort(key=lambda c: -abs(c["valor"]))

    return {
        "de": de,
        "ate": ate,
        "regime": regime,
        "linhas": [_linha(l) for l in total],
        "meses": [{"mes": c["mes"], "linhas": [_linha(l) for l in c["linhas"]]} for c in colunas],
        "categorias": detalhe,
        "observacao": None if regime == "competencia" else
            "No regime de caixa não há depreciação: ela não movimenta dinheiro.",
    }


def _linha(linha) -> dict:
    return {"chave": linha.chave, "rotulo": linha.rotulo, "valor": linha.valor, "tipo": linha.tipo, "percentual": linha.percentual}


def _depreciacao(db, org_id: str, mes: date, centro: str | None) -> tuple[Decimal, Decimal]:
    if centro:
        from ..dominio import depreciacao as dep

        depreciacao = resultado = ZERO
        for linha in db.todos(
            "SELECT * FROM financeiro.ativo WHERE organizacao_id = %s AND centro_custo_id = %s", (org_id, centro)
        ):
            bem = capital._bem(linha)
            depreciacao += dep.depreciacao_no_periodo(bem, mes, mes)
            if linha["baixado_em"] and linha["baixado_em"].replace(day=1) == mes:
                resultado += dep.resultado_da_baixa(bem, Decimal(linha["valor_venda"] or 0))
        return depreciacao, resultado
    return capital.depreciacao_e_vendas(db, org_id, mes, mes)


# ==========================================================================
# Fluxo de caixa realizado
# ==========================================================================

def _periodos(de: date, ate: date, agrupamento: str) -> list[tuple[date, date]]:
    periodos = []
    if agrupamento == "dia":
        dia = de
        while dia <= ate:
            periodos.append((dia, dia))
            dia += timedelta(days=1)
    elif agrupamento == "semana":
        inicio = de
        while inicio <= ate:
            fim = min(inicio + timedelta(days=6 - inicio.weekday()), ate)
            periodos.append((inicio, fim))
            inicio = fim + timedelta(days=1)
    elif agrupamento == "mes":
        for mes in meses_entre(de, ate):
            periodos.append((max(mes, de), min(ultimo_dia_do_mes(mes), ate)))
    else:
        raise RegraDeNegocio("Agrupamento: dia, semana ou mes.")
    return periodos


def fluxo_caixa(ctx: Contexto, de: date, ate: date, agrupamento: str = "mes") -> dict:
    """Entradas e saídas realizadas por período, categoria e atividade."""
    if de > ate:
        raise RegraDeNegocio("A data inicial é depois da final.")
    if (ate - de).days > 800:
        raise RegraDeNegocio("Período máximo: cerca de 2 anos.")
    periodos = _periodos(de, ate, agrupamento)
    if len(periodos) > 400:
        raise RegraDeNegocio("Período longo demais para esse agrupamento.")
    with ctx.ler() as db:
        categorias = _categorias(db, ctx.org_id)
        saldo_inicial = Decimal(db.valor(
            "SELECT COALESCE(sum(valor), 0) FROM financeiro.movimento WHERE organizacao_id = %s AND data < %s",
            (ctx.org_id, de),
        ))
        params = {"org": ctx.org_id, "de": de, "ate": ate, **_categorias_financeiras(db, ctx.org_id)}
        partes = db.todos(
            f"SELECT data, categoria_id, sum(valor) AS valor FROM ({_CAIXA_CATEGORIZADO}) x GROUP BY 1, 2",  # nosec B608 - consulta fixa
            params,
        )
        # Entradas e saídas saem dos MOVIMENTOS, e não das partes por
        # categoria: um pagamento de 400 com 10 de desconto é uma saída de
        # 390 no banco, não "400 de saída e 10 de entrada".
        dinheiro = db.todos(
            """
            SELECT data,
                   COALESCE(sum(valor) FILTER (WHERE valor > 0 AND tipo IN ('baixa', 'estorno')), 0) AS entradas,
                   COALESCE(-sum(valor) FILTER (WHERE valor < 0 AND tipo IN ('baixa', 'estorno')), 0) AS saidas,
                   COALESCE(sum(valor) FILTER (WHERE tipo IN ('ajuste', 'saldo_inicial')), 0) AS ajustes
              FROM financeiro.movimento
             WHERE organizacao_id = %s AND data BETWEEN %s AND %s
             GROUP BY 1
            """,
            (ctx.org_id, de, ate),
        )

    def indice(data: date) -> int:
        for i, (inicio, fim) in enumerate(periodos):
            if inicio <= data <= fim:
                return i
        raise AssertionError(data)

    linhas_periodo = [
        {"inicio": ini, "fim": fim, "entradas": ZERO, "saidas": ZERO, "ajustes": ZERO,
         "operacional": ZERO, "investimento": ZERO, "financiamento": ZERO}
        for ini, fim in periodos
    ]
    por_categoria: dict[str, list[Decimal]] = defaultdict(lambda: [ZERO] * len(periodos))
    for parte in partes:
        i = indice(parte["data"])
        valor = Decimal(parte["valor"])
        cat = categorias[str(parte["categoria_id"])]
        por_categoria[str(parte["categoria_id"])][i] += valor
        linhas_periodo[i][GRUPOS[cat["grupo"]].atividade] += valor
    for dia in dinheiro:
        linha = linhas_periodo[indice(dia["data"])]
        linha["entradas"] += Decimal(dia["entradas"])
        linha["saidas"] += Decimal(dia["saidas"])
        linha["ajustes"] += Decimal(dia["ajustes"])

    saldo = saldo_inicial
    for linha in linhas_periodo:
        for chave in ("entradas", "saidas", "ajustes", "operacional", "investimento", "financiamento"):
            linha[chave] = arredondar(linha[chave])
        linha["resultado"] = linha["entradas"] - linha["saidas"]
        linha["saldo_inicial"] = saldo
        saldo = saldo + linha["resultado"] + linha["ajustes"]
        linha["saldo_final"] = saldo

    ordem = {g: i for i, g in enumerate(GRUPOS)}
    detalhe = []
    for categoria_id, valores in por_categoria.items():
        cat = categorias[categoria_id]
        valores = [arredondar(v) for v in valores]
        detalhe.append({
            "categoria_id": categoria_id, "nome": cat["nome"], "grupo": cat["grupo"],
            "grupo_rotulo": GRUPOS[cat["grupo"]].rotulo, "atividade": GRUPOS[cat["grupo"]].atividade,
            "natureza": cat["natureza"], "valores": valores, "total": somar(valores),
        })
    detalhe.sort(key=lambda c: (ordem[c["grupo"]], -abs(c["total"])))
    return {
        "de": de, "ate": ate, "agrupamento": agrupamento,
        "saldo_inicial": saldo_inicial, "saldo_final": saldo,
        "periodos": linhas_periodo, "categorias": detalhe,
        "atividades": ATIVIDADES,
        "totais": {
            "entradas": somar(l["entradas"] for l in linhas_periodo),
            "saidas": somar(l["saidas"] for l in linhas_periodo),
            "ajustes": somar(l["ajustes"] for l in linhas_periodo),
            **{a: somar(l[a] for l in linhas_periodo) for a in ATIVIDADES},
        },
    }


# ==========================================================================
# Fluxo de caixa projetado
# ==========================================================================

def fluxo_projetado(ctx: Contexto, dias: int = 90, agrupamento: str = "semana", incluir_vencidos: bool = True) -> dict:
    """Para onde o saldo vai, com o que já está lançado e o que é previsível.

    Entra: parcelas em aberto, recorrências ainda não geradas, a folha dos
    meses que ainda não têm folha (estimada pela última fechada) e o 13º em
    novembro e dezembro (estimado pelos salários). O que é estimativa vem
    marcado como tal — é previsão, não compromisso.
    """
    if not 7 <= dias <= 400:
        raise RegraDeNegocio("Horizonte da projeção entre 7 e 400 dias.")
    inicio, fim = ctx.hoje, ctx.hoje + timedelta(days=dias)
    periodos = _periodos(inicio, fim, agrupamento)
    itens: list[dict] = []
    with ctx.ler() as db:
        saldo_atual = Decimal(db.valor(
            "SELECT COALESCE(sum(valor), 0) FROM financeiro.movimento WHERE organizacao_id = %s AND data <= %s",
            (ctx.org_id, ctx.hoje),
        ))
        abertas = db.todos(
            """
            SELECT p.vencimento, p.valor - p.valor_pago AS saldo, t.tipo, t.descricao, pe.nome AS pessoa_nome
              FROM financeiro.parcela p
              JOIN financeiro.titulo t ON t.id = p.titulo_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
             WHERE t.organizacao_id = %s AND p.status IN ('aberta', 'parcial') AND p.vencimento <= %s
            """,
            (ctx.org_id, fim),
        )
        vencidos = {"receber": ZERO, "pagar": ZERO}
        for p in abertas:
            valor = p["saldo"] if p["tipo"] == "receber" else -p["saldo"]
            if p["vencimento"] < ctx.hoje:
                vencidos[p["tipo"]] += p["saldo"]
                if not incluir_vencidos:
                    continue
            itens.append({
                "data": max(p["vencimento"], ctx.hoje), "valor": valor, "origem": "lancado",
                "descricao": p["descricao"] + (f" — {p['pessoa_nome']}" if p["pessoa_nome"] else ""),
                "vencido": p["vencimento"] < ctx.hoje,
            })
        for r in recorrencias.projetar(db, ctx.org_id, inicio, fim):
            itens.append({
                "data": r["data"], "valor": r["valor"] if r["tipo"] == "receber" else -r["valor"],
                "origem": "recorrencia", "descricao": r["descricao"], "vencido": False,
            })
        itens.extend(_folhas_estimadas(db, ctx.org_id, inicio, fim))

    itens.sort(key=lambda i: i["data"])
    linhas = []
    saldo = saldo_atual
    menor = {"valor": saldo_atual, "data": ctx.hoje}
    for ini, fim_periodo in periodos:
        do_periodo = [i for i in itens if ini <= i["data"] <= fim_periodo]
        entradas = somar(i["valor"] for i in do_periodo if i["valor"] > 0)
        saidas = somar(-i["valor"] for i in do_periodo if i["valor"] < 0)
        estimado = somar(abs(i["valor"]) for i in do_periodo if i["origem"] in ("folha_estimada", "decimo_terceiro"))
        inicial = saldo
        saldo = saldo + entradas - saidas
        if saldo < menor["valor"]:
            menor = {"valor": saldo, "data": fim_periodo}
        linhas.append({
            "inicio": ini, "fim": fim_periodo, "saldo_inicial": inicial, "entradas": entradas,
            "saidas": saidas, "saldo_final": saldo, "estimado": estimado,
        })
    return {
        "hoje": ctx.hoje, "ate": fim, "agrupamento": agrupamento, "saldo_atual": saldo_atual,
        "vencidos": vencidos, "incluiu_vencidos": incluir_vencidos,
        "periodos": linhas, "itens": itens[:500], "menor_saldo": menor,
    }


def _folhas_estimadas(db, org_id: str, inicio: date, fim: date) -> list[dict]:
    """Folha dos meses sem folha e 13º — as duas maiores saídas previsíveis de quem tem equipe."""
    base = db.um(
        """
        SELECT f.competencia, sum(t.valor_total) AS total FROM financeiro.folha f
          JOIN financeiro.titulo t ON t.origem = 'folha' AND t.origem_id = f.id AND t.cancelado_em IS NULL
         WHERE f.organizacao_id = %s AND f.tipo = 'mensal' AND f.status = 'fechada'
         GROUP BY f.id ORDER BY f.competencia DESC LIMIT 1
        """,
        (org_id,),
    )
    salarios = Decimal(db.valor(
        """
        SELECT COALESCE(sum(salario_base), 0) FROM financeiro.colaborador
         WHERE organizacao_id = %s AND vinculo IN ('clt', 'aprendiz')
           AND (data_desligamento IS NULL OR data_desligamento >= %s)
        """,
        (org_id, inicio),
    ))
    itens = []
    if base:
        # A folha do mês M é paga no mês M+1: projeta a de cada mês ainda sem folha.
        mes = somar_meses(base["competencia"], 1)
        while somar_meses(mes, 1) <= fim:
            pagamento = somar_meses(mes, 1).replace(day=5)
            existe = db.valor(
                "SELECT EXISTS (SELECT 1 FROM financeiro.folha WHERE organizacao_id = %s AND tipo = 'mensal' AND competencia = %s)",
                (org_id, mes),
            )
            if not existe and inicio <= pagamento <= fim:
                itens.append({
                    "data": pagamento, "valor": -Decimal(base["total"]), "origem": "folha_estimada",
                    "descricao": f"Folha {mes:%m/%Y} (estimada pela de {base['competencia']:%m/%Y})", "vencido": False,
                })
            mes = somar_meses(mes, 1)
    if salarios > 0:
        for ano in {inicio.year, fim.year}:
            for data, rotulo, fator in (
                (date(ano, 11, 30), "1ª parcela", Decimal("0.5")),
                # 2ª parcela mais FGTS e INSS do 13º, que vencem em dezembro.
                (date(ano, 12, 20), "2ª parcela e encargos", Decimal("0.58")),
            ):
                if inicio <= data <= fim:
                    itens.append({
                        "data": data, "valor": -arredondar(salarios * fator), "origem": "decimo_terceiro",
                        "descricao": f"13º salário {ano} — {rotulo} (estimativa)", "vencido": False,
                    })
    return itens


# ==========================================================================
# Inadimplência e painel
# ==========================================================================

_FAIXAS_VENCIDAS = [(1, 30, "1 a 30 dias"), (31, 60, "31 a 60 dias"), (61, 90, "61 a 90 dias"), (91, None, "Mais de 90 dias")]
_FAIXAS_A_VENCER = [(0, 30, "Até 30 dias"), (31, 60, "31 a 60 dias"), (61, None, "Mais de 60 dias")]


def inadimplencia(ctx: Contexto, tipo: str = "receber") -> dict:
    """Quanto está vencido e há quanto tempo; quem deve (ou a quem se deve) mais."""
    if tipo not in ("receber", "pagar"):
        raise RegraDeNegocio("Tipo: receber ou pagar.")
    with ctx.ler() as db:
        abertas = db.todos(
            """
            SELECT p.vencimento, p.valor - p.valor_pago AS saldo, t.pessoa_id, pe.nome AS pessoa_nome
              FROM financeiro.parcela p
              JOIN financeiro.titulo t ON t.id = p.titulo_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
             WHERE t.organizacao_id = %s AND t.tipo = %s AND p.status IN ('aberta', 'parcial')
            """,
            (ctx.org_id, tipo),
        )

    def faixa(lista, dias):
        for de, ate, rotulo in lista:
            if dias >= de and (ate is None or dias <= ate):
                return rotulo
        return lista[-1][2]

    vencidas = {r: {"rotulo": r, "valor": ZERO, "quantidade": 0} for _, _, r in _FAIXAS_VENCIDAS}
    a_vencer = {r: {"rotulo": r, "valor": ZERO, "quantidade": 0} for _, _, r in _FAIXAS_A_VENCER}
    pessoas: dict[str, dict] = {}
    for p in abertas:
        atraso = (ctx.hoje - p["vencimento"]).days
        if atraso > 0:
            alvo = vencidas[faixa(_FAIXAS_VENCIDAS, atraso)]
            chave = str(p["pessoa_id"] or "sem")
            pessoa = pessoas.setdefault(chave, {"pessoa_id": p["pessoa_id"], "nome": p["pessoa_nome"] or "(sem pessoa)",
                                                 "vencido": ZERO, "parcelas": 0, "maior_atraso": 0})
            pessoa["vencido"] += p["saldo"]
            pessoa["parcelas"] += 1
            pessoa["maior_atraso"] = max(pessoa["maior_atraso"], atraso)
        else:
            alvo = a_vencer[faixa(_FAIXAS_A_VENCER, -atraso)]
        alvo["valor"] += p["saldo"]
        alvo["quantidade"] += 1

    total_vencido = somar(f["valor"] for f in vencidas.values())
    total_aberto = somar(p["saldo"] for p in abertas)
    return {
        "tipo": tipo,
        "vencidas": list(vencidas.values()),
        "a_vencer": list(a_vencer.values()),
        "total_vencido": total_vencido,
        "total_a_vencer": total_aberto - total_vencido,
        "percentual_vencido": ind.percentual(total_vencido, total_aberto),
        "pessoas": sorted(pessoas.values(), key=lambda p: -p["vencido"])[:20],
    }


def indicadores(ctx: Contexto) -> dict:
    """Os indicadores do painel, cada um com o dado que o alimenta."""
    hoje = ctx.hoje
    tres_meses = somar_meses(hoje.replace(day=1), -3)
    with ctx.ler() as db:
        saldos = db.todos(
            """
            SELECT c.tipo, COALESCE(sum(m.valor), 0) AS saldo FROM financeiro.conta c
              LEFT JOIN financeiro.movimento m ON m.conta_id = c.id AND m.data <= %s
             WHERE c.organizacao_id = %s AND c.ativa GROUP BY c.tipo
            """,
            (hoje, ctx.org_id),
        )
        horizonte = db.um(
            """
            SELECT COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE t.tipo = 'receber'), 0) AS receber,
                   COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE t.tipo = 'pagar'), 0) AS pagar,
                   COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE t.tipo = 'receber' AND p.vencimento < %s), 0) AS receber_vencido,
                   COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE t.tipo = 'receber'), 0) AS receber_total
              FROM financeiro.parcela p JOIN financeiro.titulo t ON t.id = p.titulo_id
             WHERE t.organizacao_id = %s AND p.status IN ('aberta', 'parcial') AND p.vencimento <= %s
            """,
            (hoje, ctx.org_id, hoje + timedelta(days=90)),
        )
        saidas = db.todos(
            """
            SELECT date_trunc('month', data)::date AS mes, -sum(valor) AS saidas
              FROM financeiro.movimento
             WHERE organizacao_id = %s AND tipo IN ('baixa', 'estorno') AND valor < 0
               AND data >= %s AND data < %s
             GROUP BY 1
            """,
            (ctx.org_id, tres_meses, hoje.replace(day=1)),
        )
        prazos = db.todos(
            """
            SELECT t.tipo, t.data_emissao, b.data, b.valor FROM financeiro.baixa b
              JOIN financeiro.parcela p ON p.id = b.parcela_id
              JOIN financeiro.titulo t ON t.id = p.titulo_id
             WHERE t.organizacao_id = %s AND b.estornada_em IS NULL AND b.data >= %s AND t.origem = 'manual'
            """,
            (ctx.org_id, hoje - timedelta(days=90)),
        )
    disponivel = somar(s["saldo"] for s in saldos if s["tipo"] != "cartao_credito")
    cartao = somar(s["saldo"] for s in saldos if s["tipo"] == "cartao_credito")
    # Ponto de equilíbrio pelos três meses fechados mais recentes. Receita
    # BRUTA, porque os impostos sobre o faturamento já entram como custo
    # variável — pela líquida, seriam descontados duas vezes.
    dre_recente = dre(ctx, tres_meses, somar_meses(hoje.replace(day=1), -1))
    receita = next(l["valor"] for l in dre_recente["linhas"] if l["chave"] == "receita_bruta")
    variaveis = somar(-c["valor"] for c in dre_recente["categorias"]
                      if c["natureza"] == "despesa" and c["comportamento"] == "variavel")
    fixos = somar(-c["valor"] for c in dre_recente["categorias"]
                  if c["natureza"] == "despesa" and c["comportamento"] == "fixo")
    equilibrio_trimestre = ind.ponto_de_equilibrio(receita, variaveis, fixos)
    return {
        "disponivel": disponivel,
        "cartao_credito": cartao,
        "a_receber_90_dias": horizonte["receber"],
        "a_pagar_90_dias": horizonte["pagar"],
        "capital_de_giro": ind.capital_de_giro(disponivel + cartao, horizonte["receber"], horizonte["pagar"]),
        "folego_meses": ind.folego_de_caixa(disponivel, [Decimal(s["saidas"]) for s in saidas]),
        "inadimplencia_percentual": ind.percentual(horizonte["receber_vencido"], horizonte["receber_total"]),
        "prazo_medio_recebimento": ind.prazo_medio([(p["data_emissao"], p["data"], p["valor"]) for p in prazos if p["tipo"] == "receber"]),
        "prazo_medio_pagamento": ind.prazo_medio([(p["data_emissao"], p["data"], p["valor"]) for p in prazos if p["tipo"] == "pagar"]),
        "ponto_de_equilibrio_mensal": arredondar(equilibrio_trimestre / 3) if equilibrio_trimestre is not None else None,
        "receita_media_mensal": arredondar(receita / 3),
    }


def painel(ctx: Contexto) -> dict:
    """A visão geral: o que a pessoa precisa saber ao abrir o financeiro."""
    from . import cadastros, titulos

    hoje = ctx.hoje
    mes = hoje.replace(day=1)
    contas = [c for c in cadastros.listar_contas(ctx) if c["ativa"]]
    resultado_mes = dre(ctx, mes, mes)
    linha = {l["chave"]: l["valor"] for l in resultado_mes["linhas"]}
    receitas = somar(c["valor"] for c in resultado_mes["categorias"] if c["natureza"] == "receita")
    despesas = somar(-c["valor"] for c in resultado_mes["categorias"] if c["natureza"] == "despesa")
    realizado = fluxo_caixa(ctx, somar_meses(mes, -5), hoje, "mes")
    projetado = fluxo_projetado(ctx, 180, "mes")

    with ctx.ler() as db:
        proximos = db.todos(
            """
            SELECT p.id, t.id AS titulo_id, t.tipo, t.descricao, pe.nome AS pessoa_nome, p.vencimento,
                   p.valor - p.valor_pago AS saldo, p.vencimento < %s AS vencida
              FROM financeiro.parcela p
              JOIN financeiro.titulo t ON t.id = p.titulo_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
             WHERE t.organizacao_id = %s AND p.status IN ('aberta', 'parcial') AND p.vencimento <= %s
             ORDER BY p.vencimento, t.descricao LIMIT 10
            """,
            (hoje, ctx.org_id, hoje + timedelta(days=15)),
        )
        alertas = _alertas(db, ctx, projetado)
        fechado = db.valor("SELECT fechado_ate FROM financeiro.organizacao WHERE id = %s", (ctx.org_id,))

    grafico = [
        {"mes": p["inicio"].replace(day=1), "entradas": p["entradas"], "saidas": p["saidas"], "tipo": "realizado"}
        for p in realizado["periodos"]
    ]
    for p in projetado["periodos"]:
        if p["inicio"].replace(day=1) == mes:
            # O mês corrente: o realizado até hoje mais o previsto até o fim do mês.
            grafico[-1]["entradas_previstas"] = p["entradas"]
            grafico[-1]["saidas_previstas"] = p["saidas"]
            continue
        grafico.append({"mes": p["inicio"].replace(day=1), "entradas": p["entradas"], "saidas": p["saidas"], "tipo": "projetado"})

    return {
        "hoje": hoje,
        "fechado_ate": fechado,
        "contas": contas,
        "saldo_total": somar(c["saldo"] for c in contas),
        "receber": titulos.resumo(ctx, "receber"),
        "pagar": titulos.resumo(ctx, "pagar"),
        "resultado_mes": {
            "receitas": receitas, "despesas": despesas, "resultado": linha["lucro_liquido"], "mes": mes,
        },
        "grafico": grafico,
        "menor_saldo_projetado": projetado["menor_saldo"],
        "indicadores": indicadores(ctx),
        "proximos_vencimentos": proximos,
        "alertas": alertas,
    }


def _alertas(db, ctx: Contexto, projetado: dict) -> list[dict]:
    alertas = []
    hoje = ctx.hoje
    if projetado["menor_saldo"]["valor"] < 0:
        alertas.append({
            "nivel": "critico",
            "mensagem": f"O saldo projetado fica negativo até {projetado['menor_saldo']['data']:%d/%m/%Y} "
                        f"(R$ {projetado['menor_saldo']['valor']:.2f}).",
            "area": "relatorios",
        })
    vencidas = db.um(
        """
        SELECT count(*) FILTER (WHERE t.tipo = 'pagar') AS pagar, count(*) FILTER (WHERE t.tipo = 'receber') AS receber
          FROM financeiro.parcela p JOIN financeiro.titulo t ON t.id = p.titulo_id
         WHERE t.organizacao_id = %s AND p.status IN ('aberta', 'parcial') AND p.vencimento < %s
        """,
        (ctx.org_id, hoje),
    )
    if vencidas["pagar"]:
        alertas.append({"nivel": "atencao", "mensagem": f"{vencidas['pagar']} conta(s) a pagar vencida(s).", "area": "pagar"})
    if vencidas["receber"]:
        alertas.append({"nivel": "atencao", "mensagem": f"{vencidas['receber']} recebimento(s) em atraso.", "area": "receber"})

    mes_passado = somar_meses(hoje.replace(day=1), -1)
    tem_equipe = db.valor(
        """
        SELECT EXISTS (SELECT 1 FROM financeiro.colaborador WHERE organizacao_id = %s
                        AND vinculo IN ('clt', 'aprendiz', 'estagio', 'prolabore')
                        AND data_admissao <= %s AND (data_desligamento IS NULL OR data_desligamento >= %s))
        """,
        (ctx.org_id, ultimo_dia_do_mes(mes_passado), mes_passado),
    )
    if tem_equipe:
        folha = db.valor(
            "SELECT status FROM financeiro.folha WHERE organizacao_id = %s AND tipo = 'mensal' AND competencia = %s",
            (ctx.org_id, mes_passado),
        )
        if folha != "fechada":
            alertas.append({
                "nivel": "atencao",
                "mensagem": f"A folha de {mes_passado:%m/%Y} ainda não foi fechada." if folha
                            else f"Não há folha de {mes_passado:%m/%Y}.",
                "area": "pessoal",
            })
    pendentes = db.um(
        """
        SELECT count(*) AS quantidade, min(data) AS desde FROM financeiro.extrato_linha
         WHERE organizacao_id = %s AND status = 'pendente'
        """,
        (ctx.org_id,),
    )
    if pendentes["quantidade"]:
        alertas.append({
            "nivel": "info",
            "mensagem": f"{pendentes['quantidade']} linha(s) de extrato para conciliar, desde {pendentes['desde']:%d/%m/%Y}.",
            "area": "conciliacao",
        })
    fechado = db.valor("SELECT fechado_ate FROM financeiro.organizacao WHERE id = %s", (ctx.org_id,))
    limite_sugerido = mes_passado - timedelta(days=1)  # fim do mês retrasado
    tem_movimento_antigo = db.valor(
        "SELECT EXISTS (SELECT 1 FROM financeiro.movimento WHERE organizacao_id = %s AND data <= %s)",
        (ctx.org_id, limite_sugerido),
    )
    if tem_movimento_antigo and (fechado is None or fechado < limite_sugerido):
        alertas.append({
            "nivel": "info",
            "mensagem": f"Os meses até {limite_sugerido:%m/%Y} ainda estão abertos. Fechar impede alteração retroativa.",
            "area": "configuracoes",
        })
    return alertas
