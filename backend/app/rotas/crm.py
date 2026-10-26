"""Relacionamento com paciente e família (CRM Saúde).

Entrou em 26/10/2026 com as oito telas do grupo: agenda do paciente,
lembretes, mensagens com a família, respostas prontas (o "chatbot" do portal),
comunicação de exames, satisfação (NPS), campanhas e o histórico que junta
tudo por paciente.

A família participa pelo portal (`familia.py`): manda e lê mensagens, tira
dúvida nas respostas prontas, confirma a ciência de exame e responde a
pesquisa. Daqui é o lado da equipe.

Permissão: `crm`. `view` lista; `create` registra (agendar, lembrar, escrever,
comunicar exame); `edit` muda o que existe (status do agendamento, resposta
pronta, campanha).
"""

import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..comum import clinica_por_slug, iso
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant
from .acompanhantes import paciente_da_clinica

router = APIRouter()


def clinica_de(tenant: str, usuario: UsuarioAutenticado) -> dict:
    exigir_tenant(usuario, tenant)
    return clinica_por_slug(tenant)


def vazio(v: str | None) -> str | None:
    return (v or "").strip() or None


def instante(valor: str, campo: str) -> datetime:
    try:
        d = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, f"{campo}: data e hora inválidas.")
    if d.tzinfo is None:
        raise HTTPException(422, f"{campo}: informe o fuso (ISO 8601 com deslocamento).")
    return d


# -----------------------------------------------------------------------------
# Agenda do paciente
# -----------------------------------------------------------------------------

TipoAgenda = Literal["consulta", "exame", "terapia", "procedimento", "visita", "outro"]
StatusAgenda = Literal["agendado", "realizado", "cancelado", "faltou"]


class AgendamentoPayload(BaseModel):
    tenantId: str
    pacienteId: str
    tipo: TipoAgenda
    titulo: str = Field(min_length=3, max_length=160)
    inicio: str
    fim: str | None = None
    local: str | None = Field(default=None, max_length=120)
    profissional: str | None = Field(default=None, max_length=120)
    observacao: str | None = Field(default=None, max_length=1000)


class AgendamentoEdicao(BaseModel):
    tenantId: str
    status: StatusAgenda | None = None
    titulo: str | None = Field(default=None, min_length=3, max_length=160)
    inicio: str | None = None
    fim: str | None = None
    local: str | None = Field(default=None, max_length=120)
    profissional: str | None = Field(default=None, max_length=120)
    observacao: str | None = Field(default=None, max_length=1000)


SELECT_AGENDA = """
    SELECT a.*, p.nome AS paciente_nome, amb.nome AS ambiente_nome, u.nome AS criado_por_nome
      FROM agendamento a JOIN paciente p ON p.id = a.paciente_id
      LEFT JOIN ambiente amb ON amb.id = p.ambiente_id
      LEFT JOIN usuario u ON u.id = a.criado_por
"""


def montar_agendamento(l: dict) -> dict:
    return {
        "id": str(l["id"]), "pacienteId": str(l["paciente_id"]), "pacienteNome": l["paciente_nome"],
        "ambienteNome": l["ambiente_nome"], "tipo": l["tipo"], "titulo": l["titulo"],
        "inicio": iso(l["inicio"]), "fim": iso(l["fim"]), "local": l["local"], "profissional": l["profissional"],
        "status": l["status"], "observacao": l["observacao"], "criadoPorNome": l["criado_por_nome"],
    }


@router.get("/api/agenda")
def listar_agenda(
    tenantId: str, inicio: str, fim: str, pacienteId: str | None = None,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view")),
):
    clinica = clinica_de(tenantId, usuario)
    ini, f = instante(inicio, "inicio"), instante(fim, "fim")
    if f - ini > timedelta(days=93):
        raise HTTPException(422, "Consulte no máximo três meses por vez.")
    filtro, params = "", [clinica["id"], ini, f]
    if pacienteId:
        filtro, params = " AND a.paciente_id = %s", params + [pacienteId]
    linhas = db.buscar_todos(SELECT_AGENDA + " WHERE a.clinica_id = %s AND a.inicio >= %s AND a.inicio < %s" + filtro + " ORDER BY a.inicio", tuple(params))
    return [montar_agendamento(l) for l in linhas]


