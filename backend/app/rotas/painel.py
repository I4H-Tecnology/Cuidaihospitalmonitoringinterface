"""Saúde da aplicação, tenants e visão operacional do painel."""

from fastapi import APIRouter, Depends, HTTPException
from psycopg import sql

from .. import clipes, db
from ..comum import agora_iso, clinica_por_slug, iso, logger
from ..ensaio import sem_ensaio
from ..seguranca import (
    UsuarioAutenticado,
    exigir_permissao,
    exigir_tenant,
)
from ..schemas import (
    Insight,
    OperationalOverviewResponse,
    SetorCritico,
    TenantInfo,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# Saúde e tenants
# -----------------------------------------------------------------------------

@router.get("/health")
def health():
    db.buscar_um("SELECT 1 AS ok")
    return {"status": "ok", "banco": "conectado"}


@router.get("/api/modo-de-teste")
def modo_de_teste():
    """O modo EFETIVO do sistema, para o painel mostrar a faixa "MODO DE TESTE".

    É o mesmo valor (MEDSIGNAL_MODO_TESTE, lido pelo backend) que libera a retenção estendida dos
    clipes e a importação dos registros de ensaio: a faixa não depende de uma cópia da configuração
    gravada no build do painel, que poderia divergir. Público de propósito, como a lista de
    clínicas: a faixa aparece antes do login, e dizer que o ambiente é de demonstração não é segredo.
    """
    return {"modoTeste": clipes.MODO_TESTE}


@router.get("/api/tenants", response_model=list[TenantInfo])
def listar_tenants():
    linhas = db.buscar_todos("SELECT slug, nome, ativa FROM clinica ORDER BY nome")
    return [TenantInfo(id=l["slug"], nome=l["nome"], active=l["ativa"]) for l in linhas]


# -----------------------------------------------------------------------------
# Visão operacional
# -----------------------------------------------------------------------------

@router.get("/api/operational-overview", response_model=OperationalOverviewResponse)
def visao_operacional(tenantId: str, usuario: UsuarioAutenticado = Depends(exigir_permissao("dashboard", "view"))):
    exigir_tenant(usuario, tenantId)
    """Todos os números saem de consulta ao banco.

    Nada aqui é gerado aleatoriamente — se não houver dado, o número é zero.
    Um painel que inventa valor não é painel, é enfeite.
    """
    clinica = clinica_por_slug(tenantId)
    cid = clinica["id"]

    # Registros de ensaio controlado (ensaio.py) ficam fora destas contagens: o alerta deles já
    # nasce `ciente` e a ocorrência `encerrada`, então só a janela de 24 h precisa do filtro.
    numeros = db.buscar_um(
        sql.SQL("""
        SELECT
          (SELECT count(*) FROM alerta a
             JOIN ocorrencia o ON o.id = a.ocorrencia_id
            WHERE o.clinica_id = %(cid)s AND a.nivel = 'critico' AND a.status <> 'ciente') AS alertas_criticos,
          (SELECT count(*) FROM ocorrencia
            WHERE clinica_id = %(cid)s AND status IN ('pendente', 'em_atendimento')) AS casos_abertos,
          (SELECT count(*) FROM ocorrencia o
            WHERE o.clinica_id = %(cid)s AND o.data_hora > now() - interval '24 hours'
              AND {sem}) AS incidentes_24h,
          (SELECT count(*) FROM paciente WHERE clinica_id = %(cid)s AND status = 'internado') AS internados,
          (SELECT count(*) FROM ambiente WHERE clinica_id = %(cid)s) AS ambientes,
          (SELECT COALESCE(avg(EXTRACT(EPOCH FROM (at.finalizado_em - at.iniciado_em)) / 60), 0)
             FROM atendimento at
             JOIN ocorrencia o ON o.id = at.ocorrencia_id
            WHERE o.clinica_id = %(cid)s AND at.finalizado_em IS NOT NULL) AS media_resposta
        """).format(sem=sem_ensaio("o")),
        {"cid": cid},
    )

    ambientes = numeros["ambientes"] or 0
    ocupacao = round((numeros["internados"] / ambientes) * 100, 1) if ambientes else 0.0

    if numeros["alertas_criticos"] > 0:
        status = "critical"
    elif numeros["casos_abertos"] > 0 or ocupacao >= 85:
        status = "attention"
    else:
        status = "operational"

    setores = db.buscar_todos(
        """
        SELECT a.id, a.nome,
               count(DISTINCT p.id) FILTER (WHERE p.status = 'internado') AS internados,
               count(DISTINCT o.id) FILTER (WHERE o.status IN ('pendente', 'em_atendimento')) AS abertos
        FROM ambiente a
        LEFT JOIN paciente p ON p.ambiente_id = a.id
        LEFT JOIN ocorrencia o ON o.ambiente_id = a.id
        WHERE a.clinica_id = %s
        GROUP BY a.id, a.nome
        ORDER BY abertos DESC, a.nome
        """,
        (cid,),
    )

    insights: list[Insight] = []
    if numeros["alertas_criticos"]:
        insights.append(Insight(
            id="alertas-criticos",
            title=f"{numeros['alertas_criticos']} alerta(s) crítico(s) sem ciência",
            description="Há alerta crítico aguardando confirmação de atendimento (RN12).",
            priority="high",
        ))
    if numeros["incidentes_24h"]:
        insights.append(Insight(
            id="incidentes-24h",
            title=f"{numeros['incidentes_24h']} ocorrência(s) nas últimas 24h",
            description="Volume registrado no período pelo serviço de detecção.",
            priority="medium",
        ))
    if not insights:
        insights.append(Insight(
            id="sem-eventos",
            title="Nenhuma ocorrência registrada",
            description="Sem eventos no banco. Os números aparecem conforme a operação gera dados.",
            priority="low",
        ))

    return OperationalOverviewResponse(
        status=status,
        criticalAlerts=numeros["alertas_criticos"],
        criticalCases=numeros["casos_abertos"],
        occupancyRate=ocupacao,
        avgResponseMinutes=round(float(numeros["media_resposta"]), 1),
        incidentsLast24h=numeros["incidentes_24h"],
        updatedAt=agora_iso(),
        criticalSectors=[
            SetorCritico(
                id=str(s["id"]),
                name=s["nome"],
                occupancyRate=float(s["internados"] or 0),
                activeAlerts=s["abertos"] or 0,
                status="critical" if s["abertos"] else "operational",
            )
            for s in setores
        ],
        insights=insights,
    )
