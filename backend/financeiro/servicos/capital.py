"""Capital: sócios, empréstimos, investimentos e patrimônio.

Cada operação aqui é um contrato mais o dinheiro dele. O dinheiro passa por
títulos e baixas como qualquer outro — o aporte do sócio aparece no extrato
do banco, a parcela do empréstimo aparece em contas a pagar —, com categorias
do sistema que tiram da DRE o que não é resultado (aporte, amortização,
compra de bem) e põem nela o que é (juros, depreciação, rendimento).
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from ..dominio import depreciacao as dep
from ..dominio import emprestimo as emp
from ..dominio.calendario import competencia as competencia_de
from ..dominio.dinheiro import ZERO, arredondar, dinheiro, somar
from ..erros import NaoEncontrado, RegraDeNegocio
from .contexto import Contexto
from .titulos import ParcelaNova, RateioNovo, _baixar, _cancelar, _inserir_titulo
from .util import categoria_do_sistema, exigir_da_empresa, exigir_periodo_aberto, texto

# ==========================================================================
# Sócios
# ==========================================================================

OPERACOES_DE_SOCIO = {
    # operação: (tipo do título, categoria do sistema, rótulo)
    "integralizacao": ("receber", "capital.integralizacao", "Integralização de capital"),
    "aporte": ("receber", "capital.aporte", "Aporte de sócio"),
    "distribuicao": ("pagar", "capital.distribuicao", "Distribuição de lucros"),
    "devolucao": ("pagar", "capital.devolucao", "Devolução de capital"),
}


def listar_socios(ctx: Contexto) -> dict:
    with ctx.ler() as db:
        socios = db.todos(
            """
            SELECT s.*, p.nome, p.documento,
                   COALESCE(sum(b.valor) FILTER (WHERE c.sistema = 'capital.integralizacao'), 0) AS integralizado,
                   COALESCE(sum(b.valor) FILTER (WHERE c.sistema = 'capital.aporte'), 0) AS aportes,
                   COALESCE(sum(b.valor) FILTER (WHERE c.sistema = 'capital.distribuicao'), 0) AS distribuido,
                   COALESCE(sum(b.valor) FILTER (WHERE c.sistema = 'capital.devolucao'), 0) AS devolvido
              FROM financeiro.socio s
              JOIN financeiro.pessoa p ON p.id = s.pessoa_id
              LEFT JOIN financeiro.titulo t ON t.organizacao_id = s.organizacao_id AND t.origem = 'capital'
                                          AND t.origem_id = s.id AND t.cancelado_em IS NULL
              LEFT JOIN financeiro.rateio r ON r.titulo_id = t.id
              LEFT JOIN financeiro.categoria c ON c.id = r.categoria_id
              LEFT JOIN financeiro.parcela pa ON pa.titulo_id = t.id
              LEFT JOIN financeiro.baixa b ON b.parcela_id = pa.id AND b.estornada_em IS NULL
             WHERE s.organizacao_id = %s
             GROUP BY s.id, p.nome, p.documento
             ORDER BY s.data_saida NULLS FIRST, s.participacao DESC
            """,
            (ctx.org_id,),
        )
        org = db.um("SELECT capital_social FROM financeiro.organizacao WHERE id = %s", (ctx.org_id,))
    ativos = [s for s in socios if s["data_saida"] is None or s["data_saida"] >= ctx.hoje]
    participacao = sum((s["participacao"] for s in ativos), Decimal(0))
    subscrito = somar(s["capital_subscrito"] for s in ativos)
    integralizado = somar(s["integralizado"] - s["devolvido"] for s in socios)
    avisos = []
    if ativos and participacao != 100:
        avisos.append(f"As participações dos sócios ativos somam {participacao}%, não 100%.")
    if org["capital_social"] and subscrito and org["capital_social"] != subscrito:
        avisos.append("O capital subscrito pelos sócios difere do capital social cadastrado da empresa.")
    return {
        "socios": socios,
        "capital_social": org["capital_social"],
        "capital_subscrito": subscrito,
        "capital_integralizado": integralizado,
        "a_integralizar": max(ZERO, subscrito - integralizado),
        "avisos": avisos,
    }


def salvar_socio(ctx: Contexto, dados: dict, socio_id: str | None = None) -> dict:
    with ctx.escrever() as db:
        campos = {}
        if dados.get("participacao") is not None:
            campos["participacao"] = Decimal(str(dados["participacao"]))
            if not 0 < campos["participacao"] <= 100:
                raise RegraDeNegocio("Participação entre 0 e 100%.")
        if dados.get("capital_subscrito") is not None:
            campos["capital_subscrito"] = dinheiro(dados["capital_subscrito"])
        for campo in ("data_entrada", "data_saida"):
            if campo in dados:
                campos[campo] = dados[campo]
        if socio_id:
            exigir_da_empresa(db, "socio", ctx.org_id, socio_id, "Sócio")
            if campos:
                atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
                db.executar(
                    f"UPDATE financeiro.socio SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - colunas fixas
                    {**campos, "id": socio_id},
                )
        else:
            pessoa_id = dados.get("pessoa_id")
            exigir_da_empresa(db, "pessoa", ctx.org_id, pessoa_id, "Pessoa")
            if "participacao" not in campos:
                raise RegraDeNegocio("Informe a participação do sócio.")
            campos.setdefault("data_entrada", ctx.hoje)
            colunas = ", ".join(["organizacao_id", "pessoa_id", *campos])
            marcas = ", ".join(["%(organizacao_id)s", "%(pessoa_id)s", *(f"%({c})s" for c in campos)])
            db.executar(
                f"INSERT INTO financeiro.socio ({colunas}) VALUES ({marcas})",  # nosec B608 - colunas fixas
                {**campos, "organizacao_id": ctx.org_id, "pessoa_id": pessoa_id},
            )
    return listar_socios(ctx)


def operacao_de_socio(ctx: Contexto, socio_id: str, dados: dict) -> dict:
    """Aporte, integralização, distribuição de lucros ou devolução de capital.

    Com `conta_id`, o dinheiro entra (ou sai) na hora; sem, fica como conta a
    receber (ou a pagar) com o vencimento informado.
    """
    operacao = dados.get("operacao")
    if operacao not in OPERACOES_DE_SOCIO:
        raise RegraDeNegocio("Operação: integralizacao, aporte, distribuicao ou devolucao.")
    tipo, categoria, rotulo = OPERACOES_DE_SOCIO[operacao]
    valor = dinheiro(dados.get("valor"))
    if valor <= 0:
        raise RegraDeNegocio("O valor deve ser maior que zero.")
    data = dados.get("data") or ctx.hoje
    with ctx.escrever() as db:
        socio = exigir_da_empresa(db, "socio", ctx.org_id, socio_id, "Sócio")
        nome = db.valor("SELECT nome FROM financeiro.pessoa WHERE id = %s", (socio["pessoa_id"],))
        titulo_id = _inserir_titulo(
            db, ctx.org_id, ctx.autor,
            tipo=tipo, descricao=texto(dados.get("descricao")) or f"{rotulo} — {nome}",
            competencia=competencia_de(data),
            parcelas=[ParcelaNova(dados.get("vencimento") or data, valor)],
            rateio=[RateioNovo(categoria_do_sistema(db, ctx.org_id, categoria), None, valor)],
            pessoa_id=str(socio["pessoa_id"]), data_emissao=data,
            origem="capital", origem_id=socio_id,
        )
        if dados.get("conta_id"):
            parcela_id = db.valor("SELECT id FROM financeiro.parcela WHERE titulo_id = %s", (titulo_id,))
            _baixar(db, ctx.org_id, ctx.autor, str(parcela_id), dados["conta_id"], data, forma=dados.get("forma") or "transferencia")
    return listar_socios(ctx)


def resumo_do_capital(ctx: Contexto) -> dict:
    """O quadro do "capital" da empresa num lugar só."""
    from . import relatorios

    socios = listar_socios(ctx)
    with ctx.ler() as db:
        inicio = db.valor(
            "SELECT least(min(competencia), %s) FROM financeiro.titulo WHERE organizacao_id = %s AND cancelado_em IS NULL",
            (ctx.hoje.replace(day=1), ctx.org_id),
        ) or ctx.hoje.replace(day=1)
    dre = relatorios.dre(ctx, inicio, ctx.hoje.replace(day=1))
    lucro_acumulado = next(l["valor"] for l in dre["linhas"] if l["chave"] == "lucro_liquido")
    distribuido = somar(s["distribuido"] for s in socios["socios"])
    return {
        **{k: v for k, v in socios.items() if k != "socios"},
        "resultado_acumulado": lucro_acumulado,
        "distribuido": distribuido,
        "lucros_a_distribuir": lucro_acumulado - distribuido,
        "emprestimos": listar_emprestimos(ctx)["totais"],
        "investimentos": listar_investimentos(ctx)["total"],
        "patrimonio": listar_ativos(ctx)["totais"],
    }


# ==========================================================================
# Empréstimos
# ==========================================================================

def simular(dados: dict) -> dict:
    parcelas = emp.cronograma(
        dados.get("sistema") or "price", dados.get("valor_principal"), dados.get("taxa_mensal") or 0,
        int(dados.get("prazo") or 0), dados.get("primeiro_vencimento"),
        int(dados.get("carencia") or 0), dados.get("juros_na_carencia") or "pagos",
    )
    return {"parcelas": [p.__dict__ for p in parcelas], **emp.custo_total(parcelas)}


def criar_emprestimo(ctx: Contexto, dados: dict) -> dict:
    """Registra o contrato, a entrada do dinheiro e as parcelas a pagar."""
    principal = dinheiro(dados.get("valor_principal"))
    custos = dinheiro(dados.get("custos_iniciais") or 0)
    contratacao = dados.get("data_contratacao") or ctx.hoje
    try:
        parcelas = emp.cronograma(
            dados.get("sistema") or "price", principal, dados.get("taxa_mensal") or 0,
            int(dados.get("prazo") or 0), dados.get("primeiro_vencimento"),
            int(dados.get("carencia") or 0), dados.get("juros_na_carencia") or "pagos",
        )
    except (ValueError, TypeError) as exc:
        raise RegraDeNegocio(str(exc)) from exc
    with ctx.escrever() as db:
        credor = exigir_da_empresa(db, "pessoa", ctx.org_id, dados.get("pessoa_id"), "Credor")
        conta = exigir_da_empresa(db, "conta", ctx.org_id, dados.get("conta_id"), "Conta")
        centro = dados.get("centro_custo_id") or None
        exigir_periodo_aberto(db, ctx.org_id, contratacao, "A contratação")
        emp_id = str(db.valor(
            """
            INSERT INTO financeiro.emprestimo
              (organizacao_id, pessoa_id, conta_id, centro_custo_id, descricao, sistema, valor_principal,
               taxa_mensal, prazo, carencia, juros_na_carencia, data_contratacao, primeiro_vencimento,
               custos_iniciais, criado_por)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (ctx.org_id, credor["id"], conta["id"], centro, texto(dados.get("descricao")) or f"Empréstimo {credor['nome']}",
             dados.get("sistema") or "price", principal, dados.get("taxa_mensal") or 0, int(dados["prazo"]),
             int(dados.get("carencia") or 0), dados.get("juros_na_carencia") or "pagos", contratacao,
             dados["primeiro_vencimento"], custos, ctx.autor),
        ))
        descricao = texto(dados.get("descricao")) or f"Empréstimo {credor['nome']}"
        cat = {c: categoria_do_sistema(db, ctx.org_id, c) for c in
               ("emprestimo.captacao", "emprestimo.juros", "emprestimo.amortizacao", "emprestimo.custos")}

        # 1. O dinheiro entra: título a receber do banco, já recebido na conta.
        entrada = _inserir_titulo(
            db, ctx.org_id, ctx.autor, tipo="receber", descricao=f"Liberação — {descricao}",
            competencia=competencia_de(contratacao), parcelas=[ParcelaNova(contratacao, principal)],
            rateio=[RateioNovo(cat["emprestimo.captacao"], centro, principal)], pessoa_id=str(credor["id"]),
            data_emissao=contratacao, origem="emprestimo", origem_id=emp_id, origem_chave=f"emp:{emp_id}:liberacao",
        )
        parcela_entrada = db.valor("SELECT id FROM financeiro.parcela WHERE titulo_id = %s", (entrada,))
        _baixar(db, ctx.org_id, ctx.autor, str(parcela_entrada), str(conta["id"]), contratacao, forma="transferencia")

        # 2. IOF e tarifas descontados na liberação.
        if custos > 0:
            custo_id = _inserir_titulo(
                db, ctx.org_id, ctx.autor, tipo="pagar", descricao=f"IOF e tarifas — {descricao}",
                competencia=competencia_de(contratacao), parcelas=[ParcelaNova(contratacao, custos)],
                rateio=[RateioNovo(cat["emprestimo.custos"], centro, custos)], pessoa_id=str(credor["id"]),
                data_emissao=contratacao, origem="emprestimo", origem_id=emp_id, origem_chave=f"emp:{emp_id}:custos",
            )
            parcela_custo = db.valor("SELECT id FROM financeiro.parcela WHERE titulo_id = %s", (custo_id,))
            _baixar(db, ctx.org_id, ctx.autor, str(parcela_custo), str(conta["id"]), contratacao, forma="debito_automatico")

        # 3. Uma conta a pagar por parcela, juros e amortização separados.
        for p in parcelas:
            if p.valor <= 0:
                continue  # carência capitalizada: não há pagamento no mês
            rateio = []
            if p.amortizacao > 0:
                rateio.append(RateioNovo(cat["emprestimo.amortizacao"], centro, p.amortizacao))
            if p.juros > 0:
                rateio.append(RateioNovo(cat["emprestimo.juros"], centro, p.juros))
            _inserir_titulo(
                db, ctx.org_id, ctx.autor, tipo="pagar",
                descricao=f"{descricao} — parcela {p.numero}/{len(parcelas)}",
                competencia=competencia_de(p.vencimento), parcelas=[ParcelaNova(p.vencimento, p.valor)],
                rateio=rateio, pessoa_id=str(credor["id"]), data_emissao=contratacao,
                origem="emprestimo", origem_id=emp_id, origem_chave=f"emp:{emp_id}:{p.numero}",
            )
    return obter_emprestimo(ctx, emp_id)


