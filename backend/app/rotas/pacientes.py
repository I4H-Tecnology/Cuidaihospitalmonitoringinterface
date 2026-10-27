"""Cadastro, vínculo com ambiente e alta de pacientes (RF05, RF08, RN07)."""

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..comum import clinica_por_slug, iso, logger
from .operacional import registrar_movimentacao
from ..seguranca import (
    UsuarioAutenticado,
    exigir_permissao,
    exigir_tenant,
)
from ..schemas import (
    AltaPayload,
    AltaResultado,
    PacienteEdicaoPayload,
    PacientePayload,
    PacienteResumo,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Pacientes (RF05, RF21, RF22)
#
# A legenda da Figura 5 da RFC autoriza exatamente isto: "no MVP, aproveita-se
# o cadastro e o status dos pacientes monitorados". Em 13/09/2026, por decisão
# de produto, o cadastro ganhou histórico médico e médico responsável, e o
# prontuário ganhou evolução, alergia/risco e prescrição (rotas próprias);
# exame continua fora.
# -----------------------------------------------------------------------------

SELECT_PACIENTE = """
    SELECT p.id, p.nome, p.data_nascimento, p.status, p.data_admissao, p.data_alta,
           p.historico_medico, p.medico_responsavel,
           amb.id AS ambiente_id, amb.nome AS ambiente_nome, amb.tipo AS ambiente_tipo,
           date_part('year', age(p.data_nascimento))::int AS idade,
           count(o.id) FILTER (
             WHERE o.status IN ('pendente', 'em_atendimento')
           ) AS abertas,
           count(o.id) FILTER (WHERE o.status = 'queda_confirmada') AS confirmadas,
           count(o.id) AS total_ocorrencias,
           max(o.data_hora) AS ultima_ocorrencia
      FROM paciente p
      LEFT JOIN ambiente amb ON amb.id = p.ambiente_id
      LEFT JOIN ocorrencia o ON o.paciente_id = p.id
     WHERE p.clinica_id = %(cid)s
"""


def montar_paciente(l: dict) -> PacienteResumo:
    # Derivada de evento aberto, nunca de julgamento clínico: a RN16 é
    # explícita em que o sistema não emite diagnóstico, só risco operacional.
    if l["abertas"]:
        situacao = "critical"
    elif l["confirmadas"]:
        situacao = "attention"
    else:
        situacao = "stable"

    return PacienteResumo(
        id=str(l["id"]),
        nome=l["nome"],
        idade=l["idade"],
        dataNascimento=l["data_nascimento"].isoformat() if l["data_nascimento"] else None,
        status=l["status"],
        dataAdmissao=l["data_admissao"].isoformat(),
        dataAlta=l["data_alta"].isoformat() if l["data_alta"] else None,
        ambienteId=str(l["ambiente_id"]) if l["ambiente_id"] else None,
        ambienteNome=l["ambiente_nome"],
        ambienteTipo=l["ambiente_tipo"],
        historicoMedico=l.get("historico_medico"),
        medicoResponsavel=l.get("medico_responsavel"),
        situacao=situacao,
        ocorrenciasAbertas=l["abertas"] or 0,
        quedasConfirmadas=l["confirmadas"] or 0,
        totalOcorrencias=l["total_ocorrencias"] or 0,
        ultimaOcorrencia=iso(l["ultima_ocorrencia"]),
    )


@router.get("/api/pacientes", response_model=list[PacienteResumo])
def listar_pacientes(
    tenantId: str,
    incluirAlta: bool = False,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("patients", "view")),
):
    """Pacientes da clínica, com o resumo de ocorrências de cada um."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)

    filtro = "" if incluirAlta else " AND p.status = 'internado'"
    linhas = db.buscar_todos(
        SELECT_PACIENTE + filtro + """
        GROUP BY p.id, p.nome, p.data_nascimento, p.status, p.data_admissao,
                 p.data_alta, amb.id, amb.nome, amb.tipo
        ORDER BY abertas DESC, p.nome
        """,
        {"cid": clinica["id"]},
    )
    return [montar_paciente(l) for l in linhas]


@router.get("/api/pacientes/{paciente_id}", response_model=PacienteResumo)
def obter_paciente(
    paciente_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("patients", "view")),
):
    """Um paciente, com o mesmo resumo da listagem."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)

    linha = db.buscar_um(
        SELECT_PACIENTE + """ AND p.id = %(pid)s
        GROUP BY p.id, p.nome, p.data_nascimento, p.status, p.data_admissao,
                 p.data_alta, amb.id, amb.nome, amb.tipo
        """,
        {"cid": clinica["id"], "pid": paciente_id},
    )
    if not linha:
        raise HTTPException(404, "Paciente não encontrado.")
    return montar_paciente(linha)


