"""Contas a pagar e a receber: título, parcelas, rateio e baixas.

Vocabulário (o mesmo da tela):

  título   a conta em si — "Aluguel de setembro", "Mensalidade da Dona Maria".
           Tem número sequencial por empresa ("Título 42"), dado pelo banco.
  parcela  quando e quanto vence; um título à vista tem uma parcela
  rateio   em que categoria e centro de custo o valor cai
  baixa    o pagamento (ou recebimento) de uma parcela, total ou parcial

Regras que valem aqui e no banco:
  - pagamento não se edita nem se apaga: estorna-se, e o estorno lança o
    dinheiro de volta na data do estorno, sem reescrever o passado;
  - parcela paga não muda; as em aberto se refazem pelo reparcelamento
    (`reparcelar`), que pode excluir, criar e alterar parcelas e mudar o total;
  - título não se apaga: cancela-se, com motivo;
  - o que foi gerado por outra parte do módulo (folha, empréstimo, capital,
    patrimônio) muda de valor só por lá.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from ..banco import Consulta
from ..dominio.calendario import competencia as competencia_de
from ..dominio.calendario import somar_meses
from ..dominio.dinheiro import ZERO, dinheiro, dividir_em_parcelas, ratear, somar
from ..erros import NaoEncontrado, RegraDeNegocio
from .contexto import Contexto
from .util import exigir_da_empresa, exigir_periodo_aberto, fechado_ate, texto

FORMAS = (
    "pix", "boleto", "dinheiro", "cartao_credito", "cartao_debito",
    "transferencia", "debito_automatico", "cheque", "outro",
)
# Origens cujo valor só muda pela própria origem (reabrir a folha, cancelar o empréstimo...).
ORIGENS_LIVRES = ("manual", "recorrencia", "conciliacao", "integracao")
NATUREZA_DO_TIPO = {"pagar": "despesa", "receber": "receita"}


@dataclass
class ParcelaNova:
    vencimento: date
    valor: Decimal
    codigo_barras: str | None = None


@dataclass
class RateioNovo:
    categoria_id: str
    centro_custo_id: str | None
    valor: Decimal


# ==========================================================================
# Montagem e validação
# ==========================================================================

def montar_parcelas(
    total: Decimal,
    informadas: list[dict] | None,
    quantidade: int | None,
    primeiro_vencimento: date | None,
) -> list[ParcelaNova]:
    """Parcelas explícitas, ou `quantidade` parcelas mensais a partir do primeiro vencimento."""
    if informadas:
        parcelas = [
            ParcelaNova(p["vencimento"], dinheiro(p["valor"]), texto(p.get("codigo_barras")))
            for p in informadas
        ]
        if any(p.valor <= 0 for p in parcelas):
            raise RegraDeNegocio("Toda parcela precisa de valor maior que zero.")
        if somar(p.valor for p in parcelas) != total:
            raise RegraDeNegocio(
                f"As parcelas somam R$ {somar(p.valor for p in parcelas)} e o total é R$ {total}."
            )
        return sorted(parcelas, key=lambda p: p.vencimento)
    if not primeiro_vencimento:
        raise RegraDeNegocio("Informe o vencimento.")
    quantidade = quantidade or 1
    if not 1 <= quantidade <= 360:
        raise RegraDeNegocio("Quantidade de parcelas fora do limite (1 a 360).")
    valores = dividir_em_parcelas(total, quantidade)
    dia = primeiro_vencimento.day
    return [ParcelaNova(somar_meses(primeiro_vencimento, i, dia), v) for i, v in enumerate(valores)]


def montar_rateio(total: Decimal, linhas: list[dict]) -> list[RateioNovo]:
    """Rateio por valor ou por percentual; uma linha sem valor fica com o total."""
    if not linhas:
        raise RegraDeNegocio("Escolha a categoria.")
    if len(linhas) == 1 and not linhas[0].get("valor") and not linhas[0].get("percentual"):
        return [RateioNovo(linhas[0]["categoria_id"], linhas[0].get("centro_custo_id") or None, total)]
    if all(l.get("percentual") for l in linhas) and not any(l.get("valor") for l in linhas):
        pesos = [Decimal(str(l["percentual"])) for l in linhas]
        if sum(pesos) != 100:
            raise RegraDeNegocio("Os percentuais do rateio devem somar 100%.")
        valores = ratear(total, pesos)
    else:
        valores = [dinheiro(l.get("valor") or 0) for l in linhas]
    rateio = [
        RateioNovo(l["categoria_id"], l.get("centro_custo_id") or None, v)
        for l, v in zip(linhas, valores)
    ]
    if any(r.valor <= 0 for r in rateio):
        raise RegraDeNegocio("Toda linha do rateio precisa de valor maior que zero.")
    if somar(r.valor for r in rateio) != total:
        raise RegraDeNegocio(f"O rateio soma R$ {somar(r.valor for r in rateio)} e o total é R$ {total}.")
    return rateio


def _validar_rateio(db: Consulta, org_id: str, tipo: str, rateio: list[RateioNovo]) -> None:
    for linha in rateio:
        categoria = exigir_da_empresa(db, "categoria", org_id, linha.categoria_id, "Categoria")
        if not categoria["ativa"]:
            raise RegraDeNegocio(f"A categoria {categoria['nome']} está inativa.")
        if categoria["natureza"] != NATUREZA_DO_TIPO[tipo]:
            lado = "a receber" if tipo == "receber" else "a pagar"
            raise RegraDeNegocio(
                f"A categoria {categoria['nome']} é de {categoria['natureza']} e não serve para conta {lado}."
            )
        if linha.centro_custo_id:
            centro = exigir_da_empresa(db, "centro_custo", org_id, linha.centro_custo_id, "Centro de custo")
            if not centro["ativo"]:
                raise RegraDeNegocio(f"O centro de custo {centro['nome']} está inativo.")


# ==========================================================================
# Gravação (compartilhada com folha, recorrência, capital, conciliação)
# ==========================================================================

def _inserir_titulo(
    db: Consulta,
    org_id: str,
    autor: str,
    *,
    tipo: str,
    descricao: str,
    competencia: date,
    parcelas: list[ParcelaNova],
    rateio: list[RateioNovo],
    pessoa_id: str | None = None,
    documento: str | None = None,
    data_emissao: date | None = None,
    observacao: str | None = None,
    origem: str = "manual",
    origem_id: str | None = None,
    origem_chave: str | None = None,
) -> str:
    if tipo not in NATUREZA_DO_TIPO:
        raise RegraDeNegocio("Tipo deve ser 'pagar' ou 'receber'.")
    descricao = texto(descricao)
    if not descricao:
        raise RegraDeNegocio("Descreva o lançamento.")
    total = somar(p.valor for p in parcelas)
    if total <= 0:
        raise RegraDeNegocio("O valor deve ser maior que zero.")
    if pessoa_id:
        pessoa = exigir_da_empresa(db, "pessoa", org_id, pessoa_id, "Pessoa")
        if not pessoa["ativa"]:
            raise RegraDeNegocio(f"{pessoa['nome']} está inativo(a) no cadastro.")
    _validar_rateio(db, org_id, tipo, rateio)
    competencia = competencia_de(competencia)
    exigir_periodo_aberto(db, org_id, competencia, "A competência")

    titulo_id = db.valor(
        """
        INSERT INTO financeiro.titulo
          (organizacao_id, tipo, pessoa_id, descricao, documento, competencia, data_emissao,
           valor_total, origem, origem_id, origem_chave, observacao, criado_por)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (org_id, tipo, pessoa_id, descricao, texto(documento), competencia, data_emissao or date.today(),
         total, origem, origem_id, origem_chave, texto(observacao), autor),
    )
    for numero, parcela in enumerate(parcelas, start=1):
        db.executar(
            """
            INSERT INTO financeiro.parcela (organizacao_id, titulo_id, numero, vencimento, valor, codigo_barras)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (org_id, titulo_id, numero, parcela.vencimento, parcela.valor, parcela.codigo_barras),
        )
    for linha in rateio:
        db.executar(
            """
            INSERT INTO financeiro.rateio (organizacao_id, titulo_id, categoria_id, centro_custo_id, valor)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (org_id, titulo_id, linha.categoria_id, linha.centro_custo_id, linha.valor),
        )
    return str(titulo_id)


