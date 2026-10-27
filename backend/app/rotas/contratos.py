"""Contratos da clínica com fornecedores e prestadores (Administração → Contratos).

Entrou em 25/10/2026. O que a tela precisa responder é "o que vence e quando
eu tenho de decidir", então a situação não é coluna: sai das datas a cada
consulta (vigente, vencendo, vencido, agendado) e nunca fica desatualizada.

Contrato não se apaga: encerra-se com motivo, e continua na lista. Pedido de
compra pode apontar para ele, e apagar levaria a referência junto.

Permissão: `contracts`. Listar exige `view`; cadastrar `create`; editar e
encerrar `edit`.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
# "Hoje" no fuso da clínica, não em UTC: às 22h de Brasília o servidor já
# está no dia seguinte, e "vence hoje" viraria "venceu" três horas antes.
from financeiro.relogio import hoje as hoje_na_clinica

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..schemas import ContratoEncerramento, ContratoPayload, ContratoResumo, Ok
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant

router = APIRouter()

SELECT_CONTRATO = """
    SELECT c.*, u.nome AS criado_por_nome,
           (SELECT count(*) FROM pedido_compra pc WHERE pc.contrato_id = c.id) AS pedidos
      FROM contrato c
      LEFT JOIN usuario u ON u.id = c.criado_por
"""


def situacao(l: dict, hoje: date) -> tuple[str, date | None]:
    """Situação do contrato hoje e a data limite para decidir a renovação."""
    if l["encerrado_em"]:
        return "encerrado", None
    if l["inicio"] > hoje:
        return "agendado", None
    fim = l["fim"]
    if fim is None:
        return "vigente", None
    decidir_ate = fim - timedelta(days=l["aviso_previo_dias"])
    if fim < hoje:
        # Renovação automática: o papel continua valendo depois do fim.
        return ("vigente", None) if l["renovacao_automatica"] else ("vencido", None)
    if hoje >= decidir_ate:
        return "vencendo", decidir_ate
    return "vigente", decidir_ate


def montar(l: dict, hoje: date | None = None) -> ContratoResumo:
    estado, decidir = situacao(l, hoje or hoje_na_clinica())
    return ContratoResumo(
        id=str(l["id"]),
        numero=l["numero"],
        objeto=l["objeto"],
        fornecedor=l["fornecedor"],
        fornecedorDocumento=l["fornecedor_documento"],
        categoria=l["categoria"],
        valorMensal=float(l["valor_mensal"]) if l["valor_mensal"] is not None else None,
        inicio=l["inicio"].isoformat(),
        fim=l["fim"].isoformat() if l["fim"] else None,
        renovacaoAutomatica=l["renovacao_automatica"],
        avisoPrevioDias=l["aviso_previo_dias"],
        responsavel=l["responsavel"],
        observacoes=l["observacoes"],
        situacao=estado,
        decidirAte=decidir.isoformat() if decidir else None,
        encerradoEm=iso(l["encerrado_em"]),
        motivoEncerramento=l["motivo_encerramento"],
        criadoPorNome=l["criado_por_nome"],
        criadoEm=iso(l["created_at"]) or "",
        pedidosVinculados=l["pedidos"],
    )


def valores(p: ContratoPayload) -> tuple:
    """Campos do payload já limpos, na ordem das colunas do INSERT/UPDATE."""
    fim = p.fim or None
    if fim and fim < p.inicio:
        raise HTTPException(422, "O fim do contrato não pode ser antes do início.")
    vazio = lambda v: (v or "").strip() or None  # noqa: E731
    return (
        vazio(p.numero), p.objeto.strip(), p.fornecedor.strip(), p.fornecedorDocumento or None,
        p.categoria, p.valorMensal, p.inicio, fim, p.renovacaoAutomatica, p.avisoPrevioDias,
        vazio(p.responsavel), vazio(p.observacoes),
    )


def contrato_da_clinica(contrato_id: str, clinica_id) -> dict:
    linha = db.buscar_um(SELECT_CONTRATO + " WHERE c.id = %s", (contrato_id,))
    if not linha or str(linha["clinica_id"]) != str(clinica_id):
        raise HTTPException(404, "Contrato não encontrado.")
    return linha


@router.get("/api/contratos", response_model=list[ContratoResumo])
def listar_contratos(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("contracts", "view")),
):
    """Todos os contratos da clínica, encerrados inclusive. Os que vencem antes vêm primeiro."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linhas = db.buscar_todos(
        SELECT_CONTRATO + " WHERE c.clinica_id = %s ORDER BY c.encerrado_em NULLS FIRST, c.fim NULLS LAST, c.objeto",
        (clinica["id"],),
    )
    hoje = hoje_na_clinica()
    return [montar(l, hoje) for l in linhas]


@router.post("/api/contratos", response_model=ContratoResumo, status_code=201)
def criar_contrato(
    payload: ContratoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("contracts", "create")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO contrato (numero, objeto, fornecedor, fornecedor_documento, categoria,
                                  valor_mensal, inicio, fim, renovacao_automatica, aviso_previo_dias,
                                  responsavel, observacoes, clinica_id, criado_por)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            valores(payload) + (clinica["id"], usuario.id),
        )
        novo = cur.fetchone()["id"]
    logger.info("Contrato '%s' (%s) cadastrado por %s", payload.objeto, payload.fornecedor, usuario.nome)
    return montar(contrato_da_clinica(str(novo), clinica["id"]))


@router.patch("/api/contratos/{contrato_id}", response_model=ContratoResumo)
def editar_contrato(
    contrato_id: str,
    payload: ContratoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("contracts", "edit")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    atual = contrato_da_clinica(contrato_id, clinica["id"])
    if atual["encerrado_em"]:
        raise HTTPException(409, "Contrato encerrado não é editado; cadastre um novo.")
    db.executar(
        """
        UPDATE contrato
           SET numero = %s, objeto = %s, fornecedor = %s, fornecedor_documento = %s, categoria = %s,
               valor_mensal = %s, inicio = %s, fim = %s, renovacao_automatica = %s,
               aviso_previo_dias = %s, responsavel = %s, observacoes = %s
         WHERE id = %s
        """,
        valores(payload) + (contrato_id,),
    )
    return montar(contrato_da_clinica(contrato_id, clinica["id"]))


@router.post("/api/contratos/{contrato_id}/encerrar", response_model=Ok)
def encerrar_contrato(
    contrato_id: str,
    payload: ContratoEncerramento,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("contracts", "edit")),
):
    """Encerra antes ou no fim do prazo. Idempotente: encerrar de novo não é erro."""
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    contrato_da_clinica(contrato_id, clinica["id"])
    db.executar(
        "UPDATE contrato SET encerrado_em = now(), motivo_encerramento = %s WHERE id = %s AND encerrado_em IS NULL",
        (payload.motivo.strip(), contrato_id),
    )
    logger.info("Contrato %s encerrado por %s", contrato_id, usuario.nome)
    return Ok()
