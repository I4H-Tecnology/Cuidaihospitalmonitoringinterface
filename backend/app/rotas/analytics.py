"""Inteligência & Analytics: números calculados dos dados reais da clínica.

Entrou em 26/10/2026 com as sete telas do grupo. Nada aqui é modelo de IA nem
estimativa inventada: tudo sai de ocorrência, alerta, atendimento, paciente,
prescrição, risco e avaliação de Morse. Onde a base é pequena para o número
dizer algo, a resposta traz o `n` e a tela avisa, em vez de exibir uma
porcentagem de três casos como se fosse tendência.

Permissão: `reports` (ver). O relatório de quedas também é `reports`.
"""

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import mean, median

from fastapi import APIRouter, Depends, HTTPException
from financeiro.relogio import FUSO, hoje

from .. import db
from ..comum import clinica_por_slug, iso
from ..seguranca import UsuarioAutenticado, exigir_permissao, exigir_tenant, permissoes_do_perfil

router = APIRouter()

TIPOS = ("queda", "perda_verticalidade", "permanencia_solo", "ausencia_prolongada")
ENCERRADAS = ("encerrada", "falso_positivo", "queda_confirmada")


def turno_de(instante: datetime) -> str:
    h = instante.astimezone(FUSO).hour
    return "manha" if 6 <= h < 12 else "tarde" if 12 <= h < 18 else "noite"


def periodo(inicio: str | None, fim: str | None, dias: int) -> tuple[date, date]:
    """Período fechado [inicio, fim] em dias do fuso da clínica."""
    try:
        f = date.fromisoformat(fim) if fim else hoje()
        i = date.fromisoformat(inicio) if inicio else f - timedelta(days=dias - 1)
    except ValueError:
        raise HTTPException(422, "Datas no formato AAAA-MM-DD.")
    if i > f:
        raise HTTPException(422, "O início do período não pode ser depois do fim.")
    if (f - i).days > 731:
        raise HTTPException(422, "Período máximo de dois anos.")
    return i, f


def limites(i: date, f: date) -> tuple[datetime, datetime]:
    """Instantes UTC que cobrem os dias [i, f] no fuso da clínica."""
    ini = datetime(i.year, i.month, i.day, tzinfo=FUSO)
    fim = datetime(f.year, f.month, f.day, tzinfo=FUSO) + timedelta(days=1)
    return ini, fim


def ocorrencias_do_periodo(clinica_id, i: date, f: date) -> list[dict]:
    ini, fim = limites(i, f)
    return db.buscar_todos(
        """
        SELECT o.id, o.tipo_evento, o.status, o.data_hora, o.encerrada_em, o.observacao,
               o.ambiente_id, amb.nome AS ambiente_nome, o.paciente_id, p.nome AS paciente_nome,
               p.data_nascimento, a.ciencia_em, uc.nome AS ciencia_nome,
               at.iniciado_em AS atendimento_em, ua.nome AS atendimento_nome
          FROM ocorrencia o
          JOIN ambiente amb ON amb.id = o.ambiente_id
          LEFT JOIN paciente p ON p.id = o.paciente_id
          LEFT JOIN alerta a ON a.ocorrencia_id = o.id
          LEFT JOIN usuario uc ON uc.id = a.ciencia_usuario_id
          LEFT JOIN LATERAL (
            SELECT iniciado_em, usuario_id FROM atendimento
             WHERE ocorrencia_id = o.id ORDER BY iniciado_em LIMIT 1
          ) at ON true
          LEFT JOIN usuario ua ON ua.id = at.usuario_id
         WHERE o.clinica_id = %s AND o.data_hora >= %s AND o.data_hora < %s
         ORDER BY o.data_hora DESC
        """,
        (clinica_id, ini, fim),
    )


def resumo_de_tempos(segundos: list[float]) -> dict:
    if not segundos:
        return {"n": 0, "mediana": None, "media": None, "p90": None}
    ordenados = sorted(segundos)
    p90 = ordenados[min(len(ordenados) - 1, int(round(0.9 * (len(ordenados) - 1))))]
    return {"n": len(ordenados), "mediana": round(median(ordenados)), "media": round(mean(ordenados)), "p90": round(p90)}