def _baixar(
    db: Consulta,
    org_id: str,
    autor: str,
    parcela_id: str,
    conta_id: str,
    data: date,
    valor: Decimal | None = None,
    juros: Decimal = ZERO,
    multa: Decimal = ZERO,
    desconto: Decimal = ZERO,
    forma: str = "pix",
    observacao: str | None = None,
) -> str:
    """Registra o pagamento e o movimento de caixa dele, juntos."""
    # FOR UPDATE: duas baixas simultâneas da mesma parcela entram em fila, e a
    # segunda já enxerga o saldo que a primeira deixou.
    parcela = db.um(
        """
        SELECT p.id, p.numero, p.valor, p.valor_pago, p.cancelada, p.titulo_id,
               t.tipo, t.descricao, t.cancelado_em,
               (SELECT count(*) FROM financeiro.parcela x WHERE x.titulo_id = t.id) AS total_parcelas,
               pe.nome AS pessoa_nome
          FROM financeiro.parcela p
          JOIN financeiro.titulo t ON t.id = p.titulo_id
          LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
         WHERE p.id = %s AND p.organizacao_id = %s
           FOR UPDATE OF p
        """,
        (parcela_id, org_id),
    )
    if not parcela:
        raise NaoEncontrado("Parcela não encontrada.")
    if parcela["cancelada"] or parcela["cancelado_em"]:
        raise RegraDeNegocio("Esta conta foi cancelada.")
    saldo = parcela["valor"] - parcela["valor_pago"]
    if saldo <= 0:
        raise RegraDeNegocio("Esta parcela já está quitada.")
    valor = dinheiro(valor) if valor is not None else saldo
    juros, multa, desconto = dinheiro(juros or 0), dinheiro(multa or 0), dinheiro(desconto or 0)
    if valor <= 0:
        raise RegraDeNegocio("O valor pago deve ser maior que zero.")
    if valor > saldo:
        raise RegraDeNegocio(f"O valor (R$ {valor}) passa do saldo da parcela (R$ {saldo}).")
    if min(juros, multa, desconto) < 0:
        raise RegraDeNegocio("Juros, multa e desconto não podem ser negativos.")
    if forma not in FORMAS:
        raise RegraDeNegocio("Forma de pagamento inválida.")
    conta = exigir_da_empresa(db, "conta", org_id, conta_id, "Conta")
    if not conta["ativa"]:
        raise RegraDeNegocio(f"A conta {conta['nome']} está inativa.")
    exigir_periodo_aberto(db, org_id, data, "O pagamento")

    efetivo = valor + juros + multa - desconto
    if efetivo <= 0:
        raise RegraDeNegocio("O desconto não pode ser maior que o valor pago.")
    baixa_id = db.valor(
        """
        INSERT INTO financeiro.baixa
          (organizacao_id, parcela_id, conta_id, data, valor, juros, multa, desconto, forma, observacao, criado_por)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """,
        (org_id, parcela_id, conta_id, data, valor, juros, multa, desconto, forma, texto(observacao), autor),
    )
    receber = parcela["tipo"] == "receber"
    rotulo = "Recebimento" if receber else "Pagamento"
    partes = [f"{rotulo}: {parcela['descricao']}"]
    if parcela["total_parcelas"] > 1:
        partes.append(f"({parcela['numero']}/{parcela['total_parcelas']})")
    if parcela["pessoa_nome"]:
        partes.append(f"— {parcela['pessoa_nome']}")
    db.executar(
        """
        INSERT INTO financeiro.movimento
          (organizacao_id, conta_id, data, valor, tipo, descricao, baixa_id, criado_por)
        VALUES (%s, %s, %s, %s, 'baixa', %s, %s, %s)
        """,
        (org_id, conta_id, data, efetivo if receber else -efetivo, " ".join(partes)[:300], baixa_id, autor),
    )
    return str(baixa_id)


