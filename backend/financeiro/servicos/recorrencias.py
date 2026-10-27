"""Recorrências: o molde e a geração das contas que se repetem.

A geração vai até um horizonte (60 dias à frente): longe o bastante para a
conta aparecer em "a pagar" antes de vencer, perto o bastante para mudar o
molde (novo valor de aluguel) sem ter dezenas de lançamentos futuros a
corrigir. Para além do horizonte, a projeção de caixa enxerga as ocorrências
sem gravá-las.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from ..acesso import Operador, todas_as_permissoes
from ..banco import Banco, Consulta
from ..dominio.calendario import competencia as competencia_de
from ..dominio.dinheiro import dinheiro
from ..dominio.recorrencia import FREQUENCIAS, ocorrencias
from ..erros import RegraDeNegocio
from .contexto import Contexto
from .titulos import NATUREZA_DO_TIPO, ParcelaNova, RateioNovo, _inserir_titulo
from .util import exigir_da_empresa, fechado_ate, texto

HORIZONTE_DIAS = 60


def listar(ctx: Contexto) -> list[dict]:
    with ctx.ler() as db:
        linhas = db.todos(
            """
            SELECT r.*, c.nome AS categoria_nome, cc.nome AS centro_custo_nome, pe.nome AS pessoa_nome,
                   (SELECT count(*) FROM financeiro.titulo t
                     WHERE t.origem = 'recorrencia' AND t.origem_id = r.id AND t.cancelado_em IS NULL) AS gerados
              FROM financeiro.recorrencia r
              JOIN financeiro.categoria c ON c.id = r.categoria_id
              LEFT JOIN financeiro.centro_custo cc ON cc.id = r.centro_custo_id
              LEFT JOIN financeiro.pessoa pe ON pe.id = r.pessoa_id
             WHERE r.organizacao_id = %s
             ORDER BY r.ativa DESC, r.tipo, lower(r.descricao)
            """,
            (ctx.org_id,),
        )
    for linha in linhas:
        proximas = [] if not linha["ativa"] else ocorrencias(
            linha["inicio"], linha["frequencia"], ctx.hoje + timedelta(days=400), fim=linha["fim"],
            dia_vencimento=linha["dia_vencimento"], depois_de=ctx.hoje - timedelta(days=1),
        )
        linha["proxima_ocorrencia"] = proximas[0] if proximas else None
    return linhas


def _validar(db: Consulta, org_id: str, dados: dict, atual: dict | None = None) -> dict:
    campos: dict = {}
    tipo = dados.get("tipo") or (atual or {}).get("tipo")
    if tipo not in NATUREZA_DO_TIPO:
        raise RegraDeNegocio("Tipo deve ser 'pagar' ou 'receber'.")
    if atual is None:
        campos["tipo"] = tipo
    if dados.get("descricao") is not None or atual is None:
        campos["descricao"] = texto(dados.get("descricao"))
        if not campos["descricao"]:
            raise RegraDeNegocio("Descreva a recorrência.")
    if dados.get("valor") is not None or atual is None:
        campos["valor"] = dinheiro(dados.get("valor") or 0)
        if campos["valor"] <= 0:
            raise RegraDeNegocio("O valor deve ser maior que zero.")
    if dados.get("categoria_id") or atual is None:
        categoria = exigir_da_empresa(db, "categoria", org_id, dados.get("categoria_id"), "Categoria")
        if categoria["natureza"] != NATUREZA_DO_TIPO[tipo]:
            raise RegraDeNegocio(f"A categoria {categoria['nome']} não combina com o tipo da conta.")
        campos["categoria_id"] = dados["categoria_id"]
    if "centro_custo_id" in dados:
        if dados["centro_custo_id"]:
            exigir_da_empresa(db, "centro_custo", org_id, dados["centro_custo_id"], "Centro de custo")
        campos["centro_custo_id"] = dados["centro_custo_id"] or None
    if "pessoa_id" in dados:
        if dados["pessoa_id"]:
            exigir_da_empresa(db, "pessoa", org_id, dados["pessoa_id"], "Pessoa")
        campos["pessoa_id"] = dados["pessoa_id"] or None
    if dados.get("frequencia") or atual is None:
        if dados.get("frequencia") not in FREQUENCIAS:
            raise RegraDeNegocio("Escolha a frequência.")
        campos["frequencia"] = dados["frequencia"]
    if "dia_vencimento" in dados:
        dia = dados.get("dia_vencimento")
        if dia is not None and not 1 <= int(dia) <= 31:
            raise RegraDeNegocio("Dia de vencimento entre 1 e 31.")
        campos["dia_vencimento"] = dia
    if atual is None:
        campos["inicio"] = dados.get("inicio") or date.today()
    if "fim" in dados:
        campos["fim"] = dados.get("fim")
    return campos


def criar(ctx: Contexto, dados: dict) -> dict:
    with ctx.escrever() as db:
        campos = _validar(db, ctx.org_id, dados)
        colunas = ", ".join(["organizacao_id", "criado_por", *campos])
        marcas = ", ".join(["%(organizacao_id)s", "%(criado_por)s", *(f"%({c})s" for c in campos)])
        rec_id = db.valor(
            f"INSERT INTO financeiro.recorrencia ({colunas}) VALUES ({marcas}) RETURNING id",  # nosec B608 - colunas de _validar
            {**campos, "organizacao_id": ctx.org_id, "criado_por": ctx.autor},
        )
        rec = db.um("SELECT * FROM financeiro.recorrencia WHERE id = %s", (rec_id,))
        _gerar_da_recorrencia(db, ctx.org_id, ctx.autor, rec, ctx.hoje + timedelta(days=HORIZONTE_DIAS))
    return next(r for r in listar(ctx) if str(r["id"]) == str(rec_id))


def editar(ctx: Contexto, rec_id: str, dados: dict) -> dict:
    """Muda o molde. O que já foi gerado fica como está; muda só o que vier depois."""
    with ctx.escrever() as db:
        atual = exigir_da_empresa(db, "recorrencia", ctx.org_id, rec_id, "Recorrência")
        campos = _validar(db, ctx.org_id, dados, atual)
        if dados.get("ativa") is not None:
            campos["ativa"] = bool(dados["ativa"])
        if campos:
            atribuicoes = ", ".join(f"{c} = %({c})s" for c in campos)
            db.executar(
                f"UPDATE financeiro.recorrencia SET {atribuicoes} WHERE id = %(id)s",  # nosec B608 - colunas de _validar
                {**campos, "id": rec_id},
            )
    return next(r for r in listar(ctx) if str(r["id"]) == str(rec_id))


def gerar(ctx: Contexto, ate: date | None = None) -> dict:
    """Gera as ocorrências de todas as recorrências ativas até `ate`."""
    ate = ate or ctx.hoje + timedelta(days=HORIZONTE_DIAS)
    total = 0
    with ctx.escrever("Geração de recorrências") as db:
        for rec in db.todos(
            "SELECT * FROM financeiro.recorrencia WHERE organizacao_id = %s AND ativa FOR UPDATE", (ctx.org_id,)
        ):
            total += _gerar_da_recorrencia(db, ctx.org_id, ctx.autor, rec, ate)
    return {"gerados": total, "ate": ate}


def _gerar_da_recorrencia(db: Consulta, org_id: str, autor: str, rec: dict, ate: date) -> int:
    datas = ocorrencias(
        rec["inicio"], rec["frequencia"], ate, fim=rec["fim"],
        dia_vencimento=rec["dia_vencimento"], depois_de=rec["gerado_ate"],
    )
    limite = fechado_ate(db, org_id)
    gerados = 0
    for vencimento in datas:
        if limite and competencia_de(vencimento) <= limite:
            continue  # recorrência retroativa em período fechado: não há onde lançar
        chave = f"rec:{rec['id']}:{vencimento.isoformat()}"
        ja_existe = db.valor(
            "SELECT EXISTS (SELECT 1 FROM financeiro.titulo WHERE organizacao_id = %s AND origem_chave = %s)",
            (org_id, chave),
        )
        if ja_existe:
            continue
        _inserir_titulo(
            db, org_id, autor,
            tipo=rec["tipo"],
            descricao=f"{rec['descricao']} — {vencimento:%m/%Y}",
            competencia=competencia_de(vencimento),
            parcelas=[ParcelaNova(vencimento, Decimal(rec["valor"]))],
            rateio=[RateioNovo(str(rec["categoria_id"]), rec["centro_custo_id"], Decimal(rec["valor"]))],
            pessoa_id=rec["pessoa_id"],
            data_emissao=vencimento,
            origem="recorrencia",
            origem_id=str(rec["id"]),
            origem_chave=chave,
        )
        gerados += 1
    if datas:
        db.executar("UPDATE financeiro.recorrencia SET gerado_ate = %s WHERE id = %s", (max(datas), rec["id"]))
    return gerados


def projetar(db: Consulta, org_id: str, de: date, ate: date) -> list[dict]:
    """Ocorrências futuras ainda não gravadas — para a projeção de caixa."""
    saida = []
    for rec in db.todos("SELECT * FROM financeiro.recorrencia WHERE organizacao_id = %s AND ativa", (org_id,)):
        for vencimento in ocorrencias(
            rec["inicio"], rec["frequencia"], ate, fim=rec["fim"],
            dia_vencimento=rec["dia_vencimento"], depois_de=rec["gerado_ate"],
        ):
            if vencimento >= de:
                saida.append({
                    "data": vencimento, "tipo": rec["tipo"], "valor": Decimal(rec["valor"]),
                    "descricao": rec["descricao"], "categoria_id": rec["categoria_id"],
                })
    return saida


def gerar_para_todas(banco: Banco, hoje: date | None = None) -> int:
    """Para a tarefa diária do hospedeiro: gera o horizonte de todas as empresas."""
    hoje = hoje or date.today()
    sistema = Operador("sistema", "Sistema (recorrências)", "", "", todas_as_permissoes())
    with banco.ler() as db:
        empresas = [str(l["id"]) for l in db.todos("SELECT id FROM financeiro.organizacao")]
    total = 0
    for org_id in empresas:
        with banco.escrever(sistema, "Geração automática de recorrências") as db:
            for rec in db.todos(
                "SELECT * FROM financeiro.recorrencia WHERE organizacao_id = %s AND ativa FOR UPDATE", (org_id,)
            ):
                total += _gerar_da_recorrencia(db, org_id, sistema.usuario_nome, rec, hoje + timedelta(days=HORIZONTE_DIAS))
    return total