@router.post("/api/agenda", status_code=201)
def agendar(payload: AgendamentoPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "create"))):
    clinica = clinica_de(payload.tenantId, usuario)
    paciente_da_clinica(payload.pacienteId, clinica["id"])
    ini = instante(payload.inicio, "inicio")
    fim = instante(payload.fim, "fim") if payload.fim else None
    if fim and fim <= ini:
        raise HTTPException(422, "O fim tem de ser depois do início.")
    novo = db.buscar_um(
        """INSERT INTO agendamento (clinica_id, paciente_id, tipo, titulo, inicio, fim, local, profissional, observacao, criado_por)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (clinica["id"], payload.pacienteId, payload.tipo, payload.titulo.strip(), ini, fim,
         vazio(payload.local), vazio(payload.profissional), vazio(payload.observacao), usuario.id),
    )
    return montar_agendamento(db.buscar_um(SELECT_AGENDA + " WHERE a.id = %s", (novo["id"],)))


@router.patch("/api/agenda/{agendamento_id}")
def editar_agendamento(agendamento_id: str, payload: AgendamentoEdicao, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "edit"))):
    clinica = clinica_de(payload.tenantId, usuario)
    atual = db.buscar_um("SELECT * FROM agendamento WHERE id = %s AND clinica_id = %s", (agendamento_id, clinica["id"]))
    if not atual:
        raise HTTPException(404, "Agendamento não encontrado.")
    campos, valores = [], []
    for campo, coluna in (("status", "status"), ("titulo", "titulo")):
        valor = getattr(payload, campo)
        if valor is not None:
            campos.append(f"{coluna} = %s")
            valores.append(valor.strip() if campo == "titulo" else valor)
    for campo in ("local", "profissional", "observacao"):
        valor = getattr(payload, campo)
        if valor is not None:
            campos.append(f"{campo} = %s")
            valores.append(vazio(valor))
    ini = instante(payload.inicio, "inicio") if payload.inicio else atual["inicio"]
    fim = (instante(payload.fim, "fim") if payload.fim else None) if payload.fim is not None else atual["fim"]
    if fim and fim <= ini:
        raise HTTPException(422, "O fim tem de ser depois do início.")
    if payload.inicio:
        campos.append("inicio = %s"); valores.append(ini)
    if payload.fim is not None:
        campos.append("fim = %s"); valores.append(fim)
    if not campos:
        raise HTTPException(400, "Nada a alterar.")
    # `campos` só tem fragmentos fixos deste módulo; os valores vão por parâmetro.
    db.executar(f"UPDATE agendamento SET {', '.join(campos)} WHERE id = %s", (*valores, agendamento_id))  # nosec B608
    return montar_agendamento(db.buscar_um(SELECT_AGENDA + " WHERE a.id = %s", (agendamento_id,)))


# -----------------------------------------------------------------------------
# Lembretes
# -----------------------------------------------------------------------------

class LembretePayload(BaseModel):
    tenantId: str
    titulo: str = Field(min_length=3, max_length=160)
    descricao: str | None = Field(default=None, max_length=1000)
    pacienteId: str | None = None
    proximaEm: str
    recorrencia: Literal["nenhuma", "diaria", "semanal", "mensal"] = "nenhuma"


class Conclusao(BaseModel):
    tenantId: str
    observacao: str | None = Field(default=None, max_length=500)


SELECT_LEMBRETE = """
    SELECT l.*, p.nome AS paciente_nome, u.nome AS criado_por_nome,
           uc.nome AS ultima_conclusao_por, lc.concluido_em AS ultima_conclusao_em
      FROM lembrete l LEFT JOIN paciente p ON p.id = l.paciente_id
      LEFT JOIN usuario u ON u.id = l.criado_por
      LEFT JOIN LATERAL (SELECT usuario_id, concluido_em FROM lembrete_conclusao c
                          WHERE c.lembrete_id = l.id ORDER BY concluido_em DESC LIMIT 1) lc ON true
      LEFT JOIN usuario uc ON uc.id = lc.usuario_id
"""


def montar_lembrete(l: dict) -> dict:
    return {
        "id": str(l["id"]), "titulo": l["titulo"], "descricao": l["descricao"],
        "pacienteId": str(l["paciente_id"]) if l["paciente_id"] else None, "pacienteNome": l["paciente_nome"],
        "proximaEm": iso(l["proxima_em"]), "recorrencia": l["recorrencia"], "ativo": l["ativo"],
        "criadoPorNome": l["criado_por_nome"], "ultimaConclusaoEm": iso(l["ultima_conclusao_em"]),
        "ultimaConclusaoPor": l["ultima_conclusao_por"],
    }


@router.get("/api/lembretes")
def listar_lembretes(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    clinica = clinica_de(tenantId, usuario)
    linhas = db.buscar_todos(
        SELECT_LEMBRETE + """ WHERE l.clinica_id = %s AND (l.ativo OR l.updated_at > now() - interval '30 days')
                              ORDER BY l.ativo DESC, l.proxima_em""",
        (clinica["id"],),
    )
    return [montar_lembrete(l) for l in linhas]


@router.post("/api/lembretes", status_code=201)
def criar_lembrete(payload: LembretePayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "create"))):
    clinica = clinica_de(payload.tenantId, usuario)
    if payload.pacienteId:
        paciente_da_clinica(payload.pacienteId, clinica["id"])
    novo = db.buscar_um(
        """INSERT INTO lembrete (clinica_id, paciente_id, titulo, descricao, proxima_em, recorrencia, criado_por)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (clinica["id"], payload.pacienteId or None, payload.titulo.strip(), vazio(payload.descricao),
         instante(payload.proximaEm, "proximaEm"), payload.recorrencia, usuario.id),
    )
    return montar_lembrete(db.buscar_um(SELECT_LEMBRETE + " WHERE l.id = %s", (novo["id"],)))


