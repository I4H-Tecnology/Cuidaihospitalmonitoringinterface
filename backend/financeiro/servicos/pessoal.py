"""Pessoal: colaboradores, rubricas, tabelas de imposto e a folha de pagamento.

Ciclo da folha, como a tela mostra:

  1. Criar a folha do mês: entra todo colaborador com vínculo naquele mês, e
     o cálculo já roda (salário, fixos, INSS, IRRF, FGTS).
  2. Lançar o variável (hora extra, falta, comissão): cada lançamento
     recalcula o holerite daquele colaborador na hora.
  3. Se a contabilidade fechou com outro número, registrar o ajuste: o valor
     dela prevalece, e a diferença para o cálculo fica guardada.
  4. Fechar: gera as contas a pagar (líquidos, guias, repasses) numa
     transação só. Reabrir cancela essas contas, se nenhuma foi paga.
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

from ..banco import Consulta
from ..dominio import folha as dom
from ..dominio.calendario import competencia as competencia_de
from ..dominio.calendario import ultimo_dia_do_mes
from ..dominio.dinheiro import ZERO, dinheiro, somar
from ..dominio.documentos import normalizar, tipo_do_documento
from ..erros import NaoEncontrado, RegraDeNegocio
from . import organizacao as org_servico
from .cadastros import _inserir_pessoa
from .contexto import Contexto
from .titulos import ParcelaNova, RateioNovo, _cancelar, _inserir_titulo
from .util import (
    calendario_da_empresa,
    categoria_do_sistema,
    exigir_da_empresa,
    exigir_periodo_aberto,
    pessoa_do_sistema,
    texto,
)

VINCULOS = ("clt", "aprendiz", "estagio", "prolabore", "pj", "autonomo")
TIPOS_DE_FOLHA = ("mensal", "adiantamento")


def _json(valor) -> str:
    return json.dumps(valor, default=str, ensure_ascii=False)


# ==========================================================================
# Colaboradores
# ==========================================================================

_SELECT_COLABORADOR = """
    SELECT c.*, p.nome, p.documento, p.email, p.telefone, p.chave_pix, p.banco, p.agencia,
           p.conta_bancaria, cc.nome AS centro_custo_nome,
           (c.data_desligamento IS NULL OR c.data_desligamento >= %(hoje)s) AS ativo
      FROM financeiro.colaborador c
      JOIN financeiro.pessoa p ON p.id = c.pessoa_id
      LEFT JOIN financeiro.centro_custo cc ON cc.id = c.centro_custo_id
