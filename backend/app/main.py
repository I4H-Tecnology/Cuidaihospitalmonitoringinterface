"""MedSignal — backend mínimo de autenticação e monitoramento (andaime).

Existe para destravar o frontend enquanto o backend definitivo não chega.
Implementa os endpoints que `frontend/src/app/data/api.ts` chama, contra o
mesmo Postgres do docker-compose.

SEGURANÇA:
  - Emite JWT no login e exige token em toda rota protegida.
  - A permissão é conferida no SERVIDOR, contra o perfil gravado no banco.
  - O token carrega o tenant: token da clínica A não abre dado da clínica B,
    mesmo que a query string peça outra.
  - O que falta: refresh token, revogação (logout só descarta no cliente) e
    rate limit no login.

ORGANIZAÇÃO:
  Este arquivo é só a montagem da aplicação — ciclo de vida, middleware,
  tradução de erro e registro dos routers. Cada domínio mora no seu módulo em
  `rotas/`, e o que mais de um domínio usa fica em `comum.py`.

  Antes eram 1727 linhas com treze grupos de rota no mesmo arquivo. O problema
  não era o tamanho: era que qualquer rota precisava importar o módulo que
  monta a aplicação, o que fecha um ciclo de import ao primeiro `from .main`.

  O financeiro é outro caso: é um pacote à parte (`backend/financeiro`), que
  não importa nada daqui e serve a outros sistemas. Entra pela única porta
  `integracao_financeiro.py`.

Substitua por inteiro quando o FastAPI real chegar.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from financeiro import tarefas as tarefas_financeiro

from . import clipes, db, integracao_financeiro, registro
from .alertas import central
from .comum import TABELA_EVENTOS, TABELA_POLITICA
from .rotas import (
    acompanhantes,
    analytics,
    auditoria,
    autenticacao,
    cameras,
    clinica,
    compras,
    contratos,
    crm,
    evolucoes,
    familia,
    operacional,
    ocorrencias,
    pacientes,
    painel,
    permissoes,
    prescricoes,
    risco_queda,
    riscos,
    saude,
    sensores,
    usuarios,
)

# O uvicorn configura apenas os loggers dele. Sem isto, todo logger.info deste
# backend vai para o vazio -- inclusive o registro de falso positivo da RN14,
# que ficaria com o comentário prometendo uma trilha que não existia.
# Log estruturado em JSON por padrão (LOG_FORMATO=texto para o legível), com
# o mesmo formato do serviço de visão.
registro.configurar()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.abrir_pool()
    db.executar(TABELA_POLITICA)
    db.executar(TABELA_EVENTOS)
    # Módulo financeiro: schema próprio (`financeiro`), migrações próprias.
    integracao_financeiro.preparar()
    # A rota que registra a ocorrência é síncrona e roda em threadpool. Sem
    # esta referência ela não teria como agendar o envio no event loop.
    central.registrar_loop(asyncio.get_running_loop())
    # Retenção de 24 h dos clipes (RNF05, RN09): roda no boot e de hora em
    # hora, independentemente de o serviço de visão estar no ar.
    expurgo = asyncio.create_task(clipes.laco_de_expurgo())
    # Contas recorrentes (aluguel, mensalidade) aparecem em contas a pagar e a
    # receber sem ninguém precisar lembrar de gerá-las.
    recorrencias = asyncio.create_task(tarefas_financeiro.laco_de_recorrencias(integracao_financeiro.banco))
    yield
    recorrencias.cancel()
    expurgo.cancel()
    db.fechar_pool()


app = FastAPI(title="MedSignal — backend mínimo", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:8080"
    ).split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def erro_no_formato_do_frontend(_: Request, exc: HTTPException):
    """O frontend lê `payload.error`; o FastAPI devolveria `detail`.

    Sem esta tradução toda mensagem viraria o genérico "Erro inesperado."
    na tela de login.
    """
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


# A ordem aqui é só de leitura: o FastAPI casa a rota pelo caminho, não pela
# ordem de inclusão. As tags agrupam o /docs por domínio.
app.include_router(painel.router, tags=["painel"])
app.include_router(autenticacao.router, tags=["autenticação"])
app.include_router(permissoes.router, tags=["permissões"])
app.include_router(usuarios.router, tags=["usuários"])
app.include_router(auditoria.router, tags=["auditoria"])
app.include_router(cameras.router, tags=["câmeras"])
app.include_router(clinica.router, tags=["clínica"])
app.include_router(ocorrencias.router, tags=["ocorrências"])
app.include_router(pacientes.router, tags=["pacientes"])
app.include_router(acompanhantes.router, tags=["acompanhantes"])
app.include_router(familia.router, tags=["portal da família"])
app.include_router(contratos.router, tags=["contratos"])
app.include_router(compras.router, tags=["compras"])
app.include_router(analytics.router, tags=["analytics"])
app.include_router(crm.router, tags=["crm"])
app.include_router(operacional.router, tags=["operacional"])
app.include_router(risco_queda.router, tags=["risco de queda"])
app.include_router(sensores.router, tags=["sensores"])
app.include_router(evolucoes.router, tags=["evoluções"])
app.include_router(riscos.router, tags=["alergias e riscos"])
app.include_router(prescricoes.router, tags=["prescrições"])
app.include_router(saude.router, tags=["saúde"])
# Módulo financeiro (backend/financeiro), montado pelo adaptador. As tags de
# cada área vêm do próprio módulo.
app.include_router(integracao_financeiro.router)