@router.post("/api/lembretes/{lembrete_id}/concluir")
def concluir_lembrete(lembrete_id: str, payload: Conclusao, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "create"))):
    """Concluir registra quem e quando; o recorrente pula para a próxima data
    futura (se ficou três dias atrasado, não gera três pendências)."""
    clinica = clinica_de(payload.tenantId, usuario)
    with db.cursor() as cur:
        cur.execute("SELECT * FROM lembrete WHERE id = %s AND clinica_id = %s AND ativo FOR UPDATE", (lembrete_id, clinica["id"]))
        l = cur.fetchone()
        if not l:
            raise HTTPException(404, "Lembrete não encontrado ou já concluído.")
        cur.execute(
            "INSERT INTO lembrete_conclusao (lembrete_id, usuario_id, previsto_para, observacao) VALUES (%s, %s, %s, %s)",
            (lembrete_id, usuario.id, l["proxima_em"], vazio(payload.observacao)),
        )
        if l["recorrencia"] == "nenhuma":
            cur.execute("UPDATE lembrete SET ativo = false WHERE id = %s", (lembrete_id,))
        else:
            passo = {"diaria": "1 day", "semanal": "7 days", "mensal": "1 month"}[l["recorrencia"]]
            cur.execute(
                f"""UPDATE lembrete SET proxima_em = (
                      SELECT min(t) FROM generate_series(proxima_em + interval '{passo}', now() + interval '{passo}' + interval '1 month', interval '{passo}') t
                       WHERE t > now())
                    WHERE id = %s""",  # nosec B608 — `passo` vem do dicionário acima
                (lembrete_id,),
            )
    return montar_lembrete(db.buscar_um(SELECT_LEMBRETE + " WHERE l.id = %s", (lembrete_id,)))


@router.post("/api/lembretes/{lembrete_id}/desativar")
def desativar_lembrete(lembrete_id: str, tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "edit"))):
    clinica = clinica_de(tenantId, usuario)
    if not db.executar("UPDATE lembrete SET ativo = false WHERE id = %s AND clinica_id = %s", (lembrete_id, clinica["id"])):
        raise HTTPException(404, "Lembrete não encontrado.")
    return {"ok": True}


# -----------------------------------------------------------------------------
# Mensagens com a família
# -----------------------------------------------------------------------------

class MensagemPayload(BaseModel):
    tenantId: str
    pacienteId: str
    texto: str = Field(min_length=1, max_length=2000)


def montar_mensagem(l: dict) -> dict:
    return {
        "id": str(l["id"]), "autor": l["autor"], "autorNome": l.get("autor_nome"), "texto": l["texto"],
        "lidaEm": iso(l["lida_em"]), "criadoEm": iso(l["created_at"]),
    }


SELECT_MENSAGEM = """
    SELECT m.*, COALESCE(u.nome, a.nome) AS autor_nome FROM mensagem m
      LEFT JOIN usuario u ON u.id = m.usuario_id LEFT JOIN acompanhante a ON a.id = m.acompanhante_id
"""