"""


def listar_colaboradores(ctx: Contexto, incluir_desligados: bool = False) -> list[dict]:
    with ctx.ler() as db:
        linhas = db.todos(
            _SELECT_COLABORADOR
            + " WHERE c.organizacao_id = %(org)s"
            + ("" if incluir_desligados else " AND (c.data_desligamento IS NULL OR c.data_desligamento >= %(hoje)s)")
            + " ORDER BY lower(p.nome)",
            {"org": ctx.org_id, "hoje": ctx.hoje},
        )
        org = db.um("SELECT * FROM financeiro.organizacao WHERE id = %s", (ctx.org_id,))
    encargos = org_servico.encargos(org)
    for linha in linhas:
        provisao = dom.provisao_mensal(_dominio_colaborador(linha), encargos)
        linha["provisao_mensal"] = provisao.total
    return linhas


def obter_colaborador(ctx: Contexto, colaborador_id: str) -> dict:
    with ctx.ler() as db:
        colab = db.um(
            _SELECT_COLABORADOR + " WHERE c.id = %(id)s AND c.organizacao_id = %(org)s",
            {"id": colaborador_id, "org": ctx.org_id, "hoje": ctx.hoje},
        )
        if not colab:
            raise NaoEncontrado("Colaborador não encontrado.")
        colab["fixos"] = db.todos(
            """
            SELECT f.id, f.rubrica_id, r.codigo, r.nome AS rubrica_nome, r.tipo, r.calculo, r.percentual,
                   f.referencia, f.valor, f.limite, f.credor_id, pe.nome AS credor_nome, f.inicio, f.fim
              FROM financeiro.colaborador_rubrica f
              JOIN financeiro.rubrica r ON r.id = f.rubrica_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = f.credor_id
             WHERE f.colaborador_id = %s
             ORDER BY r.tipo, r.codigo
            """,
            (colaborador_id,),
        )
        colab["holerites"] = db.todos(
            """
            SELECT h.id, f.id AS folha_id, f.competencia, f.tipo, f.status, h.total_proventos,
                   h.total_descontos, h.liquido, h.custo_total
              FROM financeiro.holerite h JOIN financeiro.folha f ON f.id = h.folha_id
             WHERE h.colaborador_id = %s ORDER BY f.competencia DESC, f.tipo LIMIT 24
            """,
            (colaborador_id,),
        )
        org = db.um("SELECT * FROM financeiro.organizacao WHERE id = %s", (ctx.org_id,))
    provisao = dom.provisao_mensal(_dominio_colaborador(colab), org_servico.encargos(org))
    colab["provisao"] = {
        "ferias": provisao.ferias, "decimo_terceiro": provisao.decimo_terceiro,
        "encargos": provisao.encargos, "total": provisao.total,
    }
    return colab


def _validar_colaborador(db: Consulta, org_id: str, dados: dict, atual: dict | None = None) -> dict:
    campos: dict = {}
    if dados.get("vinculo") is not None or atual is None:
        if dados.get("vinculo") not in VINCULOS:
            raise RegraDeNegocio("Escolha o vínculo (CLT, aprendiz, estágio, pró-labore, PJ ou autônomo).")
        campos["vinculo"] = dados["vinculo"]
    if dados.get("salario_base") is not None or atual is None:
        campos["salario_base"] = dinheiro(dados.get("salario_base") or 0)
        if campos["salario_base"] < 0:
            raise RegraDeNegocio("Salário não pode ser negativo.")
    if dados.get("data_admissao") is not None or atual is None:
        if not dados.get("data_admissao"):
            raise RegraDeNegocio("Informe a data de admissão.")
        campos["data_admissao"] = dados["data_admissao"]
    for campo in ("matricula", "cargo", "referencia_externa"):
        if campo in dados:
            campos[campo] = texto(dados[campo])
    if "centro_custo_id" in dados:
        if dados["centro_custo_id"]:
            exigir_da_empresa(db, "centro_custo", org_id, dados["centro_custo_id"], "Centro de custo")
        campos["centro_custo_id"] = dados["centro_custo_id"] or None
    if dados.get("horas_mes") is not None:
        campos["horas_mes"] = Decimal(str(dados["horas_mes"]))
        if campos["horas_mes"] <= 0:
            raise RegraDeNegocio("Horas do mês devem ser maiores que zero.")
    if dados.get("dependentes_irrf") is not None:
        campos["dependentes_irrf"] = int(dados["dependentes_irrf"])
        if not 0 <= campos["dependentes_irrf"] <= 30:
            raise RegraDeNegocio("Dependentes entre 0 e 30.")
    return campos


def criar_colaborador(ctx: Contexto, dados: dict) -> dict:
    with ctx.escrever() as db:
        pessoa_id = dados.get("pessoa_id")
        if pessoa_id:
            pessoa = exigir_da_empresa(db, "pessoa", ctx.org_id, pessoa_id, "Pessoa")
            if pessoa["tipo"] != "fisica":
                raise RegraDeNegocio("Colaborador é pessoa física. Para PJ, lance como fornecedor.")
        else:
            nova = dict(dados.get("pessoa") or {})
            nova["tipo"] = "fisica"
            documento = normalizar(nova.get("documento"))
            if documento and tipo_do_documento(documento) != "cpf":
                raise RegraDeNegocio("CPF inválido.")
            pessoa_id = _inserir_pessoa(db, ctx.org_id, nova)
        campos = _validar_colaborador(db, ctx.org_id, dados)
        colunas = ", ".join(["organizacao_id", "pessoa_id", *campos])
        marcas = ", ".join(["%(organizacao_id)s", "%(pessoa_id)s", *(f"%({c})s" for c in campos)])
        colab_id = db.valor(
            f"INSERT INTO financeiro.colaborador ({colunas}) VALUES ({marcas}) RETURNING id",  # nosec B608 - colunas de _validar_colaborador
            {**campos, "organizacao_id": ctx.org_id, "pessoa_id": pessoa_id},
        )
    return obter_colaborador(ctx, str(colab_id))


def editar_colaborador(ctx: Contexto, colaborador_id: str, dados: dict) -> dict:
    with ctx.escrever() as db:
        atual = exigir_da_empresa(db, "colaborador", ctx.org_id, colaborador_id, "Colaborador")
        campos = _validar_colaborador(db, ctx.org_id, dados, atual)
        if "data_desligamento" in dados:
            campos["data_desligamento"] = dados["data_desligamento"]
        if campos:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
            db.executar(
                f"UPDATE financeiro.colaborador SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - colunas de _validar_colaborador
                {**campos, "id": colaborador_id},
            )
        if dados.get("pessoa"):
            from .cadastros import _validar_pessoa

            pessoa = db.um("SELECT * FROM financeiro.pessoa WHERE id = %s", (atual["pessoa_id"],))
            mudancas = _validar_pessoa({**dados["pessoa"], "tipo": "fisica"}, pessoa)
            if mudancas:
                atribuicoes = ", ".join(f"{c} = %({c})s" for c in mudancas)
                db.executar(
                    f"UPDATE financeiro.pessoa SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - colunas de _validar_pessoa
                    {**mudancas, "id": atual["pessoa_id"]},
                )
    return obter_colaborador(ctx, colaborador_id)


def salvar_fixo(ctx: Contexto, colaborador_id: str, dados: dict, fixo_id: str | None = None) -> dict:
    """Item que entra todo mês: vale-transporte, plano de saúde, pensão, consignado."""
    with ctx.escrever() as db:
        exigir_da_empresa(db, "colaborador", ctx.org_id, colaborador_id, "Colaborador")
        rubrica = exigir_da_empresa(db, "rubrica", ctx.org_id, dados.get("rubrica_id"), "Rubrica")
        if rubrica["sistema"]:
            raise RegraDeNegocio("Esta rubrica é calculada pelo sistema e não entra como item fixo.")
        if rubrica["calculo"] == "valor" and dados.get("valor") in (None, ""):
            raise RegraDeNegocio("Informe o valor.")
        if dados.get("credor_id"):
            exigir_da_empresa(db, "pessoa", ctx.org_id, dados["credor_id"], "Credor")
        valores = {
            "rubrica_id": dados["rubrica_id"],
            "referencia": dados.get("referencia"),
            "valor": dinheiro(dados["valor"]) if dados.get("valor") not in (None, "") else None,
            "limite": dinheiro(dados["limite"]) if dados.get("limite") not in (None, "") else None,
            "credor_id": dados.get("credor_id") or None,
            "inicio": dados.get("inicio") or ctx.hoje.replace(day=1),
            "fim": dados.get("fim"),
        }
        if fixo_id:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in valores)
            db.executar(
                f"UPDATE financeiro.colaborador_rubrica SET {atribuicoes} WHERE id = %(id)s AND colaborador_id = %(colab)s",  # nosec B608 - colunas fixas
                {**valores, "id": fixo_id, "colab": colaborador_id},
            )
        else:
            db.executar(
                """
                INSERT INTO financeiro.colaborador_rubrica
                  (organizacao_id, colaborador_id, rubrica_id, referencia, valor, limite, credor_id, inicio, fim)
                VALUES (%(org)s, %(colab)s, %(rubrica_id)s, %(referencia)s, %(valor)s, %(limite)s,
                        %(credor_id)s, %(inicio)s, %(fim)s)
                """,
                {**valores, "org": ctx.org_id, "colab": colaborador_id},
            )
    return obter_colaborador(ctx, colaborador_id)


def remover_fixo(ctx: Contexto, colaborador_id: str, fixo_id: str) -> dict:
    with ctx.escrever() as db:
        db.executar(
            "DELETE FROM financeiro.colaborador_rubrica WHERE id = %s AND colaborador_id = %s AND organizacao_id = %s",
            (fixo_id, colaborador_id, ctx.org_id),
        )
    return obter_colaborador(ctx, colaborador_id)


def _dominio_colaborador(linha: dict) -> dom.Colaborador:
    return dom.Colaborador(
        vinculo=linha["vinculo"],
        salario_base=Decimal(linha["salario_base"]),
        dependentes=linha["dependentes_irrf"],
        data_admissao=linha["data_admissao"],
        data_desligamento=linha["data_desligamento"],
    )


# ==========================================================================
# Rubricas e tabelas
# ==========================================================================

def listar_rubricas(ctx: Contexto) -> list[dict]:
    with ctx.ler() as db:
        return db.todos(
            """
            SELECT r.*, pe.nome AS credor_nome FROM financeiro.rubrica r
              LEFT JOIN financeiro.pessoa pe ON pe.id = r.credor_id
             WHERE r.organizacao_id = %s ORDER BY r.tipo, r.codigo
            """,
            (ctx.org_id,),
        )


def salvar_rubrica(ctx: Contexto, dados: dict, rubrica_id: str | None = None) -> dict:
    with ctx.escrever() as db:
        if rubrica_id:
            atual = exigir_da_empresa(db, "rubrica", ctx.org_id, rubrica_id, "Rubrica")
            if atual["sistema"]:
                # As incidências das rubricas do sistema são as da lei; só o nome muda.
                permitidos = {"nome": texto(dados.get("nome"))} if dados.get("nome") else {}
            else:
                permitidos = _campos_rubrica(dados, parcial=True)
            if dados.get("credor_id") is not None and not atual["sistema"]:
                permitidos["credor_id"] = dados["credor_id"] or None
            if dados.get("ativa") is not None and not atual["sistema"]:
                permitidos["ativa"] = bool(dados["ativa"])
            if permitidos:
                atribuicoes = ", ".join(f"{c} = %({c})s" for c in permitidos)
                db.executar(
                    f"UPDATE financeiro.rubrica SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - colunas de _campos_rubrica
                    {**permitidos, "id": rubrica_id},
                )
            novo_id = rubrica_id
        else:
            campos = _campos_rubrica(dados, parcial=False)
            campos["credor_id"] = dados.get("credor_id") or None
            colunas = ", ".join(["organizacao_id", *campos])
            marcas = ", ".join(["%(organizacao_id)s", *(f"%({c})s" for c in campos)])
            novo_id = db.valor(
                f"INSERT INTO financeiro.rubrica ({colunas}) VALUES ({marcas}) RETURNING id",  # nosec B608 - colunas de _campos_rubrica
                {**campos, "organizacao_id": ctx.org_id},
            )
    return next(r for r in listar_rubricas(ctx) if str(r["id"]) == str(novo_id))


def _campos_rubrica(dados: dict, parcial: bool) -> dict:
    campos: dict = {}
    for campo in ("codigo", "nome"):
        if dados.get(campo) is not None or not parcial:
            campos[campo] = texto(dados.get(campo))
            if not campos[campo]:
                raise RegraDeNegocio(f"Informe o {campo} da rubrica.")
    if dados.get("tipo") is not None or not parcial:
        if dados.get("tipo") not in ("provento", "desconto", "informativo"):
            raise RegraDeNegocio("Tipo da rubrica: provento, desconto ou informativo.")
        campos["tipo"] = dados["tipo"]
    if dados.get("calculo") is not None or not parcial:
        if (dados.get("calculo") or "valor") not in ("valor", "percentual_salario", "horas", "dias"):
            raise RegraDeNegocio("Cálculo inválido.")
        campos["calculo"] = dados.get("calculo") or "valor"
    if "percentual" in dados:
        campos["percentual"] = dados["percentual"]
    for campo in ("incide_inss", "incide_irrf", "incide_fgts", "deduz_irrf", "entra_dsr"):
        if dados.get(campo) is not None or not parcial:
            campos[campo] = bool(dados.get(campo))
    return campos


def listar_tabelas(ctx: Contexto) -> list[dict]:
    with ctx.ler() as db:
        return db.todos(
            """
            SELECT id, organizacao_id IS NULL AS oficial, tipo, vigencia, dados, fonte, criado_em
              FROM financeiro.tabela_fiscal
             WHERE organizacao_id IS NULL OR organizacao_id = %s
             ORDER BY tipo, vigencia DESC, organizacao_id NULLS LAST
            """,
            (ctx.org_id,),
        )


def criar_tabela(ctx: Contexto, dados: dict) -> dict:
    """Tabela da própria empresa — quando o governo publica uma nova antes da atualização do módulo."""
    tipo = dados.get("tipo")
    if tipo not in ("inss", "irrf"):
        raise RegraDeNegocio("Tipo da tabela: inss ou irrf.")
    fonte = texto(dados.get("fonte"))
    if not fonte or len(fonte) < 5:
        raise RegraDeNegocio("Informe a norma que publicou a tabela (ex.: número da portaria).")
    try:
        (dom.TabelaInss if tipo == "inss" else dom.TabelaIrrf).de_dados(dados.get("dados") or {})
    except (ValueError, KeyError, TypeError) as exc:
        raise RegraDeNegocio(f"Tabela inválida: {exc}") from exc
    vigencia = competencia_de(dados.get("vigencia") or ctx.hoje)
    with ctx.escrever(f"Tabela de {tipo.upper()} — {fonte}") as db:
        novo_id = db.valor(
            """
            INSERT INTO financeiro.tabela_fiscal (organizacao_id, tipo, vigencia, dados, fonte)
            VALUES (%s, %s, %s, %s::jsonb, %s) RETURNING id
            """,
            (ctx.org_id, tipo, vigencia, _json(dados["dados"]), fonte),
        )
    return next(t for t in listar_tabelas(ctx) if str(t["id"]) == str(novo_id))


def _tabela_vigente(db: Consulta, org_id: str, tipo: str, mes: date):
    linha = db.um(
        """
        SELECT dados, fonte FROM financeiro.tabela_fiscal
         WHERE tipo = %s AND vigencia <= %s AND (organizacao_id IS NULL OR organizacao_id = %s)
         ORDER BY vigencia DESC, organizacao_id NULLS LAST LIMIT 1
        """,
        (tipo, mes, org_id),
    )
    if not linha:
        raise RegraDeNegocio(
            f"Não há tabela de {tipo.upper()} vigente em {mes:%m/%Y}. Cadastre-a em Configurações > Tabelas de imposto."
        )
    classe = dom.TabelaInss if tipo == "inss" else dom.TabelaIrrf
    return classe.de_dados(linha["dados"], linha["fonte"])


# ==========================================================================
# Folha: cálculo
# ==========================================================================

class _Ambiente:
    """O que o cálculo de todos os holerites de uma folha compartilha."""

    def __init__(self, db: Consulta, org_id: str, folha: dict):
        self.folha = folha
        self.mes = folha["competencia"]
        self.org = db.um("SELECT * FROM financeiro.organizacao WHERE id = %s", (org_id,))
        self.encargos = org_servico.encargos(self.org)
        self.calendario = calendario_da_empresa(db, org_id)
        self.rubricas = {
            str(r["id"]): r for r in db.todos("SELECT * FROM financeiro.rubrica WHERE organizacao_id = %s", (org_id,))
        }
        self.sistema = {r["sistema"]: self.rubrica(r) for r in self.rubricas.values() if r["sistema"]}
        faltando = set(dom.rubricas_do_sistema()) - set(self.sistema)
        if faltando:
            raise RegraDeNegocio(f"Rubricas do sistema ausentes: {', '.join(sorted(faltando))}.")
        if folha["tipo"] == "mensal":
            self.inss = _tabela_vigente(db, org_id, "inss", self.mes)
            self.irrf = _tabela_vigente(db, org_id, "irrf", self.mes)

    @staticmethod
    def rubrica(linha: dict) -> dom.Rubrica:
        return dom.Rubrica(
            chave=str(linha["id"]), nome=linha["nome"], tipo=linha["tipo"],
            incide_inss=linha["incide_inss"], incide_irrf=linha["incide_irrf"],
            incide_fgts=linha["incide_fgts"], deduz_irrf=linha["deduz_irrf"], entra_dsr=linha["entra_dsr"],
        )


def _calcular_holerite(db: Consulta, org_id: str, amb: _Ambiente, holerite: dict) -> None:
    colab = db.um("SELECT * FROM financeiro.colaborador WHERE id = %s", (holerite["colaborador_id"],))
    dom_colab = _dominio_colaborador(colab)
    salario, horas = Decimal(colab["salario_base"]), Decimal(colab["horas_mes"])
    inicio, fim = amb.mes, ultimo_dia_do_mes(amb.mes)
    credores: dict[str, str | None] = {}

    if amb.folha["tipo"] == "adiantamento":
        resultado = dom.calcular_adiantamento(
            dom_colab, amb.mes, Decimal(amb.org["percentual_adiantamento"]), amb.sistema
        )
    else:
        lancamentos: list[dom.Lancamento] = []
        fixos = db.todos(
            """
            SELECT * FROM financeiro.colaborador_rubrica
             WHERE colaborador_id = %s AND inicio <= %s AND (fim IS NULL OR fim >= %s)
            """,
            (colab["id"], fim, inicio),
        )
        for fixo in fixos:
            rub = amb.rubricas[str(fixo["rubrica_id"])]
            if not rub["ativa"]:
                continue
            valor = dom.valor_por_calculo(
                rub["calculo"], salario, horas, fixo["referencia"], fixo["valor"], rub["percentual"], fixo["limite"]
            )
            lancamentos.append(dom.Lancamento(amb.rubrica(rub), valor, fixo["referencia"], "fixo"))
            credores[str(rub["id"])] = str(fixo["credor_id"] or rub["credor_id"] or "") or None

        # Os lançados do mês sobrevivem ao recálculo; o valor é refeito pela
        # regra da rubrica (salário pode ter mudado desde o lançamento).
        for item in db.todos(
            "SELECT * FROM financeiro.holerite_item WHERE holerite_id = %s AND origem = 'lancado'", (holerite["id"],)
        ):
            rub = amb.rubricas[str(item["rubrica_id"])]
            valor = item["valor"]
            if rub["calculo"] != "valor" and item["referencia"] is not None:
                valor = dom.valor_por_calculo(rub["calculo"], salario, horas, item["referencia"], None, rub["percentual"])
                if valor != item["valor"]:
                    db.executar("UPDATE financeiro.holerite_item SET valor = %s WHERE id = %s", (valor, item["id"]))
            lancamentos.append(dom.Lancamento(amb.rubrica(rub), valor, item["referencia"], "lancado"))
            if rub["credor_id"]:
                credores.setdefault(str(rub["id"]), str(rub["credor_id"]))

        adiantado = db.valor(
            """
            SELECT h.liquido FROM financeiro.holerite h JOIN financeiro.folha f ON f.id = h.folha_id
             WHERE f.organizacao_id = %s AND f.tipo = 'adiantamento' AND f.competencia = %s
               AND h.colaborador_id = %s
            """,
            (org_id, amb.mes, colab["id"]),
        )
        if adiantado and adiantado > 0:
            lancamentos.append(dom.Lancamento(amb.sistema["desconto_adiantamento"], Decimal(adiantado), None, "adiantamento"))

        resultado = dom.calcular_holerite(
            dom_colab, amb.mes, lancamentos, amb.inss, amb.irrf, amb.encargos, amb.calendario, amb.sistema
        )

    calculado = {
        "inss": resultado.inss, "irrf": resultado.irrf, "fgts": resultado.fgts,
        "encargos_patronais": resultado.encargos_patronais, "liquido": resultado.liquido,
    }
    ajuste = holerite.get("ajuste")
    if ajuste:
        _aplicar_ajuste(resultado, ajuste, amb)

    db.executar(
        "DELETE FROM financeiro.holerite_item WHERE holerite_id = %s AND origem <> 'lancado'", (holerite["id"],)
    )
    for item in resultado.itens:
        if item.origem == "lancado":
            continue
        db.executar(
            """
            INSERT INTO financeiro.holerite_item (organizacao_id, holerite_id, rubrica_id, referencia, valor, origem, credor_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (org_id, holerite["id"], item.chave, item.referencia, item.valor, item.origem,
             credores.get(item.chave) if item.origem == "fixo" else None),
        )
    detalhe = resultado.detalhe_irrf
    db.executar(
        """
        UPDATE financeiro.holerite SET
          vinculo = %(vinculo)s, salario_base = %(salario)s, centro_custo_id = %(centro)s,
          dias_trabalhados = %(dias)s, total_proventos = %(proventos)s, total_descontos = %(descontos)s,
          liquido = %(liquido)s, base_inss = %(base_inss)s, inss = %(inss)s, base_irrf = %(base_irrf)s,
          irrf = %(irrf)s, base_fgts = %(base_fgts)s, fgts = %(fgts)s,
          encargos_patronais = %(encargos)s, beneficios = %(beneficios)s, custo_total = %(custo)s,
          detalhe_irrf = %(detalhe)s::jsonb, avisos = %(avisos)s,
          calculado = %(calculado)s::jsonb
        WHERE id = %(id)s
        """,
        {
            "vinculo": colab["vinculo"], "salario": salario, "centro": colab["centro_custo_id"],
            "dias": resultado.dias_trabalhados, "proventos": resultado.total_proventos,
            "descontos": resultado.total_descontos, "liquido": resultado.liquido,
            "base_inss": resultado.base_inss, "inss": resultado.inss, "base_irrf": resultado.base_irrf,
            "irrf": resultado.irrf, "base_fgts": resultado.base_fgts, "fgts": resultado.fgts,
            "encargos": resultado.encargos_patronais, "beneficios": resultado.beneficios,
            "custo": resultado.custo_total,
            "detalhe": _json(detalhe.__dict__) if detalhe else None,
            "avisos": resultado.avisos,
            "calculado": _json(calculado) if ajuste else None,
            "id": holerite["id"],
        },
    )