def metricas(linhas: list[dict], i: date, f: date) -> dict:
    """Os números de um período. Usado pelos KPIs e pelo comparativo."""
    por_status = Counter(l["status"] for l in linhas)
    por_tipo = Counter(l["tipo_evento"] for l in linhas)
    ciencia = [(l["ciencia_em"] - l["data_hora"]).total_seconds() for l in linhas if l["ciencia_em"]]
    atendimento = [(l["atendimento_em"] - l["data_hora"]).total_seconds() for l in linhas if l["atendimento_em"]]
    encerramento = [(l["encerrada_em"] - l["data_hora"]).total_seconds() for l in linhas if l["encerrada_em"]]
    encerradas = sum(por_status[s] for s in ENCERRADAS)
    por_dia = Counter(l["data_hora"].astimezone(FUSO).date() for l in linhas)
    dias = [(i + timedelta(days=k)) for k in range((f - i).days + 1)]
    return {
        "inicio": i.isoformat(),
        "fim": f.isoformat(),
        "total": len(linhas),
        "porStatus": {s: por_status.get(s, 0) for s in ("pendente", "em_atendimento", *ENCERRADAS)},
        "porTipo": {t: por_tipo.get(t, 0) for t in TIPOS},
        "porTurno": dict(Counter(turno_de(l["data_hora"]) for l in linhas)),
        "porDia": [{"dia": d.isoformat(), "total": por_dia.get(d, 0)} for d in dias],
        "tempoCiencia": resumo_de_tempos(ciencia),
        "tempoAtendimento": resumo_de_tempos(atendimento),
        "tempoEncerramento": resumo_de_tempos(encerramento),
        "cienciaEm5Min": round(100 * sum(1 for s in ciencia if s <= 300) / len(ciencia), 1) if ciencia else None,
        "quedasConfirmadas": por_status.get("queda_confirmada", 0),
        "falsosPositivos": por_status.get("falso_positivo", 0),
        "taxaFalsoPositivo": round(100 * por_status.get("falso_positivo", 0) / encerradas, 1) if encerradas else None,
        "encerradas": encerradas,
    }


def pacientes_dia(clinica_id, i: date, f: date) -> int:
    linha = db.buscar_um(
        """
        SELECT COALESCE(sum(GREATEST(0,
                 LEAST(COALESCE(data_alta, %(hoje)s), %(fim)s) - GREATEST(data_admissao, %(ini)s) + 1)), 0) AS pd
          FROM paciente
         WHERE clinica_id = %(c)s AND data_admissao <= %(fim)s AND (data_alta IS NULL OR data_alta >= %(ini)s)
        """,
        {"c": clinica_id, "ini": i, "fim": min(f, hoje()), "hoje": hoje()},
    )
    return int(linha["pd"])


def da_clinica(tenant_id: str, usuario: UsuarioAutenticado) -> dict:
    exigir_tenant(usuario, tenant_id)
    return clinica_por_slug(tenant_id)


@router.get("/api/analytics/kpis")
def kpis(
    tenantId: str, dias: int = 30, inicio: str | None = None, fim: str | None = None,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("reports", "view")),
):
    """KPIs assistenciais do período, com o período anterior de mesmo tamanho para comparar."""
    clinica = da_clinica(tenantId, usuario)
    i, f = periodo(inicio, fim, max(1, min(dias, 365)))
    tamanho = (f - i).days + 1
    ai, af = i - timedelta(days=tamanho), i - timedelta(days=1)
    atual = metricas(ocorrencias_do_periodo(clinica["id"], i, f), i, f)
    anterior = metricas(ocorrencias_do_periodo(clinica["id"], ai, af), ai, af)
    atual["pacientesDia"] = pacientes_dia(clinica["id"], i, f)
    evolucoes = db.buscar_um(
        """SELECT count(*) AS n FROM evolucao e JOIN paciente p ON p.id = e.paciente_id
            WHERE p.clinica_id = %s AND e.created_at >= %s AND e.created_at < %s""",
        (clinica["id"], *limites(i, f)),
    )["n"]
    atual["evolucoes"] = evolucoes
    return {"atual": atual, "anterior": anterior}


@router.get("/api/analytics/comparativo")
def comparativo(
    tenantId: str, inicioA: str, fimA: str, inicioB: str, fimB: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("reports", "view")),
):
    clinica = da_clinica(tenantId, usuario)
    saida = {}
    for nome, (ini, fim) in {"a": (inicioA, fimA), "b": (inicioB, fimB)}.items():
        i, f = periodo(ini, fim, 30)
        m = metricas(ocorrencias_do_periodo(clinica["id"], i, f), i, f)
        m["pacientesDia"] = pacientes_dia(clinica["id"], i, f)
        m["taxaQuedas1000"] = round(1000 * m["quedasConfirmadas"] / m["pacientesDia"], 2) if m["pacientesDia"] else None
        saida[nome] = m
    return saida


