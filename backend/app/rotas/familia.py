"""Portal da família: o app do acompanhante (RN04, RN06, RN07).

Até aqui só existia o lado da clínica (`acompanhantes.py`): criar, listar e
revogar. Este é o outro lado, público, que o familiar abre pelo QR Code:

1. `POST /api/familia/entrar` troca o código do QR por uma sessão curta.
   O QR carrega `<id do acompanhante>.<token>`: com o id a busca é uma linha
   só, e o token confere contra o hash bcrypt (o token em claro nunca foi
   guardado). Código errado e código vencido recebem a mesma resposta.
2. Sem aceite do termo de confidencialidade não há vídeo (RN04). O aceite
   grava versão, data e IP em `termo_confidencialidade`.
3. O vídeo é UMA câmera, a do ambiente do paciente vinculado (RN06), e passa
   pela API: o serviço de visão fica na rede da clínica, sem autenticação, e
   o familiar nunca recebe o endereço dele. A cada 30 s o stream confere se o
   acesso continua valendo, então revogar ou dar alta corta o vídeo (RN07).

A sessão da família é um JWT com `tipo: familia`, assinado com a mesma
chave, mas que nenhuma rota da equipe aceita (`usuario_atual` procura o
`sub` na tabela de usuários e não acha) e vice-versa (`familiar_atual` exige
o tipo).
"""

import json
import os
import re
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from .. import db
from ..comum import iso, logger
from ..schemas import FamiliaEntrada, FamiliaIngresso, FamiliaPainel, FamiliaSessao, FamiliaTermo, FamiliaTermoAceite, Ok
from ..seguranca import ALGORITMO, SECRET_KEY

router = APIRouter()
esquema = HTTPBearer(auto_error=False)

TERMO_VERSAO = "2026-10-25"
TERMO_TEXTO = (
    "Ao continuar, você declara que:\n"
    "1. É a pessoa cadastrada pela clínica como acompanhante deste paciente, e não vai repassar este acesso.\n"
    "2. Não vai gravar, fotografar nem compartilhar as imagens, que mostram o paciente e podem mostrar profissionais.\n"
    "3. Entende que o acesso é temporário, vale só para a câmera do quarto do paciente e pode ser encerrado pela clínica a qualquer momento.\n"
    "4. Sabe que este acesso fica registrado (data, hora e endereço de rede), conforme a LGPD."
)

HORAS_MAX_DE_SESSAO = 12
SEGUNDOS_DO_INGRESSO = 30
SEGUNDOS_ENTRE_CONFERENCIAS = 30
JANELA_DE_PING = timedelta(seconds=90)

# Serviço de visão padrão, visto de dentro do container da API. No navegador
# ele é localhost:8001; daqui, o host é outro (ver docker-compose.yml).
VISAO_URL_PADRAO = os.environ.get("VISAO_URL_PADRAO", "").rstrip("/")
# Endereço cadastrado na câmera como "localhost" vale para o navegador de
# quem cadastrou; para a API em container, localhost é o próprio container.
VISAO_HOST_LOCAL = os.environ.get("VISAO_HOST_LOCAL", "")

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

SELECT_FAMILIAR = """
    SELECT a.id, a.nome, a.ativo, a.expira_em, a.revogado_em,
           p.id AS paciente_id, p.nome AS paciente_nome, p.status AS paciente_status,
           c.id AS clinica_id, c.nome AS clinica_nome, c.ativa AS clinica_ativa,
           amb.id AS ambiente_id, amb.nome AS ambiente_nome,
           (SELECT max(t.versao) FROM termo_confidencialidade t WHERE t.acompanhante_id = a.id) AS termo_versao
      FROM acompanhante a
      JOIN paciente p ON p.id = a.paciente_id
      JOIN clinica c ON c.id = p.clinica_id
      LEFT JOIN ambiente amb ON amb.id = p.ambiente_id
"""