def _aplicar_ajuste(resultado: dom.Holerite, ajuste: dict, amb: _Ambiente) -> None:
    """Troca INSS, IRRF, FGTS e encargos pelos valores da contabilidade e refaz os totais."""
    for chave_sistema, campo in (("inss", "inss"), ("irrf", "irrf")):
        if ajuste.get(campo) is None:
            continue
        valor = dinheiro(ajuste[campo])
        rub = amb.sistema[chave_sistema]
        resultado.itens = [i for i in resultado.itens if i.chave != rub.chave]
        if valor > 0:
            resultado.itens.append(dom.ItemCalculado(rub.chave, rub.nome, "desconto", valor, None, "ajuste"))
        setattr(resultado, campo, valor)
    if ajuste.get("fgts") is not None:
        resultado.fgts = dinheiro(ajuste["fgts"])
    if ajuste.get("encargos_patronais") is not None:
        resultado.encargos_patronais = dinheiro(ajuste["encargos_patronais"])
    resultado.total_descontos = somar(i.valor for i in resultado.itens if i.tipo == "desconto")
    resultado.liquido = resultado.total_proventos - resultado.total_descontos
    resultado.custo_total = resultado.total_proventos + resultado.fgts + resultado.encargos_patronais + resultado.beneficios
    resultado.avisos.append("Valores de INSS/IRRF/FGTS informados pela contabilidade.")