@router.get("/api/mensagens/conversas")
def conversas(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    """Uma conversa por paciente internado com acompanhante (ou com mensagens)."""
    clinica = clinica_de(tenantId, usuario)
    linhas = db.buscar_todos(
        """
        SELECT p.id, p.nome, amb.nome AS ambiente_nome,
               (SELECT count(*) FROM acompanhante a WHERE a.paciente_id = p.id AND a.ativo AND a.expira_em > now()) AS acompanhantes,
               (SELECT count(*) FROM mensagem m WHERE m.paciente_id = p.id AND m.autor = 'familia' AND m.lida_em IS NULL) AS nao_lidas,
               ult.texto AS ultima_texto, ult.autor AS ultima_autor, ult.created_at AS ultima_em
          FROM paciente p LEFT JOIN ambiente amb ON amb.id = p.ambiente_id
          LEFT JOIN LATERAL (SELECT texto, autor, created_at FROM mensagem m WHERE m.paciente_id = p.id
                              ORDER BY created_at DESC LIMIT 1) ult ON true
         WHERE p.clinica_id = %s
           AND (ult.created_at IS NOT NULL OR (p.status = 'internado' AND EXISTS (
                SELECT 1 FROM acompanhante a WHERE a.paciente_id = p.id AND a.ativo AND a.expira_em > now())))
         ORDER BY (SELECT count(*) FROM mensagem m WHERE m.paciente_id = p.id AND m.autor = 'familia' AND m.lida_em IS NULL) > 0 DESC,
                  ult.created_at DESC NULLS LAST, p.nome
        """,
        (clinica["id"],),
    )
    return [{
        "pacienteId": str(l["id"]), "pacienteNome": l["nome"], "ambienteNome": l["ambiente_nome"],
        "acompanhantesAtivos": l["acompanhantes"], "naoLidas": l["nao_lidas"],
        "ultimaTexto": l["ultima_texto"], "ultimaAutor": l["ultima_autor"], "ultimaEm": iso(l["ultima_em"]),
    } for l in linhas]


@router.get("/api/pacientes/{paciente_id}/mensagens")
def mensagens_do_paciente(paciente_id: str, tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    """Abrir a conversa marca como lidas as mensagens da família."""
    clinica = clinica_de(tenantId, usuario)
    paciente_da_clinica(paciente_id, clinica["id"])
    db.executar("UPDATE mensagem SET lida_em = now() WHERE paciente_id = %s AND autor = 'familia' AND lida_em IS NULL", (paciente_id,))
    linhas = db.buscar_todos(SELECT_MENSAGEM + " WHERE m.paciente_id = %s ORDER BY m.created_at DESC LIMIT 200", (paciente_id,))
    return [montar_mensagem(l) for l in reversed(linhas)]


@router.post("/api/mensagens", status_code=201)
def enviar_mensagem(payload: MensagemPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "create"))):
    clinica = clinica_de(payload.tenantId, usuario)
    paciente_da_clinica(payload.pacienteId, clinica["id"])
    novo = db.buscar_um(
        "INSERT INTO mensagem (clinica_id, paciente_id, autor, usuario_id, texto) VALUES (%s, %s, 'equipe', %s, %s) RETURNING id",
        (clinica["id"], payload.pacienteId, usuario.id, payload.texto.strip()),
    )
    return montar_mensagem(db.buscar_um(SELECT_MENSAGEM + " WHERE m.id = %s", (novo["id"],)))


# -----------------------------------------------------------------------------
# Respostas prontas (chatbot do portal)
# -----------------------------------------------------------------------------

class RespostaPayload(BaseModel):
    tenantId: str
    pergunta: str = Field(min_length=3, max_length=200)
    palavrasChave: list[str] = Field(min_length=1, max_length=20)
    resposta: str = Field(min_length=3, max_length=2000)
    ativa: bool = True


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sem_acento.lower()).strip()


def melhor_resposta(clinica_id, pergunta: str) -> dict | None:
    """A resposta ativa com mais palavras-chave presentes na pergunta. Empate
    fica com a mais usada. Nenhuma palavra presente = sem resposta."""
    texto = f" {normalizar(pergunta)} "
    melhor, pontos_melhor = None, 0
    for r in db.buscar_todos("SELECT * FROM chatbot_resposta WHERE clinica_id = %s AND ativa ORDER BY usos DESC", (clinica_id,)):
        pontos = sum(1 for p in r["palavras_chave"] if normalizar(p) and normalizar(p) in texto)
        if pontos > pontos_melhor:
            melhor, pontos_melhor = r, pontos
    return melhor


def montar_resposta(l: dict) -> dict:
    return {
        "id": str(l["id"]), "pergunta": l["pergunta"], "palavrasChave": l["palavras_chave"], "resposta": l["resposta"],
        "ativa": l["ativa"], "usos": l["usos"], "atualizadoEm": iso(l["updated_at"]),
    }


