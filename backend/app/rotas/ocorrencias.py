"""Ingestão da detecção, histórico e ciclo de atendimento (RF13-RF22)."""

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from .. import db
from ..comum import agora_iso, clinica_por_slug, iso, logger
from ..seguranca import (
    UsuarioAutenticado,
    exigir_permissao,
    exigir_tenant,
)
from datetime import datetime

from ..alertas import autenticar_conexao, central
from ..schemas import (
    AtendimentoPayload,
    ContextoCamera,
    EncerramentoPayload,
    OcorrenciaCriada,
    OcorrenciaPayload,
    OcorrenciaResumo,
    Ok,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Monitoramento — ingestão do serviço de visão e leitura do painel
#
# É aqui que a detecção deixa de ser um log e vira registro. Até esta fase o
# pipeline via a queda, decidia que era queda, e não contava para ninguém.
#
# Quem escreve é o usuário de serviço (perfil SYSTEM, permissão monitoring:
# create). Ele passa pelas MESMAS dependências de um humano — mesmo token,
# mesma releitura no banco, mesmo isolamento por tenant. Um segundo mecanismo
# de autenticação só para máquina seria mais código e mais superfície de ataque
# para resolver um problema que o primeiro já resolve.
# -----------------------------------------------------------------------------

@router.get("/api/cameras/{camera_id}/contexto", response_model=ContextoCamera)
def contexto_da_camera(
    camera_id: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view")),
):
    """Onde a câmera está e quem ela observa.

    O serviço de visão chama uma vez no boot. A ocorrência exige ambiente_id, e
    quem sabe disso é o cadastro — deixar o vínculo no `.env` duplicaria o
    cadastro e desalinharia no primeiro remanejamento de leito.
    """
    linha = db.buscar_um(
        """
        SELECT cam.id, cam.identificador, cam.status,
               amb.id AS ambiente_id, amb.nome AS ambiente_nome,
               cli.slug AS tenant, cli.id AS clinica_id,
               pac.id AS paciente_id, pac.nome AS paciente_nome
        FROM camera cam
        JOIN ambiente amb ON amb.id = cam.ambiente_id
        JOIN clinica  cli ON cli.id = amb.clinica_id
        LEFT JOIN paciente pac
               ON pac.ambiente_id = amb.id AND pac.status = 'internado'
        WHERE cam.id = %s
        ORDER BY pac.data_admissao DESC
        LIMIT 1
        """,
        (camera_id,),
    )
    if not linha:
        raise HTTPException(404, "Câmera não encontrada.")
    # A câmera pertence a uma clínica através do ambiente. Sem esta conferência,
    # um token de uma clínica leria o cadastro da outra pelo id da câmera.
    exigir_tenant(usuario, linha["tenant"])

    return ContextoCamera(
        cameraId=str(linha["id"]),
        identificador=linha["identificador"],
        status=linha["status"],
        tenantId=linha["tenant"],
        ambienteId=str(linha["ambiente_id"]),
        ambienteNome=linha["ambiente_nome"],
        pacienteId=str(linha["paciente_id"]) if linha["paciente_id"] else None,
        pacienteNome=linha["paciente_nome"],
    )


@router.post("/api/cameras/{camera_id}/ping", response_model=Ok)
def ping_da_camera(
    camera_id: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "create")),
):
    """Sinal de vida da câmera (RF30, RN15).

    Marca online e carimba o horário. Quem decide que ela caiu é a ausência de
    ping, não uma chamada — câmera que morre não avisa. Essa parte é da Fase 4.
    """
    linha = db.buscar_um(
        """
        SELECT cam.id, cli.slug AS tenant
        FROM camera cam
        JOIN ambiente amb ON amb.id = cam.ambiente_id
        JOIN clinica  cli ON cli.id = amb.clinica_id
        WHERE cam.id = %s
        """,
        (camera_id,),
    )
    if not linha:
        raise HTTPException(404, "Câmera não encontrada.")
    exigir_tenant(usuario, linha["tenant"])

    db.executar(
        "UPDATE camera SET status = 'online', ultimo_ping = now() WHERE id = %s",
        (camera_id,),
    )
    return Ok()