def _elegiveis(db: Consulta, org_id: str, folha: dict) -> list[dict]:
    """Quem entra na folha: vínculo de folha e ao menos um dia no mês."""
    inicio, fim = folha["competencia"], ultimo_dia_do_mes(folha["competencia"])
    vinculos = ("clt", "aprendiz", "estagio") if folha["tipo"] == "adiantamento" else dom.VINCULOS_EM_FOLHA
    return db.todos(
        """
        SELECT id FROM financeiro.colaborador
         WHERE organizacao_id = %s AND vinculo = ANY(%s) AND data_admissao <= %s
           AND (data_desligamento IS NULL OR data_desligamento >= %s)
        """,
        (org_id, list(vinculos), fim, inicio),
    )


def _recalcular(db: Consulta, org_id: str, folha_id: str) -> None:
    folha = db.um("SELECT * FROM financeiro.folha WHERE id = %s AND organizacao_id = %s FOR UPDATE", (folha_id, org_id))
    if not folha:
        raise NaoEncontrado("Folha não encontrada.")
    if folha["status"] == "fechada":
        raise RegraDeNegocio("Folha fechada não recalcula. Reabra para alterar.")
    amb = _Ambiente(db, org_id, folha)

    elegiveis = {str(l["id"]) for l in _elegiveis(db, org_id, folha)}
    atuais = {str(h["colaborador_id"]): h for h in db.todos("SELECT * FROM financeiro.holerite WHERE folha_id = %s", (folha_id,))}
    for colab_id in elegiveis - set(atuais):
        db.executar(
            "INSERT INTO financeiro.holerite (organizacao_id, folha_id, colaborador_id, vinculo) "
            "SELECT %s, %s, id, vinculo FROM financeiro.colaborador WHERE id = %s",
            (org_id, folha_id, colab_id),
        )
    for colab_id, h in atuais.items():
        if colab_id not in elegiveis:
            tem_lancado = db.valor(
                "SELECT EXISTS (SELECT 1 FROM financeiro.holerite_item WHERE holerite_id = %s AND origem = 'lancado')",
                (h["id"],),
            )
            if not tem_lancado:
                db.executar("DELETE FROM financeiro.holerite WHERE id = %s", (h["id"],))

    for holerite in db.todos("SELECT * FROM financeiro.holerite WHERE folha_id = %s", (folha_id,)):
        _calcular_holerite(db, org_id, amb, holerite)
    db.executar(
        "UPDATE financeiro.folha SET status = 'calculada', calculada_em = now() WHERE id = %s", (folha_id,)
    )


