"""Pedidos de compra (Administração → Compras).

Entrou em 25/10/2026. O caminho de um pedido:

    solicitado → aprovado → comprado → recebido
               ↘ recusado
    (cancelado a qualquer momento antes de recebido ou recusado)

Regras que a API garante, não só a tela:

- Quem pediu não aprova nem recusa o próprio pedido (segregação de funções).
- Cada passo só sai do estado anterior certo; a troca é um UPDATE com o
  estado esperado no WHERE, então duas pessoas clicando ao mesmo tempo não
  aprovam e recusam o mesmo pedido.
- Quem pediu pode cancelar enquanto ninguém decidiu; depois disso, só quem
  aprova (`edit`).

Permissão `purchases`: `view` lista, `create` pede e confirma recebimento
(a enfermagem pede material e é quem recebe), `edit` aprova, recusa,
registra a compra e cancela pedido dos outros.
"""

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import clinica_por_slug, iso, logger
from ..schemas import EtapaPedido, ItemPedido, Ok, PedidoCompra, PedidoMotivo, PedidoPayload, PedidoResumo
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant, permissoes_do_perfil
from .contratos import contrato_da_clinica

router = APIRouter()

SELECT_PEDIDO = """
    SELECT pc.*, ct.objeto AS contrato_objeto,
           us.nome AS solicitante_nome, ud.nome AS decidido_nome,
           uc.nome AS comprado_nome, ur.nome AS recebido_nome, ux.nome AS cancelado_nome
      FROM pedido_compra pc
      JOIN usuario us ON us.id = pc.solicitante_id
      LEFT JOIN contrato ct ON ct.id = pc.contrato_id
      LEFT JOIN usuario ud ON ud.id = pc.decidido_por
      LEFT JOIN usuario uc ON uc.id = pc.comprado_por
      LEFT JOIN usuario ur ON ur.id = pc.recebido_por
      LEFT JOIN usuario ux ON ux.id = pc.cancelado_por
"""


def itens_dos_pedidos(ids: list) -> dict[str, list[ItemPedido]]:
    if not ids:
        return {}
    linhas = db.buscar_todos(
        "SELECT * FROM item_pedido_compra WHERE pedido_id = ANY(%s) ORDER BY ordem",
        (ids,),
    )
    por_pedido: dict[str, list[ItemPedido]] = {}
    for l in linhas:
        por_pedido.setdefault(str(l["pedido_id"]), []).append(ItemPedido(
            descricao=l["descricao"],
            quantidade=float(l["quantidade"]),
            unidade=l["unidade"],
            valorUnitario=float(l["valor_unitario"]) if l["valor_unitario"] is not None else None,
        ))
    return por_pedido


def montar(l: dict, itens: list[ItemPedido]) -> PedidoResumo:
    com_preco = [i for i in itens if i.valorUnitario is not None]
    trilha = [EtapaPedido(etapa="solicitado", quem=l["solicitante_nome"], quando=iso(l["created_at"]) or "")]
    if l["decidido_em"]:
        trilha.append(EtapaPedido(etapa="decidido", quem=l["decidido_nome"], quando=iso(l["decidido_em"])))
    if l["comprado_em"]:
        trilha.append(EtapaPedido(etapa="comprado", quem=l["comprado_nome"], quando=iso(l["comprado_em"])))
    if l["recebido_em"]:
        trilha.append(EtapaPedido(etapa="recebido", quem=l["recebido_nome"], quando=iso(l["recebido_em"])))
    if l["cancelado_em"]:
        trilha.append(EtapaPedido(etapa="cancelado", quem=l["cancelado_nome"], quando=iso(l["cancelado_em"])))
    return PedidoResumo(
        id=str(l["id"]),
        numero=l["numero"],
        titulo=l["titulo"],
        justificativa=l["justificativa"],
        urgente=l["urgente"],
        status=l["status"],
        fornecedor=l["fornecedor"],
        contratoId=str(l["contrato_id"]) if l["contrato_id"] else None,
        contratoObjeto=l["contrato_objeto"],
        itens=itens,
        valorEstimado=round(sum(i.quantidade * i.valorUnitario for i in com_preco), 2) if com_preco else None,
        valorFinal=float(l["valor_final"]) if l["valor_final"] is not None else None,
        solicitanteId=str(l["solicitante_id"]),
        solicitanteNome=l["solicitante_nome"],
        motivoRecusa=l["motivo_recusa"],
        motivoCancelamento=l["motivo_cancelamento"],
        trilha=trilha,
        criadoEm=iso(l["created_at"]) or "",
    )


def pedido_da_clinica(pedido_id: str, clinica_id) -> PedidoResumo:
    linha = db.buscar_um(SELECT_PEDIDO + " WHERE pc.id = %s", (pedido_id,))
    if not linha or str(linha["clinica_id"]) != str(clinica_id):
        raise HTTPException(404, "Pedido não encontrado.")
    return montar(linha, itens_dos_pedidos([linha["id"]]).get(str(linha["id"]), []))


def transicao(pedido_id: str, clinica_id, de: tuple[str, ...], sql_set: str, params: tuple) -> None:
    """Troca de estado atômica: só passa se o pedido ainda estiver em `de`."""
    alterados = db.executar(
        f"UPDATE pedido_compra SET {sql_set} WHERE id = %s AND clinica_id = %s AND status = ANY(%s)",
        params + (pedido_id, clinica_id, list(de)),
    )
    if alterados == 0:
        raise HTTPException(409, "O pedido mudou de situação enquanto você olhava. Atualize a lista.")


