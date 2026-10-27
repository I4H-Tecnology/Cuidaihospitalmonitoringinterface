"""A empresa dentro do financeiro: provisionamento, parâmetros e fechamento.

Provisionar é o que acontece na primeira chamada de uma empresa: ela ganha o
plano de contas padrão, a conta Caixa, as rubricas da folha e os credores das
guias. Não há tela de "ativar o financeiro" — quem tem permissão e abre o
módulo já encontra tudo pronto para usar.
"""

from __future__ import annotations

import threading
from datetime import date
from decimal import Decimal

from ..acesso import Operador
from ..banco import Banco, Consulta
from ..dominio.calendario import feriados_nacionais, ultimo_dia_do_mes
from ..erros import RegraDeNegocio
from . import padroes
from .contexto import Contexto
from .util import texto

# chave externa -> id. Uma empresa não troca de id, então o cache nunca fica
# errado; no pior caso (processo novo) custa uma consulta.
_ids: dict[str, str] = {}
_trava = threading.Lock()


def resolver(banco: Banco, operador: Operador) -> str:
    """Id da empresa do operador no financeiro; cria e provisiona na primeira vez."""
    chave = operador.organizacao_ref
    if chave in _ids:
        return _ids[chave]
    with _trava:
        if chave in _ids:
            return _ids[chave]
        with banco.ler() as db:
            org_id = db.valor("SELECT id FROM financeiro.organizacao WHERE chave_externa = %s", (chave,))
        if org_id is None:
            with banco.escrever(operador, "Primeiro acesso da empresa ao financeiro") as db:
                org_id = db.valor(
                    """
                    INSERT INTO financeiro.organizacao (chave_externa, nome) VALUES (%s, %s)
                    ON CONFLICT (chave_externa) DO NOTHING RETURNING id
                    """,
                    (chave, operador.organizacao_nome or chave),
                )
                if org_id is not None:
                    provisionar(db, str(org_id))
            if org_id is None:
                # Outro processo provisionou ao mesmo tempo; o dele valeu.
                with banco.ler() as db:
                    org_id = db.valor("SELECT id FROM financeiro.organizacao WHERE chave_externa = %s", (chave,))
        _ids[chave] = str(org_id)
        return _ids[chave]


def esquecer_cache() -> None:
    """Para testes que recriam o banco."""
    _ids.clear()


def provisionar(db: Consulta, org_id: str) -> None:
    for grupo, nome, sistema, comportamento in padroes.CATEGORIAS:
        natureza = "receita" if grupo in (
            "receita_operacional", "receita_financeira", "outras_receitas",
            "aporte_socio", "captacao_emprestimo", "venda_ativo",
        ) else "despesa"
        db.executar(
            """
            INSERT INTO financeiro.categoria (organizacao_id, grupo, natureza, nome, sistema, comportamento)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (org_id, grupo, natureza, nome, sistema, comportamento),
        )
    for sistema, nome in padroes.PESSOAS_SISTEMA:
        db.executar(
            "INSERT INTO financeiro.pessoa (organizacao_id, tipo, nome, fornecedor, sistema) VALUES (%s, 'juridica', %s, true, %s)",
            (org_id, nome, sistema),
        )
    for (codigo, nome, tipo, calculo, pct, inss, irrf, fgts, deduz, dsr, sistema) in padroes.RUBRICAS:
        db.executar(
            """
            INSERT INTO financeiro.rubrica
              (organizacao_id, codigo, nome, tipo, calculo, percentual,
               incide_inss, incide_irrf, incide_fgts, deduz_irrf, entra_dsr, sistema)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (org_id, codigo, nome, tipo, calculo, pct, inss, irrf, fgts, deduz, dsr, sistema),
        )
    db.executar(
        "INSERT INTO financeiro.conta (organizacao_id, nome, tipo) VALUES (%s, 'Caixa', 'caixa')",
        (org_id,),
    )


# --------------------------------------------------------------------------
# Parâmetros
# --------------------------------------------------------------------------

CAMPOS_EDITAVEIS = (
    "nome", "documento", "regime_tributario", "capital_social",
    "encargo_inss_patronal", "encargo_rat", "encargo_terceiros", "fgts_aliquota",
    "percentual_adiantamento", "guia_unica_dctfweb",
)


def obter(ctx: Contexto) -> dict:
    with ctx.ler() as db:
        return db.um("SELECT * FROM financeiro.organizacao WHERE id = %s", (ctx.org_id,))


