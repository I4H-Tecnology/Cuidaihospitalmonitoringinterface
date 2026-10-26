"""O módulo financeiro como serviço próprio, para sistemas que não são Python.

Um Laravel, um Node ou qualquer outro sistema autentica o usuário do jeito
dele e emite um JWT assinado com o segredo compartilhado. O financeiro só
confere a assinatura e lê os claims — não tem tela de login nem cadastro de
usuário, e é por isso que serve a qualquer sistema.

    uvicorn financeiro.servidor:app --port 8100

Variáveis de ambiente:

    FINANCEIRO_DATABASE_URL      postgresql://usuario:senha@host:5432/banco   (obrigatória)
    FINANCEIRO_JWT_SEGREDO       segredo compartilhado (HS256) ou chave pública (RS256) (obrigatória)
    FINANCEIRO_JWT_ALGORITMO     HS256 (padrão) ou RS256
    FINANCEIRO_JWT_EMISSOR       `iss` esperado (opcional)
    FINANCEIRO_JWT_AUDIENCIA     `aud` esperado (opcional)
    FINANCEIRO_CORS              origens liberadas, separadas por vírgula
    FINANCEIRO_MIGRAR            1 (padrão) aplica as migrações na subida

Claims do token:

    sub          id do usuário no sistema de origem          (obrigatório)
    nome         nome do usuário, para a auditoria
    org          id da empresa no sistema de origem           (obrigatório)
    org_nome     nome da empresa, usado na primeira vez
    permissoes   ["operacao:ver", "operacao:criar", ...] ou ["*"] para tudo
    exp          expiração                                     (obrigatório)
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg_pool import ConnectionPool

from . import __version__, tarefas
from .acesso import ACOES, RECURSOS, Operador, todas_as_permissoes
from .api import criar_router
from .banco import Banco
from .migracoes import migrar


def _obrigatoria(nome: str) -> str:
    valor = os.environ.get(nome, "").strip()
    if not valor:
        raise RuntimeError(f"Defina {nome} para subir o financeiro como serviço.")
    return valor


DSN = _obrigatoria("FINANCEIRO_DATABASE_URL")
SEGREDO = _obrigatoria("FINANCEIRO_JWT_SEGREDO")
ALGORITMO = os.environ.get("FINANCEIRO_JWT_ALGORITMO", "HS256")
EMISSOR = os.environ.get("FINANCEIRO_JWT_EMISSOR") or None
AUDIENCIA = os.environ.get("FINANCEIRO_JWT_AUDIENCIA") or None
if ALGORITMO not in ("HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256"):
    raise RuntimeError(f"Algoritmo de JWT não suportado: {ALGORITMO}")

pool = ConnectionPool(DSN, min_size=1, max_size=int(os.environ.get("FINANCEIRO_POOL", "10")), open=False)
banco = Banco(pool)
_bearer = HTTPBearer(auto_error=False)
_VALIDAS = {f"{r}:{a}" for r in RECURSOS for a in ACOES}


def obter_operador(credencial: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Operador:
    if credencial is None or not credencial.credentials:
        raise HTTPException(401, "Autenticação obrigatória.")
    try:
        carga = jwt.decode(
            credencial.credentials,
            SEGREDO,
            algorithms=[ALGORITMO],
            issuer=EMISSOR,
            audience=AUDIENCIA,
            options={"require": ["exp", "sub"], "verify_aud": AUDIENCIA is not None},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessão expirada.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido.")
    org = str(carga.get("org") or "").strip()
    if not org:
        raise HTTPException(401, "O token não diz de qual empresa é o usuário (claim 'org').")
    pedidas = carga.get("permissoes") or []
    if not isinstance(pedidas, list):
        raise HTTPException(401, "Claim 'permissoes' deve ser uma lista.")
    permissoes = todas_as_permissoes() if "*" in pedidas else frozenset(p for p in pedidas if p in _VALIDAS)
    return Operador(
        usuario_ref=str(carga["sub"]),
        usuario_nome=str(carga.get("nome") or carga["sub"]),
        organizacao_ref=org,
        organizacao_nome=str(carga.get("org_nome") or org),
        permissoes=permissoes,
    )


@asynccontextmanager
async def ciclo(_: FastAPI):
    pool.open()
    pool.wait(timeout=30)
    if os.environ.get("FINANCEIRO_MIGRAR", "1") == "1":
        migrar(pool)
    tarefa = asyncio.create_task(tarefas.laco_de_recorrencias(banco))
    yield
    tarefa.cancel()
    pool.close()


app = FastAPI(title="Financeiro", version=__version__, lifespan=ciclo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("FINANCEIRO_CORS", "").split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(HTTPException)
async def erro(_: Request, exc: HTTPException):
    # Mesmo envelope do MedSignal: {"error": "mensagem"}.
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.get("/health")
def saude():
    with banco.ler() as db:
        versao = db.valor("SELECT max(versao) FROM financeiro.migracao")
    return {"status": "ok", "versao": __version__, "migracao": versao}


app.include_router(criar_router(banco, obter_operador))
