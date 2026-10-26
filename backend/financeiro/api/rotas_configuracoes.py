"""Sessão, empresa, fechamento de período, auditoria, feriados e tabelas de imposto."""

from __future__ import annotations

from fastapi import Depends

from .. import __version__
from ..acesso import ACOES, RECURSOS
from ..dominio.demonstrativos import ATIVIDADES, GRUPOS
from ..servicos import organizacao, pessoal
from ..servicos.contexto import Contexto
from .base import novo_router
from .esquemas import FechamentoEntrada, FeriadoEntrada, OrganizacaoEntrada, TabelaFiscalEntrada

QUALQUER_LEITURA = tuple(f"{r}:ver" for r in RECURSOS)


def criar(pode, contexto):
    r = novo_router()

    @r.get("/sessao", summary="Quem está operando, a empresa e o que pode fazer")
    def sessao(ctx: Contexto = Depends(contexto)):
        org = organizacao.obter(ctx)
        return {
            "versao": __version__,
            "hoje": ctx.hoje,
            "usuario": {"ref": ctx.operador.usuario_ref, "nome": ctx.operador.usuario_nome},
            "organizacao": {"id": org["id"], "nome": org["nome"], "fechado_ate": org["fechado_ate"]},
            "permissoes": sorted(ctx.operador.permissoes),
            "recursos": [{"chave": k, "descricao": v} for k, v in RECURSOS.items()],
            "acoes": list(ACOES),
        }

    @r.get("/grupos", summary="Grupos do plano de contas e onde cada um cai na DRE")
    def grupos(ctx: Contexto = Depends(pode(*QUALQUER_LEITURA))):
        return {
            "grupos": [
                {"chave": g.chave, "rotulo": g.rotulo, "natureza": g.natureza,
                 "linha_dre": g.linha_dre, "atividade": g.atividade}
                for g in GRUPOS.values()
            ],
            "atividades": ATIVIDADES,
        }

    @r.get("/organizacao")
    def obter(ctx: Contexto = Depends(pode("configuracoes:ver", "relatorios:ver", "pessoal:ver"))):
        return organizacao.obter(ctx)

    @r.patch("/organizacao")
    def atualizar(entrada: OrganizacaoEntrada, ctx: Contexto = Depends(pode("configuracoes:editar"))):
        return organizacao.atualizar(ctx, entrada.campos())

    @r.post("/organizacao/fechamento", summary="Fecha (ou reabre) o período até o fim do mês informado")
    def fechamento(entrada: FechamentoEntrada, ctx: Contexto = Depends(pode("configuracoes:editar"))):
        return organizacao.alterar_fechamento(ctx, entrada.fechado_ate, entrada.motivo)

    @r.get("/auditoria")
    def auditoria(
        tabela: str | None = None,
        registroId: str | None = None,
        limite: int = 100,
        ctx: Contexto = Depends(pode("configuracoes:ver")),
    ):
        return organizacao.auditoria(ctx, tabela, registroId, limite)

    @r.get("/feriados")
    def feriados(ano: int | None = None, ctx: Contexto = Depends(pode(*QUALQUER_LEITURA))):
        return organizacao.listar_feriados(ctx, ano or ctx.hoje.year)

    @r.post("/feriados", status_code=201)
    def criar_feriado(entrada: FeriadoEntrada, ctx: Contexto = Depends(pode("cadastros:criar", "configuracoes:editar"))):
        return organizacao.criar_feriado(ctx, entrada.data, entrada.nome)

    @r.delete("/feriados/{feriado_id}")
    def remover_feriado(feriado_id: str, ctx: Contexto = Depends(pode("cadastros:excluir", "configuracoes:editar"))):
        organizacao.remover_feriado(ctx, feriado_id)
        return {"ok": True}

    @r.get("/tabelas-fiscais", summary="Tabelas de INSS e IRRF, oficiais e da empresa")
    def tabelas(ctx: Contexto = Depends(pode("configuracoes:ver", "pessoal:ver"))):
        return pessoal.listar_tabelas(ctx)

    @r.post("/tabelas-fiscais", status_code=201)
    def criar_tabela(entrada: TabelaFiscalEntrada, ctx: Contexto = Depends(pode("configuracoes:editar"))):
        return pessoal.criar_tabela(ctx, entrada.campos())

    return r