@router.get("/api/chatbot/respostas")
def listar_respostas(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    clinica = clinica_de(tenantId, usuario)
    return [montar_resposta(l) for l in db.buscar_todos(
        "SELECT * FROM chatbot_resposta WHERE clinica_id = %s ORDER BY ativa DESC, usos DESC, pergunta", (clinica["id"],))]


def limpar_palavras(palavras: list[str]) -> list[str]:
    saida = sorted({p.strip().lower() for p in palavras if p.strip()})
    if not saida:
        raise HTTPException(422, "Informe pelo menos uma palavra-chave.")
    return saida


@router.post("/api/chatbot/respostas", status_code=201)
def criar_resposta(payload: RespostaPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "edit"))):
    clinica = clinica_de(payload.tenantId, usuario)
    linha = db.buscar_um(
        "INSERT INTO chatbot_resposta (clinica_id, pergunta, palavras_chave, resposta, ativa) VALUES (%s, %s, %s, %s, %s) RETURNING *",
        (clinica["id"], payload.pergunta.strip(), limpar_palavras(payload.palavrasChave), payload.resposta.strip(), payload.ativa),
    )
    return montar_resposta(linha)


@router.patch("/api/chatbot/respostas/{resposta_id}")
def editar_resposta(resposta_id: str, payload: RespostaPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "edit"))):
    clinica = clinica_de(payload.tenantId, usuario)
    linha = db.buscar_um(
        """UPDATE chatbot_resposta SET pergunta = %s, palavras_chave = %s, resposta = %s, ativa = %s
            WHERE id = %s AND clinica_id = %s RETURNING *""",
        (payload.pergunta.strip(), limpar_palavras(payload.palavrasChave), payload.resposta.strip(), payload.ativa, resposta_id, clinica["id"]),
    )
    if not linha:
        raise HTTPException(404, "Resposta não encontrada.")
    return montar_resposta(linha)