@router.get("/api/analytics/mapa-de-calor")
def mapa_de_calor(
    tenantId: str, dias: int = 30, incluirFalsos: bool = False,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("reports", "view")),
):
    """Ocorrências por ambiente × hora do dia e por dia da semana × hora."""
    clinica = da_clinica(tenantId, usuario)
    i, f = periodo(None, None, max(7, min(dias, 365)))
    linhas = [l for l in ocorrencias_do_periodo(clinica["id"], i, f) if incluirFalsos or l["status"] != "falso_positivo"]
    ambientes = db.buscar_todos("SELECT id, nome FROM ambiente WHERE clinica_id = %s ORDER BY nome", (clinica["id"],))
    por_amb = defaultdict(lambda: [0] * 24)
    por_semana = [[0] * 24 for _ in range(7)]
    for l in linhas:
        local = l["data_hora"].astimezone(FUSO)
        por_amb[str(l["ambiente_id"])][local.hour] += 1
        por_semana[local.weekday()][local.hour] += 1
    return {
        "inicio": i.isoformat(), "fim": f.isoformat(), "total": len(linhas),
        "ambientes": [{"id": str(a["id"]), "nome": a["nome"], "horas": por_amb[str(a["id"])], "total": sum(por_amb[str(a["id"])])} for a in ambientes],
        # 0 = segunda-feira, como datetime.weekday().
        "diasDaSemana": por_semana,
    }


@router.get("/api/analytics/previsao")
def previsao(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("reports", "view")),
):
    """Tendência e horários de maior risco, por estatística simples e explicável.

    Semanas: contagem das últimas 12 semanas e reta de mínimos quadrados sobre
    elas; a próxima semana é a reta estendida (nunca abaixo de zero). Horários:
    média semanal de ocorrências em cada hora e dia da semana nas últimas 8
    semanas. Falso positivo fica de fora: não é evento.
    """
    clinica = da_clinica(tenantId, usuario)
    f = hoje()
    inicio_semana = f - timedelta(days=f.weekday())  # segunda desta semana
    i = inicio_semana - timedelta(weeks=12)
    linhas = [l for l in ocorrencias_do_periodo(clinica["id"], i, f) if l["status"] != "falso_positivo"]

    semanas = [0] * 12
    hora_dia = [[0] * 24 for _ in range(7)]
    por_ambiente = Counter()
    corte8 = inicio_semana - timedelta(weeks=8)
    for l in linhas:
        d = l["data_hora"].astimezone(FUSO)
        k = (d.date() - i).days // 7
        if 0 <= k < 12:
            semanas[k] += 1
        # Horários e ambientes contam a semana corrente também: com pouco histórico,
        # deixar de fora o que aconteceu esta semana zerava a tela sem motivo.
        if d.date() >= corte8:
            hora_dia[d.weekday()][d.hour] += 1
            por_ambiente[l["ambiente_nome"]] += 1

    n = len(semanas)
    xm, ym = (n - 1) / 2, sum(semanas) / n
    sxx = sum((x - xm) ** 2 for x in range(n))
    inclinacao = sum((x - xm) * (y - ym) for x, y in enumerate(semanas)) / sxx
    proxima = max(0.0, ym + inclinacao * (n - xm))
    semanas_com_dados = sum(1 for s in semanas if s)
    media_hora = [[round(c / 8, 2) for c in linha] for linha in hora_dia]
    picos = sorted(
        ({"diaDaSemana": d, "hora": h, "mediaSemanal": media_hora[d][h]} for d in range(7) for h in range(24) if hora_dia[d][h]),
        key=lambda x: -x["mediaSemanal"],
    )[:5]
    return {
        "semanas": [{"inicio": (i + timedelta(weeks=k)).isoformat(), "total": semanas[k]} for k in range(12)],
        "semanaAtual": sum(1 for l in linhas if l["data_hora"].astimezone(FUSO).date() >= inicio_semana),
        "inclinacaoPorSemana": round(inclinacao, 3),
        "previsaoProximaSemana": round(proxima, 1),
        "semanasComDados": semanas_com_dados,
        "mediaPorHoraEDia": media_hora,
        "picos": picos,
        "ambientes": [{"nome": nome, "mediaSemanal": round(c / 8, 2)} for nome, c in por_ambiente.most_common(8)],
    }


