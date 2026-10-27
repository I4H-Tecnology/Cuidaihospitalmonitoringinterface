"""O que toda chamada de serviço carrega: o banco, quem opera e de qual empresa."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from ..acesso import Operador
from ..banco import Banco


@dataclass(frozen=True)
class Contexto:
    banco: Banco
    operador: Operador
    org_id: str  # id de financeiro.organizacao (não a chave do hospedeiro)
    hoje: date

    def ler(self):
        return self.banco.ler()

    def escrever(self, motivo: str | None = None):
        return self.banco.escrever(self.operador, motivo)

    @property
    def autor(self) -> str:
        return self.operador.usuario_nome