@router.get("/api/chatbot/perguntas")
def perguntas_recebidas(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    """Últimas perguntas das famílias, com a resposta que o portal deu (ou nenhuma)."""
    clinica = clinica_de(tenantId, usuario)
    linhas = db.buscar_todos(
        """SELECT q.id, q.texto, q.created_at, r.pergunta AS respondida_com FROM chatbot_pergunta q
             LEFT JOIN chatbot_resposta r ON r.id = q.resposta_id
            WHERE q.clinica_id = %s ORDER BY q.created_at DESC LIMIT 100""",
        (clinica["id"],),
    )
    return [{"id": str(l["id"]), "texto": l["texto"], "criadoEm": iso(l["created_at"]), "respondidaCom": l["respondida_com"]} for l in linhas]


class TestePergunta(BaseModel):
    tenantId: str
    texto: str = Field(min_length=2, max_length=300)


@router.post("/api/chatbot/testar")
def testar(payload: TestePergunta, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    """O que a família receberia para esta pergunta, sem registrar nada."""
    clinica = clinica_de(payload.tenantId, usuario)
    r = melhor_resposta(clinica["id"], payload.texto)
    return {"resposta": r["resposta"] if r else None, "pergunta": r["pergunta"] if r else None}


# -----------------------------------------------------------------------------
# Comunicação de exames
# -----------------------------------------------------------------------------

class ExamePayload(BaseModel):
    tenantId: str
    pacienteId: str
    exame: str = Field(min_length=2, max_length=160)
    dataExame: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    resultado: str = Field(min_length=3, max_length=2000)
    destinatario: str = Field(min_length=2, max_length=120)
    canal: Literal["presencial", "telefone", "portal", "email", "outro"]
    observacao: str | None = Field(default=None, max_length=500)


SELECT_EXAME = """
    SELECT e.*, p.nome AS paciente_nome, u.nome AS autor_nome FROM comunicacao_exame e
      JOIN paciente p ON p.id = e.paciente_id JOIN usuario u ON u.id = e.usuario_id
"""


def montar_exame(l: dict) -> dict:
    return {
        "id": str(l["id"]), "pacienteId": str(l["paciente_id"]), "pacienteNome": l["paciente_nome"],
        "exame": l["exame"], "dataExame": l["data_exame"].isoformat(), "resultado": l["resultado"],
        "destinatario": l["destinatario"], "canal": l["canal"], "comunicadoEm": iso(l["comunicado_em"]),
        "cienciaEm": iso(l["ciencia_em"]), "observacao": l["observacao"], "autorNome": l["autor_nome"],
    }


@router.get("/api/exames")
def listar_exames(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    clinica = clinica_de(tenantId, usuario)
    return [montar_exame(l) for l in db.buscar_todos(SELECT_EXAME + " WHERE e.clinica_id = %s ORDER BY e.comunicado_em DESC LIMIT 300", (clinica["id"],))]


@router.post("/api/exames", status_code=201)
def comunicar_exame(payload: ExamePayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "create"))):
    clinica = clinica_de(payload.tenantId, usuario)
    paciente_da_clinica(payload.pacienteId, clinica["id"])
    # Canal fora do portal: a comunicação é a própria ciência (foi dita a alguém).
    novo = db.buscar_um(
        """INSERT INTO comunicacao_exame (clinica_id, paciente_id, exame, data_exame, resultado, destinatario, canal,
                                          usuario_id, observacao, ciencia_em)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CASE WHEN %s = 'portal' THEN NULL ELSE now() END) RETURNING id""",
        (clinica["id"], payload.pacienteId, payload.exame.strip(), payload.dataExame, payload.resultado.strip(),
         payload.destinatario.strip(), payload.canal, usuario.id, vazio(payload.observacao), payload.canal),
    )
    return montar_exame(db.buscar_um(SELECT_EXAME + " WHERE e.id = %s", (novo["id"],)))


# -----------------------------------------------------------------------------
# Satisfação (NPS)
# -----------------------------------------------------------------------------

class SatisfacaoPayload(BaseModel):
    tenantId: str
    nota: int = Field(ge=0, le=10)
    comentario: str | None = Field(default=None, max_length=1000)
    canal: Literal["telefone", "presencial", "formulario"]
    pacienteId: str | None = None


def resumo_nps(linhas: list[dict]) -> dict:
    n = len(linhas)
    p = sum(1 for l in linhas if l["nota"] >= 9)
    d = sum(1 for l in linhas if l["nota"] <= 6)
    return {"total": n, "promotores": p, "neutros": n - p - d, "detratores": d, "nps": round(100 * (p - d) / n) if n else None}


@router.get("/api/satisfacao")
def satisfacao(tenantId: str, dias: int = 90, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    clinica = clinica_de(tenantId, usuario)
    dias = max(7, min(dias, 730))
    linhas = db.buscar_todos(
        """SELECT s.*, p.nome AS paciente_nome, a.nome AS acompanhante_nome, u.nome AS registrado_por_nome
             FROM resposta_satisfacao s LEFT JOIN paciente p ON p.id = s.paciente_id
             LEFT JOIN acompanhante a ON a.id = s.acompanhante_id LEFT JOIN usuario u ON u.id = s.registrado_por
            WHERE s.clinica_id = %s AND s.created_at > now() - make_interval(days => %s)
            ORDER BY s.created_at DESC""",
        (clinica["id"], dias),
    )
    por_mes: dict[str, list] = {}
    for l in linhas:
        por_mes.setdefault(l["created_at"].strftime("%Y-%m"), []).append(l)
    distribuicao = [0] * 11
    for l in linhas:
        distribuicao[l["nota"]] += 1
    return {
        **resumo_nps(linhas),
        "distribuicao": distribuicao,
        "porMes": [{"mes": m, **resumo_nps(v)} for m, v in sorted(por_mes.items())],
        "respostas": [{
            "id": str(l["id"]), "nota": l["nota"], "comentario": l["comentario"], "canal": l["canal"],
            "pacienteNome": l["paciente_nome"], "acompanhanteNome": l["acompanhante_nome"],
            "registradoPorNome": l["registrado_por_nome"], "criadoEm": iso(l["created_at"]),
        } for l in linhas[:200]],
    }


@router.post("/api/satisfacao", status_code=201)
def registrar_satisfacao(payload: SatisfacaoPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "create"))):
    clinica = clinica_de(payload.tenantId, usuario)
    if payload.pacienteId:
        paciente_da_clinica(payload.pacienteId, clinica["id"])
    db.executar(
        "INSERT INTO resposta_satisfacao (clinica_id, paciente_id, nota, comentario, canal, registrado_por) VALUES (%s, %s, %s, %s, %s, %s)",
        (clinica["id"], payload.pacienteId or None, payload.nota, vazio(payload.comentario), payload.canal, usuario.id),
    )
    return {"ok": True}


# -----------------------------------------------------------------------------
# Campanhas de saúde
# -----------------------------------------------------------------------------

