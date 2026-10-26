"""Cadastros: contas, plano de contas, centros de custo e pessoas.

Nada aqui se apaga: inativa-se. Uma categoria com dez anos de lançamentos não
pode sumir do plano de contas sem levar a DRE daqueles anos junto.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from ..dominio.demonstrativos import GRUPOS
from ..dominio.documentos import normalizar, tipo_do_documento
from ..erros import RegraDeNegocio
from .contexto import Contexto
from .util import exigir_da_empresa, exigir_periodo_aberto, texto

TIPOS_DE_CONTA = ("caixa", "corrente", "poupanca", "investimento", "cartao_credito", "outro")


# ==========================================================================
# Contas
# ==========================================================================

def listar_contas(ctx: Contexto, data: date | None = None, incluir_inativas: bool = True) -> list[dict]:
    """Contas com o saldo na data (hoje, se não vier data)."""
    data = data or ctx.hoje
    with ctx.ler() as db:
        return db.todos(
            """
            SELECT c.id, c.nome, c.tipo, c.banco, c.agencia, c.numero, c.ativa,
                   COALESCE(sum(m.valor) FILTER (WHERE m.data <= %(data)s), 0) AS saldo,
                   max(m.data) FILTER (WHERE m.data <= %(data)s) AS ultimo_movimento
              FROM financeiro.conta c
              LEFT JOIN financeiro.movimento m ON m.conta_id = c.id
             WHERE c.organizacao_id = %(org)s AND (%(todas)s OR c.ativa)
             GROUP BY c.id
             ORDER BY c.ativa DESC, c.nome
            """,
            {"org": ctx.org_id, "data": data, "todas": incluir_inativas},
        )


def criar_conta(ctx: Contexto, dados: dict) -> dict:
    nome = texto(dados.get("nome"))
    tipo = dados.get("tipo") or "corrente"
    if not nome:
        raise RegraDeNegocio("Dê um nome à conta.")
    if tipo not in TIPOS_DE_CONTA:
        raise RegraDeNegocio("Tipo de conta inválido.")
    saldo = Decimal(dados.get("saldo_inicial") or 0)
    data_saldo = dados.get("data_saldo_inicial") or ctx.hoje
    with ctx.escrever() as db:
        conta = db.um(
            """
            INSERT INTO financeiro.conta (organizacao_id, nome, tipo, banco, agencia, numero)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (ctx.org_id, nome, tipo, texto(dados.get("banco")), texto(dados.get("agencia")), texto(dados.get("numero"))),
        )
        if saldo != 0:
            exigir_periodo_aberto(db, ctx.org_id, data_saldo, "O saldo inicial")
            db.executar(
                """
                INSERT INTO financeiro.movimento (organizacao_id, conta_id, data, valor, tipo, descricao, criado_por)
                VALUES (%s, %s, %s, %s, 'saldo_inicial', 'Saldo inicial', %s)
                """,
                (ctx.org_id, conta["id"], data_saldo, saldo, ctx.autor),
            )
    return _conta(ctx, str(conta["id"]))


def editar_conta(ctx: Contexto, conta_id: str, dados: dict) -> dict:
    with ctx.escrever() as db:
        exigir_da_empresa(db, "conta", ctx.org_id, conta_id, "Conta")
        campos = {}
        if "nome" in dados and dados["nome"] is not None:
            campos["nome"] = texto(dados["nome"])
            if not campos["nome"]:
                raise RegraDeNegocio("Dê um nome à conta.")
        for campo in ("banco", "agencia", "numero"):
            if campo in dados:
                campos[campo] = texto(dados[campo])
        if "ativa" in dados and dados["ativa"] is not None:
            campos["ativa"] = bool(dados["ativa"])
        if "tipo" in dados and dados["tipo"]:
            if dados["tipo"] not in TIPOS_DE_CONTA:
                raise RegraDeNegocio("Tipo de conta inválido.")
            campos["tipo"] = dados["tipo"]
        if campos:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
            db.executar(
                f"UPDATE financeiro.conta SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - nomes de campo fixos
                {**campos, "id": conta_id},
            )
    return _conta(ctx, conta_id)


def _conta(ctx: Contexto, conta_id: str) -> dict:
    return next(c for c in listar_contas(ctx) if str(c["id"]) == str(conta_id))


# ==========================================================================
# Plano de contas
# ==========================================================================

