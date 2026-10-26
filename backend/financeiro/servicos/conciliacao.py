"""Conciliação bancária: importar o extrato e casar com o caixa do sistema.

Toda linha do banco termina em um de três estados:
  conciliada  casou com um movimento do sistema (já lançado, ou lançado
              agora a partir da linha, ou a baixa de uma conta em aberto);
  ignorada    não é para o financeiro (com motivo — fica na auditoria);
  pendente    ainda não resolvida.

Quando todas estão resolvidas, o saldo do sistema na data do extrato tem de
bater com o saldo que o banco informou. Se não bate, há lançamento faltando
ou sobrando — e a tela mostra a diferença.
"""

from __future__ import annotations

import base64
import binascii
from datetime import timedelta
from decimal import Decimal

from ..dominio import conciliacao as dom
from ..dominio.dinheiro import ZERO
from ..dominio.extrato import ExtratoInvalido, ler_csv, ler_ofx
from ..erros import NaoEncontrado, RegraDeNegocio
from .contexto import Contexto
from .titulos import ParcelaNova, RateioNovo, _baixar, _inserir_titulo
from .util import exigir_da_empresa, texto

LIMITE_BYTES = 5 * 1024 * 1024


def importar(ctx: Contexto, conta_id: str, dados: dict) -> dict:
    formato = (dados.get("formato") or "ofx").lower()
    try:
        bruto = base64.b64decode(dados.get("conteudo_base64") or "", validate=True)
    except (binascii.Error, ValueError) as exc:
        raise RegraDeNegocio("Arquivo corrompido no envio.") from exc
    if not bruto:
        raise RegraDeNegocio("Arquivo vazio.")
    if len(bruto) > LIMITE_BYTES:
        raise RegraDeNegocio("Arquivo acima de 5 MB.")
    try:
        if formato == "ofx":
            extrato = ler_ofx(bruto)
        elif formato == "csv":
            from ..dominio.extrato import decodificar

            opcoes = dados.get("csv") or {}
            extrato = ler_csv(
                decodificar(bruto),
                coluna_data=opcoes.get("coluna_data") or "data",
                coluna_descricao=opcoes.get("coluna_descricao") or "descricao",
                coluna_valor=opcoes.get("coluna_valor") or None,
                coluna_debito=opcoes.get("coluna_debito") or None,
                coluna_credito=opcoes.get("coluna_credito") or None,
                coluna_documento=opcoes.get("coluna_documento") or None,
                formato_data=opcoes.get("formato_data") or "%d/%m/%Y",
                decimal=opcoes.get("decimal") or ",",
            )
        else:
            raise RegraDeNegocio("Formato: ofx ou csv.")
    except ExtratoInvalido as exc:
        raise RegraDeNegocio(str(exc)) from exc

    with ctx.escrever("Importação de extrato") as db:
        conta = exigir_da_empresa(db, "conta", ctx.org_id, conta_id, "Conta")
        importacao_id = db.valor(
            """
            INSERT INTO financeiro.extrato_importacao
              (organizacao_id, conta_id, arquivo, formato, inicio, fim, saldo_final, importado_por)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (ctx.org_id, conta["id"], texto(dados.get("nome_arquivo")) or f"extrato.{formato}", formato,
             extrato.inicio, extrato.fim, extrato.saldo_final, ctx.autor),
        )
        novas = 0
        for linha in extrato.linhas:
            novas += db.executar(
                """
                INSERT INTO financeiro.extrato_linha
                  (organizacao_id, importacao_id, conta_id, data, valor, descricao, documento, identificador)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (conta_id, identificador) DO NOTHING
                """,
                (ctx.org_id, importacao_id, conta["id"], linha.data, linha.valor, linha.descricao,
                 linha.documento, linha.identificador),
            )
        repetidas = len(extrato.linhas) - novas
        db.executar(
            "UPDATE financeiro.extrato_importacao SET linhas_novas = %s, linhas_repetidas = %s WHERE id = %s",
            (novas, repetidas, importacao_id),
        )
    return {
        "importacao_id": importacao_id, "novas": novas, "repetidas": repetidas,
        "inicio": extrato.inicio, "fim": extrato.fim, "saldo_banco": extrato.saldo_final,
        "banco": extrato.banco, "conta_no_arquivo": extrato.conta,
    }


def pendencias(ctx: Contexto, conta_id: str) -> dict:
    """As linhas a resolver, cada uma com o par sugerido e alternativas."""
    with ctx.ler() as db:
        conta = exigir_da_empresa(db, "conta", ctx.org_id, conta_id, "Conta")
        linhas = db.todos(
            """
            SELECT id, data, valor, descricao, documento FROM financeiro.extrato_linha
             WHERE conta_id = %s AND status = 'pendente' ORDER BY data, valor
            """,
            (conta_id,),
        )
        ultima = db.um(
            """
            SELECT fim, saldo_final, arquivo, importado_em FROM financeiro.extrato_importacao
             WHERE conta_id = %s ORDER BY fim DESC NULLS LAST, importado_em DESC LIMIT 1
            """,
            (conta_id,),
        )
        candidatos: list[dom.Candidato] = []
        if linhas:
            de = min(l["data"] for l in linhas) - timedelta(days=dom.JANELA_PARCELA)
            ate = max(l["data"] for l in linhas) + timedelta(days=dom.JANELA_PARCELA)
            for m in db.todos(
                """
                SELECT m.id, m.data, m.valor, m.descricao FROM financeiro.movimento m
                 WHERE m.conta_id = %s AND m.data BETWEEN %s AND %s AND m.tipo <> 'saldo_inicial'
                   AND NOT EXISTS (SELECT 1 FROM financeiro.extrato_linha e WHERE e.movimento_id = m.id)
                """,
                (conta_id, de, ate),
            ):
                candidatos.append(dom.Candidato(str(m["id"]), "movimento", m["data"], m["valor"], m["descricao"]))
            for p in db.todos(
                """
                SELECT p.id, p.vencimento, p.valor - p.valor_pago AS saldo, t.tipo, t.descricao, t.documento,
                       pe.nome AS pessoa_nome
                  FROM financeiro.parcela p
                  JOIN financeiro.titulo t ON t.id = p.titulo_id
                  LEFT JOIN financeiro.pessoa pe ON pe.id = t.pessoa_id
                 WHERE t.organizacao_id = %s AND p.status IN ('aberta', 'parcial') AND p.vencimento BETWEEN %s AND %s
                """,
                (ctx.org_id, de, ate),
            ):
                valor = p["saldo"] if p["tipo"] == "receber" else -p["saldo"]
                descricao = f"{p['descricao']} {p['pessoa_nome'] or ''}".strip()
                candidatos.append(dom.Candidato(str(p["id"]), "parcela", p["vencimento"], valor, descricao, p["documento"]))
        saldo_sistema = None
        if ultima and ultima["fim"]:
            saldo_sistema = Decimal(db.valor(
                "SELECT COALESCE(sum(valor), 0) FROM financeiro.movimento WHERE conta_id = %s AND data <= %s",
                (conta_id, ultima["fim"]),
            ))

    banco = [dom.LinhaDoBanco(str(l["id"]), l["data"], l["valor"], l["descricao"], l["documento"]) for l in linhas]
    sugestoes = dom.sugerir(banco, candidatos)

    def sugestao(s: dom.Sugestao | None) -> dict | None:
        if s is None:
            return None
        c = s.candidato
        return {"id": c.id, "tipo": c.tipo, "data": c.data, "valor": c.valor, "descricao": c.descricao,
                "pontuacao": s.pontuacao, "motivos": s.motivos}

    for linha in linhas:
        resultado = sugestoes[str(linha["id"])]
        linha["sugestao"] = sugestao(resultado.principal)
        linha["alternativas"] = [sugestao(s) for s in resultado.alternativas]
    return {
        "conta": {"id": conta["id"], "nome": conta["nome"]},
        "linhas": linhas,
        "ultima_importacao": ultima,
        "saldo_sistema_na_data": saldo_sistema,
        "diferenca": (saldo_sistema - ultima["saldo_final"]) if saldo_sistema is not None and ultima and ultima["saldo_final"] is not None else None,
    }


def _linha_pendente(db, org_id: str, linha_id: str) -> dict:
    linha = exigir_da_empresa(db, "extrato_linha", org_id, linha_id, "Linha do extrato")
    if linha["status"] != "pendente":
        raise RegraDeNegocio("Esta linha já foi resolvida.")
    return linha


def _marcar(db, linha_id: str, movimento_id: str, autor: str) -> None:
    db.executar(
        """
        UPDATE financeiro.extrato_linha SET status = 'conciliada', movimento_id = %s,
               resolvida_em = now(), resolvida_por = %s WHERE id = %s
        """,
        (movimento_id, autor, linha_id),
    )


def conciliar(ctx: Contexto, linha_id: str, movimento_id: str) -> dict:
    with ctx.escrever("Conciliação") as db:
        linha = _linha_pendente(db, ctx.org_id, linha_id)
        movimento = exigir_da_empresa(db, "movimento", ctx.org_id, movimento_id, "Movimento")
        if movimento["conta_id"] != linha["conta_id"]:
            raise RegraDeNegocio("O movimento é de outra conta.")
        if movimento["valor"] != linha["valor"]:
            raise RegraDeNegocio(
                "Os valores são diferentes. Se a diferença é tarifa ou juros, lance-a antes e concilie o resto."
            )
        _marcar(db, linha_id, movimento_id, ctx.autor)
    return {"linha_id": linha_id, "movimento_id": movimento_id}


def conciliar_com_parcela(ctx: Contexto, linha_id: str, parcela_id: str) -> dict:
    """A linha do banco é o pagamento de uma conta em aberto: baixa e concilia de uma vez.

    Se o banco mostra mais que o saldo da parcela, a diferença entra como
    juros; se mostra menos, a baixa é parcial.
    """
    with ctx.escrever("Conciliação com baixa") as db:
        linha = _linha_pendente(db, ctx.org_id, linha_id)
        parcela = db.um(
            """
            SELECT p.id, p.valor - p.valor_pago AS saldo, t.tipo FROM financeiro.parcela p
              JOIN financeiro.titulo t ON t.id = p.titulo_id
             WHERE p.id = %s AND p.organizacao_id = %s
            """,
            (parcela_id, ctx.org_id),
        )
        if not parcela:
            raise NaoEncontrado("Parcela não encontrada.")
        esperado = 1 if parcela["tipo"] == "receber" else -1
        if (linha["valor"] > 0) != (esperado > 0):
            raise RegraDeNegocio("Entrada no banco não quita conta a pagar (nem saída quita conta a receber).")
        pago = abs(linha["valor"])
        valor = min(pago, parcela["saldo"])
        juros = pago - valor if pago > parcela["saldo"] else ZERO
        baixa_id = _baixar(db, ctx.org_id, ctx.autor, parcela_id, str(linha["conta_id"]), linha["data"],
                           valor=valor, juros=juros, forma="outro", observacao="Conciliação bancária")
        movimento_id = db.valor("SELECT id FROM financeiro.movimento WHERE baixa_id = %s AND tipo = 'baixa'", (baixa_id,))
        _marcar(db, linha_id, str(movimento_id), ctx.autor)
    return {"linha_id": linha_id, "movimento_id": str(movimento_id), "baixa_id": baixa_id}


def criar_lancamento(ctx: Contexto, linha_id: str, dados: dict) -> dict:
    """Lança a partir da linha do banco (tarifa, rendimento, PIX sem conta cadastrada) e concilia."""
    with ctx.escrever("Lançamento a partir do extrato") as db:
        linha = _linha_pendente(db, ctx.org_id, linha_id)
        valor = abs(linha["valor"])
        tipo = "receber" if linha["valor"] > 0 else "pagar"
        titulo_id = _inserir_titulo(
            db, ctx.org_id, ctx.autor, tipo=tipo,
            descricao=texto(dados.get("descricao")) or linha["descricao"][:200],
            competencia=linha["data"], parcelas=[ParcelaNova(linha["data"], valor)],
            rateio=[RateioNovo(dados.get("categoria_id"), dados.get("centro_custo_id") or None, valor)],
            pessoa_id=dados.get("pessoa_id") or None, documento=linha["documento"], data_emissao=linha["data"],
            origem="conciliacao", origem_id=linha_id,
        )
        parcela_id = db.valor("SELECT id FROM financeiro.parcela WHERE titulo_id = %s", (titulo_id,))
        baixa_id = _baixar(db, ctx.org_id, ctx.autor, str(parcela_id), str(linha["conta_id"]), linha["data"], forma="outro")
        movimento_id = db.valor("SELECT id FROM financeiro.movimento WHERE baixa_id = %s AND tipo = 'baixa'", (baixa_id,))
        _marcar(db, linha_id, str(movimento_id), ctx.autor)
    return {"linha_id": linha_id, "titulo_id": titulo_id}


def ignorar(ctx: Contexto, linha_id: str, motivo: str) -> dict:
    motivo = texto(motivo)
    if not motivo:
        raise RegraDeNegocio("Informe por que a linha não entra no financeiro.")
    with ctx.escrever(motivo) as db:
        _linha_pendente(db, ctx.org_id, linha_id)
        db.executar(
            "UPDATE financeiro.extrato_linha SET status = 'ignorada', resolvida_em = now(), resolvida_por = %s WHERE id = %s",
            (ctx.autor, linha_id),
        )
    return {"linha_id": linha_id}


def desfazer(ctx: Contexto, linha_id: str) -> dict:
    """Volta a linha para pendente. A baixa criada pela conciliação continua; estorne-a à parte se for o caso."""
    with ctx.escrever("Conciliação desfeita") as db:
        linha = exigir_da_empresa(db, "extrato_linha", ctx.org_id, linha_id, "Linha do extrato")
        if linha["status"] == "pendente":
            raise RegraDeNegocio("A linha já está pendente.")
        db.executar(
            """
            UPDATE financeiro.extrato_linha SET status = 'pendente', movimento_id = NULL,
                   resolvida_em = NULL, resolvida_por = NULL WHERE id = %s
            """,
            (linha_id,),
        )
    return {"linha_id": linha_id}


def conciliar_sugestoes_fortes(ctx: Contexto, conta_id: str, pontuacao_minima: int = 70) -> dict:
    """Aceita de uma vez os pares fortes com movimento já lançado. Parcela nunca: baixar é decisão."""
    atual = pendencias(ctx, conta_id)
    aceitos = 0
    with ctx.escrever("Conciliação das sugestões fortes") as db:
        for linha in atual["linhas"]:
            s = linha["sugestao"]
            if s and s["tipo"] == "movimento" and s["pontuacao"] >= pontuacao_minima:
                _marcar(db, str(linha["id"]), s["id"], ctx.autor)
                aceitos += 1
    return {"conciliadas": aceitos}


def historico(ctx: Contexto, conta_id: str, limite: int = 100) -> list[dict]:
    with ctx.ler() as db:
        exigir_da_empresa(db, "conta", ctx.org_id, conta_id, "Conta")
        return db.todos(
            """
            SELECT e.id, e.data, e.valor, e.descricao, e.status, e.resolvida_em, e.resolvida_por,
                   m.descricao AS movimento_descricao
              FROM financeiro.extrato_linha e
              LEFT JOIN financeiro.movimento m ON m.id = e.movimento_id
             WHERE e.conta_id = %s AND e.status <> 'pendente'
             ORDER BY e.resolvida_em DESC LIMIT %s
            """,
            (conta_id, min(max(limite, 1), 500)),
        )
