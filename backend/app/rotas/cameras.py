"""Cadastro de câmeras e ambientes monitorados (RF06, RF07, RF30)."""

from fastapi import APIRouter, Depends, HTTPException
from psycopg import sql

from .. import db
from ..comum import clinica_por_slug, iso, logger, mascarar_credencial
from ..ensaio import sem_ensaio
from ..seguranca import (
    UsuarioAutenticado,
    exigir_permissao,
    exigir_tenant,
)
from psycopg.errors import UniqueViolation
from ..schemas import (
    AmbienteResumo,
    CameraEdicaoPayload,
    CameraPayload,
    CameraResumo,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Cadastro de câmeras e ambientes (RF06, RF07, RF30)
#
# "Conectada" NÃO é lida da coluna status: é derivada de ultimo_ping a cada
# consulta. Coluna de status precisa de alguém para escrevê-la quando o
# dispositivo cai — e câmera que cai não avisa. Derivar do último sinal de vida
# torna o dado verdadeiro por construção, sem job de varredura.
#
# Gerir dispositivo exige monitoring:edit, e não :create. A conta de máquina do
# serviço de visão tem create (registrar ocorrência) e não tem edit — assim ela
# pode reportar queda mas não mexer no parque de câmeras.
# -----------------------------------------------------------------------------

# Sem ping nesta janela, a câmera é considerada desconectada. 90s dá folga para
# três batidas de 30s perdidas antes de acusar problema.
JANELA_DE_PING = "90 seconds"


def consultar_cameras(clinica_id, camera_id: str | None = None) -> list[dict]:
    """Parque de câmeras da clínica, com "conectada" derivada do último ping.

    O SQL é composto com `psycopg.sql` (JANELA_DE_PING, constante deste módulo, e o filtro de
    ensaio); o que vem do cliente entra por parâmetro.
    """
    filtro_camera = sql.SQL(" AND cam.id = %(cam)s") if camera_id else sql.SQL("")
    return db.buscar_todos(
        sql.SQL("""
        SELECT cam.id, cam.identificador, cam.url_stream, cam.status, cam.ultimo_ping,
               cam.visao_url,
               amb.id AS ambiente_id, amb.nome AS ambiente_nome, amb.tipo AS ambiente_tipo,
               pac.id AS paciente_id, pac.nome AS paciente_nome,
               (cam.ultimo_ping IS NOT NULL
                AND cam.ultimo_ping > now() - interval '{janela}') AS conectada,
               (SELECT count(*) FROM ocorrencia o
                 WHERE o.camera_id = cam.id
                   AND o.data_hora > now() - interval '24 hours'
                   AND {sem}) AS ocorrencias_24h,
               (SELECT max(o.data_hora) FROM ocorrencia o
                 WHERE o.camera_id = cam.id AND {sem})
                 AS ultima_ocorrencia
        FROM camera cam
        JOIN ambiente amb ON amb.id = cam.ambiente_id
        LEFT JOIN LATERAL (
          SELECT p.id, p.nome FROM paciente p
           WHERE p.ambiente_id = amb.id AND p.status = 'internado'
           ORDER BY p.data_admissao DESC LIMIT 1
        ) pac ON true
        WHERE amb.clinica_id = %(cid)s{filtro}
        ORDER BY conectada DESC, amb.nome, cam.identificador
        """).format(janela=sql.SQL(JANELA_DE_PING), sem=sem_ensaio("o"), filtro=filtro_camera),
        {"cid": clinica_id, "cam": camera_id},
    )


def montar_camera(l: dict) -> CameraResumo:
    return CameraResumo(
        id=str(l["id"]),
        identificador=l["identificador"],
        # A URL costuma carregar usuário e senha. Quem lista o parque não
        # precisa da credencial para operar, então ela não sai daqui.
        urlStream=mascarar_credencial(l["url_stream"]),
        status=l["status"],
        conectada=bool(l["conectada"]),
        ultimoPing=iso(l["ultimo_ping"]),
        ambienteId=str(l["ambiente_id"]),
        ambienteNome=l["ambiente_nome"],
        ambienteTipo=l["ambiente_tipo"],
        pacienteId=str(l["paciente_id"]) if l["paciente_id"] else None,
        pacienteNome=l["paciente_nome"],
        ocorrencias24h=l["ocorrencias_24h"] or 0,
        ultimaOcorrencia=iso(l["ultima_ocorrencia"]),
        visaoUrl=l["visao_url"],
    )


@router.get("/api/ambientes", response_model=list[AmbienteResumo])
def listar_ambientes(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view")),
):
    """Ambientes monitorados da clínica, com quantas câmeras cada um já tem."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)

    linhas = db.buscar_todos(
        """
        SELECT amb.id, amb.nome, amb.tipo,
               count(cam.id) AS cameras,
               (SELECT p.nome FROM paciente p
                 WHERE p.ambiente_id = amb.id AND p.status = 'internado'
                 ORDER BY p.data_admissao DESC LIMIT 1) AS paciente_nome
        FROM ambiente amb
        LEFT JOIN camera cam ON cam.ambiente_id = amb.id
        WHERE amb.clinica_id = %s
        GROUP BY amb.id, amb.nome, amb.tipo
        ORDER BY amb.nome
        """,
        (clinica["id"],),
    )
    return [
        AmbienteResumo(
            id=str(l["id"]),
            nome=l["nome"],
            tipo=l["tipo"],
            cameras=l["cameras"] or 0,
            pacienteNome=l["paciente_nome"],
        )
        for l in linhas
    ]


@router.get("/api/cameras", response_model=list[CameraResumo])
def listar_cameras(
    tenantId: str,
    somenteConectadas: bool = False,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view")),
):
    """Parque de câmeras da clínica, com o estado real de conexão."""
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)

    linhas = consultar_cameras(clinica["id"])
    if somenteConectadas:
        linhas = [l for l in linhas if l["conectada"]]

    return [montar_camera(l) for l in linhas]


@router.post("/api/cameras", response_model=CameraResumo, status_code=201)
def criar_camera(
    payload: CameraPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "edit")),
):
    """Vincula uma câmera nova a um ambiente monitorado (RF07, RN02)."""
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)

    ambiente = db.buscar_um(
        "SELECT id, nome, tipo FROM ambiente WHERE id = %s AND clinica_id = %s",
        (payload.ambienteId, clinica["id"]),
    )
    if not ambiente:
        raise HTTPException(404, "Ambiente não encontrado nesta clínica.")

    try:
        nova = db.buscar_um(
            """
            INSERT INTO camera (ambiente_id, identificador, url_stream, status, visao_url)
            VALUES (%s, %s, %s, 'offline', %s)
            RETURNING id, identificador, url_stream, status, ultimo_ping, visao_url
            """,
            (
                ambiente["id"],
                payload.identificador.strip(),
                payload.urlStream.strip(),
                payload.visaoUrl.rstrip("/") if payload.visaoUrl else None,
            ),
        )
    except UniqueViolation:
        raise HTTPException(
            409,
            f"Já existe uma câmera '{payload.identificador}' em {ambiente['nome']}.",
        )

    paciente = db.buscar_um(
        """
        SELECT id, nome FROM paciente
        WHERE ambiente_id = %s AND status = 'internado'
        ORDER BY data_admissao DESC LIMIT 1
        """,
        (ambiente["id"],),
    )

    return CameraResumo(
        id=str(nova["id"]),
        identificador=nova["identificador"],
        urlStream=mascarar_credencial(nova["url_stream"]),
        status=nova["status"],
        # Nasce desconectada, e é honesto que apareça assim: só passa a
        # conectada quando o serviço de visão apontar para ela e mandar o
        # primeiro sinal de vida.
        conectada=False,
        ultimoPing=None,
        ambienteId=str(ambiente["id"]),
        ambienteNome=ambiente["nome"],
        ambienteTipo=ambiente["tipo"],
        pacienteId=str(paciente["id"]) if paciente else None,
        pacienteNome=paciente["nome"] if paciente else None,
        ocorrencias24h=0,
        ultimaOcorrencia=None,
        visaoUrl=nova["visao_url"],
    )


@router.patch("/api/cameras/{camera_id}", response_model=CameraResumo)
def editar_camera(
    camera_id: str,
    payload: CameraEdicaoPayload,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "edit")),
):
    """Edita identificador, URL do stream, ambiente ou serviço de visão de uma câmera.

    A posse é conferida pelo ambiente: a câmera pertence à clínica através
    dele. Mudar de ambiente exige que o novo também seja da mesma clínica.
    """
    exigir_tenant(usuario, payload.tenantId)
    clinica = clinica_por_slug(payload.tenantId)

    atual = db.buscar_um(
        """
        SELECT cam.id, cam.ambiente_id
          FROM camera cam JOIN ambiente amb ON amb.id = cam.ambiente_id
         WHERE cam.id = %s AND amb.clinica_id = %s
        """,
        (camera_id, clinica["id"]),
    )
    if not atual:
        raise HTTPException(404, "Câmera não encontrada.")

    campos, valores = [], []
    if payload.identificador is not None:
        campos.append("identificador = %s")
        valores.append(payload.identificador.strip())
    if payload.urlStream is not None:
        campos.append("url_stream = %s")
        valores.append(payload.urlStream.strip())
    if payload.ambienteId is not None:
        ambiente = db.buscar_um(
            "SELECT id FROM ambiente WHERE id = %s AND clinica_id = %s",
            (payload.ambienteId, clinica["id"]),
        )
        if not ambiente:
            raise HTTPException(404, "Ambiente não encontrado nesta clínica.")
        campos.append("ambiente_id = %s")
        valores.append(payload.ambienteId)
    if payload.visaoUrl is not None:
        campos.append("visao_url = %s")
        valores.append(payload.visaoUrl.rstrip("/") or None)
    if not campos:
        raise HTTPException(400, "Nada a alterar.")

    valores.append(camera_id)
    try:
        # `campos` só tem fragmentos fixos deste módulo; os valores vão por parâmetro.
        db.executar(f"UPDATE camera SET {', '.join(campos)} WHERE id = %s", tuple(valores))  # nosec B608
    except UniqueViolation:
        raise HTTPException(409, "Já existe uma câmera com esse identificador neste ambiente.")

    logger.info("Câmera %s editada por %s", camera_id, usuario.nome)
    return montar_camera(consultar_cameras(clinica["id"], camera_id)[0])