def listar_emprestimos(ctx: Contexto) -> dict:
    with ctx.ler() as db:
        linhas = db.todos(
            """
            SELECT e.*, p.nome AS credor_nome, c.nome AS conta_nome,
                   (SELECT count(*) FROM financeiro.titulo t JOIN financeiro.parcela pa ON pa.titulo_id = t.id
                     WHERE t.origem = 'emprestimo' AND t.origem_id = e.id AND t.tipo = 'pagar'
                       AND t.origem_chave NOT LIKE '%%:custos' AND t.cancelado_em IS NULL) AS parcelas,
                   (SELECT count(*) FROM financeiro.titulo t JOIN financeiro.parcela pa ON pa.titulo_id = t.id
                     WHERE t.origem = 'emprestimo' AND t.origem_id = e.id AND t.tipo = 'pagar'
                       AND t.origem_chave NOT LIKE '%%:custos' AND pa.status = 'paga') AS parcelas_pagas,
                   (SELECT min(pa.vencimento) FROM financeiro.titulo t JOIN financeiro.parcela pa ON pa.titulo_id = t.id
                     WHERE t.origem = 'emprestimo' AND t.origem_id = e.id AND t.tipo = 'pagar'
                       AND pa.status IN ('aberta', 'parcial')) AS proximo_vencimento,
                   (SELECT COALESCE(sum(r.valor * (pa.valor - pa.valor_pago) / pa.valor), 0)
                      FROM financeiro.titulo t
                      JOIN financeiro.parcela pa ON pa.titulo_id = t.id
                      JOIN financeiro.rateio r ON r.titulo_id = t.id
                      JOIN financeiro.categoria c2 ON c2.id = r.categoria_id AND c2.sistema = 'emprestimo.amortizacao'
                     WHERE t.origem = 'emprestimo' AND t.origem_id = e.id AND t.cancelado_em IS NULL
                       AND pa.status IN ('aberta', 'parcial')) AS saldo_devedor
              FROM financeiro.emprestimo e
              JOIN financeiro.pessoa p ON p.id = e.pessoa_id
              JOIN financeiro.conta c ON c.id = e.conta_id
             WHERE e.organizacao_id = %s
             ORDER BY e.cancelado_em NULLS FIRST, e.data_contratacao DESC
            """,
            (ctx.org_id,),
        )
    ativos = [l for l in linhas if not l["cancelado_em"]]
    for linha in linhas:
        linha["saldo_devedor"] = dinheiro(linha["saldo_devedor"])
    return {
        "itens": linhas,
        "totais": {
            "contratos": len(ativos),
            "saldo_devedor": somar(l["saldo_devedor"] for l in ativos),
            "principal": somar(l["valor_principal"] for l in ativos),
        },
    }