@router.post("/api/pacientes/{paciente_id}/alta", response_model=AltaResultado)
def dar_alta(
    paciente_id: str,
    payload: AltaPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("patients", "edit")),
):
    """Registra a alta do paciente e revoga o acesso dos acompanhantes (RN07).

    A revogação não é opcional nem assíncrona: a RN07 diz que o acesso "será
    cancelado automaticamente na alta". Deixar para um job depois abriria uma
    janela em que um familiar continua vendo a câmera de um quarto que já é de
    outra pessoa.
    """
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)

    paciente = db.buscar_um(
        "SELECT id, nome, status, data_admissao, ambiente_id FROM paciente WHERE id = %s AND clinica_id = %s",
        (paciente_id, clinica["id"]),
    )
    if not paciente:
        raise HTTPException(404, "Paciente não encontrado.")
    if paciente["status"] != "internado":
        raise HTTPException(409, f"Paciente já consta como '{paciente['status']}'.")

    abertas = db.buscar_um(
        """
        SELECT count(*) AS n FROM ocorrencia
         WHERE paciente_id = %s AND status IN ('pendente', 'em_atendimento')
        """,
        (paciente_id,),
    )
    # Dar alta com queda em aberto deixaria a ocorrência órfã de desfecho, e é
    # justamente o registro que o gestor audita depois.
    if abertas["n"]:
        raise HTTPException(
            409,
            f"Há {abertas['n']} ocorrência(s) em aberto para este paciente. "
            "Encerre o atendimento antes de dar alta.",
        )

    with db.cursor() as cur:
        cur.execute(
            """
            UPDATE paciente
               SET status = %s, data_alta = GREATEST(CURRENT_DATE, data_admissao)
             WHERE id = %s
            """,
            (payload.motivo, paciente_id),
        )
        # RN07: o acesso do acompanhante morre junto com a internação.
        cur.execute(
            """
            UPDATE acompanhante
               SET ativo = false, revogado_em = now()
             WHERE paciente_id = %s AND ativo
            """,
            (paciente_id,),
        )
        revogados = cur.rowcount
        registrar_movimentacao(
            cur, clinica["id"], paciente_id,
            "transferencia_externa" if payload.motivo == "transferido" else "alta",
            origem=paciente["ambiente_id"], usuario_id=usuario.id,
        )

        cur.execute(
            """
            INSERT INTO log_acesso (clinica_id, usuario_id, acao, resultado, ip)
            VALUES (%s, %s, %s, 'sucesso', NULL)
            """,
            (clinica["id"], usuario.id, f"Alta de paciente ({payload.motivo})"),
        )

    logger.info(
        "Alta registrada: %s (%s) por %s. Acessos de acompanhante revogados: %d",
        paciente["nome"], payload.motivo, usuario.nome, revogados,
    )

    atualizado = db.buscar_um(
        SELECT_PACIENTE + """ AND p.id = %(pid)s
        GROUP BY p.id, p.nome, p.data_nascimento, p.status, p.data_admissao,
                 p.data_alta, amb.id, amb.nome, amb.tipo
        """,
        {"cid": clinica["id"], "pid": paciente_id},
    )
    return AltaResultado(paciente=montar_paciente(atualizado), acessosRevogados=revogados)