def listar_categorias(ctx: Contexto, incluir_inativas: bool = True) -> list[dict]:
    """Categorias com o rótulo do grupo e quantos lançamentos cada uma tem."""
    with ctx.ler() as db:
        linhas = db.todos(
            """
            SELECT c.id, c.pai_id, c.grupo, c.natureza, c.codigo, c.nome, c.comportamento,
                   c.sistema, c.ativa,
                   (SELECT count(*) FROM financeiro.rateio r WHERE r.categoria_id = c.id) AS usos
              FROM financeiro.categoria c
             WHERE c.organizacao_id = %s AND (%s OR c.ativa)
            """,
            (ctx.org_id, incluir_inativas),
        )
    ordem = {g: i for i, g in enumerate(GRUPOS)}
    for linha in linhas:
        linha["grupo_rotulo"] = GRUPOS[linha["grupo"]].rotulo
    return sorted(linhas, key=lambda c: (ordem[c["grupo"]], c["codigo"] or "", c["nome"].lower()))


def criar_categoria(ctx: Contexto, dados: dict) -> dict:
    grupo = dados.get("grupo")
    nome = texto(dados.get("nome"))
    if grupo not in GRUPOS:
        raise RegraDeNegocio("Escolha o grupo da categoria.")
    if not nome:
        raise RegraDeNegocio("Dê um nome à categoria.")
    comportamento = dados.get("comportamento") or "variavel"
    with ctx.escrever() as db:
        pai_id = dados.get("pai_id")
        if pai_id:
            pai = exigir_da_empresa(db, "categoria", ctx.org_id, pai_id, "Categoria-mãe")
            if pai["grupo"] != grupo:
                raise RegraDeNegocio("A subcategoria precisa ser do mesmo grupo da categoria-mãe.")
        linha = db.um(
            """
            INSERT INTO financeiro.categoria (organizacao_id, pai_id, grupo, natureza, codigo, nome, comportamento)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (ctx.org_id, pai_id, grupo, GRUPOS[grupo].natureza, texto(dados.get("codigo")), nome, comportamento),
        )
    return _categoria(ctx, str(linha["id"]))


def editar_categoria(ctx: Contexto, categoria_id: str, dados: dict) -> dict:
    with ctx.escrever() as db:
        atual = exigir_da_empresa(db, "categoria", ctx.org_id, categoria_id, "Categoria")
        campos = {}
        if dados.get("nome") is not None:
            campos["nome"] = texto(dados["nome"])
            if not campos["nome"]:
                raise RegraDeNegocio("Dê um nome à categoria.")
        if "codigo" in dados:
            campos["codigo"] = texto(dados["codigo"])
        if dados.get("comportamento") in ("fixo", "variavel"):
            campos["comportamento"] = dados["comportamento"]
        if dados.get("ativa") is not None:
            if atual["sistema"] and not dados["ativa"]:
                raise RegraDeNegocio("Esta categoria é usada pelo próprio financeiro e não pode ser inativada.")
            campos["ativa"] = bool(dados["ativa"])
        if dados.get("grupo") and dados["grupo"] != atual["grupo"]:
            if atual["sistema"]:
                raise RegraDeNegocio("Esta categoria é usada pelo próprio financeiro e não muda de grupo.")
            if dados["grupo"] not in GRUPOS:
                raise RegraDeNegocio("Grupo inválido.")
            if GRUPOS[dados["grupo"]].natureza != atual["natureza"]:
                raise RegraDeNegocio("Receita não vira despesa (nem o contrário): crie uma categoria nova.")
            campos["grupo"] = dados["grupo"]
        if campos:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
            db.executar(
                f"UPDATE financeiro.categoria SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - nomes de campo fixos
                {**campos, "id": categoria_id},
            )
    return _categoria(ctx, categoria_id)


def _categoria(ctx: Contexto, categoria_id: str) -> dict:
    return next(c for c in listar_categorias(ctx) if str(c["id"]) == str(categoria_id))


# ==========================================================================
# Centros de custo
# ==========================================================================

def listar_centros(ctx: Contexto, incluir_inativos: bool = True) -> list[dict]:
    with ctx.ler() as db:
        return db.todos(
            """
            SELECT id, pai_id, codigo, nome, ativo FROM financeiro.centro_custo
             WHERE organizacao_id = %s AND (%s OR ativo)
             ORDER BY ativo DESC, codigo NULLS LAST, lower(nome)
            """,
            (ctx.org_id, incluir_inativos),
        )


def salvar_centro(ctx: Contexto, dados: dict, centro_id: str | None = None) -> dict:
    nome = texto(dados.get("nome"))
    with ctx.escrever() as db:
        if centro_id:
            exigir_da_empresa(db, "centro_custo", ctx.org_id, centro_id, "Centro de custo")
            campos = {}
            if dados.get("nome") is not None:
                if not nome:
                    raise RegraDeNegocio("Dê um nome ao centro de custo.")
                campos["nome"] = nome
            if "codigo" in dados:
                campos["codigo"] = texto(dados["codigo"])
            if dados.get("ativo") is not None:
                campos["ativo"] = bool(dados["ativo"])
            if "pai_id" in dados:
                if dados["pai_id"] == centro_id:
                    raise RegraDeNegocio("Um centro de custo não pode ser pai dele mesmo.")
                campos["pai_id"] = dados["pai_id"] or None
            if campos:
                atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
                db.executar(
                    f"UPDATE financeiro.centro_custo SET {atribuicoes} WHERE id = %(id)s AND organizacao_id = %(org)s",  # nosec B608 - nomes de campo fixos
                    {**campos, "id": centro_id, "org": ctx.org_id},
                )
            novo_id = centro_id
        else:
            if not nome:
                raise RegraDeNegocio("Dê um nome ao centro de custo.")
            novo_id = db.valor(
                """
                INSERT INTO financeiro.centro_custo (organizacao_id, pai_id, codigo, nome)
                VALUES (%s, %s, %s, %s) RETURNING id
                """,
                (ctx.org_id, dados.get("pai_id") or None, texto(dados.get("codigo")), nome),
            )
    return next(c for c in listar_centros(ctx) if str(c["id"]) == str(novo_id))


# ==========================================================================
# Pessoas
# ==========================================================================

def listar_pessoas(
    ctx: Contexto,
    busca: str | None = None,
    papel: str | None = None,
    incluir_inativas: bool = False,
    limite: int = 50,
    deslocamento: int = 0,
) -> dict:
    """Pessoas com paginação; `papel` filtra cliente, fornecedor, colaborador ou sócio."""
    filtros = ["p.organizacao_id = %(org)s"]
    params: dict = {"org": ctx.org_id}
    if not incluir_inativas:
        filtros.append("p.ativa")
    if busca:
        filtros.append(
            "(lower(p.nome) LIKE %(busca)s OR lower(coalesce(p.nome_fantasia, '')) LIKE %(busca)s OR p.documento LIKE %(doc)s)"
        )
        params["busca"] = f"%{busca.strip().lower()}%"
        params["doc"] = f"%{normalizar(busca) or busca.strip()}%"
    if papel == "cliente":
        filtros.append("p.cliente")
    elif papel == "fornecedor":
        filtros.append("p.fornecedor")
    elif papel == "colaborador":
        filtros.append("EXISTS (SELECT 1 FROM financeiro.colaborador c WHERE c.pessoa_id = p.id)")
    elif papel == "socio":
        filtros.append("EXISTS (SELECT 1 FROM financeiro.socio s WHERE s.pessoa_id = p.id)")
    where = " AND ".join(f"({f})" for f in filtros)
    params.update(limite=min(max(limite, 1), 200), deslocamento=max(deslocamento, 0))
    with ctx.ler() as db:
        total = db.valor(f"SELECT count(*) FROM financeiro.pessoa p WHERE {where}", params)  # nosec B608 - filtros fixos, valores parametrizados
        linhas = db.todos(
            f"""
            SELECT p.id, p.tipo, p.nome, p.nome_fantasia, p.documento, p.email, p.telefone,
                   p.chave_pix, p.cliente, p.fornecedor, p.referencia_externa, p.ativa, p.sistema,
                   EXISTS (SELECT 1 FROM financeiro.colaborador c WHERE c.pessoa_id = p.id) AS colaborador,
                   EXISTS (SELECT 1 FROM financeiro.socio s WHERE s.pessoa_id = p.id) AS socio
              FROM financeiro.pessoa p
             WHERE {where}
             ORDER BY lower(p.nome)
             LIMIT %(limite)s OFFSET %(deslocamento)s
            """,  # nosec B608 - filtros fixos, valores parametrizados
            params,
        )
    return {"total": total, "itens": linhas}


def obter_pessoa(ctx: Contexto, pessoa_id: str) -> dict:
    with ctx.ler() as db:
        pessoa = exigir_da_empresa(db, "pessoa", ctx.org_id, pessoa_id, "Pessoa")
        pessoa["resumo"] = db.um(
            """
            SELECT
              COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE t.tipo = 'receber' AND p.status IN ('aberta','parcial')), 0) AS a_receber,
              COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE t.tipo = 'pagar' AND p.status IN ('aberta','parcial')), 0) AS a_pagar,
              COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE t.tipo = 'receber' AND p.status IN ('aberta','parcial') AND p.vencimento < %s), 0) AS vencido_a_receber,
              count(DISTINCT t.id) AS titulos
              FROM financeiro.titulo t
              JOIN financeiro.parcela p ON p.titulo_id = t.id
             WHERE t.organizacao_id = %s AND t.pessoa_id = %s AND t.cancelado_em IS NULL
            """,
            (ctx.hoje, ctx.org_id, pessoa_id),
        )
    return pessoa


def _validar_pessoa(dados: dict, atual: dict | None = None) -> dict:
    campos: dict = {}
    tipo = dados.get("tipo") or (atual or {}).get("tipo")
    if tipo not in ("fisica", "juridica"):
        raise RegraDeNegocio("Informe se é pessoa física ou jurídica.")
    campos["tipo"] = tipo
    if "nome" in dados or atual is None:
        nome = texto(dados.get("nome"))
        if not nome or len(nome) < 2:
            raise RegraDeNegocio("Informe o nome.")
        campos["nome"] = nome
    if "documento" in dados:
        documento = normalizar(dados.get("documento"))
        if documento:
            esperado = "cpf" if tipo == "fisica" else "cnpj"
            if tipo_do_documento(documento) != esperado:
                raise RegraDeNegocio(f"{esperado.upper()} inválido.")
        campos["documento"] = documento
    for campo in ("nome_fantasia", "email", "telefone", "chave_pix", "banco", "agencia",
                  "conta_bancaria", "endereco", "referencia_externa", "observacao"):
        if campo in dados:
            campos[campo] = texto(dados.get(campo))
    for campo in ("cliente", "fornecedor", "ativa"):
        if campo in dados and dados[campo] is not None:
            campos[campo] = bool(dados[campo])
    return campos


def criar_pessoa(ctx: Contexto, dados: dict) -> dict:
    with ctx.escrever() as db:
        pessoa_id = _inserir_pessoa(db, ctx.org_id, dados)
    return obter_pessoa(ctx, pessoa_id)


def _inserir_pessoa(db, org_id: str, dados: dict) -> str:
    campos = _validar_pessoa(dados)
    colunas = ", ".join(["organizacao_id", *campos])
    marcas = ", ".join(["%(organizacao_id)s", *(f"%({c})s" for c in campos)])
    return str(
        db.valor(
            f"INSERT INTO financeiro.pessoa ({colunas}) VALUES ({marcas}) RETURNING id",  # nosec B608 - colunas de _validar_pessoa
            {**campos, "organizacao_id": org_id},
        )
    )


def editar_pessoa(ctx: Contexto, pessoa_id: str, dados: dict) -> dict:
    with ctx.escrever() as db:
        atual = exigir_da_empresa(db, "pessoa", ctx.org_id, pessoa_id, "Pessoa")
        if atual["sistema"]:
            permitidos = {k: v for k, v in dados.items() if k in ("nome", "documento", "chave_pix", "banco", "agencia", "conta_bancaria", "observacao")}
            dados = {**permitidos, "tipo": "juridica"}
        campos = _validar_pessoa(dados, atual)
        if campos:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
            db.executar(
                f"UPDATE financeiro.pessoa SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - colunas de _validar_pessoa
                {**campos, "id": pessoa_id},
            )
    return obter_pessoa(ctx, pessoa_id)


def importar_pessoas_externas(ctx: Contexto, pessoas: list[dict]) -> dict:
    """Traz cadastros do sistema hospedeiro (ex.: pacientes) como clientes.

    Idempotente pela `referencia_externa`: quem já foi importado é atualizado
    no nome, não duplicado.
    """
    criadas = atualizadas = 0
    with ctx.escrever("Importação de cadastros do sistema") as db:
        for externa in pessoas:
            ref = texto(externa.get("referencia_externa"))
            nome = texto(externa.get("nome"))
            if not ref or not nome:
                continue
            existente = db.um(
                "SELECT id, nome FROM financeiro.pessoa WHERE organizacao_id = %s AND referencia_externa = %s",
                (ctx.org_id, ref),
            )
            if existente:
                if existente["nome"] != nome:
                    db.executar("UPDATE financeiro.pessoa SET nome = %s WHERE id = %s", (nome, existente["id"]))
                    atualizadas += 1
                continue
            _inserir_pessoa(
                db, ctx.org_id,
                {"tipo": externa.get("tipo") or "fisica", "nome": nome, "cliente": True,
                 "referencia_externa": ref, "observacao": texto(externa.get("observacao"))},
            )
            criadas += 1
    return {"criadas": criadas, "atualizadas": atualizadas}
