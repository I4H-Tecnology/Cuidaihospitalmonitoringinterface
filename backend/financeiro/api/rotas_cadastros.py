"""Contas, plano de contas, centros de custo, pessoas e recorrências."""

from __future__ import annotations

from datetime import date

from fastapi import Depends

from ..servicos import cadastros, recorrencias
from ..servicos.contexto import Contexto
from .base import novo_router
from .esquemas import (
    CategoriaEntrada,
    CentroEntrada,
    ContaEntrada,
    GerarEntrada,
    ImportarPessoasEntrada,
    PessoaEntrada,
    RecorrenciaEntrada,
)
from .rotas_configuracoes import QUALQUER_LEITURA


def criar(pode):
    r = novo_router()

    # ------------------------------------------------------------ contas
    @r.get("/contas", summary="Contas com o saldo na data")
    def contas(data: date | None = None, incluirInativas: bool = True, ctx: Contexto = Depends(pode(*QUALQUER_LEITURA))):
        return cadastros.listar_contas(ctx, data, incluirInativas)

    @r.post("/contas", status_code=201)
    def criar_conta(entrada: ContaEntrada, ctx: Contexto = Depends(pode("cadastros:criar"))):
        return cadastros.criar_conta(ctx, entrada.campos())

    @r.patch("/contas/{conta_id}")
    def editar_conta(conta_id: str, entrada: ContaEntrada, ctx: Contexto = Depends(pode("cadastros:editar"))):
        return cadastros.editar_conta(ctx, conta_id, entrada.campos())

    # ------------------------------------------------------------ categorias
    @r.get("/categorias")
    def categorias(incluirInativas: bool = True, ctx: Contexto = Depends(pode(*QUALQUER_LEITURA))):
        return cadastros.listar_categorias(ctx, incluirInativas)

    @r.post("/categorias", status_code=201)
    def criar_categoria(entrada: CategoriaEntrada, ctx: Contexto = Depends(pode("cadastros:criar"))):
        return cadastros.criar_categoria(ctx, entrada.campos())

    @r.patch("/categorias/{categoria_id}")
    def editar_categoria(categoria_id: str, entrada: CategoriaEntrada, ctx: Contexto = Depends(pode("cadastros:editar"))):
        return cadastros.editar_categoria(ctx, categoria_id, entrada.campos())

    # ------------------------------------------------------------ centros de custo
    @r.get("/centros-custo")
    def centros(incluirInativos: bool = True, ctx: Contexto = Depends(pode(*QUALQUER_LEITURA))):
        return cadastros.listar_centros(ctx, incluirInativos)

    @r.post("/centros-custo", status_code=201)
    def criar_centro(entrada: CentroEntrada, ctx: Contexto = Depends(pode("cadastros:criar"))):
        return cadastros.salvar_centro(ctx, entrada.campos())

    @r.patch("/centros-custo/{centro_id}")
    def editar_centro(centro_id: str, entrada: CentroEntrada, ctx: Contexto = Depends(pode("cadastros:editar"))):
        return cadastros.salvar_centro(ctx, entrada.campos(), centro_id)

    # ------------------------------------------------------------ pessoas
    @r.get("/pessoas", summary="Clientes, fornecedores, colaboradores e sócios")
    def pessoas(
        busca: str | None = None,
        papel: str | None = None,
        incluirInativas: bool = False,
        limite: int = 50,
        deslocamento: int = 0,
        ctx: Contexto = Depends(pode(*QUALQUER_LEITURA)),
    ):
        return cadastros.listar_pessoas(ctx, busca, papel, incluirInativas, limite, deslocamento)

    @r.get("/pessoas/{pessoa_id}")
    def pessoa(pessoa_id: str, ctx: Contexto = Depends(pode(*QUALQUER_LEITURA))):
        return cadastros.obter_pessoa(ctx, pessoa_id)

    # Cadastrar o fornecedor na hora de lançar a conta é o caminho mais comum:
    # quem pode lançar pode cadastrar a outra ponta.
    @r.post("/pessoas", status_code=201)
    def criar_pessoa(entrada: PessoaEntrada, ctx: Contexto = Depends(pode("cadastros:criar", "operacao:criar"))):
        return cadastros.criar_pessoa(ctx, entrada.campos())

    @r.patch("/pessoas/{pessoa_id}")
    def editar_pessoa(pessoa_id: str, entrada: PessoaEntrada, ctx: Contexto = Depends(pode("cadastros:editar"))):
        return cadastros.editar_pessoa(ctx, pessoa_id, entrada.campos())

    @r.post("/pessoas/importar", summary="Traz cadastros do sistema hospedeiro como clientes (idempotente)")
    def importar(entrada: ImportarPessoasEntrada, ctx: Contexto = Depends(pode("cadastros:criar"))):
        return cadastros.importar_pessoas_externas(ctx, [p.campos() for p in entrada.pessoas])

    # ------------------------------------------------------------ recorrências
    @r.get("/recorrencias")
    def listar_recorrencias(ctx: Contexto = Depends(pode("cadastros:ver", "operacao:ver"))):
        return recorrencias.listar(ctx)

    @r.post("/recorrencias", status_code=201)
    def criar_recorrencia(entrada: RecorrenciaEntrada, ctx: Contexto = Depends(pode("cadastros:criar", "operacao:criar"))):
        return recorrencias.criar(ctx, entrada.campos())

    @r.patch("/recorrencias/{rec_id}")
    def editar_recorrencia(rec_id: str, entrada: RecorrenciaEntrada, ctx: Contexto = Depends(pode("cadastros:editar", "operacao:editar"))):
        return recorrencias.editar(ctx, rec_id, entrada.campos())

    @r.post("/recorrencias/gerar", summary="Gera as contas das recorrências até a data (padrão: 60 dias)")
    def gerar(entrada: GerarEntrada, ctx: Contexto = Depends(pode("operacao:criar"))):
        return recorrencias.gerar(ctx, entrada.ate)

    return r
