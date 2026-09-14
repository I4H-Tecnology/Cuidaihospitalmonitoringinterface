"""A clínica do próprio tenant: ler e editar o cadastro.

`clinica` é o tenant. O token de cada usuário já vem preso a uma só, então
não há "listar clínicas" nem "criar clínica" por aqui: só a do próprio
usuário, e só o que é seguro editar em autoatendimento.

Fora do PATCH, de propósito:

  - `ativa`: desativar corta o acesso de TODOS os usuários da clínica de uma
    vez, login incluso (`comum.py:clinica_por_slug`, `seguranca.py`). Um
    clique errado trancaria a clínica sem volta pela própria tela. Aparece na
    leitura, nunca na edição.
  - `cnpj`: mudar o CNPJ de uma clínica em operação é ato jurídico, não
    ajuste de tela. Fica só de leitura.
  - `slug`: é o identificador que o frontend e os tokens usam.
"""

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import clinica_por_slug, logger
from ..schemas import ClinicaEdicaoPayload, ClinicaResumo
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant

router = APIRouter()

SELECT_CLINICA = "SELECT slug, nome, cnpj, endereco, telefone, email, ativa FROM clinica WHERE id = %s"


def montar(l: dict) -> ClinicaResumo:
    return ClinicaResumo(
        slug=l["slug"],
        nome=l["nome"],
        cnpj=l["cnpj"],
        endereco=l["endereco"],
        telefone=l["telefone"],
        email=l["email"],
        ativa=bool(l["ativa"]),
    )


@router.get("/api/clinica", response_model=ClinicaResumo)
def obter_clinica(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("settings", "view")),
):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    return montar(db.buscar_um(SELECT_CLINICA, (clinica["id"],)))


@router.patch("/api/clinica", response_model=ClinicaResumo)
def editar_clinica(
    payload: ClinicaEdicaoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("settings", "edit")),
):
    """Nome, endereço, telefone e e-mail. Só os campos enviados mudam; string
    vazia limpa o campo (endereço, telefone e e-mail são opcionais)."""
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)

    campos, valores = [], []
    if payload.nome is not None:
        campos.append("nome = %s")
        valores.append(payload.nome.strip())
    for coluna in ("endereco", "telefone", "email"):
        valor = getattr(payload, coluna)
        if valor is not None:
            campos.append(f"{coluna} = %s")
            valores.append(valor.strip() or None)
    if not campos:
        raise HTTPException(400, "Nada a alterar.")

    valores.append(clinica["id"])
    # `campos` só tem nomes de coluna fixos deste módulo; os valores vão por parâmetro.
    db.executar(f"UPDATE clinica SET {', '.join(campos)} WHERE id = %s", tuple(valores))  # nosec B608
    logger.info("Cadastro da clínica %s atualizado por %s", payload.tenantId, usuario.nome)
    return montar(db.buscar_um(SELECT_CLINICA, (clinica["id"],)))