@router.post("/api/ocorrencias", response_model=OcorrenciaCriada, status_code=201)
def registrar_ocorrencia(
    payload: OcorrenciaPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "create")),
):
    """Registra a ocorrência detectada e abre o alerta correspondente (RF13, RF14).

    Ocorrência e alerta nascem na MESMA transação. Meio caminho aqui seria o
    pior estado possível: um evento gravado que nunca notifica ninguém — o
    sistema acharia que avisou, e a equipe nunca teria sido avisada.
    """
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)

    camera = db.buscar_um(
        """
        SELECT cam.id, cam.identificador, amb.id AS ambiente_id, amb.nome AS ambiente_nome,
               amb.clinica_id,
               (SELECT p.id FROM paciente p
                 WHERE p.ambiente_id = amb.id AND p.status = 'internado'
                 ORDER BY p.data_admissao DESC LIMIT 1) AS paciente_id,
               (SELECT p.nome FROM paciente p
                 WHERE p.ambiente_id = amb.id AND p.status = 'internado'
                 ORDER BY p.data_admissao DESC LIMIT 1) AS paciente_nome
        FROM camera cam
        JOIN ambiente amb ON amb.id = cam.ambiente_id
        WHERE cam.id = %s
        """,
        (payload.cameraId,),
    )
    # Mesma resposta para "não existe" e "é de outra clínica": distinguir as duas
    # já contaria que a câmera existe em algum lugar.
    if not camera or str(camera["clinica_id"]) != str(clinica["id"]):
        raise HTTPException(404, "Câmera não encontrada.")

    with db.cursor() as cur:
        # A chave é PK: se o evento já entrou, devolvemos o id antigo e nada é
        # criado. É o que torna o reenvio da fila seguro.
        cur.execute(
            "SELECT ocorrencia_id FROM stub_evento_publicado WHERE chave = %s",
            (payload.chaveEvento,),
        )
        ja_existe = cur.fetchone()
        if ja_existe:
            cur.execute(
                "SELECT id FROM alerta WHERE ocorrencia_id = %s",
                (ja_existe["ocorrencia_id"],),
            )
            alerta = cur.fetchone()
            return OcorrenciaCriada(
                id=str(ja_existe["ocorrencia_id"]),
                alertaId=str(alerta["id"]) if alerta else "",
                duplicada=True,
            )

        cur.execute(
            """
            INSERT INTO ocorrencia
              (clinica_id, paciente_id, ambiente_id, camera_id,
               tipo_evento, status, confianca, data_hora, observacao)
            VALUES (%s, %s, %s, %s, %s, 'pendente', %s, %s, %s)
            RETURNING id
            """,
            (
                clinica["id"],
                camera["paciente_id"],
                camera["ambiente_id"],
                camera["id"],
                payload.tipoEvento,
                payload.confianca,
                payload.dataHora,
                payload.motivo,
            ),
        )
        ocorrencia_id = cur.fetchone()["id"]

        # Toda queda entra como crítica: a RFC prioriza recall justamente porque
        # o custo de subestimar é o paciente no chão sem atendimento.
        cur.execute(
            """
            INSERT INTO alerta (ocorrencia_id, nivel, status)
            VALUES (%s, 'critico', 'enviado')
            RETURNING id
            """,
            (ocorrencia_id,),
        )
        alerta_id = cur.fetchone()["id"]

        cur.execute(
            "INSERT INTO stub_evento_publicado (chave, ocorrencia_id) VALUES (%s, %s)",
            (payload.chaveEvento, ocorrencia_id),
        )

    # Fora do `with`: a transação já fechou, então o que o painel receber
    # existe mesmo no banco. Empurrar de dentro anunciaria um evento que um
    # rollback ainda poderia desfazer.
    ouvintes = central.publicar(payload.tenantId, {
        "tipo": "ocorrencia",
        "ocorrenciaId": str(ocorrencia_id),
        "alertaId": str(alerta_id),
        "tipoEvento": payload.tipoEvento,
        "confianca": payload.confianca,
        "dataHora": payload.dataHora.isoformat(),
        "motivo": payload.motivo,
        "nivel": "critico",
        "cameraId": str(camera["id"]),
        "cameraIdentificador": camera["identificador"],
        "ambienteId": str(camera["ambiente_id"]),
        "ambienteNome": camera["ambiente_nome"],
        "pacienteId": str(camera["paciente_id"]) if camera["paciente_id"] else None,
        "pacienteNome": camera["paciente_nome"],
    })
    logger.warning(
        "Ocorrência %s registrada e empurrada para %d painel(is)", ocorrencia_id, ouvintes
    )

    return OcorrenciaCriada(id=str(ocorrencia_id), alertaId=str(alerta_id))