def obter_emprestimo(ctx: Contexto, emp_id: str) -> dict:
    emprestimo = next((e for e in listar_emprestimos(ctx)["itens"] if str(e["id"]) == str(emp_id)), None)
    if not emprestimo:
        raise NaoEncontrado("Empréstimo não encontrado.")
    with ctx.ler() as db:
        emprestimo["cronograma"] = db.todos(
            """
            SELECT t.id AS titulo_id, t.descricao, pa.id AS parcela_id, pa.vencimento, pa.valor, pa.valor_pago,
                   pa.status, (pa.status IN ('aberta', 'parcial') AND pa.vencimento < %s) AS vencida,
                   COALESCE(sum(r.valor) FILTER (WHERE c.sistema = 'emprestimo.juros'), 0) AS juros,
                   COALESCE(sum(r.valor) FILTER (WHERE c.sistema = 'emprestimo.amortizacao'), 0) AS amortizacao
              FROM financeiro.titulo t
              JOIN financeiro.parcela pa ON pa.titulo_id = t.id
              JOIN financeiro.rateio r ON r.titulo_id = t.id
              JOIN financeiro.categoria c ON c.id = r.categoria_id
             WHERE t.organizacao_id = %s AND t.origem = 'emprestimo' AND t.origem_id = %s
               AND t.tipo = 'pagar' AND t.origem_chave NOT LIKE '%%:custos'
             GROUP BY t.id, pa.id
             ORDER BY pa.vencimento
            """,
            (ctx.hoje, ctx.org_id, emp_id),
        )
    emprestimo["juros_totais"] = somar(p["juros"] for p in emprestimo["cronograma"])
    return emprestimo