@router.get("/api/analytics/indicadores-clinicos")
def indicadores_clinicos(
    tenantId: str, dias: int = 30,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("reports", "view")),
):
    clinica = da_clinica(tenantId, usuario)
    c = clinica["id"]
    i, f = periodo(None, None, max(1, min(dias, 365)))
    pd = pacientes_dia(c, i, f)
    linhas = ocorrencias_do_periodo(c, i, f)
    quedas = sum(1 for l in linhas if l["status"] == "queda_confirmada")
    censo = db.buscar_um(
        """
        SELECT count(*) FILTER (WHERE status = 'internado') AS internados,
               count(*) FILTER (WHERE data_admissao BETWEEN %(i)s AND %(f)s) AS admissoes,
               count(*) FILTER (WHERE data_alta BETWEEN %(i)s AND %(f)s) AS saidas,
               avg(data_alta - data_admissao) FILTER (WHERE data_alta BETWEEN %(i)s AND %(f)s) AS permanencia,
               avg(EXTRACT(year FROM age(data_nascimento))) FILTER (WHERE status = 'internado' AND data_nascimento IS NOT NULL) AS idade_media,
               count(*) FILTER (WHERE status = 'internado' AND data_nascimento <= CURRENT_DATE - interval '80 years') AS idosos80
          FROM paciente WHERE clinica_id = %(c)s
        """,
        {"c": c, "i": i, "f": f},
    )
    clinico = db.buscar_um(
        """
        WITH internados AS (SELECT id FROM paciente WHERE clinica_id = %(c)s AND status = 'internado'),
        morse AS (
          SELECT DISTINCT ON (paciente_id) paciente_id, total, created_at
            FROM avaliacao_risco_queda WHERE paciente_id IN (SELECT id FROM internados)
           ORDER BY paciente_id, created_at DESC
        )
        SELECT
          (SELECT count(DISTINCT r.paciente_id) FROM risco_paciente r WHERE r.paciente_id IN (SELECT id FROM internados)
              AND r.ativo AND r.tipo = 'alergia' AND r.gravidade = 'grave') AS alergia_grave,
          (SELECT count(DISTINCT r.paciente_id) FROM risco_paciente r WHERE r.paciente_id IN (SELECT id FROM internados)
              AND r.ativo AND r.tipo = 'risco' AND r.gravidade = 'grave') AS risco_grave,
          (SELECT count(*) FROM (SELECT paciente_id FROM prescricao WHERE ativo AND paciente_id IN (SELECT id FROM internados)
              GROUP BY paciente_id HAVING count(*) >= 5) x) AS polifarmacia,
          (SELECT count(*) FROM morse WHERE total >= 45) AS morse_alto,
          (SELECT count(*) FROM morse WHERE total BETWEEN 25 AND 44) AS morse_moderado,
          (SELECT count(*) FROM internados WHERE id NOT IN (SELECT paciente_id FROM morse)) AS sem_morse,
          (SELECT count(*) FROM internados WHERE NOT EXISTS (
              SELECT 1 FROM evolucao e WHERE e.paciente_id = internados.id AND e.created_at > now() - interval '3 days')) AS sem_evolucao_3d
        """,
        {"c": c},
    )
    pacientes_com_ocorrencia = len({l["paciente_id"] for l in linhas if l["paciente_id"] and l["status"] != "falso_positivo"})
    return {
        "inicio": i.isoformat(), "fim": f.isoformat(),
        "pacientesDia": pd,
        "internados": censo["internados"], "admissoes": censo["admissoes"], "saidas": censo["saidas"],
        "permanenciaMediaDias": round(float(censo["permanencia"]), 1) if censo["permanencia"] is not None else None,
        "idadeMedia": round(float(censo["idade_media"]), 1) if censo["idade_media"] is not None else None,
        "idosos80": censo["idosos80"],
        "quedasConfirmadas": quedas,
        "taxaQuedas1000": round(1000 * quedas / pd, 2) if pd else None,
        "pacientesComOcorrencia": pacientes_com_ocorrencia,
        "alergiaGrave": clinico["alergia_grave"], "riscoGrave": clinico["risco_grave"],
        "polifarmacia": clinico["polifarmacia"],
        "morseAlto": clinico["morse_alto"], "morseModerado": clinico["morse_moderado"], "semMorse": clinico["sem_morse"],
        "semEvolucao3d": clinico["sem_evolucao_3d"],
    }


def evento(l: dict) -> dict:
    segundos = lambda a: round((a - l["data_hora"]).total_seconds()) if a else None  # noqa: E731
    idade = None
    if l.get("data_nascimento"):
        nasc = l["data_nascimento"]
        h = hoje()
        idade = h.year - nasc.year - ((h.month, h.day) < (nasc.month, nasc.day))
    return {
        "id": str(l["id"]), "dataHora": iso(l["data_hora"]), "tipo": l["tipo_evento"], "status": l["status"],
        "ambienteId": str(l["ambiente_id"]), "ambienteNome": l["ambiente_nome"],
        "pacienteId": str(l["paciente_id"]) if l["paciente_id"] else None, "pacienteNome": l["paciente_nome"], "idade": idade,
        "cienciaEm": iso(l["ciencia_em"]), "cienciaPor": l["ciencia_nome"], "segundosAteCiencia": segundos(l["ciencia_em"]),
        "atendimentoEm": iso(l["atendimento_em"]), "atendidoPor": l["atendimento_nome"], "segundosAteAtendimento": segundos(l["atendimento_em"]),
        "encerradaEm": iso(l["encerrada_em"]), "segundosAteEncerramento": segundos(l["encerrada_em"]),
        "observacao": l["observacao"], "turno": turno_de(l["data_hora"]),
    }