# ==========================================================================
# Folha: casos de uso
# ==========================================================================

def listar_folhas(ctx: Contexto, ano: int | None = None) -> list[dict]:
    with ctx.ler() as db:
        return db.todos(
            """
            SELECT f.*, count(h.id) AS colaboradores,
                   COALESCE(sum(h.total_proventos), 0) AS total_proventos,
                   COALESCE(sum(h.liquido), 0) AS total_liquido,
                   COALESCE(sum(h.custo_total), 0) AS custo_total
              FROM financeiro.folha f
              LEFT JOIN financeiro.holerite h ON h.folha_id = f.id
             WHERE f.organizacao_id = %s AND (%s::int IS NULL OR extract(year FROM f.competencia) = %s)
             GROUP BY f.id
             ORDER BY f.competencia DESC, f.tipo DESC
            """,
            (ctx.org_id, ano, ano),
        )


def criar_folha(ctx: Contexto, dados: dict) -> dict:
    tipo = dados.get("tipo") or "mensal"
    if tipo not in TIPOS_DE_FOLHA:
        raise RegraDeNegocio("Tipo de folha: mensal ou adiantamento.")
    mes = competencia_de(dados.get("competencia") or ctx.hoje)
    with ctx.escrever() as db:
        exigir_periodo_aberto(db, ctx.org_id, mes, "A competência da folha")
        pagamento = dados.get("data_pagamento")
        if not pagamento:
            calendario = calendario_da_empresa(db, ctx.org_id)
            if tipo == "mensal":
                pagamento = dom.vencimentos_padrao(mes, calendario)["salario"]
            else:
                pagamento = calendario.antecipar_para_dia_util(mes.replace(day=20))
        existente = db.valor(
            "SELECT id FROM financeiro.folha WHERE organizacao_id = %s AND competencia = %s AND tipo = %s",
            (ctx.org_id, mes, tipo),
        )
        if existente:
            raise RegraDeNegocio("Já existe essa folha. Abra a existente.")
        folha_id = str(db.valor(
            """
            INSERT INTO financeiro.folha (organizacao_id, competencia, tipo, data_pagamento, observacao)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
            """,
            (ctx.org_id, mes, tipo, pagamento, texto(dados.get("observacao"))),
        ))
        if not _elegiveis(db, ctx.org_id, {"competencia": mes, "tipo": tipo}):
            raise RegraDeNegocio("Nenhum colaborador com vínculo de folha neste mês. Cadastre os colaboradores primeiro.")
        _recalcular(db, ctx.org_id, folha_id)
    return obter_folha(ctx, folha_id)