def cancelar_emprestimo(ctx: Contexto, emp_id: str, motivo: str) -> dict:
    """Desfaz um contrato lançado por engano: só enquanto nenhuma parcela foi paga."""
    motivo = texto(motivo)
    if not motivo:
        raise RegraDeNegocio("Informe o motivo.")
    with ctx.escrever(motivo) as db:
        emprestimo = exigir_da_empresa(db, "emprestimo", ctx.org_id, emp_id, "Empréstimo")
        if emprestimo["cancelado_em"]:
            raise RegraDeNegocio("Empréstimo já cancelado.")
        titulos = db.todos(
            """
            SELECT t.id, t.origem_chave FROM financeiro.titulo t
             WHERE t.organizacao_id = %s AND t.origem = 'emprestimo' AND t.origem_id = %s AND t.cancelado_em IS NULL
            """,
            (ctx.org_id, emp_id),
        )
        parcela_paga = db.valor(
            """
            SELECT EXISTS (SELECT 1 FROM financeiro.titulo t
                             JOIN financeiro.parcela pa ON pa.titulo_id = t.id
                             JOIN financeiro.baixa b ON b.parcela_id = pa.id AND b.estornada_em IS NULL
                            WHERE t.origem = 'emprestimo' AND t.origem_id = %s
                              AND t.origem_chave NOT LIKE '%%:liberacao' AND t.origem_chave NOT LIKE '%%:custos')
            """,
            (emp_id,),
        )
        if parcela_paga:
            raise RegraDeNegocio("Já há parcela paga deste empréstimo. Estorne os pagamentos antes.")
        # A liberação e os custos foram baixados na criação: estorna e cancela.
        for titulo in titulos:
            for baixa in db.todos(
                """
                SELECT b.id, m.conta_id, m.valor, m.descricao FROM financeiro.baixa b
                  JOIN financeiro.parcela pa ON pa.id = b.parcela_id
                  JOIN financeiro.movimento m ON m.baixa_id = b.id AND m.tipo = 'baixa'
                 WHERE pa.titulo_id = %s AND b.estornada_em IS NULL
                """,
                (titulo["id"],),
            ):
                exigir_periodo_aberto(db, ctx.org_id, ctx.hoje, "O estorno")
                db.executar("UPDATE financeiro.baixa SET estornada_em = now(), motivo_estorno = %s WHERE id = %s", (motivo, baixa["id"]))
                db.executar(
                    """
                    INSERT INTO financeiro.movimento (organizacao_id, conta_id, data, valor, tipo, descricao, baixa_id, criado_por)
                    VALUES (%s, %s, %s, %s, 'estorno', %s, %s, %s)
                    """,
                    (ctx.org_id, baixa["conta_id"], ctx.hoje, -baixa["valor"], f"Estorno — {baixa['descricao']}"[:300], baixa["id"], ctx.autor),
                )
            _cancelar(db, str(titulo["id"]), f"Empréstimo cancelado: {motivo}")
        db.executar(
            "UPDATE financeiro.emprestimo SET cancelado_em = now(), motivo_cancelamento = %s WHERE id = %s",
            (motivo, emp_id),
        )
    return obter_emprestimo(ctx, emp_id)