# ==========================================================================
# Casos de uso
# ==========================================================================

def criar(ctx: Contexto, dados: dict) -> dict:
    """Novo título. Com `pagamento`, já nasce quitado (lançamento à vista)."""
    tipo = dados.get("tipo")
    total = dinheiro(dados.get("valor_total"))
    if total <= 0:
        raise RegraDeNegocio("O valor deve ser maior que zero.")
    emissao = dados.get("data_emissao") or ctx.hoje
    parcelas = montar_parcelas(
        total, dados.get("parcelas"), dados.get("quantidade_parcelas"),
        dados.get("primeiro_vencimento") or (dados.get("pagamento") or {}).get("data") or emissao,
    )
    rateio = montar_rateio(total, dados.get("rateio") or [])
    competencia = dados.get("competencia") or competencia_de(emissao)

    with ctx.escrever() as db:
        titulo_id = _inserir_titulo(
            db, ctx.org_id, ctx.autor,
            tipo=tipo, descricao=dados.get("descricao"), competencia=competencia,
            parcelas=parcelas, rateio=rateio, pessoa_id=dados.get("pessoa_id") or None,
            documento=dados.get("documento"), data_emissao=emissao, observacao=dados.get("observacao"),
        )
        pagamento = dados.get("pagamento")
        if pagamento:
            ids = db.todos("SELECT id FROM financeiro.parcela WHERE titulo_id = %s ORDER BY numero", (titulo_id,))
            for linha in ids:
                _baixar(
                    db, ctx.org_id, ctx.autor, str(linha["id"]), pagamento["conta_id"],
                    pagamento.get("data") or ctx.hoje, forma=pagamento.get("forma") or "pix",
                )
    return obter(ctx, titulo_id)


def obter(ctx: Contexto, titulo_id: str) -> dict:
    with ctx.ler() as db:
        titulo = db.um(
            """
            SELECT t.*, pe.nome AS pessoa_nome, pe.documento AS pessoa_documento
              FROM financeiro.titulo t
              LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
             WHERE t.id = %s AND t.organizacao_id = %s
            """,
            (titulo_id, ctx.org_id),
        )
        if not titulo:
            raise NaoEncontrado("Lançamento não encontrado.")
        titulo["parcelas"] = db.todos(
            """
            SELECT id, numero, vencimento, valor, valor_pago, valor - valor_pago AS saldo, status,
                   codigo_barras, (status IN ('aberta', 'parcial') AND vencimento < %s) AS vencida
              FROM financeiro.parcela WHERE titulo_id = %s ORDER BY numero
            """,
            (ctx.hoje, titulo_id),
        )
        baixas = db.todos(
            """
            SELECT b.id, b.parcela_id, b.data, b.valor, b.juros, b.multa, b.desconto, b.forma,
                   b.observacao, b.estornada_em, b.motivo_estorno, b.criado_por, b.criado_em,
                   c.nome AS conta_nome,
                   EXISTS (SELECT 1 FROM financeiro.extrato_linha e
                             JOIN financeiro.movimento m ON m.id = e.movimento_id
                            WHERE m.baixa_id = b.id) AS conciliada
              FROM financeiro.baixa b
              JOIN financeiro.conta c ON c.id = b.conta_id
             WHERE b.parcela_id IN (SELECT id FROM financeiro.parcela WHERE titulo_id = %s)
             ORDER BY b.data, b.criado_em
            """,
            (titulo_id,),
        )
        for parcela in titulo["parcelas"]:
            parcela["baixas"] = [b for b in baixas if b["parcela_id"] == parcela["id"]]
        titulo["rateio"] = db.todos(
            """
            SELECT r.id, r.categoria_id, c.nome AS categoria_nome, c.grupo, r.centro_custo_id,
                   cc.nome AS centro_custo_nome, r.valor
              FROM financeiro.rateio r
              JOIN financeiro.categoria c ON c.id = r.categoria_id
              LEFT JOIN financeiro.centro_custo cc ON cc.id = r.centro_custo_id
             WHERE r.titulo_id = %s ORDER BY r.valor DESC
            """,
            (titulo_id,),
        )
        # Parcela e rateio excluídos não estão mais nas tabelas, mas a trilha
        # guarda de que título eles eram (o `titulo_id` da linha criada ou apagada).
        titulo["historico"] = db.todos(
            """
            WITH do_titulo AS (
              SELECT id FROM financeiro.parcela WHERE titulo_id = %(t)s::uuid
              UNION SELECT id FROM financeiro.rateio WHERE titulo_id = %(t)s::uuid
              UNION SELECT registro_id FROM financeiro.auditoria
                     WHERE organizacao_id = %(org)s AND tabela IN ('parcela', 'rateio')
                       AND %(t)s::uuid::text IN (antes ->> 'titulo_id', depois ->> 'titulo_id')
            )
            SELECT a.tabela, a.registro_id, a.operacao, a.antes, a.depois, a.usuario_nome, a.motivo, a.em
              FROM financeiro.auditoria a
             WHERE a.organizacao_id = %(org)s
               AND (   (a.tabela = 'titulo' AND a.registro_id = %(t)s::uuid)
                    OR (a.tabela IN ('parcela', 'rateio') AND a.registro_id IN (SELECT id FROM do_titulo))
                    OR (a.tabela = 'baixa' AND a.registro_id IN (
                          SELECT b.id FROM financeiro.baixa b WHERE b.parcela_id IN (SELECT id FROM do_titulo))))
             ORDER BY a.em DESC, a.id DESC
             LIMIT 80
            """,
            {"t": titulo_id, "org": ctx.org_id},
        )
    titulo["saldo"] = somar(p["saldo"] for p in titulo["parcelas"] if p["status"] in ("aberta", "parcial"))
    titulo["editavel"] = titulo["origem"] in ORIGENS_LIVRES and titulo["cancelado_em"] is None
    titulo["tem_baixa"] = any(p["baixas"] for p in titulo["parcelas"])
    return titulo