def obter_folha(ctx: Contexto, folha_id: str) -> dict:
    with ctx.ler() as db:
        folha = exigir_da_empresa(db, "folha", ctx.org_id, folha_id, "Folha")
        folha["holerites"] = db.todos(
            """
            SELECT h.id, h.colaborador_id, p.nome, c.cargo, h.vinculo, h.salario_base, h.dias_trabalhados,
                   cc.nome AS centro_custo_nome, h.total_proventos, h.total_descontos, h.liquido,
                   h.inss, h.irrf, h.fgts, h.encargos_patronais, h.beneficios, h.custo_total,
                   h.avisos, h.ajuste IS NOT NULL AS ajustado,
                   (SELECT count(*) FROM financeiro.holerite_item i WHERE i.holerite_id = h.id AND i.origem = 'lancado') AS lancamentos
              FROM financeiro.holerite h
              JOIN financeiro.colaborador c ON c.id = h.colaborador_id
              JOIN financeiro.pessoa p ON p.id = c.pessoa_id
              LEFT JOIN financeiro.centro_custo cc ON cc.id = h.centro_custo_id
             WHERE h.folha_id = %s
             ORDER BY lower(p.nome)
            """,
            (folha_id,),
        )
        folha["titulos"] = db.todos(
            """
            SELECT t.id, t.descricao, t.valor_total, t.cancelado_em, p.vencimento, p.status
              FROM financeiro.titulo t JOIN financeiro.parcela p ON p.titulo_id = t.id
             WHERE t.organizacao_id = %s AND t.origem = 'folha' AND t.origem_id = %s
             ORDER BY t.cancelado_em NULLS FIRST, p.vencimento, t.descricao
            """,
            (ctx.org_id, folha_id),
        )
    campos = ("total_proventos", "total_descontos", "liquido", "inss", "irrf", "fgts", "encargos_patronais", "beneficios", "custo_total")
    folha["totais"] = {c: somar(h[c] for h in folha["holerites"]) for c in campos}
    return folha


def obter_holerite(ctx: Contexto, holerite_id: str) -> dict:
    with ctx.ler() as db:
        holerite = db.um(
            """
            SELECT h.*, p.nome, p.documento, c.cargo, c.matricula, c.data_admissao, c.dependentes_irrf,
                   f.competencia, f.tipo AS folha_tipo, f.status AS folha_status, f.data_pagamento,
                   cc.nome AS centro_custo_nome, o.nome AS empresa_nome, o.documento AS empresa_documento
              FROM financeiro.holerite h
              JOIN financeiro.folha f ON f.id = h.folha_id
              JOIN financeiro.colaborador c ON c.id = h.colaborador_id
              JOIN financeiro.pessoa p ON p.id = c.pessoa_id
              JOIN financeiro.organizacao o ON o.id = h.organizacao_id
              LEFT JOIN financeiro.centro_custo cc ON cc.id = h.centro_custo_id
             WHERE h.id = %s AND h.organizacao_id = %s
            """,
            (holerite_id, ctx.org_id),
        )
        if not holerite:
            raise NaoEncontrado("Holerite não encontrado.")
        holerite["itens"] = db.todos(
            """
            SELECT i.id, i.rubrica_id, r.codigo, r.nome, r.tipo, i.referencia, i.valor, i.origem,
                   pe.nome AS credor_nome
              FROM financeiro.holerite_item i
              JOIN financeiro.rubrica r ON r.id = i.rubrica_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = i.credor_id
             WHERE i.holerite_id = %s
             ORDER BY CASE r.tipo WHEN 'provento' THEN 0 WHEN 'desconto' THEN 1 ELSE 2 END, r.codigo
            """,
            (holerite_id,),
        )
    return holerite


def lancar(ctx: Contexto, folha_id: str, dados: dict) -> dict:
    """Lança um variável do mês (hora extra, falta, comissão) e recalcula o holerite."""
    with ctx.escrever() as db:
        folha = exigir_da_empresa(db, "folha", ctx.org_id, folha_id, "Folha")
        if folha["status"] == "fechada":
            raise RegraDeNegocio("Folha fechada. Reabra para lançar.")
        if folha["tipo"] != "mensal":
            raise RegraDeNegocio("Lançamentos entram na folha mensal; o adiantamento é só o percentual.")
        holerite = db.um(
            "SELECT * FROM financeiro.holerite WHERE folha_id = %s AND colaborador_id = %s",
            (folha_id, dados.get("colaborador_id")),
        )
        if not holerite:
            raise RegraDeNegocio("Este colaborador não está nesta folha.")
        rubrica = exigir_da_empresa(db, "rubrica", ctx.org_id, dados.get("rubrica_id"), "Rubrica")
        if rubrica["sistema"]:
            raise RegraDeNegocio("Esta rubrica é calculada pelo sistema.")
        if not rubrica["ativa"]:
            raise RegraDeNegocio("Rubrica inativa.")
        colab = db.um("SELECT salario_base, horas_mes FROM financeiro.colaborador WHERE id = %s", (holerite["colaborador_id"],))
        referencia = dados.get("referencia")
        if rubrica["calculo"] == "valor":
            valor = dinheiro(dados.get("valor") or 0)
        else:
            if referencia in (None, ""):
                raise RegraDeNegocio("Informe a referência (horas, dias ou %).")
            valor = dom.valor_por_calculo(
                rubrica["calculo"], Decimal(colab["salario_base"]), Decimal(colab["horas_mes"]),
                Decimal(str(referencia)), None, rubrica["percentual"],
            )
        if valor <= 0:
            raise RegraDeNegocio("O lançamento precisa de valor maior que zero.")
        db.executar(
            """
            INSERT INTO financeiro.holerite_item (organizacao_id, holerite_id, rubrica_id, referencia, valor, origem, credor_id)
            VALUES (%s, %s, %s, %s, %s, 'lancado', %s)
            """,
            (ctx.org_id, holerite["id"], rubrica["id"], referencia, valor, rubrica["credor_id"]),
        )
        amb = _Ambiente(db, ctx.org_id, folha)
        _calcular_holerite(db, ctx.org_id, amb, holerite)
    return obter_holerite(ctx, str(holerite["id"]))


def remover_lancamento(ctx: Contexto, folha_id: str, item_id: str) -> dict:
    with ctx.escrever() as db:
        folha = exigir_da_empresa(db, "folha", ctx.org_id, folha_id, "Folha")
        if folha["status"] == "fechada":
            raise RegraDeNegocio("Folha fechada. Reabra para alterar.")
        item = db.um(
            """
            SELECT i.id, i.holerite_id FROM financeiro.holerite_item i
              JOIN financeiro.holerite h ON h.id = i.holerite_id
             WHERE i.id = %s AND h.folha_id = %s AND i.origem = 'lancado'
            """,
            (item_id, folha_id),
        )
        if not item:
            raise NaoEncontrado("Lançamento não encontrado (só os lançados à mão podem ser removidos).")
        db.executar("DELETE FROM financeiro.holerite_item WHERE id = %s", (item_id,))
        holerite = db.um("SELECT * FROM financeiro.holerite WHERE id = %s", (item["holerite_id"],))
        _calcular_holerite(db, ctx.org_id, _Ambiente(db, ctx.org_id, folha), holerite)
    return obter_holerite(ctx, str(item["holerite_id"]))