# ==========================================================================
# Investimentos
# ==========================================================================

def listar_investimentos(ctx: Contexto) -> dict:
    with ctx.ler() as db:
        contas = db.todos(
            """
            SELECT c.id, c.nome, c.banco, c.ativa,
                   COALESCE(sum(m.valor) FILTER (WHERE m.data <= %(hoje)s), 0) AS saldo,
                   COALESCE(sum(m.valor) FILTER (WHERE m.tipo = 'transferencia' AND m.valor > 0), 0) AS aplicado,
                   COALESCE(sum(-m.valor) FILTER (WHERE m.tipo = 'transferencia' AND m.valor < 0), 0) AS resgatado
              FROM financeiro.conta c
              LEFT JOIN financeiro.movimento m ON m.conta_id = c.id
             WHERE c.organizacao_id = %(org)s AND c.tipo = 'investimento'
             GROUP BY c.id ORDER BY c.ativa DESC, c.nome
            """,
            {"org": ctx.org_id, "hoje": ctx.hoje},
        )
        rendimentos = {
            str(l["conta_id"]): l["valor"]
            for l in db.todos(
                """
                SELECT b.conta_id, sum(CASE WHEN t.tipo = 'receber' THEN b.valor ELSE -b.valor END) AS valor
                  FROM financeiro.baixa b
                  JOIN financeiro.parcela p ON p.id = b.parcela_id
                  JOIN financeiro.titulo t ON t.id = p.titulo_id
                 WHERE t.organizacao_id = %s AND t.origem = 'investimento' AND b.estornada_em IS NULL
                 GROUP BY b.conta_id
                """,
                (ctx.org_id,),
            )
        }
    for conta in contas:
        conta["rendimento_acumulado"] = rendimentos.get(str(conta["id"]), ZERO)
    return {"contas": contas, "total": somar(c["saldo"] for c in contas if c["ativa"])}


