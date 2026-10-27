"""Acesso do módulo ao Postgres.

O pool é emprestado pelo hospedeiro (no MedSignal, o mesmo da API). Duas
portas de entrada:

    with banco.ler() as db:                    leitura
        db.todos("SELECT ...", (...))

    with banco.escrever(operador) as db:       escrita: tudo ou nada
        db.executar("INSERT ...", (...))

`escrever` abre UMA transação e grava quem está operando em variáveis dela;
o gatilho de auditoria lê essas variáveis. Assim a trilha sempre sabe quem
foi, sem cada função de serviço precisar lembrar de registrar.

Erro de banco não sai daqui como erro de banco: violação de regra vira
`RegraDeNegocio` ou `Conflito` com mensagem para a tela. O mapa de mensagens
está no fim deste arquivo, indexado pelo nome da constraint.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg import errors
from psycopg.rows import dict_row

from .acesso import Operador
from .erros import Conflito, RegraDeNegocio


class Consulta:
    """Um cursor com os três jeitos de perguntar que o módulo usa."""

    def __init__(self, cursor: psycopg.Cursor):
        self.cursor = cursor

    def um(self, sql: str, params: tuple | dict = ()) -> dict | None:
        self.cursor.execute(sql, params)
        return self.cursor.fetchone()

    def todos(self, sql: str, params: tuple | dict = ()) -> list[dict]:
        self.cursor.execute(sql, params)
        return self.cursor.fetchall()

    def valor(self, sql: str, params: tuple | dict = ()) -> Any:
        linha = self.um(sql, params)
        return None if linha is None else next(iter(linha.values()))

    def executar(self, sql: str, params: tuple | dict = ()) -> int:
        self.cursor.execute(sql, params)
        return self.cursor.rowcount


class Banco:
    def __init__(self, pool):
        self.pool = pool

    @contextmanager
    def ler(self) -> Iterator[Consulta]:
        try:
            with self.pool.connection() as conn:
                with conn.cursor(row_factory=dict_row) as cur:
                    yield Consulta(cur)
        except psycopg.Error as exc:
            raise traduzir(exc) from exc

    @contextmanager
    def escrever(self, operador: Operador, motivo: str | None = None) -> Iterator[Consulta]:
        try:
            with self.pool.connection() as conn:
                with conn.transaction():
                    with conn.cursor(row_factory=dict_row) as cur:
                        cur.execute(
                            "SELECT set_config('financeiro.usuario_ref', %s, true),"
                            "       set_config('financeiro.usuario_nome', %s, true),"
                            "       set_config('financeiro.motivo', %s, true)",
                            (operador.usuario_ref, operador.usuario_nome, motivo or ""),
                        )
                        yield Consulta(cur)
        except psycopg.Error as exc:
            # Inclui o que só estoura no COMMIT: as somas do título são
            # conferidas por gatilho DEFERRABLE, no fim da transação.
            raise traduzir(exc) from exc


def traduzir(exc: psycopg.Error) -> Exception:
    """Erro do Postgres -> erro do módulo, com mensagem para quem usa a tela."""
    diag = getattr(exc, "diag", None)
    constraint = getattr(diag, "constraint_name", None) if diag else None

    if isinstance(exc, errors.RaiseException):
        # Os gatilhos do módulo já escrevem a mensagem final.
        return RegraDeNegocio(getattr(diag, "message_primary", None) or str(exc))
    if isinstance(exc, errors.UniqueViolation):
        return Conflito(MENSAGENS.get(constraint, "Já existe um registro com esses dados."))
    if isinstance(exc, errors.ForeignKeyViolation):
        return RegraDeNegocio(
            MENSAGENS.get(constraint, "Registro relacionado não encontrado, ou ainda em uso por outro lançamento.")
        )
    if isinstance(exc, (errors.CheckViolation, errors.NotNullViolation)):
        return RegraDeNegocio(MENSAGENS.get(constraint, "Dado fora das regras do financeiro."))
    if isinstance(exc, errors.InvalidTextRepresentation):
        return RegraDeNegocio("Identificador inválido.")
    return exc


MENSAGENS = {
    "conta_nome_unico": "Já existe uma conta com esse nome.",
    "categoria_nome_unico": "Já existe uma categoria com esse nome neste grupo.",
    "categoria_codigo_unico": "Já existe uma categoria com esse código.",
    "categoria_natureza_do_grupo": "A natureza da categoria não combina com o grupo.",
    "centro_custo_nome_unico": "Já existe um centro de custo com esse nome.",
    "pessoa_documento_unico": "Já existe uma pessoa com esse CPF/CNPJ.",
    "pessoa_referencia_unica": "Essa pessoa já está vinculada a outro cadastro.",
    "pessoa_documento_do_tipo": "CPF é de pessoa física; CNPJ, de jurídica.",
    "titulo_origem_unica": "Esse lançamento já foi gerado.",
    "titulo_cancelamento_coerente": "Cancelamento precisa de motivo.",
    "parcela_nao_paga_a_mais": "O valor pago passa do saldo da parcela.",
    "baixa_efetiva_positiva": "O desconto não pode ser maior que o valor pago.",
    "movimento_um_saldo_inicial": "Esta conta já tem saldo inicial.",
    "feriado_organizacao_id_data_key": "Já existe um feriado nesta data.",
    "colaborador_organizacao_id_pessoa_id_key": "Essa pessoa já é colaboradora.",
    "colaborador_matricula_unica": "Já existe um colaborador com essa matrícula.",
    "colaborador_desligamento_valido": "O desligamento não pode ser antes da admissão.",
    "rubrica_organizacao_id_codigo_key": "Já existe uma rubrica com esse código.",
    "rubrica_deducao_e_desconto": "Só desconto pode deduzir do IRRF.",
    "tabela_fiscal_unica": "Já existe uma tabela desse tipo com essa vigência.",
    "folha_organizacao_id_competencia_tipo_key": "Já existe uma folha desse tipo nessa competência.",
    "socio_organizacao_id_pessoa_id_key": "Essa pessoa já é sócia.",
    "emprestimo_vencimento_depois": "O primeiro vencimento deve ser depois da contratação.",
    "emprestimo_custos_menores": "Os custos iniciais não podem passar do valor emprestado.",
    "ativo_residual_menor": "O valor residual não pode passar do valor de aquisição.",
    "ativo_uso_depois_da_compra": "O início de uso não pode ser antes da aquisição.",
    "ativo_baixa_depois_da_compra": "A baixa não pode ser antes da aquisição.",
    "ativo_terreno_nao_deprecia": "Terreno não deprecia: deixe a vida útil em branco.",
    "orcamento_unico": "Já existe orçamento para essa categoria nesse mês.",
    "extrato_linha_conta_id_identificador_key": "Essa linha do extrato já foi importada.",
    "extrato_movimento_unico": "Esse movimento já está conciliado com outra linha do extrato.",
    "recorrencia_periodo_valido": "O fim da recorrência não pode ser antes do início.",
}