def recalcular(ctx: Contexto, folha_id: str) -> dict:
    with ctx.escrever("Recálculo da folha") as db:
        _recalcular(db, ctx.org_id, folha_id)
    return obter_folha(ctx, folha_id)


def ajustar(ctx: Contexto, holerite_id: str, dados: dict) -> dict:
    """Valores da contabilidade para INSS, IRRF, FGTS e encargos. Prevalecem sobre o cálculo."""
    campos = {c: dados.get(c) for c in ("inss", "irrf", "fgts", "encargos_patronais") if dados.get(c) not in (None, "")}
    if not campos:
        raise RegraDeNegocio("Informe ao menos um valor da contabilidade.")
    ajuste = {c: str(dinheiro(v)) for c, v in campos.items()}
    if any(Decimal(v) < 0 for v in ajuste.values()):
        raise RegraDeNegocio("Valores da contabilidade não podem ser negativos.")
    ajuste.update(observacao=texto(dados.get("observacao")), por=ctx.autor, em=ctx.hoje.isoformat())
    with ctx.escrever(ajuste["observacao"] or "Ajuste da contabilidade") as db:
        holerite = exigir_da_empresa(db, "holerite", ctx.org_id, holerite_id, "Holerite")
        folha = db.um("SELECT * FROM financeiro.folha WHERE id = %s", (holerite["folha_id"],))
        if folha["status"] == "fechada":
            raise RegraDeNegocio("Folha fechada. Reabra para ajustar.")
        db.executar("UPDATE financeiro.holerite SET ajuste = %s::jsonb WHERE id = %s", (_json(ajuste), holerite_id))
        holerite["ajuste"] = ajuste
        _calcular_holerite(db, ctx.org_id, _Ambiente(db, ctx.org_id, folha), holerite)
    return obter_holerite(ctx, holerite_id)


def remover_ajuste(ctx: Contexto, holerite_id: str) -> dict:
    with ctx.escrever("Ajuste da contabilidade removido") as db:
        holerite = exigir_da_empresa(db, "holerite", ctx.org_id, holerite_id, "Holerite")
        folha = db.um("SELECT * FROM financeiro.folha WHERE id = %s", (holerite["folha_id"],))
        if folha["status"] == "fechada":
            raise RegraDeNegocio("Folha fechada. Reabra para alterar.")
        db.executar("UPDATE financeiro.holerite SET ajuste = NULL, calculado = NULL WHERE id = %s", (holerite_id,))
        holerite["ajuste"] = None
        _calcular_holerite(db, ctx.org_id, _Ambiente(db, ctx.org_id, folha), holerite)
    return obter_holerite(ctx, holerite_id)


def fechar(ctx: Contexto, folha_id: str) -> dict:
    """Fecha a folha e gera as contas a pagar, tudo na mesma transação."""
    with ctx.escrever("Fechamento da folha") as db:
        _recalcular(db, ctx.org_id, folha_id)
        folha = db.um("SELECT * FROM financeiro.folha WHERE id = %s", (folha_id,))
        if folha["tipo"] == "mensal":
            pendente = db.valor(
                """
                SELECT EXISTS (SELECT 1 FROM financeiro.folha WHERE organizacao_id = %s AND tipo = 'adiantamento'
                                AND competencia = %s AND status <> 'fechada')
                """,
                (ctx.org_id, folha["competencia"]),
            )
            if pendente:
                raise RegraDeNegocio("Feche primeiro o adiantamento desta competência: ele é descontado aqui.")
        holerites = db.todos(
            """
            SELECT h.*, c.pessoa_id, p.nome FROM financeiro.holerite h
              JOIN financeiro.colaborador c ON c.id = h.colaborador_id
              JOIN financeiro.pessoa p ON p.id = c.pessoa_id
             WHERE h.folha_id = %s
            """,
            (folha_id,),
        )
        if not holerites:
            raise RegraDeNegocio("Folha sem colaboradores.")
        org = db.um("SELECT * FROM financeiro.organizacao WHERE id = %s", (ctx.org_id,))
        calendario = calendario_da_empresa(db, ctx.org_id)

        para_fechar = []
        pessoa_do_colaborador = {}
        for h in holerites:
            repasses = db.todos(
                """
                SELECT i.credor_id, r.nome, i.valor FROM financeiro.holerite_item i
                  JOIN financeiro.rubrica r ON r.id = i.rubrica_id
                 WHERE i.holerite_id = %s AND r.tipo = 'desconto' AND i.credor_id IS NOT NULL
                """,
                (h["id"],),
            )
            pessoa_do_colaborador[str(h["colaborador_id"])] = str(h["pessoa_id"])
            para_fechar.append(dom.HoleriteParaFechar(
                colaborador_ref=str(h["colaborador_id"]),
                colaborador_nome=h["nome"],
                centro_custo=str(h["centro_custo_id"]) if h["centro_custo_id"] else None,
                vinculo=h["vinculo"],
                liquido=h["liquido"], inss=h["inss"], irrf=h["irrf"], fgts=h["fgts"],
                encargos_patronais=h["encargos_patronais"],
                repasses=tuple((str(r["credor_id"]), f"{r['nome']} — {h['nome']}", r["valor"]) for r in repasses),
            ))

        titulos = dom.titulos_da_folha(
            folha["tipo"], folha["competencia"], para_fechar, folha["data_pagamento"],
            dom.vencimentos_padrao(folha["competencia"], calendario), org["guia_unica_dctfweb"],
        )
        categorias: dict[str, str] = {}
        for titulo in titulos:
            if titulo.credor.startswith("colaborador:"):
                pessoa_id = pessoa_do_colaborador[titulo.credor.split(":", 1)[1]]
            elif titulo.credor.startswith("pessoa:"):
                pessoa_id = titulo.credor.split(":", 1)[1]
            else:
                pessoa_id = pessoa_do_sistema(db, ctx.org_id, titulo.credor)
            rateio = []
            for parte in titulo.partes:
                if parte.categoria not in categorias:
                    categorias[parte.categoria] = categoria_do_sistema(db, ctx.org_id, parte.categoria)
                rateio.append(RateioNovo(categorias[parte.categoria], parte.centro_custo, parte.valor))
            _inserir_titulo(
                db, ctx.org_id, ctx.autor,
                tipo="pagar", descricao=titulo.descricao, competencia=folha["competencia"],
                parcelas=[ParcelaNova(titulo.vencimento, titulo.valor)], rateio=rateio,
                pessoa_id=pessoa_id, data_emissao=ctx.hoje,
                origem="folha", origem_id=folha_id, origem_chave=f"folha:{folha_id}:{titulo.chave}",
            )
        db.executar(
            "UPDATE financeiro.folha SET status = 'fechada', fechada_em = now(), fechada_por = %s WHERE id = %s",
            (ctx.autor, folha_id),
        )
    return obter_folha(ctx, folha_id)