def atualizar_investimento(ctx: Contexto, conta_id: str, dados: dict) -> dict:
    """Informe o saldo que o banco mostra; a diferença vira rendimento (ou perda).

    É o jeito prático de acompanhar aplicação: ninguém lança o rendimento
    diário do CDB, mas todo mês dá para olhar o saldo e registrá-lo.
    """
    informado = dinheiro(dados.get("saldo_informado"))
    data = dados.get("data") or ctx.hoje
    with ctx.escrever("Atualização de investimento") as db:
        conta = exigir_da_empresa(db, "conta", ctx.org_id, conta_id, "Conta")
        if conta["tipo"] != "investimento":
            raise RegraDeNegocio("Só conta do tipo investimento tem rendimento atualizado assim.")
        atual = Decimal(db.valor(
            "SELECT COALESCE(sum(valor), 0) FROM financeiro.movimento WHERE conta_id = %s AND data <= %s",
            (conta_id, data),
        ))
        diferenca = informado - atual
        if diferenca == 0:
            raise RegraDeNegocio("O saldo já é esse.")
        ganho = diferenca > 0
        valor = abs(diferenca)
        titulo_id = _inserir_titulo(
            db, ctx.org_id, ctx.autor,
            tipo="receber" if ganho else "pagar",
            descricao=f"{'Rendimento' if ganho else 'Perda'} — {conta['nome']} ({data:%m/%Y})",
            competencia=competencia_de(data), parcelas=[ParcelaNova(data, valor)],
            rateio=[RateioNovo(categoria_do_sistema(db, ctx.org_id, "investimento.rendimento" if ganho else "investimento.perda"), None, valor)],
            data_emissao=data, origem="investimento", origem_id=conta_id,
        )
        parcela_id = db.valor("SELECT id FROM financeiro.parcela WHERE titulo_id = %s", (titulo_id,))
        _baixar(db, ctx.org_id, ctx.autor, str(parcela_id), conta_id, data, forma="outro")
    return {"diferenca": diferenca, "saldo": informado}


# ==========================================================================
# Patrimônio
# ==========================================================================

def _bem(linha: dict) -> dep.Bem:
    return dep.Bem(
        valor_aquisicao=Decimal(linha["valor_aquisicao"]),
        valor_residual=Decimal(linha["valor_residual"]),
        vida_util_meses=linha["vida_util_meses"],
        inicio_uso=linha["inicio_uso"],
        baixado_em=linha["baixado_em"],
    )