@router.get("/api/relatorios/quedas")
def relatorio_de_quedas(
    tenantId: str, inicio: str | None = None, fim: str | None = None,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("reports", "view")),
):
    """Base para notificação de eventos adversos (RDC 36/2013, Segurança do Paciente).

    Traz os eventos do período e a taxa de quedas por 1.000 pacientes-dia, o
    indicador que o protocolo de prevenção de quedas do Ministério da Saúde
    pede. A notificação em si (Notivisa) é feita fora do sistema.
    """
    clinica = da_clinica(tenantId, usuario)
    i, f = periodo(inicio, fim, 30)
    linhas = ocorrencias_do_periodo(clinica["id"], i, f)
    pd = pacientes_dia(clinica["id"], i, f)
    nome = db.buscar_um("SELECT nome FROM clinica WHERE id = %s", (clinica["id"],))["nome"]
    m = metricas(linhas, i, f)
    return {
        "inicio": i.isoformat(), "fim": f.isoformat(), "clinicaNome": nome,
        "pacientesDia": pd,
        "quedasConfirmadas": m["quedasConfirmadas"],
        "taxaQuedas1000": round(1000 * m["quedasConfirmadas"] / pd, 2) if pd else None,
        "ocorrencias": m["total"], "falsosPositivos": m["falsosPositivos"],
        "tempoCiencia": m["tempoCiencia"],
        "eventos": [evento(l) for l in linhas if l["status"] != "falso_positivo"],
    }


@router.get("/api/monitoramento/eventos")
def eventos_de_monitoramento(
    tenantId: str, inicio: str | None = None, fim: str | None = None, dias: int = 7,
    tipo: str | None = None, status: str | None = None, ambienteId: str | None = None,
    noturno: bool = False, limite: int = 500,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("monitoring", "view")),
):
    """Ocorrências com os tempos de resposta e quem respondeu.

    Alimenta a linha do tempo de eventos, o histórico de incidentes, a agitação
    noturna (`noturno`: 22h às 6h no fuso da clínica) e a ausência no quarto
    (`tipo=ausencia_prolongada`).
    """
    clinica = da_clinica(tenantId, usuario)
    i, f = periodo(inicio, fim, max(1, min(dias, 365)))
    linhas = ocorrencias_do_periodo(clinica["id"], i, f)
    if tipo:
        linhas = [l for l in linhas if l["tipo_evento"] == tipo]
    if status:
        aceitos = set(status.split(","))
        linhas = [l for l in linhas if l["status"] in aceitos]
    if ambienteId:
        linhas = [l for l in linhas if str(l["ambiente_id"]) == ambienteId]
    if noturno:
        linhas = [l for l in linhas if not (6 <= l["data_hora"].astimezone(FUSO).hour < 22)]
    return {"inicio": i.isoformat(), "fim": f.isoformat(), "total": len(linhas), "eventos": [evento(l) for l in linhas[: max(1, min(limite, 2000))]]}