def reabrir(ctx: Contexto, folha_id: str, motivo: str) -> dict:
    motivo = texto(motivo)
    if not motivo:
        raise RegraDeNegocio("Informe o motivo da reabertura.")
    with ctx.escrever(motivo) as db:
        folha = exigir_da_empresa(db, "folha", ctx.org_id, folha_id, "Folha")
        if folha["status"] != "fechada":
            raise RegraDeNegocio("A folha não está fechada.")
        if folha["tipo"] == "adiantamento":
            mensal_fechada = db.valor(
                """
                SELECT EXISTS (SELECT 1 FROM financeiro.folha WHERE organizacao_id = %s AND tipo = 'mensal'
                                AND competencia = %s AND status = 'fechada')
                """,
                (ctx.org_id, folha["competencia"]),
            )
            if mensal_fechada:
                raise RegraDeNegocio("A folha mensal desta competência já fechou descontando este adiantamento. Reabra a mensal antes.")
        for titulo in db.todos(
            "SELECT id FROM financeiro.titulo WHERE organizacao_id = %s AND origem = 'folha' AND origem_id = %s AND cancelado_em IS NULL",
            (ctx.org_id, folha_id),
        ):
            _cancelar(db, str(titulo["id"]), f"Folha reaberta: {motivo}")
        db.executar(
            "UPDATE financeiro.folha SET status = 'calculada', fechada_em = NULL, fechada_por = NULL WHERE id = %s",
            (folha_id,),
        )
    return obter_folha(ctx, folha_id)


def excluir_folha(ctx: Contexto, folha_id: str) -> None:
    with ctx.escrever("Folha excluída") as db:
        folha = exigir_da_empresa(db, "folha", ctx.org_id, folha_id, "Folha")
        if folha["status"] == "fechada":
            raise RegraDeNegocio("Folha fechada não se exclui. Reabra antes.")
        db.executar("DELETE FROM financeiro.folha WHERE id = %s", (folha_id,))


# ==========================================================================
# Custos e provisões
# ==========================================================================

def custos(ctx: Contexto, mes: date | None = None) -> dict:
    """Custo de pessoal da competência: da folha, se já existe; senão, estimado."""
    mes = competencia_de(mes or ctx.hoje)
    with ctx.ler() as db:
        org = db.um("SELECT * FROM financeiro.organizacao WHERE id = %s", (ctx.org_id,))
        encargos = org_servico.encargos(org)
        folha = db.um(
            "SELECT id, status FROM financeiro.folha WHERE organizacao_id = %s AND competencia = %s AND tipo = 'mensal'",
            (ctx.org_id, mes),
        )
        colaboradores = db.todos(
            _SELECT_COLABORADOR
            + """ WHERE c.organizacao_id = %(org)s AND c.data_admissao <= %(fim)s
                  AND (c.data_desligamento IS NULL OR c.data_desligamento >= %(inicio)s)
                  ORDER BY lower(p.nome)""",
            {"org": ctx.org_id, "hoje": ctx.hoje, "inicio": mes, "fim": ultimo_dia_do_mes(mes)},
        )
        holerites = {}
        if folha:
            holerites = {
                str(h["colaborador_id"]): h
                for h in db.todos("SELECT * FROM financeiro.holerite WHERE folha_id = %s", (folha["id"],))
            }
        amb = None
        if not folha:
            try:
                amb = _Ambiente(db, ctx.org_id, {"competencia": mes, "tipo": "mensal"})
            except RegraDeNegocio:
                amb = None  # sem tabela vigente: mostra só salário e provisão

    linhas = []
    for colab in colaboradores:
        dom_colab = _dominio_colaborador(colab)
        provisao = dom.provisao_mensal(dom_colab, encargos)
        h = holerites.get(str(colab["id"]))
        if h:
            custo, fonte = h["custo_total"], "folha"
            proventos, encargos_valor = h["total_proventos"], h["fgts"] + h["encargos_patronais"]
        elif colab["vinculo"] in dom.VINCULOS_EM_FOLHA and amb:
            estimado = dom.calcular_holerite(dom_colab, mes, [], amb.inss, amb.irrf, encargos, amb.calendario, amb.sistema)
            custo, fonte = estimado.custo_total, "estimativa"
            proventos, encargos_valor = estimado.total_proventos, estimado.fgts + estimado.encargos_patronais
        else:
            # PJ e autônomo: o custo é o valor contratado, pago como conta a pagar.
            custo, fonte = Decimal(colab["salario_base"]), "contrato"
            proventos, encargos_valor = Decimal(colab["salario_base"]), ZERO
        linhas.append({
            "colaborador_id": colab["id"], "nome": colab["nome"], "cargo": colab["cargo"],
            "vinculo": colab["vinculo"], "centro_custo_nome": colab["centro_custo_nome"],
            "salario_base": colab["salario_base"], "proventos": proventos, "encargos": encargos_valor,
            "custo_mes": custo, "provisao": provisao.total, "custo_com_provisao": custo + provisao.total,
            "fonte": fonte,
        })

    por_centro: dict[str, dict] = {}
    for linha in linhas:
        chave = linha["centro_custo_nome"] or "Sem centro de custo"
        grupo = por_centro.setdefault(chave, {"centro_custo": chave, "pessoas": 0, "custo_mes": ZERO, "provisao": ZERO})
        grupo["pessoas"] += 1
        grupo["custo_mes"] += linha["custo_mes"]
        grupo["provisao"] += linha["provisao"]
    return {
        "competencia": mes,
        "folha_status": folha["status"] if folha else None,
        "colaboradores": linhas,
        "por_centro": sorted(por_centro.values(), key=lambda g: -g["custo_mes"]),
        "totais": {
            "pessoas": len(linhas),
            "custo_mes": somar(l["custo_mes"] for l in linhas),
            "provisao": somar(l["provisao"] for l in linhas),
            "custo_com_provisao": somar(l["custo_com_provisao"] for l in linhas),
        },
    }