def listar_ativos(ctx: Contexto, incluir_baixados: bool = True) -> dict:
    with ctx.ler() as db:
        linhas = db.todos(
            """
            SELECT a.*, cc.nome AS centro_custo_nome FROM financeiro.ativo a
              LEFT JOIN financeiro.centro_custo cc ON cc.id = a.centro_custo_id
             WHERE a.organizacao_id = %s AND (%s OR a.baixado_em IS NULL)
             ORDER BY a.baixado_em NULLS FIRST, a.data_aquisicao DESC
            """,
            (ctx.org_id, incluir_baixados),
        )
    for linha in linhas:
        bem = _bem(linha)
        contabil = dep.valor_contabil_em(bem, linha["baixado_em"] or ctx.hoje)
        linha["valor_contabil"] = contabil
        linha["depreciacao_acumulada"] = bem.valor_aquisicao - contabil
        linha["depreciacao_mensal"] = (
            arredondar(bem.depreciavel / bem.vida_util_meses) if bem.vida_util_meses else ZERO
        )
        linha["classe_rotulo"] = dep.CLASSES[linha["classe"]][0]
    ativos = [l for l in linhas if not l["baixado_em"]]
    return {
        "itens": linhas,
        "totais": {
            "bens": len(ativos),
            "valor_aquisicao": somar(l["valor_aquisicao"] for l in ativos),
            "depreciacao_acumulada": somar(l["depreciacao_acumulada"] for l in ativos),
            "valor_contabil": somar(l["valor_contabil"] for l in ativos),
            "depreciacao_mensal": somar(l["depreciacao_mensal"] for l in ativos),
        },
        "classes": {chave: {"rotulo": r, "vida_util_sugerida": v} for chave, (r, v) in dep.CLASSES.items()},
    }