def atualizar(ctx: Contexto, mudancas: dict) -> dict:
    campos = {k: v for k, v in mudancas.items() if k in CAMPOS_EDITAVEIS and v is not None}
    if "nome" in campos:
        campos["nome"] = texto(campos["nome"])
        if not campos["nome"]:
            raise RegraDeNegocio("O nome da empresa é obrigatório.")
    if "documento" in campos:
        from ..dominio.documentos import normalizar, tipo_do_documento

        doc = normalizar(campos["documento"])
        if doc and tipo_do_documento(doc) is None:
            raise RegraDeNegocio("CPF/CNPJ inválido.")
        campos["documento"] = doc
    if not campos:
        return obter(ctx)
    atribuicoes = ", ".join(f"{campo} = %({campo})s" for campo in campos)
    with ctx.escrever("Parâmetros da empresa") as db:
        db.executar(
            f"UPDATE financeiro.organizacao SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - campos filtrados por CAMPOS_EDITAVEIS
            {**campos, "id": ctx.org_id},
        )
    return obter(ctx)


def alterar_fechamento(ctx: Contexto, fechado_ate: date | None, motivo: str | None) -> dict:
    """Fecha (ou reabre) o período até o fim do mês de `fechado_ate`.

    Reabrir é mover a data para trás — ou tirá-la. Os dois exigem motivo, que
    vai para a auditoria: reabrir mês fechado é exatamente o tipo de coisa que
    quem audita quer saber quem fez e por quê.
    """
    motivo = texto(motivo)
    if not motivo:
        raise RegraDeNegocio("Informe o motivo do fechamento ou da reabertura.")
    limite = ultimo_dia_do_mes(fechado_ate) if fechado_ate else None
    if limite and limite >= ctx.hoje.replace(day=1):
        raise RegraDeNegocio("Só dá para fechar meses que já terminaram.")
    with ctx.escrever(motivo) as db:
        db.executar("UPDATE financeiro.organizacao SET fechado_ate = %s WHERE id = %s", (limite, ctx.org_id))
    return obter(ctx)


# --------------------------------------------------------------------------
# Feriados e auditoria
# --------------------------------------------------------------------------

def listar_feriados(ctx: Contexto, ano: int) -> list[dict]:
    with ctx.ler() as db:
        proprios = db.todos(
            """
            SELECT id, data, nome FROM financeiro.feriado
             WHERE organizacao_id = %s AND extract(year FROM data) = %s ORDER BY data
            """,
            (ctx.org_id, ano),
        )
    nacionais = [{"id": None, "data": d, "nome": n, "nacional": True} for d, n in feriados_nacionais(ano).items()]
    return sorted(nacionais + [{**f, "nacional": False} for f in proprios], key=lambda f: f["data"])


def criar_feriado(ctx: Contexto, data: date, nome: str) -> dict:
    nome = texto(nome)
    if not nome:
        raise RegraDeNegocio("Dê um nome ao feriado.")
    if data in feriados_nacionais(data.year):
        raise RegraDeNegocio("Essa data já é feriado nacional.")
    with ctx.escrever() as db:
        return db.um(
            "INSERT INTO financeiro.feriado (organizacao_id, data, nome) VALUES (%s, %s, %s) RETURNING id, data, nome",
            (ctx.org_id, data, nome),
        )


def remover_feriado(ctx: Contexto, feriado_id: str) -> None:
    with ctx.escrever() as db:
        db.executar("DELETE FROM financeiro.feriado WHERE id = %s AND organizacao_id = %s", (feriado_id, ctx.org_id))


def auditoria(ctx: Contexto, tabela: str | None, registro_id: str | None, limite: int = 100) -> list[dict]:
    filtros, params = ["organizacao_id = %s"], [ctx.org_id]
    if tabela:
        filtros.append("tabela = %s")
        params.append(tabela)
    if registro_id:
        filtros.append("registro_id = %s")
        params.append(registro_id)
    params.append(min(max(limite, 1), 500))
    with ctx.ler() as db:
        return db.todos(
            f"""
            SELECT id, tabela, registro_id, operacao, antes, depois, usuario_nome, motivo, em
              FROM financeiro.auditoria WHERE {' AND '.join(filtros)}
             ORDER BY em DESC, id DESC LIMIT %s
            """,  # nosec B608 - filtros montados só com texto fixo deste arquivo
            tuple(params),
        )


def encargos(org: dict):
    """Os percentuais da empresa no formato que o cálculo da folha usa."""
    from ..dominio.folha import Encargos

    return Encargos(
        inss_patronal=Decimal(org["encargo_inss_patronal"]),
        rat=Decimal(org["encargo_rat"]),
        terceiros=Decimal(org["encargo_terceiros"]),
        fgts=Decimal(org["fgts_aliquota"]),
    )
