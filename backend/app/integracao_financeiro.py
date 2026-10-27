"""Liga o módulo financeiro (backend/financeiro) ao MedSignal.

É o ÚNICO arquivo do MedSignal que conhece o módulo — e o módulo não conhece
nenhum arquivo do MedSignal. O contrato entre os dois é pequeno:

  1. o MedSignal empresta o pool do Postgres (`db.pool`);
  2. o MedSignal diz quem está chamando: o `Operador`, montado a partir do
     usuário do token e do perfil dele no banco.

O resto — schema, migrações, rotas, regras, auditoria — é do módulo. Trocar o
financeiro de sistema é reescrever este arquivo, não o módulo.

Permissões: o financeiro fala em recursos ("operacao", "pessoal"...); o
MedSignal fala em módulos do RBAC. A tradução é o mapa abaixo, com três
módulos novos na tela de permissões:

  finance        o dia a dia: contas a pagar e a receber, caixa, cadastros,
                 orçamento e relatórios
  payroll        colaboradores e folha — salário é dado pessoal (LGPD), por
                 isso é separado do financeiro do dia a dia
  finance_admin  capital (sócios, empréstimos, patrimônio) e configurações
                 (fechamento de período, tabelas de imposto, auditoria)
"""

from __future__ import annotations

from fastapi import Depends

from financeiro.acesso import ACOES, RECURSOS, Operador
from financeiro.api import criar_router
from financeiro.banco import Banco
from financeiro.migracoes import migrar

from . import db
from .comum import logger
from .seguranca import UsuarioAutenticado, permissoes_do_perfil, usuario_atual

MODULO_DO_RECURSO = {
    "operacao": "finance",
    "cadastros": "finance",
    "planejamento": "finance",
    "relatorios": "finance",
    "pessoal": "payroll",
    "capital": "finance_admin",
    "configuracoes": "finance_admin",
}
ACAO_DO_RBAC = {"ver": "view", "criar": "create", "editar": "edit", "excluir": "delete"}

# Recurso novo no módulo sem módulo correspondente aqui ficaria inacessível
# para todo mundo, em silêncio. Melhor não subir.
if set(MODULO_DO_RECURSO) != set(RECURSOS) or set(ACAO_DO_RBAC) != set(ACOES):
    raise RuntimeError("O mapa de permissões do financeiro está desatualizado em integracao_financeiro.py.")

banco = Banco(db.pool)


def operador(usuario: UsuarioAutenticado = Depends(usuario_atual)) -> Operador:
    """O usuário do MedSignal visto pelo financeiro. A empresa é a clínica do token."""
    perfil = permissoes_do_perfil(usuario)
    permissoes = frozenset(
        f"{recurso}:{acao}"
        for recurso, modulo in MODULO_DO_RECURSO.items()
        for acao, acao_rbac in ACAO_DO_RBAC.items()
        if (perfil.get(modulo) or {}).get(acao_rbac)
    )
    clinica = db.buscar_um("SELECT nome FROM clinica WHERE id = %s", (usuario.clinica_id,))
    return Operador(
        usuario_ref=usuario.id,
        usuario_nome=usuario.nome,
        organizacao_ref=usuario.clinica_id,
        organizacao_nome=(clinica or {}).get("nome") or usuario.tenant,
        permissoes=permissoes,
    )


router = criar_router(banco, operador)


def preparar() -> None:
    """Na subida da API: cria ou atualiza o schema `financeiro`."""
    aplicadas = migrar(db.pool)
    if aplicadas:
        logger.info("Financeiro: migrações aplicadas: %s", ", ".join(aplicadas))