def editar(ctx: Contexto, titulo_id: str, dados: dict) -> dict:
    """Muda o título. Valor, competência e parcelas só enquanto nada foi pago."""
    with ctx.escrever() as db:
        atual = exigir_da_empresa(db, "titulo", ctx.org_id, titulo_id, "Lançamento")
        if atual["cancelado_em"]:
            raise RegraDeNegocio("Lançamento cancelado não se edita.")

        campos = {}
        if dados.get("descricao") is not None:
            campos["descricao"] = texto(dados["descricao"])
            if not campos["descricao"]:
                raise RegraDeNegocio("Descreva o lançamento.")
        for campo in ("documento", "observacao"):
            if campo in dados:
                campos[campo] = texto(dados[campo])
        if "pessoa_id" in dados:
            if dados["pessoa_id"]:
                exigir_da_empresa(db, "pessoa", ctx.org_id, dados["pessoa_id"], "Pessoa")
            campos["pessoa_id"] = dados["pessoa_id"] or None

        muda_valor = any(dados.get(c) is not None for c in ("valor_total", "competencia", "parcelas"))
        if muda_valor or dados.get("rateio") is not None:
            if atual["origem"] not in ORIGENS_LIVRES:
                raise RegraDeNegocio(
                    f"Este lançamento foi gerado por {atual['origem']}: valores e categorias mudam por lá."
                )
        teve_pagamento = db.valor(
            """
            SELECT EXISTS (SELECT 1 FROM financeiro.baixa b JOIN financeiro.parcela p ON p.id = b.parcela_id
                            WHERE p.titulo_id = %s)
            """,
            (titulo_id,),
        )
        total = atual["valor_total"]
        if muda_valor:
            if teve_pagamento:
                raise RegraDeNegocio(
                    "Este título já teve pagamento: valor total e competência não mudam por aqui."
                    " Para mudar as parcelas em aberto (valor, vencimento, quantidade), use Editar parcelas."
                )
            total = dinheiro(dados["valor_total"]) if dados.get("valor_total") is not None else total
            if dados.get("competencia"):
                exigir_periodo_aberto(db, ctx.org_id, competencia_de(dados["competencia"]), "A competência")
                campos["competencia"] = competencia_de(dados["competencia"])
            campos["valor_total"] = total
            parcelas = montar_parcelas(
                total, dados.get("parcelas"), dados.get("quantidade_parcelas"),
                dados.get("primeiro_vencimento") or db.valor(
                    "SELECT min(vencimento) FROM financeiro.parcela WHERE titulo_id = %s", (titulo_id,)
                ),
            )
            db.executar("DELETE FROM financeiro.parcela WHERE titulo_id = %s", (titulo_id,))
            for numero, parcela in enumerate(parcelas, start=1):
                db.executar(
                    """
                    INSERT INTO financeiro.parcela (organizacao_id, titulo_id, numero, vencimento, valor, codigo_barras)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (ctx.org_id, titulo_id, numero, parcela.vencimento, parcela.valor, parcela.codigo_barras),
                )

        if dados.get("rateio") is not None or muda_valor:
            linhas = dados.get("rateio")
            if linhas is None:
                # Mudou o valor sem mandar rateio: mantém as proporções atuais.
                atuais = db.todos(
                    "SELECT categoria_id, centro_custo_id, valor FROM financeiro.rateio WHERE titulo_id = %s",
                    (titulo_id,),
                )
                novos = ratear(total, [r["valor"] for r in atuais])
                linhas = [
                    {"categoria_id": str(r["categoria_id"]), "centro_custo_id": r["centro_custo_id"], "valor": v}
                    for r, v in zip(atuais, novos)
                ]
            rateio = montar_rateio(total, linhas)
            _validar_rateio(db, ctx.org_id, atual["tipo"], rateio)
            db.executar("DELETE FROM financeiro.rateio WHERE titulo_id = %s", (titulo_id,))
            for linha in rateio:
                db.executar(
                    """
                    INSERT INTO financeiro.rateio (organizacao_id, titulo_id, categoria_id, centro_custo_id, valor)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (ctx.org_id, titulo_id, linha.categoria_id, linha.centro_custo_id, linha.valor),
                )

        if campos:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
            db.executar(
                f"UPDATE financeiro.titulo SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - nomes de campo fixos
                {**campos, "id": titulo_id},
            )
    return obter(ctx, titulo_id)


