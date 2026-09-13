"""Saúde da solução em execução, para a tela de observabilidade.

O núcleo comum da disciplina exige *monitoramento ou observabilidade da
solução em execução*. Este endpoint é a parte da API: tudo o que dá para
saber sobre o serviço sem abrir o código nem a máquina. O serviço de visão
tem o seu próprio `/health`, e a tela junta os dois.

Nenhum número aqui é inventado: o que não puder ser medido vem como null.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from .. import clipes, db
from ..alertas import central
from ..comum import clinica_por_slug
from ..registro import nivel_e_formato
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant
from .cameras import JANELA_DE_PING

router = APIRouter()

VERSAO = "0.2.0"
# O módulo é importado na subida do processo: serve de marco do uptime.
INICIADO_EM = time.time()


def _banco() -> dict:
    inicio = time.monotonic()
    try:
        db.buscar_um("SELECT 1 AS ok")
        return {"ok": True, "latencia_ms": round((time.monotonic() - inicio) * 1000, 1), "erro": None}
    except Exception as erro:  # noqa: BLE001
        return {"ok": False, "latencia_ms": None, "erro": str(erro)}


@router.get("/api/saude")
def saude(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view")),
):
    exigir_tenant(usuario, tenantId)
    clinica = clinica_por_slug(tenantId)
    banco = _banco()

    numeros = {"cameras": 0, "conectadas": 0, "ocorrencias_24h": 0, "abertas": 0}
    if banco["ok"]:
        # JANELA_DE_PING é constante; o id da clínica vai por parâmetro.
        linha = db.buscar_um(  # nosec B608
            f"""
            SELECT
              (SELECT count(*) FROM camera cam JOIN ambiente amb ON amb.id = cam.ambiente_id
                WHERE amb.clinica_id = %(cid)s) AS cameras,
              (SELECT count(*) FROM camera cam JOIN ambiente amb ON amb.id = cam.ambiente_id
                WHERE amb.clinica_id = %(cid)s
                  AND cam.ultimo_ping > now() - interval '{JANELA_DE_PING}') AS conectadas,
              (SELECT count(*) FROM ocorrencia
                WHERE clinica_id = %(cid)s AND data_hora > now() - interval '24 hours') AS ocorrencias_24h,
              (SELECT count(*) FROM ocorrencia
                WHERE clinica_id = %(cid)s AND status IN ('pendente', 'em_atendimento')) AS abertas
            """,
            {"cid": clinica["id"]},
        )
        numeros = {k: int(linha[k] or 0) for k in numeros}

    nivel, formato = nivel_e_formato()
    return {
        "status": "ok" if banco["ok"] else "degradado",
        "versao": VERSAO,
        "hora_servidor": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "uptime_s": round(time.time() - INICIADO_EM, 1),
        "banco": banco,
        "canal_alertas": {
            "ouvintes_desta_clinica": central.quantos(tenantId),
            "ouvintes_total": central.quantos(),
        },
        "cameras": {"total": numeros["cameras"], "conectadas": numeros["conectadas"], "janela_de_ping": JANELA_DE_PING},
        "ocorrencias": {"ultimas_24h": numeros["ocorrencias_24h"], "abertas": numeros["abertas"]},
        "clipes": clipes.estado(),
        "log": {"nivel": nivel, "formato": formato},
    }