class CampanhaPayload(BaseModel):
    tenantId: str
    titulo: str = Field(min_length=3, max_length=160)
    descricao: str | None = Field(default=None, max_length=2000)
    tipo: Literal["vacinacao", "prevencao", "educacao", "rastreamento", "outro"]
    inicio: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    fim: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    metaParticipantes: int | None = Field(default=None, gt=0, le=100000)


class Participantes(BaseModel):
    tenantId: str
    pacienteIds: list[str] = Field(min_length=1, max_length=500)
    observacao: str | None = Field(default=None, max_length=300)


def montar_campanha(l: dict, participantes: list[dict]) -> dict:
    return {
        "id": str(l["id"]), "titulo": l["titulo"], "descricao": l["descricao"], "tipo": l["tipo"],
        "inicio": l["inicio"].isoformat(), "fim": l["fim"].isoformat(), "metaParticipantes": l["meta_participantes"],
        "encerradaEm": iso(l["encerrada_em"]), "criadoPorNome": l.get("criado_por_nome"),
        "participantes": participantes,
    }


def campanhas_da_clinica(clinica_id, campanha_id: str | None = None) -> list[dict]:
    filtro = " AND c.id = %s" if campanha_id else ""
    params = (clinica_id, campanha_id) if campanha_id else (clinica_id,)
    linhas = db.buscar_todos(
        "SELECT c.*, u.nome AS criado_por_nome FROM campanha c LEFT JOIN usuario u ON u.id = c.criado_por WHERE c.clinica_id = %s"
        + filtro + " ORDER BY c.encerrada_em NULLS FIRST, c.inicio DESC",
        params,
    )
    ids = [l["id"] for l in linhas]
    part = db.buscar_todos(
        """SELECT cp.campanha_id, cp.paciente_id, cp.registrado_em, cp.observacao, p.nome AS paciente_nome, u.nome AS registrado_por_nome
             FROM campanha_participante cp JOIN paciente p ON p.id = cp.paciente_id LEFT JOIN usuario u ON u.id = cp.registrado_por
            WHERE cp.campanha_id = ANY(%s) ORDER BY p.nome""",
        (ids,),
    ) if ids else []
    por = {}
    for p in part:
        por.setdefault(str(p["campanha_id"]), []).append({
            "pacienteId": str(p["paciente_id"]), "pacienteNome": p["paciente_nome"], "registradoEm": iso(p["registrado_em"]),
            "registradoPorNome": p["registrado_por_nome"], "observacao": p["observacao"],
        })
    return [montar_campanha(l, por.get(str(l["id"]), [])) for l in linhas]