@router.get("/api/compras", response_model=list[PedidoResumo])
def listar_pedidos(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("purchases", "view")),
):
    """Pedidos da clínica, mais recentes primeiro. Os últimos 500 bastam para a tela."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    linhas = db.buscar_todos(
        SELECT_PEDIDO + " WHERE pc.clinica_id = %s ORDER BY pc.created_at DESC LIMIT 500",
        (clinica["id"],),
    )
    itens = itens_dos_pedidos([l["id"] for l in linhas])
    return [montar(l, itens.get(str(l["id"]), [])) for l in linhas]


@router.post("/api/compras", response_model=PedidoResumo, status_code=201)
def criar_pedido(
    payload: PedidoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("purchases", "create")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    with db.cursor() as cur:
        # Número sequencial por clínica sem corrida: o lock vale até o commit.
        cur.execute("SELECT pg_advisory_xact_lock(hashtext('pedido_compra:' || %s))", (str(clinica["id"]),))
        cur.execute("SELECT COALESCE(max(numero), 0) + 1 AS proximo FROM pedido_compra WHERE clinica_id = %s", (clinica["id"],))
        numero = cur.fetchone()["proximo"]
        cur.execute(
            """
            INSERT INTO pedido_compra (clinica_id, numero, titulo, justificativa, urgente, solicitante_id)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (clinica["id"], numero, payload.titulo.strip(), (payload.justificativa or "").strip() or None,
             payload.urgente, usuario.id),
        )
        novo = cur.fetchone()["id"]
        for ordem, item in enumerate(payload.itens):
            cur.execute(
                """
                INSERT INTO item_pedido_compra (pedido_id, descricao, quantidade, unidade, valor_unitario, ordem)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (novo, item.descricao.strip(), item.quantidade, item.unidade.strip(), item.valorUnitario, ordem),
            )
    logger.info("Pedido de compra %s (%s) criado por %s", numero, payload.titulo, usuario.nome)
    return pedido_da_clinica(str(novo), clinica["id"])


@router.post("/api/compras/{pedido_id}/aprovar", response_model=PedidoResumo)
def aprovar_pedido(
    pedido_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("purchases", "edit")),
):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    pedido = pedido_da_clinica(pedido_id, clinica["id"])
    if pedido.solicitanteId == usuario.id:
        raise HTTPException(403, "Quem pediu não aprova o próprio pedido. Peça a outra pessoa com essa permissão.")
    transicao(pedido_id, clinica["id"], ("solicitado",),
              "status = 'aprovado', decidido_por = %s, decidido_em = now()", (usuario.id,))
    return pedido_da_clinica(pedido_id, clinica["id"])


@router.post("/api/compras/{pedido_id}/recusar", response_model=PedidoResumo)
def recusar_pedido(
    pedido_id: str,
    payload: PedidoMotivo,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("purchases", "edit")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    pedido = pedido_da_clinica(pedido_id, clinica["id"])
    if pedido.solicitanteId == usuario.id:
        raise HTTPException(403, "Quem pediu não recusa o próprio pedido; se desistiu, cancele.")
    transicao(pedido_id, clinica["id"], ("solicitado",),
              "status = 'recusado', decidido_por = %s, decidido_em = now(), motivo_recusa = %s",
              (usuario.id, payload.motivo.strip()))
    return pedido_da_clinica(pedido_id, clinica["id"])


@router.post("/api/compras/{pedido_id}/comprar", response_model=PedidoResumo)
def registrar_compra(
    pedido_id: str,
    payload: PedidoCompra,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("purchases", "edit")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    pedido_da_clinica(pedido_id, clinica["id"])
    contrato_id = payload.contratoId or None
    if contrato_id:
        contrato = contrato_da_clinica(contrato_id, clinica["id"])
        if contrato["encerrado_em"]:
            raise HTTPException(409, "Esse contrato está encerrado.")
    transicao(pedido_id, clinica["id"], ("aprovado",),
              "status = 'comprado', comprado_por = %s, comprado_em = now(), fornecedor = %s, valor_final = %s, contrato_id = %s",
              (usuario.id, payload.fornecedor.strip(), payload.valorFinal, contrato_id))
    return pedido_da_clinica(pedido_id, clinica["id"])


@router.post("/api/compras/{pedido_id}/receber", response_model=PedidoResumo)
def confirmar_recebimento(
    pedido_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("purchases", "create")),
):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    pedido_da_clinica(pedido_id, clinica["id"])
    transicao(pedido_id, clinica["id"], ("comprado",),
              "status = 'recebido', recebido_por = %s, recebido_em = now()", (usuario.id,))
    return pedido_da_clinica(pedido_id, clinica["id"])


@router.post("/api/compras/{pedido_id}/cancelar", response_model=Ok)
def cancelar_pedido(
    pedido_id: str,
    payload: PedidoMotivo,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("purchases", "view")),
):
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    pedido = pedido_da_clinica(pedido_id, clinica["id"])
    pode_editar = bool(permissoes_do_perfil(usuario).get("purchases", {}).get("edit"))
    eh_dono = pedido.solicitanteId == usuario.id
    if not pode_editar and not (eh_dono and pedido.status == "solicitado"):
        raise HTTPException(403, "Você pode cancelar só o seu pedido, e enquanto ninguém decidiu sobre ele.")
    transicao(pedido_id, clinica["id"], ("solicitado", "aprovado", "comprado"),
              "status = 'cancelado', cancelado_por = %s, cancelado_em = now(), motivo_cancelamento = %s",
              (usuario.id, payload.motivo.strip()))
    logger.info("Pedido de compra %s cancelado por %s", pedido.numero, usuario.nome)
    return Ok()