@router.get("/api/analytics/insights")
def insights(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("reports", "view")),
):
    """Achados por regras fixas e escritas aqui, uma por bloco. Cada achado diz
    o número que o disparou e onde agir. Não é IA: é a lista de verificações
    que um gestor atento faria todo dia, rodada sozinha."""
    clinica = da_clinica(tenantId, usuario)
    c = clinica["id"]
    perms = permissoes_do_perfil(usuario)
    pode = lambda m: bool((perms.get(m) or {}).get("view"))  # noqa: E731
    achados: list[dict] = []

    def achar(nivel: str, categoria: str, titulo: str, detalhe: str, tela: str | None = None):
        achados.append({"nivel": nivel, "categoria": categoria, "titulo": titulo, "detalhe": detalhe, "tela": tela})

    h = hoje()
    ult7 = ocorrencias_do_periodo(c, h - timedelta(days=6), h)
    ant7 = ocorrencias_do_periodo(c, h - timedelta(days=13), h - timedelta(days=7))
    reais7 = [l for l in ult7 if l["status"] != "falso_positivo"]

    # 1. Ocorrência aberta há muito tempo.
    agora = datetime.now(timezone.utc)
    paradas = [l for l in ult7 if l["status"] in ("pendente", "em_atendimento") and agora - l["data_hora"] > timedelta(minutes=15)]
    if paradas:
        achar("critico", "Resposta", f"{len(paradas)} ocorrência(s) aberta(s) há mais de 15 minutos",
              "Sem encerramento, o desfecho da queda fica sem registro. Mais antiga: " + paradas[-1]["ambiente_nome"] + ".", "alerts")

    # 2. Ambiente e paciente que se repetem.
    for nome, n in Counter(l["ambiente_nome"] for l in reais7).most_common():
        if n >= 2:
            achar("atencao", "Ambiente", f"{nome}: {n} ocorrências em 7 dias",
                  "Vale revisar o ambiente (piso, iluminação, grades, posição da cama) e o plano de cuidado de quem está nele.", "heatmaps")
    for nome, n in Counter(l["paciente_nome"] for l in reais7 if l["paciente_nome"]).most_common():
        if n >= 2:
            achar("atencao", "Paciente", f"{nome}: {n} ocorrências em 7 dias",
                  "Reavalie o risco de queda (Escala de Morse) e registre a conduta na evolução.", "score-risco")

    # 3. Tempo até a ciência, esta semana contra a anterior.
    t_atual = [(l["ciencia_em"] - l["data_hora"]).total_seconds() for l in ult7 if l["ciencia_em"]]
    t_ant = [(l["ciencia_em"] - l["data_hora"]).total_seconds() for l in ant7 if l["ciencia_em"]]
    if len(t_atual) >= 3 and len(t_ant) >= 3:
        m_atual, m_ant = median(t_atual), median(t_ant)
        if m_ant > 0 and m_atual >= 1.3 * m_ant:
            achar("atencao", "Resposta", f"A ciência ficou {round(100 * (m_atual / m_ant - 1))}% mais lenta",
                  f"Mediana de {round(m_atual / 60, 1)} min nos últimos 7 dias, contra {round(m_ant / 60, 1)} min na semana anterior.", "kpis")
        elif m_atual > 0 and m_atual <= 0.77 * m_ant:
            achar("positivo", "Resposta", f"A ciência ficou {round(100 * (1 - m_atual / m_ant))}% mais rápida",
                  f"Mediana de {round(m_atual / 60, 1)} min nos últimos 7 dias, contra {round(m_ant / 60, 1)} min na semana anterior.", "kpis")

    # 4. Falso positivo alto.
    ult30 = ocorrencias_do_periodo(c, h - timedelta(days=29), h)
    fechadas = [l for l in ult30 if l["status"] in ENCERRADAS]
    falsos = [l for l in fechadas if l["status"] == "falso_positivo"]
    if len(fechadas) >= 5 and len(falsos) / len(fechadas) > 0.3:
        achar("atencao", "Detecção", f"{round(100 * len(falsos) / len(fechadas))}% de falsos positivos em 30 dias",
              "Alarme falso demais cansa a equipe. Confira o enquadramento das câmeras dos ambientes onde mais acontece.", "incidentes")

    # 5. Câmeras e cobertura.
    cams = db.buscar_um(
        """SELECT count(*) FILTER (WHERE cam.ultimo_ping IS NULL OR cam.ultimo_ping < now() - interval '1 hour') AS sem_sinal
             FROM camera cam JOIN ambiente amb ON amb.id = cam.ambiente_id WHERE amb.clinica_id = %s""", (c,))
    if cams["sem_sinal"]:
        achar("atencao", "Câmeras", f"{cams['sem_sinal']} câmera(s) sem sinal há mais de 1 hora",
              "Quarto com câmera fora do ar é quarto onde queda não é detectada.", "sensores")
    descobertos = db.buscar_todos(
        """SELECT p.nome, amb.nome AS ambiente FROM paciente p JOIN ambiente amb ON amb.id = p.ambiente_id
            WHERE p.clinica_id = %s AND p.status = 'internado'
              AND NOT EXISTS (SELECT 1 FROM camera cam WHERE cam.ambiente_id = amb.id)""", (c,))
    if descobertos:
        achar("critico", "Câmeras", f"{len(descobertos)} paciente(s) em ambiente sem câmera",
              ", ".join(f"{d['nome']} ({d['ambiente']})" for d in descobertos[:3]) + (" e outros." if len(descobertos) > 3 else "."), None)

    # 6. Avaliação de risco e evolução.
    if pode("clinical_logs"):
        sem_morse = db.buscar_um(
            """SELECT count(*) AS n FROM paciente p WHERE p.clinica_id = %s AND p.status = 'internado'
                 AND NOT EXISTS (SELECT 1 FROM avaliacao_risco_queda a WHERE a.paciente_id = p.id AND a.created_at > now() - interval '7 days')""", (c,))["n"]
        if sem_morse:
            achar("atencao", "Risco", f"{sem_morse} internado(s) sem avaliação de Morse nos últimos 7 dias",
                  "O protocolo de prevenção de quedas pede reavaliação periódica e após qualquer queda.", "score-risco")
        sem_evolucao = db.buscar_um(
            """SELECT count(*) AS n FROM paciente p WHERE p.clinica_id = %s AND p.status = 'internado'
                 AND NOT EXISTS (SELECT 1 FROM evolucao e WHERE e.paciente_id = p.id AND e.created_at > now() - interval '3 days')""", (c,))["n"]
        if sem_evolucao:
            achar("atencao", "Prontuário", f"{sem_evolucao} internado(s) sem evolução há 3 dias ou mais", "Registro em dia protege o paciente e a equipe.", "evolucoes")

    # 7. Administração e relacionamento.
    if pode("contracts"):
        venc = db.buscar_um(
            """SELECT count(*) FILTER (WHERE fim IS NOT NULL AND fim >= %(h)s AND fim - aviso_previo_dias <= %(h)s) AS vencendo,
                      count(*) FILTER (WHERE fim IS NOT NULL AND fim < %(h)s AND NOT renovacao_automatica) AS vencidos
                 FROM contrato WHERE clinica_id = %(c)s AND encerrado_em IS NULL""", {"c": c, "h": h})
        if venc["vencendo"]:
            achar("atencao", "Contratos", f"{venc['vencendo']} contrato(s) no prazo de decidir a renovação", "Depois do aviso prévio, renovar ou sair fica mais caro.", "contratos")
        if venc["vencidos"]:
            achar("critico", "Contratos", f"{venc['vencidos']} contrato(s) vencido(s) sem renovação automática", "O serviço pode estar sendo prestado sem cobertura contratual.", "contratos")
    if pode("purchases"):
        urg = db.buscar_um(
            """SELECT count(*) AS n FROM pedido_compra WHERE clinica_id = %s AND urgente AND status = 'solicitado'
                 AND created_at < now() - interval '24 hours'""", (c,))["n"]
        if urg:
            achar("atencao", "Compras", f"{urg} pedido(s) urgente(s) aguardando aprovação há mais de 24 h", "Pedido urgente parado costuma ser falta de material no cuidado.", "compras")
    if pode("crm"):
        atrasados = db.buscar_um("SELECT count(*) AS n FROM lembrete WHERE clinica_id = %s AND ativo AND proxima_em < now()", (c,))["n"]
        if atrasados:
            achar("atencao", "Lembretes", f"{atrasados} lembrete(s) atrasado(s)", "Tarefas com hora marcada que ninguém concluiu.", "lembretes")
        sem_resposta = db.buscar_um(
            """SELECT count(DISTINCT m.paciente_id) AS n FROM mensagem m
                WHERE m.clinica_id = %s AND m.autor = 'familia' AND m.created_at < now() - interval '24 hours'
                  AND NOT EXISTS (SELECT 1 FROM mensagem r WHERE r.paciente_id = m.paciente_id AND r.autor = 'equipe' AND r.created_at > m.created_at)""", (c,))["n"]
        if sem_resposta:
            achar("atencao", "Família", f"{sem_resposta} família(s) sem resposta há mais de 24 h", "Mensagem sem resposta é a queixa mais comum de quem acompanha de longe.", "mensagens")
        nps = db.buscar_um(
            """SELECT count(*) AS n, count(*) FILTER (WHERE nota >= 9) AS p, count(*) FILTER (WHERE nota <= 6) AS d
                 FROM resposta_satisfacao WHERE clinica_id = %s AND created_at > now() - interval '90 days'""", (c,))
        if nps["n"] >= 5:
            valor = round(100 * (nps["p"] - nps["d"]) / nps["n"])
            if valor < 0:
                achar("atencao", "Família", f"NPS de {valor} nos últimos 90 dias", "Mais detratores que promotores. Os comentários dizem por quê.", "nps")
            elif valor >= 50:
                achar("positivo", "Família", f"NPS de {valor} nos últimos 90 dias", "Faixa de excelência. Vale contar à equipe.", "nps")

    if not ult7 and not achados:
        achar("positivo", "Resposta", "Nenhuma ocorrência nos últimos 7 dias", "Nada a investigar por aqui esta semana.", None)

    ordem = {"critico": 0, "atencao": 1, "info": 2, "positivo": 3}
    achados.sort(key=lambda a: ordem[a["nivel"]])
    return {"geradoEm": iso(datetime.now(timezone.utc)), "achados": achados}