def criar_ativo(ctx: Contexto, dados: dict) -> dict:
    """Cadastra o bem; com `compra`, gera também a conta a pagar (ou já paga)."""
    classe = dados.get("classe") or "outro"
    if classe not in dep.CLASSES:
        raise RegraDeNegocio("Classe de bem inválida.")
    valor = dinheiro(dados.get("valor_aquisicao"))
    aquisicao = dados.get("data_aquisicao") or ctx.hoje
    vida = dados.get("vida_util_meses")
    if vida in (None, "") and classe != "terreno":
        vida = dep.CLASSES[classe][1]
    with ctx.escrever() as db:
        titulo_id = None
        compra = dados.get("compra")
        if compra:
            titulo_id = _inserir_titulo(
                db, ctx.org_id, ctx.autor, tipo="pagar",
                descricao=f"Compra — {texto(dados.get('descricao'))}",
                competencia=competencia_de(aquisicao),
                parcelas=[ParcelaNova(compra.get("vencimento") or aquisicao, valor)],
                rateio=[RateioNovo(categoria_do_sistema(db, ctx.org_id, "patrimonio.compra"), dados.get("centro_custo_id") or None, valor)],
                pessoa_id=compra.get("pessoa_id") or None, documento=compra.get("documento"),
                data_emissao=aquisicao, origem="patrimonio",
            )
            if compra.get("conta_id"):
                parcela_id = db.valor("SELECT id FROM financeiro.parcela WHERE titulo_id = %s", (titulo_id,))
                _baixar(db, ctx.org_id, ctx.autor, str(parcela_id), compra["conta_id"], compra.get("data_pagamento") or aquisicao)
        ativo_id = db.valor(
            """
            INSERT INTO financeiro.ativo
              (organizacao_id, descricao, classe, identificacao, centro_custo_id, data_aquisicao, inicio_uso,
               valor_aquisicao, valor_residual, vida_util_meses, titulo_compra_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (ctx.org_id, texto(dados.get("descricao")), classe, texto(dados.get("identificacao")),
             dados.get("centro_custo_id") or None, aquisicao, dados.get("inicio_uso") or aquisicao, valor,
             dinheiro(dados.get("valor_residual") or 0), None if classe == "terreno" else vida, titulo_id),
        )
        if titulo_id:
            db.executar("UPDATE financeiro.titulo SET origem_id = %s WHERE id = %s", (ativo_id, titulo_id))
    return next(a for a in listar_ativos(ctx)["itens"] if str(a["id"]) == str(ativo_id))


def editar_ativo(ctx: Contexto, ativo_id: str, dados: dict) -> dict:
    with ctx.escrever() as db:
        atual = exigir_da_empresa(db, "ativo", ctx.org_id, ativo_id, "Bem")
        campos = {}
        for campo in ("descricao", "identificacao"):
            if dados.get(campo) is not None:
                campos[campo] = texto(dados[campo])
        if "centro_custo_id" in dados:
            campos["centro_custo_id"] = dados["centro_custo_id"] or None
        contabeis = {}
        if dados.get("valor_residual") is not None:
            contabeis["valor_residual"] = dinheiro(dados["valor_residual"])
        if "vida_util_meses" in dados:
            contabeis["vida_util_meses"] = dados["vida_util_meses"]
        if dados.get("inicio_uso"):
            contabeis["inicio_uso"] = dados["inicio_uso"]
        if contabeis:
            # Mudar vida útil ou residual muda a depreciação de todos os meses
            # desde o início de uso: não pode atingir período fechado.
            exigir_periodo_aberto(db, ctx.org_id, min(atual["inicio_uso"], contabeis.get("inicio_uso", atual["inicio_uso"])),
                                  "A depreciação deste bem")
            campos.update(contabeis)
        if campos:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
            db.executar(
                f"UPDATE financeiro.ativo SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - colunas fixas
                {**campos, "id": ativo_id},
            )
    return next(a for a in listar_ativos(ctx)["itens"] if str(a["id"]) == str(ativo_id))


def baixar_ativo(ctx: Contexto, ativo_id: str, dados: dict) -> dict:
    """Venda, doação, perda ou descarte. Com valor de venda, gera a conta a receber."""
    motivo = texto(dados.get("motivo"))
    if not motivo:
        raise RegraDeNegocio("Informe o motivo da baixa (venda, perda, descarte...).")
    data = dados.get("data") or ctx.hoje
    with ctx.escrever(motivo) as db:
        ativo = exigir_da_empresa(db, "ativo", ctx.org_id, ativo_id, "Bem")
        if ativo["baixado_em"]:
            raise RegraDeNegocio("Este bem já foi baixado.")
        exigir_periodo_aberto(db, ctx.org_id, data, "A baixa do bem")
        venda = dinheiro(dados["valor_venda"]) if dados.get("valor_venda") not in (None, "") else None
        titulo_id = None
        if venda and venda > 0:
            titulo_id = _inserir_titulo(
                db, ctx.org_id, ctx.autor, tipo="receber", descricao=f"Venda — {ativo['descricao']}",
                competencia=competencia_de(data), parcelas=[ParcelaNova(dados.get("vencimento") or data, venda)],
                rateio=[RateioNovo(categoria_do_sistema(db, ctx.org_id, "patrimonio.venda"), ativo["centro_custo_id"], venda)],
                pessoa_id=dados.get("pessoa_id") or None, data_emissao=data, origem="patrimonio", origem_id=ativo_id,
            )
            if dados.get("conta_id"):
                parcela_id = db.valor("SELECT id FROM financeiro.parcela WHERE titulo_id = %s", (titulo_id,))
                _baixar(db, ctx.org_id, ctx.autor, str(parcela_id), dados["conta_id"], data)
        db.executar(
            """
            UPDATE financeiro.ativo SET baixado_em = %s, motivo_baixa = %s, valor_venda = %s, titulo_venda_id = %s
             WHERE id = %s
            """,
            (data, motivo, venda, titulo_id, ativo_id),
        )
    return next(a for a in listar_ativos(ctx)["itens"] if str(a["id"]) == str(ativo_id))


def cronograma_do_ativo(ctx: Contexto, ativo_id: str) -> list[dict]:
    with ctx.ler() as db:
        ativo = exigir_da_empresa(db, "ativo", ctx.org_id, ativo_id, "Bem")
    return [m.__dict__ for m in dep.cronograma(_bem(ativo))]


def depreciacao_e_vendas(db, org_id: str, de: date, ate: date) -> tuple[Decimal, Decimal]:
    """Para a DRE: depreciação do período e o resultado das vendas de bens nele."""
    depreciacao = ZERO
    resultado_vendas = ZERO
    for linha in db.todos("SELECT * FROM financeiro.ativo WHERE organizacao_id = %s", (org_id,)):
        bem = _bem(linha)
        depreciacao += dep.depreciacao_no_periodo(bem, de, ate)
        if linha["baixado_em"] and de <= linha["baixado_em"].replace(day=1) <= ate:
            resultado_vendas += dep.resultado_da_baixa(bem, Decimal(linha["valor_venda"] or 0))
    return depreciacao, resultado_vendas


def proximos_vencimentos_emprestimos(ctx: Contexto, dias: int = 30) -> Decimal:
    limite = ctx.hoje + timedelta(days=dias)
    with ctx.ler() as db:
        return Decimal(db.valor(
            """
            SELECT COALESCE(sum(pa.valor - pa.valor_pago), 0) FROM financeiro.titulo t
              JOIN financeiro.parcela pa ON pa.titulo_id = t.id
             WHERE t.organizacao_id = %s AND t.origem = 'emprestimo' AND t.tipo = 'pagar'
               AND pa.status IN ('aberta', 'parcial') AND pa.vencimento <= %s
            """,
            (ctx.org_id, limite),
        ))