def alterar_parcela(ctx: Contexto, parcela_id: str, dados: dict) -> dict:
    """Vencimento e código de barras de parcela em aberto (renegociação de data)."""
    with ctx.escrever(dados.get("motivo")) as db:
        parcela = exigir_da_empresa(db, "parcela", ctx.org_id, parcela_id, "Parcela")
        if parcela["status"] not in ("aberta", "parcial"):
            raise RegraDeNegocio("Só parcela em aberto muda de vencimento.")
        campos = {}
        if dados.get("vencimento"):
            campos["vencimento"] = dados["vencimento"]
        if "codigo_barras" in dados:
            campos["codigo_barras"] = texto(dados["codigo_barras"])
        if campos:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
            db.executar(
                f"UPDATE financeiro.parcela SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - nomes de campo fixos
                {**campos, "id": parcela_id},
            )
    return obter(ctx, str(parcela["titulo_id"]))


def reparcelar(ctx: Contexto, titulo_id: str, parcelas: list[dict], motivo: str | None = None) -> dict:
    """Refaz as parcelas em aberto do título, como num reparcelamento de ERP.

    `parcelas` é o plano novo do que ainda não foi pago:
      - com `id`: parcela em aberto que continua (vencimento, valor e código mudam);
      - sem `id`: parcela nova;
      - parcela em aberto que não vier é excluída.
    As pagas ficam como estão. O total do título passa a ser a soma de tudo, e
    o rateio acompanha na mesma proporção; no fim, as parcelas são renumeradas
    pela ordem de vencimento. Excluir parcela exige a permissão de excluir, e
    excluir ou mudar o total exige motivo, que vai para a auditoria.
    """
    motivo = texto(motivo)
    plano = [_parcela_do_plano(p) for p in parcelas]
    ids = [p["id"] for p in plano if p["id"]]
    if len(ids) != len(set(ids)):
        raise RegraDeNegocio("A mesma parcela veio duas vezes no plano.")

    with ctx.escrever(motivo) as db:
        titulo = db.um(
            "SELECT * FROM financeiro.titulo WHERE id = %s AND organizacao_id = %s FOR UPDATE",
            (titulo_id, ctx.org_id),
        )
        if not titulo:
            raise NaoEncontrado("Título não encontrado.")
        if titulo["cancelado_em"]:
            raise RegraDeNegocio("Título cancelado não muda de parcelas.")
        if titulo["origem"] not in ORIGENS_LIVRES:
            raise RegraDeNegocio(
                f"Este título foi gerado por {titulo['origem']}: as parcelas mudam por lá (aqui, só o vencimento)."
            )
        atuais = db.todos(
            """
            SELECT p.id, p.numero, p.vencimento, p.valor, p.valor_pago, p.status, p.codigo_barras,
                   EXISTS (SELECT 1 FROM financeiro.baixa b WHERE b.parcela_id = p.id) AS teve_pagamento
              FROM financeiro.parcela p
             WHERE p.titulo_id = %s
             ORDER BY p.numero
               FOR UPDATE OF p
            """,
            (titulo_id,),
        )
        por_id = {str(p["id"]): p for p in atuais}
        abertas = {i for i, p in por_id.items() if p["status"] in ("aberta", "parcial")}
        # Pagas (e, por segurança, qualquer outra que não esteja em aberto) ficam como estão.
        fixas = [p for i, p in por_id.items() if i not in abertas]
        if len(fixas) + len(plano) > 360:
            raise RegraDeNegocio("Um título tem no máximo 360 parcelas.")

        for item in plano:
            if not item["id"]:
                continue
            atual = por_id.get(item["id"])
            if atual is None:
                raise NaoEncontrado("Parcela não encontrada neste título.")
            if item["id"] not in abertas:
                raise RegraDeNegocio(f"A parcela {atual['numero']} já foi paga e não muda.")
            if item["valor"] < atual["valor_pago"]:
                raise RegraDeNegocio(
                    f"A parcela {atual['numero']} já tem R$ {atual['valor_pago']} pago: o valor dela não pode ficar abaixo disso."
                )

        mantidas = set(ids)
        excluidas = [por_id[i] for i in abertas if i not in mantidas]
        for parcela in excluidas:
            # A baixa aponta para a parcela e não se apaga (é a história do dinheiro).
            if parcela["valor_pago"] > 0:
                raise RegraDeNegocio(
                    f"A parcela {parcela['numero']} já tem R$ {parcela['valor_pago']} pago e não pode ser excluída:"
                    " ajuste o valor dela."
                )
            if parcela["teve_pagamento"]:
                raise RegraDeNegocio(
                    f"A parcela {parcela['numero']} tem pagamento estornado no histórico e não pode ser excluída:"
                    " mude o valor ou o vencimento dela."
                )
        if excluidas:
            ctx.operador.exigir("operacao", "excluir")

        total = somar([p["valor"] for p in fixas] + [p["valor"] for p in plano])
        if total <= 0:
            raise RegraDeNegocio("O título precisa de ao menos uma parcela. Para desistir dele, cancele o título.")
        muda_total = total != titulo["valor_total"]
        if excluidas and not motivo:
            raise RegraDeNegocio("Informe o motivo: parcelas em aberto vão ser excluídas.")
        if muda_total and not motivo:
            raise RegraDeNegocio(
                f"Informe o motivo: o total do título muda de R$ {titulo['valor_total']} para R$ {total}."
            )
        if muda_total:
            limite = fechado_ate(db, ctx.org_id)
            if limite and titulo["competencia"] <= limite:
                raise RegraDeNegocio(
                    f"A competência do título ({titulo['competencia']:%m/%Y}) está no período fechado: as parcelas"
                    " podem mudar, mas o total não. Reabra o período em Configurações para mudar o total."
                )

        if excluidas:
            db.executar(
                "DELETE FROM financeiro.parcela WHERE id = ANY(%s::uuid[])",
                ([str(p["id"]) for p in excluidas],),
            )
        for item in plano:
            if not item["id"]:
                continue
            atual = por_id[item["id"]]
            # Só o que mudou: a auditoria registra campo a campo, e linha sem mudança não vira histórico.
            # Código de barras que não veio no plano fica como está.
            campos = {
                c: item[c] for c in ("vencimento", "valor", "codigo_barras")
                if item[c] is not _MANTER and item[c] != atual[c]
            }
            if campos:
                atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
                db.executar(
                    f"UPDATE financeiro.parcela SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - nomes de campo fixos
                    {**campos, "id": item["id"]},
                )
        # Novas entram com número provisório, depois de todos os que existem...
        provisorio = max((p["numero"] for p in atuais), default=0)
        for item in plano:
            if item["id"]:
                continue
            provisorio += 1
            codigo = None if item["codigo_barras"] is _MANTER else item["codigo_barras"]
            db.executar(
                """
                INSERT INTO financeiro.parcela (organizacao_id, titulo_id, numero, vencimento, valor, codigo_barras)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (ctx.org_id, titulo_id, provisorio, item["vencimento"], item["valor"], codigo),
            )
        # ...e todas são renumeradas pela ordem de vencimento, num comando só (a
        # unicidade do número é conferida no fim do comando: ver migração 0005).
        ordem = db.todos(
            "SELECT id, numero FROM financeiro.parcela WHERE titulo_id = %s ORDER BY vencimento, numero",
            (titulo_id,),
        )
        trocas = [(str(p["id"]), n) for n, p in enumerate(ordem, start=1) if p["numero"] != n]
        if trocas:
            db.executar(
                """
                UPDATE financeiro.parcela p SET numero = v.numero
                  FROM unnest(%s::uuid[], %s::smallint[]) AS v(id, numero)
                 WHERE p.id = v.id
                """,
                ([i for i, _ in trocas], [n for _, n in trocas]),
            )

        if muda_total:
            db.executar("UPDATE financeiro.titulo SET valor_total = %s WHERE id = %s", (total, titulo_id))
            rateio = db.todos(
                "SELECT id, valor FROM financeiro.rateio WHERE titulo_id = %s ORDER BY valor DESC, id",
                (titulo_id,),
            )
            novos = ratear(total, [r["valor"] for r in rateio])
            if any(v <= 0 for v in novos):
                raise RegraDeNegocio(
                    "O novo total não dá para dividir entre as categorias do título: ajuste as categorias em Editar título."
                )
            for linha, valor in zip(rateio, novos):
                if valor != linha["valor"]:
                    db.executar("UPDATE financeiro.rateio SET valor = %s WHERE id = %s", (valor, linha["id"]))
    return obter(ctx, titulo_id)


# Marca de "não veio no plano" (diferente de vir vazio, que apaga).
_MANTER = object()


def _parcela_do_plano(parcela: dict) -> dict:
    if not parcela.get("vencimento"):
        raise RegraDeNegocio("Toda parcela precisa de vencimento.")
    if parcela.get("valor") is None:
        raise RegraDeNegocio("Toda parcela precisa de valor.")
    valor = dinheiro(parcela["valor"])
    if valor <= 0:
        raise RegraDeNegocio("Toda parcela precisa de valor maior que zero.")
    return {
        "id": str(parcela["id"]) if parcela.get("id") else None,
        "vencimento": parcela["vencimento"],
        "valor": valor,
        "codigo_barras": texto(parcela["codigo_barras"]) if "codigo_barras" in parcela else _MANTER,
    }


def cancelar(ctx: Contexto, titulo_id: str, motivo: str) -> dict:
    motivo = texto(motivo)
    if not motivo:
        raise RegraDeNegocio("Informe o motivo do cancelamento.")
    with ctx.escrever(motivo) as db:
        titulo = exigir_da_empresa(db, "titulo", ctx.org_id, titulo_id, "Lançamento")
        if titulo["cancelado_em"]:
            return obter(ctx, titulo_id)
        if titulo["origem"] not in ORIGENS_LIVRES:
            raise RegraDeNegocio(f"Este lançamento foi gerado por {titulo['origem']}: cancele por lá.")
        _cancelar(db, titulo_id, motivo)
    return obter(ctx, titulo_id)


def _cancelar(db: Consulta, titulo_id: str, motivo: str) -> None:
    pago = db.valor(
        """
        SELECT EXISTS (SELECT 1 FROM financeiro.baixa b JOIN financeiro.parcela p ON p.id = b.parcela_id
                        WHERE p.titulo_id = %s AND b.estornada_em IS NULL)
        """,
        (titulo_id,),
    )
    if pago:
        raise RegraDeNegocio("Este lançamento tem pagamento. Estorne o pagamento antes de cancelar.")
    db.executar(
        "UPDATE financeiro.titulo SET cancelado_em = now(), motivo_cancelamento = %s WHERE id = %s AND cancelado_em IS NULL",
        (motivo, titulo_id),
    )
    db.executar("UPDATE financeiro.parcela SET cancelada = true WHERE titulo_id = %s", (titulo_id,))


def baixar(ctx: Contexto, parcela_id: str, dados: dict) -> dict:
    with ctx.escrever() as db:
        _baixar(
            db, ctx.org_id, ctx.autor, parcela_id, dados.get("conta_id"), dados.get("data") or ctx.hoje,
            valor=dados.get("valor"), juros=dados.get("juros") or ZERO, multa=dados.get("multa") or ZERO,
            desconto=dados.get("desconto") or ZERO, forma=dados.get("forma") or "pix",
            observacao=dados.get("observacao"),
        )
        titulo_id = db.valor("SELECT titulo_id FROM financeiro.parcela WHERE id = %s", (parcela_id,))
    return obter(ctx, str(titulo_id))


def baixar_varias(ctx: Contexto, parcela_ids: list[str], conta_id: str, data: date | None, forma: str | None) -> dict:
    """Quita o saldo de várias parcelas de uma vez ("pagar selecionadas")."""
    if not parcela_ids:
        raise RegraDeNegocio("Selecione ao menos uma parcela.")
    if len(parcela_ids) > 200:
        raise RegraDeNegocio("No máximo 200 parcelas por vez.")
    with ctx.escrever() as db:
        for parcela_id in dict.fromkeys(parcela_ids):
            _baixar(db, ctx.org_id, ctx.autor, parcela_id, conta_id, data or ctx.hoje, forma=forma or "pix")
    return {"quitadas": len(set(parcela_ids))}


def estornar_baixa(ctx: Contexto, baixa_id: str, motivo: str, data: date | None = None) -> dict:
    """Desfaz um pagamento lançando o dinheiro de volta — sem apagar o original."""
    motivo = texto(motivo)
    if not motivo:
        raise RegraDeNegocio("Informe o motivo do estorno.")
    data = data or ctx.hoje
    with ctx.escrever(motivo) as db:
        baixa = db.um(
            """
            SELECT b.id, b.data, b.estornada_em, b.parcela_id, m.conta_id, m.valor AS movimento_valor,
                   m.descricao, p.titulo_id
              FROM financeiro.baixa b
              JOIN financeiro.movimento m ON m.baixa_id = b.id AND m.tipo = 'baixa'
              JOIN financeiro.parcela p ON p.id = b.parcela_id
             WHERE b.id = %s AND b.organizacao_id = %s
               FOR UPDATE OF b
            """,
            (baixa_id, ctx.org_id),
        )
        if not baixa:
            raise NaoEncontrado("Pagamento não encontrado.")
        if baixa["estornada_em"]:
            raise RegraDeNegocio("Este pagamento já foi estornado.")
        if data < baixa["data"]:
            raise RegraDeNegocio("O estorno não pode ter data anterior ao pagamento.")
        exigir_periodo_aberto(db, ctx.org_id, data, "O estorno")
        db.executar(
            "UPDATE financeiro.baixa SET estornada_em = now(), motivo_estorno = %s WHERE id = %s",
            (motivo, baixa_id),
        )
        db.executar(
            """
            INSERT INTO financeiro.movimento (organizacao_id, conta_id, data, valor, tipo, descricao, baixa_id, criado_por)
            VALUES (%s, %s, %s, %s, 'estorno', %s, %s, %s)
            """,
            (ctx.org_id, baixa["conta_id"], data, -baixa["movimento_valor"],
             f"Estorno — {baixa['descricao']}"[:300], baixa_id, ctx.autor),
        )
    return obter(ctx, str(baixa["titulo_id"]))


# ==========================================================================
# Consultas das telas
# ==========================================================================

SITUACOES = ("aberto", "vencido", "a_vencer", "pago", "cancelado", "todos")


def listar_parcelas(
    ctx: Contexto,
    tipo: str,
    situacao: str = "aberto",
    de: date | None = None,
    ate: date | None = None,
    pessoa_id: str | None = None,
    categoria_id: str | None = None,
    centro_custo_id: str | None = None,
    busca: str | None = None,
    limite: int = 100,
    deslocamento: int = 0,
) -> dict:
    if tipo not in NATUREZA_DO_TIPO:
        raise RegraDeNegocio("Tipo deve ser 'pagar' ou 'receber'.")
    if situacao not in SITUACOES:
        raise RegraDeNegocio("Situação inválida.")
    filtros = ["t.organizacao_id = %(org)s", "t.tipo = %(tipo)s"]
    params: dict = {"org": ctx.org_id, "tipo": tipo, "hoje": ctx.hoje}
    filtros.append({
        "aberto": "p.status IN ('aberta', 'parcial')",
        "vencido": "p.status IN ('aberta', 'parcial') AND p.vencimento < %(hoje)s",
        "a_vencer": "p.status IN ('aberta', 'parcial') AND p.vencimento >= %(hoje)s",
        "pago": "p.status = 'paga'",
        "cancelado": "p.status = 'cancelada'",
        "todos": "true",
    }[situacao])
    if de:
        filtros.append("p.vencimento >= %(de)s")
        params["de"] = de
    if ate:
        filtros.append("p.vencimento <= %(ate)s")
        params["ate"] = ate
    if pessoa_id:
        filtros.append("t.pessoa_id = %(pessoa)s")
        params["pessoa"] = pessoa_id
    if categoria_id:
        filtros.append("EXISTS (SELECT 1 FROM financeiro.rateio r WHERE r.titulo_id = t.id AND r.categoria_id = %(categoria)s)")
        params["categoria"] = categoria_id
    if centro_custo_id:
        filtros.append("EXISTS (SELECT 1 FROM financeiro.rateio r WHERE r.titulo_id = t.id AND r.centro_custo_id = %(centro)s)")
        params["centro"] = centro_custo_id
    if busca:
        # "42" ou "#42" também acha o título 42 pelo número.
        filtros.append(
            "(lower(t.descricao) LIKE %(busca)s OR lower(coalesce(t.documento, '')) LIKE %(busca)s"
            " OR lower(coalesce(pe.nome, '')) LIKE %(busca)s OR t.numero::text = %(numero)s)"
        )
        params["busca"] = f"%{busca.strip().lower()}%"
        params["numero"] = busca.strip().lstrip("#").strip()
    where = " AND ".join(f"({f})" for f in filtros)
    params.update(limite=min(max(limite, 1), 500), deslocamento=max(deslocamento, 0))

    with ctx.ler() as db:
        totais = db.um(
            f"""
            SELECT count(*) AS quantidade,
                   COALESCE(sum(p.valor), 0) AS valor,
                   COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE p.status IN ('aberta', 'parcial')), 0) AS saldo
              FROM financeiro.parcela p
              JOIN financeiro.titulo t ON t.id = p.titulo_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
             WHERE {where}
            """,  # nosec B608 - filtros fixos deste arquivo, valores parametrizados
            params,
        )
        itens = db.todos(
            f"""
            SELECT p.id, p.numero, p.vencimento, p.valor, p.valor_pago, p.valor - p.valor_pago AS saldo,
                   p.status, (p.status IN ('aberta', 'parcial') AND p.vencimento < %(hoje)s) AS vencida,
                   (SELECT count(*) FROM financeiro.parcela x WHERE x.titulo_id = t.id) AS total_parcelas,
                   t.id AS titulo_id, t.numero AS titulo_numero, t.tipo, t.descricao, t.documento, t.competencia, t.origem,
                   pe.id AS pessoa_id, pe.nome AS pessoa_nome,
                   (SELECT c.nome FROM financeiro.rateio r JOIN financeiro.categoria c ON c.id = r.categoria_id
                     WHERE r.titulo_id = t.id ORDER BY r.valor DESC LIMIT 1) AS categoria_nome,
                   (SELECT count(*) FROM financeiro.rateio r WHERE r.titulo_id = t.id) AS categorias,
                   (SELECT max(b.data) FROM financeiro.baixa b
                     WHERE b.parcela_id = p.id AND b.estornada_em IS NULL) AS ultimo_pagamento
              FROM financeiro.parcela p
              JOIN financeiro.titulo t ON t.id = p.titulo_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
             WHERE {where}
             ORDER BY p.vencimento, lower(t.descricao), p.numero
             LIMIT %(limite)s OFFSET %(deslocamento)s
            """,  # nosec B608 - filtros fixos deste arquivo, valores parametrizados
            params,
        )
    return {**totais, "itens": itens}


def resumo(ctx: Contexto, tipo: str) -> dict:
    """Os números do topo da tela: vencido, hoje, próximos 7 e 30 dias, pago no mês."""
    inicio_mes = ctx.hoje.replace(day=1)
    with ctx.ler() as db:
        return db.um(
            """
            SELECT
              COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE p.vencimento < %(hoje)s), 0) AS vencido,
              count(*) FILTER (WHERE p.vencimento < %(hoje)s) AS vencido_quantidade,
              COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE p.vencimento = %(hoje)s), 0) AS hoje,
              count(*) FILTER (WHERE p.vencimento = %(hoje)s) AS hoje_quantidade,
              COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE p.vencimento > %(hoje)s AND p.vencimento <= %(d7)s), 0) AS proximos_7,
              COALESCE(sum(p.valor - p.valor_pago) FILTER (WHERE p.vencimento > %(hoje)s AND p.vencimento <= %(d30)s), 0) AS proximos_30,
              (SELECT COALESCE(sum(b.valor), 0) FROM financeiro.baixa b
                 JOIN financeiro.parcela px ON px.id = b.parcela_id
                 JOIN financeiro.titulo tx ON tx.id = px.titulo_id
                WHERE tx.organizacao_id = %(org)s AND tx.tipo = %(tipo)s AND b.estornada_em IS NULL
                  AND b.data >= %(mes)s AND b.data <= %(hoje)s) AS liquidado_no_mes
              FROM financeiro.parcela p
              JOIN financeiro.titulo t ON t.id = p.titulo_id
             WHERE t.organizacao_id = %(org)s AND t.tipo = %(tipo)s AND p.status IN ('aberta', 'parcial')
            """,
            {"org": ctx.org_id, "tipo": tipo, "hoje": ctx.hoje, "d7": ctx.hoje + timedelta(days=7),
             "d30": ctx.hoje + timedelta(days=30), "mes": inicio_mes},
        )