@router.post("/api/pacientes", response_model=PacienteResumo, status_code=201)
def criar_paciente(
    payload: PacientePayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("patients", "create")),
):
    """Cadastra um paciente e o vincula a um ambiente (RF05, RF08, RN02).

    Faltava por inteiro: o sistema listava e dava alta, mas não tinha por onde
    admitir ninguém. Sem isto, dar saída no último paciente deixava a clínica
    sem caminho de volta.
    """
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)

    ambiente_id = None
    if payload.ambienteId:
        ambiente = db.buscar_um(
            "SELECT id FROM ambiente WHERE id = %s AND clinica_id = %s",
            (payload.ambienteId, clinica["id"]),
        )
        if not ambiente:
            raise HTTPException(404, "Ambiente não encontrado nesta clínica.")
        ambiente_id = ambiente["id"]

    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO paciente (clinica_id, ambiente_id, nome, data_nascimento, data_admissao,
                                  historico_medico, medico_responsavel)
            VALUES (%s, %s, %s, %s, COALESCE(%s::date, CURRENT_DATE), %s, %s)
            RETURNING id
            """,
            (clinica["id"], ambiente_id, payload.nome.strip(),
             payload.dataNascimento or None, payload.dataAdmissao or None,
             (payload.historicoMedico or "").strip() or None,
             (payload.medicoResponsavel or "").strip() or None),
        )
        novo = cur.fetchone()
        registrar_movimentacao(cur, clinica["id"], novo["id"], "admissao", destino=ambiente_id, usuario_id=usuario.id)

    logger.info("Paciente cadastrado: %s por %s", payload.nome, usuario.nome)
    return obter_paciente(str(novo["id"]), payload.tenantId, usuario)


@router.patch("/api/pacientes/{paciente_id}", response_model=PacienteResumo)
def editar_paciente(
    paciente_id: str,
    payload: PacienteEdicaoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("patients", "edit")),
):
    """Corrige o cadastro, troca o ambiente vinculado ou reinterna (RF08)."""
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)

    atual = db.buscar_um(
        "SELECT id, status, ambiente_id FROM paciente WHERE id = %s AND clinica_id = %s",
        (paciente_id, clinica["id"]),
    )
    if not atual:
        raise HTTPException(404, "Paciente não encontrado.")

    campos, valores = [], []
    if payload.nome is not None:
        campos.append("nome = %s")
        valores.append(payload.nome.strip())
    if payload.dataNascimento is not None:
        campos.append("data_nascimento = %s::date")
        valores.append(payload.dataNascimento or None)
    if payload.ambienteId is not None:
        if payload.ambienteId:
            amb = db.buscar_um(
                "SELECT id FROM ambiente WHERE id = %s AND clinica_id = %s",
                (payload.ambienteId, clinica["id"]),
            )
            if not amb:
                raise HTTPException(404, "Ambiente não encontrado nesta clínica.")
        campos.append("ambiente_id = %s")
        valores.append(payload.ambienteId or None)
    if payload.historicoMedico is not None:
        campos.append("historico_medico = %s")
        valores.append(payload.historicoMedico.strip() or None)
    if payload.medicoResponsavel is not None:
        campos.append("medico_responsavel = %s")
        valores.append(payload.medicoResponsavel.strip() or None)
    if payload.status == "internado":
        # O CHECK paciente_alta_coerente exige data_alta nula quando internado,
        # então os dois têm de mudar juntos. A nova admissão vira hoje.
        campos.append("status = 'internado'")
        campos.append("data_alta = NULL")
        campos.append("data_admissao = CURRENT_DATE")

    if not campos:
        raise HTTPException(400, "Nada a alterar.")

    valores.append(paciente_id)
    # `campos` só tem fragmentos fixos deste módulo; os valores vão por parâmetro.
    with db.cursor() as cur:
        cur.execute(f"UPDATE paciente SET {', '.join(campos)} WHERE id = %s", tuple(valores))  # nosec B608
        novo_ambiente = (payload.ambienteId or None) if payload.ambienteId is not None else atual["ambiente_id"]
        if payload.status == "internado" and atual["status"] != "internado":
            registrar_movimentacao(cur, clinica["id"], paciente_id, "admissao", destino=novo_ambiente,
                                   motivo="Reinternação", usuario_id=usuario.id)
        elif payload.ambienteId is not None and str(novo_ambiente or "") != str(atual["ambiente_id"] or ""):
            registrar_movimentacao(cur, clinica["id"], paciente_id, "transferencia", atual["ambiente_id"], novo_ambiente,
                                   usuario_id=usuario.id)
    logger.info("Paciente %s atualizado por %s", paciente_id, usuario.nome)
    return obter_paciente(paciente_id, payload.tenantId, usuario)