def ainda_vale(l: dict | None) -> bool:
    return bool(
        l and l["ativo"] and l["clinica_ativa"] and l["paciente_status"] == "internado"
        and l["expira_em"] > datetime.now(timezone.utc)
    )


def ip_de(request: Request) -> str:
    encaminhado = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return encaminhado or (request.client.host if request.client else None) or "0.0.0.0"


def registrar(clinica_id, acompanhante_id, acao: str, resultado: str, request: Request) -> None:
    db.executar(
        """
        INSERT INTO log_acesso (clinica_id, acompanhante_id, acao, resultado, ip, user_agent)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (clinica_id, acompanhante_id, acao, resultado, ip_de(request), request.headers.get("user-agent", "")[:300]),
    )


def emitir(acompanhante_id: str, tipo: str, expira: datetime) -> str:
    return jwt.encode({"sub": acompanhante_id, "tipo": tipo, "exp": expira}, SECRET_KEY, algorithm=ALGORITMO)


def ler(token: str, tipo: str) -> str:
    try:
        carga = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITMO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "O acesso expirou. Leia o QR Code de novo.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Acesso inválido. Leia o QR Code de novo.")
    if carga.get("tipo") != tipo:
        raise HTTPException(401, "Acesso inválido. Leia o QR Code de novo.")
    return str(carga.get("sub"))


def familiar_por_id(acompanhante_id: str) -> dict:
    linha = db.buscar_um(SELECT_FAMILIAR + " WHERE a.id = %s", (acompanhante_id,))
    if not ainda_vale(linha):
        raise HTTPException(401, "Este acesso foi encerrado pela clínica ou expirou.")
    return linha


def familiar_atual(credencial: HTTPAuthorizationCredentials | None = Depends(esquema)) -> dict:
    if credencial is None:
        raise HTTPException(401, "Leia o QR Code para entrar.")
    return familiar_por_id(ler(credencial.credentials, "familia"))


def camera_do_ambiente(ambiente_id) -> dict | None:
    if not ambiente_id:
        return None
    return db.buscar_um(
        "SELECT id, visao_url, ultimo_ping FROM camera WHERE ambiente_id = %s ORDER BY ultimo_ping DESC NULLS LAST LIMIT 1",
        (ambiente_id,),
    )


def para_o_servidor(url: str) -> str:
    partes = urlsplit(url)
    if VISAO_HOST_LOCAL and partes.hostname in ("localhost", "127.0.0.1"):
        netloc = VISAO_HOST_LOCAL + (f":{partes.port}" if partes.port else "")
        return urlunsplit(partes._replace(netloc=netloc))
    return url


def endereco_do_video(camera: dict | None) -> str | None:
    """Mesma regra do painel (frontend/src/app/data/visao.ts): o serviço da
    câmera ou, sem cadastro, o padrão SÓ se for esta câmera que ele observa.
    Mostrar o vídeo de outro quarto seria pior do que não mostrar nada."""
    if not camera:
        return None
    if camera["visao_url"]:
        return para_o_servidor(camera["visao_url"].rstrip("/"))
    if not VISAO_URL_PADRAO:
        return None
    try:
        with urllib.request.urlopen(f"{VISAO_URL_PADRAO}/estado", timeout=2) as r:
            publicacao = (json.load(r) or {}).get("publicacao") or {}
    except Exception:
        return None
    return VISAO_URL_PADRAO if str(publicacao.get("camera_id")) == str(camera["id"]) else None


@router.post("/api/familia/entrar", response_model=FamiliaSessao)
def entrar(dados: FamiliaEntrada, request: Request):
    acompanhante_id, _, token = dados.codigo.strip().partition(".")
    linha = None
    if UUID.match(acompanhante_id) and token:
        linha = db.buscar_um(
            SELECT_FAMILIAR + " WHERE a.id = %s AND a.token_qrcode = crypt(%s, a.token_qrcode)",
            (acompanhante_id, token),
        )
    if not ainda_vale(linha):
        if linha:
            registrar(linha["clinica_id"], linha["id"], "Entrada no app do acompanhante recusada (acesso encerrado)", "bloqueado", request)
        # Mesma mensagem para código errado e acesso vencido: não confirma qual.
        raise HTTPException(401, "Código inválido ou acesso encerrado. Peça um novo QR Code à clínica.")

    expira = min(linha["expira_em"], datetime.now(timezone.utc) + timedelta(hours=HORAS_MAX_DE_SESSAO))
    db.executar("UPDATE acompanhante SET ultimo_acesso_em = now() WHERE id = %s", (linha["id"],))
    registrar(linha["clinica_id"], linha["id"], "Entrada no app do acompanhante", "sucesso", request)
    logger.info("Acompanhante %s entrou no portal da família", linha["id"])
    return FamiliaSessao(token=emitir(str(linha["id"]), "familia", expira), expiraEm=iso(expira) or "")


@router.get("/api/familia/painel", response_model=FamiliaPainel)
def painel(familiar: dict = Depends(familiar_atual)):
    camera = camera_do_ambiente(familiar["ambiente_id"])
    conectada = bool(camera and camera["ultimo_ping"] and camera["ultimo_ping"] > datetime.now(timezone.utc) - JANELA_DE_PING)
    return FamiliaPainel(
        acompanhanteNome=familiar["nome"],
        pacienteNome=familiar["paciente_nome"],
        ambienteNome=familiar["ambiente_nome"],
        clinicaNome=familiar["clinica_nome"],
        expiraEm=iso(familiar["expira_em"]) or "",
        termo=FamiliaTermo(versao=TERMO_VERSAO, texto=TERMO_TEXTO),
        termoAceito=familiar["termo_versao"] == TERMO_VERSAO,
        cameraConectada=conectada,
        videoDisponivel=conectada and endereco_do_video(camera) is not None,
    )


@router.post("/api/familia/termo", response_model=Ok)
def aceitar_termo(dados: FamiliaTermoAceite, request: Request, familiar: dict = Depends(familiar_atual)):
    if dados.versao != TERMO_VERSAO:
        raise HTTPException(409, "O termo foi atualizado. Recarregue a página e leia a versão nova.")
    if familiar["termo_versao"] == TERMO_VERSAO:
        return Ok()
    db.executar(
        "INSERT INTO termo_confidencialidade (acompanhante_id, versao, ip_aceite) VALUES (%s, %s, %s)",
        (familiar["id"], TERMO_VERSAO, ip_de(request)),
    )
    registrar(familiar["clinica_id"], familiar["id"], f"Termo de confidencialidade aceito (versão {TERMO_VERSAO})", "sucesso", request)
    return Ok()


@router.post("/api/familia/video/ingresso", response_model=FamiliaIngresso)
def ingresso_de_video(familiar: dict = Depends(familiar_atual)):
    """A <img> do vídeo não manda cabeçalho de autorização. Em vez de pôr a
    sessão inteira na URL, ela leva este ingresso, que só abre o stream e
    vence em 30 s."""
    if familiar["termo_versao"] != TERMO_VERSAO:
        raise HTTPException(403, "Aceite o termo de confidencialidade para ver a câmera.")
    expira = datetime.now(timezone.utc) + timedelta(seconds=SEGUNDOS_DO_INGRESSO)
    return FamiliaIngresso(ingresso=emitir(str(familiar["id"]), "video", expira))


@router.get("/api/familia/video")
def video(ingresso: str, request: Request):
    familiar = familiar_por_id(ler(ingresso, "video"))
    if familiar["termo_versao"] != TERMO_VERSAO:
        raise HTTPException(403, "Aceite o termo de confidencialidade para ver a câmera.")
    endereco = endereco_do_video(camera_do_ambiente(familiar["ambiente_id"]))
    if not endereco:
        raise HTTPException(404, "A câmera deste quarto está sem vídeo agora.")
    try:
        origem = urllib.request.urlopen(f"{endereco}/stream", timeout=5)
    except Exception:
        raise HTTPException(502, "A câmera deste quarto não respondeu. Tente de novo em instantes.")
    registrar(familiar["clinica_id"], familiar["id"], "Vídeo da câmera aberto no app do acompanhante", "sucesso", request)

    def repassar():
        conferido = time.monotonic()
        try:
            while True:
                pedaco = origem.read(16384)
                if not pedaco:
                    break
                yield pedaco
                if time.monotonic() - conferido > SEGUNDOS_ENTRE_CONFERENCIAS:
                    conferido = time.monotonic()
                    atual = db.buscar_um(SELECT_FAMILIAR + " WHERE a.id = %s", (familiar["id"],))
                    if not ainda_vale(atual):
                        logger.info("Stream do acompanhante %s cortado: acesso encerrado", familiar["id"])
                        break
        finally:
            origem.close()

    return StreamingResponse(
        repassar(),
        media_type=origem.headers.get("Content-Type", "multipart/x-mixed-replace"),
        headers={"Cache-Control": "no-store"},
    )


# -----------------------------------------------------------------------------
# Mensagens, dúvidas, exames e avaliação (26/10/2026). O outro lado de crm.py.
# -----------------------------------------------------------------------------

class TextoFamilia(BaseModel):
    texto: str = Field(min_length=1, max_length=2000)


class AvaliacaoFamilia(BaseModel):
    nota: int = Field(ge=0, le=10)
    comentario: str | None = Field(default=None, max_length=1000)


@router.get("/api/familia/extras")
def extras(familiar: dict = Depends(familiar_atual)):
    """Contadores das abas do portal: mensagens novas, exames a confirmar, avaliação."""
    linha = db.buscar_um(
        """
        SELECT (SELECT count(*) FROM mensagem m WHERE m.paciente_id = %(p)s AND m.autor = 'equipe' AND m.lida_em IS NULL) AS mensagens,
               (SELECT count(*) FROM comunicacao_exame e WHERE e.paciente_id = %(p)s AND e.canal = 'portal' AND e.ciencia_em IS NULL) AS exames,
               (SELECT max(created_at) FROM resposta_satisfacao s WHERE s.acompanhante_id = %(a)s) AS avaliou_em
        """,
        {"p": familiar["paciente_id"], "a": familiar["id"]},
    )
    return {"mensagensNovas": linha["mensagens"], "examesPendentes": linha["exames"], "avaliouEm": iso(linha["avaliou_em"])}


@router.get("/api/familia/mensagens")
def mensagens_da_familia(familiar: dict = Depends(familiar_atual)):
    db.executar("UPDATE mensagem SET lida_em = now() WHERE paciente_id = %s AND autor = 'equipe' AND lida_em IS NULL", (familiar["paciente_id"],))
    linhas = db.buscar_todos(
        """SELECT m.id, m.autor, m.texto, m.created_at, COALESCE(u.nome, a.nome) AS autor_nome
             FROM mensagem m LEFT JOIN usuario u ON u.id = m.usuario_id LEFT JOIN acompanhante a ON a.id = m.acompanhante_id
            WHERE m.paciente_id = %s ORDER BY m.created_at DESC LIMIT 100""",
        (familiar["paciente_id"],),
    )
    return [{
        "id": str(l["id"]), "autor": l["autor"], "texto": l["texto"], "criadoEm": iso(l["created_at"]),
        # A família vê o primeiro nome do profissional, não o cadastro inteiro.
        "autorNome": (l["autor_nome"] or "").split(" ")[0] if l["autor"] == "equipe" else l["autor_nome"],
    } for l in reversed(linhas)]


@router.post("/api/familia/mensagens", status_code=201)
def escrever_para_a_clinica(dados: TextoFamilia, request: Request, familiar: dict = Depends(familiar_atual)):
    recentes = db.buscar_um(
        "SELECT count(*) AS n FROM mensagem WHERE acompanhante_id = %s AND created_at > now() - interval '1 hour'", (familiar["id"],)
    )["n"]
    if recentes >= 20:
        raise HTTPException(429, "Muitas mensagens em pouco tempo. Para urgência, ligue para a clínica.")
    db.executar(
        "INSERT INTO mensagem (clinica_id, paciente_id, autor, acompanhante_id, texto) VALUES (%s, %s, 'familia', %s, %s)",
        (familiar["clinica_id"], familiar["paciente_id"], familiar["id"], dados.texto.strip()),
    )
    return Ok()


@router.post("/api/familia/duvida")
def tirar_duvida(dados: TextoFamilia, familiar: dict = Depends(familiar_atual)):
    from .crm import melhor_resposta

    resposta = melhor_resposta(familiar["clinica_id"], dados.texto)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO chatbot_pergunta (clinica_id, acompanhante_id, texto, resposta_id) VALUES (%s, %s, %s, %s)",
            (familiar["clinica_id"], familiar["id"], dados.texto.strip()[:500], resposta["id"] if resposta else None),
        )
        if resposta:
            cur.execute("UPDATE chatbot_resposta SET usos = usos + 1 WHERE id = %s", (resposta["id"],))
    return {"resposta": resposta["resposta"] if resposta else None, "pergunta": resposta["pergunta"] if resposta else None}


@router.get("/api/familia/sugestoes")
def sugestoes(familiar: dict = Depends(familiar_atual)):
    """As perguntas prontas mais usadas, para a família tocar em vez de digitar."""
    linhas = db.buscar_todos(
        "SELECT pergunta FROM chatbot_resposta WHERE clinica_id = %s AND ativa ORDER BY usos DESC, pergunta LIMIT 6", (familiar["clinica_id"],)
    )
    return [l["pergunta"] for l in linhas]


@router.get("/api/familia/exames")
def exames_da_familia(familiar: dict = Depends(familiar_atual)):
    linhas = db.buscar_todos(
        """SELECT id, exame, data_exame, resultado, comunicado_em, ciencia_em FROM comunicacao_exame
            WHERE paciente_id = %s AND canal = 'portal' ORDER BY comunicado_em DESC""",
        (familiar["paciente_id"],),
    )
    return [{
        "id": str(l["id"]), "exame": l["exame"], "dataExame": l["data_exame"].isoformat(), "resultado": l["resultado"],
        "comunicadoEm": iso(l["comunicado_em"]), "cienciaEm": iso(l["ciencia_em"]),
    } for l in linhas]


@router.post("/api/familia/exames/{exame_id}/ciencia")
def confirmar_exame(exame_id: str, request: Request, familiar: dict = Depends(familiar_atual)):
    alterados = db.executar(
        "UPDATE comunicacao_exame SET ciencia_em = now() WHERE id = %s AND paciente_id = %s AND canal = 'portal' AND ciencia_em IS NULL",
        (exame_id, familiar["paciente_id"]),
    )
    if alterados:
        registrar(familiar["clinica_id"], familiar["id"], "Ciência de resultado de exame no app do acompanhante", "sucesso", request)
    return Ok()


@router.post("/api/familia/avaliacao", status_code=201)
def avaliar_clinica(dados: AvaliacaoFamilia, familiar: dict = Depends(familiar_atual)):
    """Uma avaliação por acompanhante a cada 7 dias: a pesquisa mede a
    experiência, não quantas vezes alguém apertou o botão."""
    recente = db.buscar_um(
        "SELECT 1 FROM resposta_satisfacao WHERE acompanhante_id = %s AND created_at > now() - interval '7 days'", (familiar["id"],)
    )
    if recente:
        raise HTTPException(409, "Você já avaliou nesta semana. Obrigado!")
    db.executar(
        """INSERT INTO resposta_satisfacao (clinica_id, paciente_id, acompanhante_id, nota, comentario, canal)
           VALUES (%s, %s, %s, %s, %s, 'portal')""",
        (familiar["clinica_id"], familiar["paciente_id"], familiar["id"], dados.nota, (dados.comentario or "").strip() or None),
    )
    return Ok()