# Colunas filtráveis do RF22. O mapa existe para que o nome vindo da query
# string nunca chegue ao SQL: só a coluna correspondente entra, e o valor vai
# sempre por parâmetro.
FILTROS_OCORRENCIA = {
    "pacienteId": "o.paciente_id",
    "ambienteId": "o.ambiente_id",
    "status": "o.status",
    "tipoEvento": "o.tipo_evento",
}


@router.get("/api/ocorrencias", response_model=list[OcorrenciaResumo])
def listar_ocorrencias(
    tenantId: str,
    pacienteId: str | None = None,
    ambienteId: str | None = None,
    status: str | None = None,
    tipoEvento: str | None = None,
    desde: datetime | None = None,
    ate: datetime | None = None,
    limite: int = 100,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view")),
):
    """Histórico com os filtros do RF22: paciente, ambiente, data, status e tipo."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)

    condicoes = ["o.clinica_id = %(cid)s"]
    params: dict = {"cid": clinica["id"], "limite": max(1, min(limite, 500))}

    recebidos = {
        "pacienteId": pacienteId,
        "ambienteId": ambienteId,
        "status": status,
        "tipoEvento": tipoEvento,
    }
    for nome, valor in recebidos.items():
        if valor:
            condicoes.append(f"{FILTROS_OCORRENCIA[nome]} = %({nome})s")
            params[nome] = valor
    if desde:
        condicoes.append("o.data_hora >= %(desde)s")
        params["desde"] = desde
    if ate:
        condicoes.append("o.data_hora <= %(ate)s")
        params["ate"] = ate

    linhas = db.buscar_todos(
        f"""
        SELECT o.id, o.tipo_evento, o.status, o.confianca, o.data_hora,
               o.encerrada_em, o.observacao,
               amb.id AS ambiente_id, amb.nome AS ambiente_nome,
               pac.id AS paciente_id, pac.nome AS paciente_nome,
               cam.id AS camera_id, cam.identificador AS camera_identificador,
               a.nivel AS alerta_nivel, a.status AS alerta_status
        FROM ocorrencia o
        JOIN ambiente amb ON amb.id = o.ambiente_id
        LEFT JOIN paciente pac ON pac.id = o.paciente_id
        LEFT JOIN camera   cam ON cam.id = o.camera_id
        LEFT JOIN alerta   a   ON a.ocorrencia_id = o.id
        WHERE {' AND '.join(condicoes)}
        ORDER BY o.data_hora DESC
        LIMIT %(limite)s
        """,
        params,
    )

    return [
        OcorrenciaResumo(
            id=str(l["id"]),
            tipoEvento=l["tipo_evento"],
            status=l["status"],
            confianca=float(l["confianca"]) if l["confianca"] is not None else None,
            dataHora=iso(l["data_hora"]),
            encerradaEm=iso(l["encerrada_em"]),
            observacao=l["observacao"],
            ambienteId=str(l["ambiente_id"]),
            ambienteNome=l["ambiente_nome"],
            pacienteId=str(l["paciente_id"]) if l["paciente_id"] else None,
            pacienteNome=l["paciente_nome"],
            cameraId=str(l["camera_id"]) if l["camera_id"] else None,
            cameraIdentificador=l["camera_identificador"],
            alertaNivel=l["alerta_nivel"],
            alertaStatus=l["alerta_status"],
        )
        for l in linhas
    ]


# -----------------------------------------------------------------------------
# Ciclo de atendimento (RF17-RF20, RN11-RN14)
#
# A ocorrência já nascia no banco desde a etapa anterior, mas ficava lá parada:
# ninguém dava ciência, ninguém atendia, ninguém classificava. Aqui o fluxo da
# seção 3.1 da RFC se fecha:
#
#     alerta -> ciência -> atendimento -> encerramento com classificação
#
# Cada passo exige `alerts:edit`, que o perfil NURSE tem e o MANAGER não: o
# gestor acompanha o indicador, quem atende é a enfermagem (RN17).
# -----------------------------------------------------------------------------

def ocorrencia_da_clinica(ocorrencia_id: str, clinica_id) -> dict:
    """Carrega a ocorrência conferindo que ela é desta clínica.

    Mesma resposta para inexistente e de outra clínica: distinguir as duas já
    contaria que a ocorrência existe em algum lugar.
    """
    linha = db.buscar_um(
        """
        SELECT o.id, o.status, o.clinica_id, o.tipo_evento, o.data_hora,
               a.id AS alerta_id, a.status AS alerta_status
        FROM ocorrencia o
        LEFT JOIN alerta a ON a.ocorrencia_id = o.id
        WHERE o.id = %s
        """,
        (ocorrencia_id,),
    )
    if not linha or str(linha["clinica_id"]) != str(clinica_id):
        raise HTTPException(404, "Ocorrência não encontrada.")
    return linha


@router.post("/api/ocorrencias/{ocorrencia_id}/ciencia", response_model=Ok)
def dar_ciencia(
    ocorrencia_id: str,
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("alerts", "edit")),
):
    """O profissional confirma que viu o alerta (RF17, RN12).

    Só aqui o alerta sai do painel. A RN12 é explícita: ele permanece visível
    até alguém confirmar — sumir sozinho por tempo transformaria um alerta não
    atendido em alerta esquecido.
    """
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    ocorrencia = ocorrencia_da_clinica(ocorrencia_id, clinica["id"])

    if not ocorrencia["alerta_id"]:
        raise HTTPException(409, "Esta ocorrência não tem alerta associado.")
    # Ciência é idempotente: dois enfermeiros tocando o mesmo card ao mesmo
    # tempo não é erro, e o segundo não deve sobrescrever quem chegou primeiro.
    if ocorrencia["alerta_status"] == "ciente":
        return Ok()

    db.executar(
        """
        UPDATE alerta
           SET status = 'ciente', ciencia_em = now(), ciencia_usuario_id = %s
         WHERE id = %s AND status <> 'ciente'
        """,
        (usuario.id, ocorrencia["alerta_id"]),
    )
    central.publicar(tenantId, {
        "tipo": "ciencia",
        "ocorrenciaId": ocorrencia_id,
        "por": usuario.nome,
        "em": agora_iso(),
    })
    return Ok()


@router.post("/api/ocorrencias/{ocorrencia_id}/atendimento", response_model=Ok)
def iniciar_atendimento(
    ocorrencia_id: str,
    payload: AtendimentoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("alerts", "edit")),
):
    """Registra que o profissional foi verificar o paciente (RF18, RN17)."""
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    ocorrencia = ocorrencia_da_clinica(ocorrencia_id, clinica["id"])

    if ocorrencia["status"] not in ("pendente", "em_atendimento"):
        raise HTTPException(409, "Esta ocorrência já foi encerrada.")

    with db.cursor() as cur:
        # Reabrir o atendimento de quem já estava em campo duplicaria o
        # registro e estragaria o tempo de resposta que o gestor audita.
        cur.execute(
            """
            SELECT id FROM atendimento
             WHERE ocorrencia_id = %s AND usuario_id = %s AND finalizado_em IS NULL
            """,
            (ocorrencia_id, usuario.id),
        )
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO atendimento (ocorrencia_id, usuario_id) VALUES (%s, %s)",
                (ocorrencia_id, usuario.id),
            )

        cur.execute(
            "UPDATE ocorrencia SET status = 'em_atendimento' WHERE id = %s AND status = 'pendente'",
            (ocorrencia_id,),
        )
        # Iniciar o atendimento implica ter visto o alerta. Cobrar dois cliques
        # para dizer a mesma coisa só atrasa quem está indo socorrer alguém.
        cur.execute(
            """
            UPDATE alerta
               SET status = 'ciente', ciencia_em = now(), ciencia_usuario_id = %s
             WHERE ocorrencia_id = %s AND status <> 'ciente'
            """,
            (usuario.id, ocorrencia_id),
        )

    central.publicar(payload.tenantId, {
        "tipo": "atendimento_iniciado",
        "ocorrenciaId": ocorrencia_id,
        "por": usuario.nome,
        "em": agora_iso(),
    })
    return Ok()


@router.post("/api/ocorrencias/{ocorrencia_id}/encerrar", response_model=Ok)
def encerrar_ocorrencia(
    ocorrencia_id: str,
    payload: EncerramentoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("alerts", "edit")),
):
    """Encerra a ocorrência classificando o que realmente aconteceu.

    A classificação é OBRIGATÓRIA (RF20). É ela que separa queda real de
    alarme falso, e sem essa separação não existe como medir a precisão que a
    RFC promete — nem como alimentar a análise da RN14.
    """
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)
    ocorrencia = ocorrencia_da_clinica(ocorrencia_id, clinica["id"])

    if ocorrencia["status"] in ("encerrada", "falso_positivo", "queda_confirmada"):
        raise HTTPException(409, "Esta ocorrência já foi encerrada.")

    with db.cursor() as cur:
        cur.execute(
            """
            UPDATE ocorrencia
               SET status = %s, encerrada_em = now(), observacao = %s
             WHERE id = %s
            """,
            (payload.classificacao, payload.observacao, ocorrencia_id),
        )
        # Fecha o atendimento em aberto, se houver. O enfermeiro pode encerrar
        # sem ter clicado em "iniciar" — foi ao quarto, viu que era alarme
        # falso e voltou. Nesse caso não há intervalo a fechar.
        cur.execute(
            """
            UPDATE atendimento
               SET finalizado_em = now(),
                   observacao = COALESCE(%s, observacao)
             WHERE ocorrencia_id = %s AND finalizado_em IS NULL
            """,
            (payload.observacao, ocorrencia_id),
        )

    central.publicar(payload.tenantId, {
        "tipo": "encerrada",
        "ocorrenciaId": ocorrencia_id,
        "classificacao": payload.classificacao,
        "por": usuario.nome,
        "em": agora_iso(),
    })

    if payload.classificacao == "falso_positivo":
        # RN14: falso positivo é insumo, não lixo. Fica registrado para
        # realimentar a análise da IA -- é a única fonte de rótulo vinda da
        # operação real, e é o que permite recalibrar os limiares depois.
        logger.info(
            "FALSO POSITIVO marcado por %s na ocorrência %s (evento %s de %s)",
            usuario.nome, ocorrencia_id, ocorrencia["tipo_evento"], ocorrencia["data_hora"],
        )
    return Ok()


# -----------------------------------------------------------------------------
# Canal de tempo real
# -----------------------------------------------------------------------------

@router.websocket("/api/ws/alertas")
async def canal_de_alertas(ws: WebSocket):
    """Empurra alerta para o painel no instante em que a ocorrência nasce.

    O cliente abre a conexão e manda `{"token": "..."}` como primeira
    mensagem. O tenant sai do token, nunca do que o cliente pedir — assim um
    painel não consegue escutar o canal de outra clínica.
    """
    await ws.accept()
    identidade = await autenticar_conexao(ws)
    if identidade is None:
        return

    tenant, nome = identidade
    await central.entrar(ws, tenant)
    try:
        await ws.send_json({"tipo": "conectado", "tenant": tenant, "em": agora_iso()})
        while True:
            # O cliente manda "ping" de tempos em tempos. Serve para segurar a
            # conexão viva através de proxy que derruba socket ocioso, e para
            # o servidor perceber a queda pela exceção.
            await ws.receive_text()
            await ws.send_json({"tipo": "pong", "em": agora_iso()})
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.debug("Canal de alertas encerrado para %s", nome, exc_info=True)
    finally:
        central.sair(ws, tenant)
