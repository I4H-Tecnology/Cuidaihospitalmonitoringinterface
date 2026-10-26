"""Peças comuns da API: formato de resposta, erros e tipos de entrada.

Formato da resposta, igual em todas as rotas:
  - chaves em camelCase (o padrão de quem consome em JavaScript);
  - dinheiro como TEXTO ("1234.56"). Número em JSON vira float no navegador,
    e float é exatamente o que o módulo inteiro evita;
  - datas em ISO (AAAA-MM-DD).

Erro de regra de negócio sai como HTTPException com a mensagem do serviço. O
hospedeiro decide o envelope (o MedSignal devolve {"error": ...}); o modo
serviço devolve o mesmo formato.
"""

from __future__ import annotations

import functools
import inspect
import json
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Callable
from uuid import UUID

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, BeforeValidator, ConfigDict
from pydantic.alias_generators import to_camel

from ..dominio.calendario import ler_competencia
from ..erros import ErroFinanceiro

_MAIUSCULA = re.compile(r"_([a-z0-9])")


def camel(texto: str) -> str:
    return _MAIUSCULA.sub(lambda m: m.group(1).upper(), texto)


def _preparar(valor: Any) -> Any:
    if isinstance(valor, dict):
        return {camel(k) if isinstance(k, str) else str(k): _preparar(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple, set, frozenset)):
        return [_preparar(v) for v in valor]
    if isinstance(valor, Decimal):
        return format(valor, "f")
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, UUID):
        return str(valor)
    return valor


class RespostaFinanceira(JSONResponse):
    def render(self, content: Any) -> bytes:
        return json.dumps(_preparar(content), ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class RotaFinanceira(APIRoute):
    """Rota que traduz os erros do módulo em HTTP e serializa do jeito do módulo.

    Fica na rota, e não num exception_handler da aplicação, porque o módulo
    não é dono da aplicação: montado no MedSignal ou em outro sistema, ele
    traz a própria tradução junto.

    O endpoint é embrulhado para devolver a RespostaFinanceira já pronta: sem
    isso, o FastAPI passa o retorno pelo `jsonable_encoder`, que converte
    Decimal em float ANTES da classe de resposta — e o dinheiro sairia
    "1234.5" como número, exatamente o que o módulo inteiro evita.
    """

    def __init__(self, path: str, endpoint: Callable, **kwargs: Any) -> None:
        status = kwargs.get("status_code") or 200
        original = endpoint
        if inspect.iscoroutinefunction(original):
            @functools.wraps(original)
            async def embrulho(*args: Any, **kw: Any) -> Any:
                resultado = await original(*args, **kw)
                return resultado if isinstance(resultado, Response) else RespostaFinanceira(resultado, status_code=status)
        else:
            @functools.wraps(original)
            def embrulho(*args: Any, **kw: Any) -> Any:
                resultado = original(*args, **kw)
                return resultado if isinstance(resultado, Response) else RespostaFinanceira(resultado, status_code=status)
        super().__init__(path, embrulho, **kwargs)

    def get_route_handler(self) -> Callable:
        original = super().get_route_handler()

        async def tratador(request: Request) -> Response:
            try:
                return await original(request)
            except ErroFinanceiro as exc:
                raise HTTPException(exc.status, exc.mensagem) from exc

        return tratador


def novo_router():
    """Sub-router com a tradução de erro e o formato de resposta do módulo."""
    from fastapi import APIRouter

    return APIRouter(route_class=RotaFinanceira, default_response_class=RespostaFinanceira)


class Entrada(BaseModel):
    """Base de todo corpo de requisição: aceita camelCase, trabalha em snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    def campos(self) -> dict:
        """Só os campos que vieram — é o que dá semântica de PATCH."""
        return self.model_dump(exclude_unset=True)


def _competencia(valor: Any) -> Any:
    if isinstance(valor, str) and re.fullmatch(r"\d{4}-\d{2}", valor.strip()):
        return ler_competencia(valor)
    return valor


# 'AAAA-MM' ou uma data qualquer do mês.
Competencia = Annotated[date, BeforeValidator(_competencia)]


def competencia_da_query(valor: str | None, padrao: date | None = None) -> date | None:
    if not valor:
        return padrao
    try:
        return ler_competencia(valor[:7])
    except ValueError as exc:
        raise HTTPException(422, "Competência inválida. Use AAAA-MM.") from exc