@router.get("/api/dashboard/indicadores-chave")
def indicadores_chave(
    tenantId: str,
    usuario: UsuarioAutenticado = Depends(exigir_permissao("dashboard", "view")),
):
    """Os números de cada módulo num lugar só (Dashboard → Indicadores-chave).

    Cada bloco só vem se o perfil pode ver o módulo dele: quem não vê compras
    não fica sabendo quantos pedidos esperam aprovação por aqui.
    """
    clinica = da_clinica(tenantId, usuario)
    c = clinica["id"]
    perms = permissoes_do_perfil(usuario)
    pode = lambda m: bool((perms.get(m) or {}).get("view"))  # noqa: E731
    h = hoje()
    saida: dict = {}

    if pode("monitoring") or pode("alerts"):
        ult7 = ocorrencias_do_periodo(c, h - timedelta(days=6), h)
        agora = datetime.now(timezone.utc)
        ciencia = [(l["ciencia_em"] - l["data_hora"]).total_seconds() for l in ult7 if l["ciencia_em"]]
        cams = db.buscar_um(
            """SELECT count(*) AS total, count(*) FILTER (WHERE cam.ultimo_ping > now() - interval '90 seconds') AS conectadas
                 FROM camera cam JOIN ambiente amb ON amb.id = cam.ambiente_id WHERE amb.clinica_id = %s""", (c,))
        saida["monitoramento"] = {
            "ocorrencias24h": sum(1 for l in ult7 if agora - l["data_hora"] < timedelta(hours=24)),
            "ocorrencias7d": len(ult7),
            "abertas": sum(1 for l in ult7 if l["status"] in ("pendente", "em_atendimento")),
            "quedasConfirmadas7d": sum(1 for l in ult7 if l["status"] == "queda_confirmada"),
            "cienciaMediana7d": round(median(ciencia)) if ciencia else None,
            "camerasConectadas": cams["conectadas"], "camerasTotal": cams["total"],
        }
    if pode("patients"):
        p = db.buscar_um(
            """SELECT (SELECT count(*) FROM paciente WHERE clinica_id = %(c)s AND status = 'internado') AS internados,
                      (SELECT count(*) FROM ambiente WHERE clinica_id = %(c)s AND tipo = 'quarto') AS quartos,
                      (SELECT count(DISTINCT ambiente_id) FROM paciente WHERE clinica_id = %(c)s AND status = 'internado'
                          AND ambiente_id IN (SELECT id FROM ambiente WHERE clinica_id = %(c)s AND tipo = 'quarto')) AS ocupados,
                      (SELECT count(*) FROM paciente WHERE clinica_id = %(c)s AND data_admissao > CURRENT_DATE - 7) AS admissoes7d""",
            {"c": c})
        saida["pacientes"] = {"internados": p["internados"], "quartosOcupados": p["ocupados"], "quartosTotal": p["quartos"], "admissoes7d": p["admissoes7d"]}
    if pode("clinical_logs"):
        r = db.buscar_um(
            """WITH ult AS (SELECT DISTINCT ON (a.paciente_id) a.paciente_id, a.total FROM avaliacao_risco_queda a
                             JOIN paciente p ON p.id = a.paciente_id WHERE p.clinica_id = %(c)s AND p.status = 'internado'
                             ORDER BY a.paciente_id, a.created_at DESC)
               SELECT (SELECT count(*) FROM ult WHERE total >= 45) AS alto,
                      (SELECT count(*) FROM paciente p WHERE p.clinica_id = %(c)s AND p.status = 'internado'
                          AND NOT EXISTS (SELECT 1 FROM ult WHERE ult.paciente_id = p.id)) AS sem""", {"c": c})
        saida["risco"] = {"morseAlto": r["alto"], "semAvaliacao": r["sem"]}
    if pode("crm"):
        x = db.buscar_um(
            """SELECT (SELECT count(*) FROM lembrete WHERE clinica_id = %(c)s AND ativo AND proxima_em < now()) AS atrasados,
                      (SELECT count(*) FROM mensagem WHERE clinica_id = %(c)s AND autor = 'familia' AND lida_em IS NULL) AS nao_lidas,
                      (SELECT count(*) FROM agendamento WHERE clinica_id = %(c)s AND status = 'agendado'
                          AND inicio::date = CURRENT_DATE) AS agenda_hoje""", {"c": c})
        n = db.buscar_um(
            """SELECT count(*) AS n, count(*) FILTER (WHERE nota >= 9) AS p, count(*) FILTER (WHERE nota <= 6) AS d
                 FROM resposta_satisfacao WHERE clinica_id = %s AND created_at > now() - interval '90 days'""", (c,))
        saida["relacionamento"] = {
            "lembretesAtrasados": x["atrasados"], "mensagensNaoLidas": x["nao_lidas"], "agendaHoje": x["agenda_hoje"],
            "nps90": round(100 * (n["p"] - n["d"]) / n["n"]) if n["n"] else None, "respostasNps90": n["n"],
        }
    if pode("operations"):
        o = db.buscar_um(
            """SELECT (SELECT count(*) FROM checklist_execucao WHERE clinica_id = %(c)s AND concluido_em::date = CURRENT_DATE) AS checklists_hoje,
                      (SELECT count(*) FROM escala_turno WHERE clinica_id = %(c)s AND data = CURRENT_DATE) AS escalados_hoje""", {"c": c})
        saida["operacao"] = {"checklistsHoje": o["checklists_hoje"], "escaladosHoje": o["escalados_hoje"]}
    if pode("purchases") or pode("contracts"):
        a = {}
        if pode("purchases"):
            a["pedidosAguardando"] = db.buscar_um("SELECT count(*) AS n FROM pedido_compra WHERE clinica_id = %s AND status = 'solicitado'", (c,))["n"]
        if pode("contracts"):
            a["contratosVencendo"] = db.buscar_um(
                """SELECT count(*) AS n FROM contrato WHERE clinica_id = %(c)s AND encerrado_em IS NULL AND fim IS NOT NULL
                     AND fim >= %(h)s AND fim - aviso_previo_dias <= %(h)s""", {"c": c, "h": h})["n"]
        saida["administracao"] = a
    return saida