@router.get("/api/campanhas")
def listar_campanhas(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    clinica = clinica_de(tenantId, usuario)
    return campanhas_da_clinica(clinica["id"])


@router.post("/api/campanhas", status_code=201)
def criar_campanha(payload: CampanhaPayload, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "edit"))):
    clinica = clinica_de(payload.tenantId, usuario)
    if payload.fim < payload.inicio:
        raise HTTPException(422, "O fim não pode ser antes do início.")
    novo = db.buscar_um(
        """INSERT INTO campanha (clinica_id, titulo, descricao, tipo, inicio, fim, meta_participantes, criado_por)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (clinica["id"], payload.titulo.strip(), vazio(payload.descricao), payload.tipo, payload.inicio, payload.fim,
         payload.metaParticipantes, usuario.id),
    )
    return campanhas_da_clinica(clinica["id"], str(novo["id"]))[0]


@router.post("/api/campanhas/{campanha_id}/participantes")
def registrar_participantes(campanha_id: str, payload: Participantes, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "create"))):
    clinica = clinica_de(payload.tenantId, usuario)
    campanha = db.buscar_um("SELECT encerrada_em FROM campanha WHERE id = %s AND clinica_id = %s", (campanha_id, clinica["id"]))
    if not campanha:
        raise HTTPException(404, "Campanha não encontrada.")
    if campanha["encerrada_em"]:
        raise HTTPException(409, "Campanha encerrada não recebe participantes.")
    validos = db.buscar_todos("SELECT id FROM paciente WHERE clinica_id = %s AND id = ANY(%s::uuid[])", (clinica["id"], payload.pacienteIds))
    with db.cursor() as cur:
        for p in validos:
            cur.execute(
                """INSERT INTO campanha_participante (campanha_id, paciente_id, registrado_por, observacao)
                   VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING""",
                (campanha_id, p["id"], usuario.id, vazio(payload.observacao)),
            )
    return campanhas_da_clinica(clinica["id"], campanha_id)[0]


@router.post("/api/campanhas/{campanha_id}/encerrar")
def encerrar_campanha(campanha_id: str, tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "edit"))):
    clinica = clinica_de(tenantId, usuario)
    db.executar("UPDATE campanha SET encerrada_em = now() WHERE id = %s AND clinica_id = %s AND encerrada_em IS NULL", (campanha_id, clinica["id"]))
    return campanhas_da_clinica(clinica["id"], campanha_id)[0]


# -----------------------------------------------------------------------------
# Histórico de atendimento: tudo o que aconteceu com o paciente e a família
# -----------------------------------------------------------------------------

@router.get("/api/pacientes/{paciente_id}/historico-atendimento")
def historico(paciente_id: str, tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("crm", "view"))):
    clinica = clinica_de(tenantId, usuario)
    paciente_da_clinica(paciente_id, clinica["id"])
    itens: list[dict] = []

    def add(tipo: str, quando, titulo: str, detalhe: str | None = None, quem: str | None = None):
        itens.append({"tipo": tipo, "quando": iso(quando), "titulo": titulo, "detalhe": detalhe, "quem": quem})

    for l in db.buscar_todos(SELECT_MENSAGEM + " WHERE m.paciente_id = %s ORDER BY m.created_at DESC LIMIT 100", (paciente_id,)):
        add("mensagem", l["created_at"], "Mensagem da família" if l["autor"] == "familia" else "Mensagem da equipe", l["texto"], l["autor_nome"])
    for l in db.buscar_todos(SELECT_EXAME + " WHERE e.paciente_id = %s", (paciente_id,)):
        add("exame", l["comunicado_em"], f"Exame comunicado: {l['exame']}", f"A {l['destinatario']}, por {l['canal']}. {l['resultado']}", l["autor_nome"])
    for l in db.buscar_todos(SELECT_AGENDA + " WHERE a.paciente_id = %s", (paciente_id,)):
        add("agenda", l["inicio"], f"{l['titulo']} ({l['status']})", " · ".join(x for x in (l["local"], l["profissional"]) if x) or None, l["criado_por_nome"])
    for l in db.buscar_todos("SELECT s.*, a.nome AS acompanhante_nome FROM resposta_satisfacao s LEFT JOIN acompanhante a ON a.id = s.acompanhante_id WHERE s.paciente_id = %s", (paciente_id,)):
        add("satisfacao", l["created_at"], f"Avaliação: nota {l['nota']}", l["comentario"], l["acompanhante_nome"])
    for l in db.buscar_todos(
        """SELECT a.nome, a.created_at, a.revogado_em, (SELECT min(aceito_em) FROM termo_confidencialidade t WHERE t.acompanhante_id = a.id) AS termo
             FROM acompanhante a WHERE a.paciente_id = %s""", (paciente_id,)):
        add("familia", l["created_at"], f"Acesso da família criado: {l['nome']}")
        if l["termo"]:
            add("familia", l["termo"], f"{l['nome']} aceitou o termo de confidencialidade")
        if l["revogado_em"]:
            add("familia", l["revogado_em"], f"Acesso de {l['nome']} encerrado")
    for l in db.buscar_todos(
        """SELECT m.tipo, m.data_hora, m.motivo, o.nome AS origem, d.nome AS destino, u.nome AS quem
             FROM movimentacao_paciente m LEFT JOIN ambiente o ON o.id = m.ambiente_origem_id
             LEFT JOIN ambiente d ON d.id = m.ambiente_destino_id LEFT JOIN usuario u ON u.id = m.usuario_id
            WHERE m.paciente_id = %s""", (paciente_id,)):
        rotulo = {"admissao": "Admissão", "transferencia": "Transferência", "alta": "Alta", "transferencia_externa": "Transferência externa"}[l["tipo"]]
        rota = " → ".join(x for x in (l["origem"], l["destino"]) if x)
        add("movimentacao", l["data_hora"], f"{rotulo}{f': {rota}' if rota else ''}", l["motivo"], l["quem"])
    for l in db.buscar_todos("SELECT tipo_evento, status, data_hora FROM ocorrencia WHERE paciente_id = %s", (paciente_id,)):
        add("ocorrencia", l["data_hora"], f"Ocorrência: {l['tipo_evento'].replace('_', ' ')}", f"Situação: {l['status'].replace('_', ' ')}")
    itens.sort(key=lambda i: i["quando"] or "", reverse=True)
    return itens
