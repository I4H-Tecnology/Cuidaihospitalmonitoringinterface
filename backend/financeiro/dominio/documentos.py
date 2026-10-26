"""CPF e CNPJ: normalização e dígito verificador.

O CNPJ passou a ser alfanumérico em julho de 2026 (IN RFB nº 2.229/2024): as
doze primeiras posições podem ter letras maiúsculas, os dois dígitos
verificadores continuam numéricos. O cálculo é o mesmo módulo 11 de sempre,
só que cada caractere vale o seu código ASCII menos 48 — por isso '0'..'9'
continuam valendo 0..9 e 'A' vale 17. Um validador que só aceita dígitos
recusaria toda empresa aberta a partir de agora.

Exemplo oficial da Receita: 12.ABC.345/01DE-35.
"""

from __future__ import annotations

import re

_SO_CNPJ = re.compile(r"^[0-9A-Z]{12}[0-9]{2}$")
_SO_CPF = re.compile(r"^[0-9]{11}$")


def normalizar(documento: str | None) -> str | None:
    """Tira pontuação e espaços; letras ficam maiúsculas. Vazio vira None."""
    if documento is None:
        return None
    limpo = re.sub(r"[^0-9A-Za-z]", "", documento).upper()
    return limpo or None


def _dv_modulo_11(valores: list[int], pesos: list[int]) -> int:
    resto = sum(v * p for v, p in zip(valores, pesos)) % 11
    return 0 if resto < 2 else 11 - resto


def cpf_valido(cpf: str) -> bool:
    cpf = normalizar(cpf) or ""
    if not _SO_CPF.match(cpf) or cpf == cpf[0] * 11:
        # 111.111.111-11 passa no módulo 11 e não é CPF de ninguém.
        return False
    numeros = [int(c) for c in cpf]
    dv1 = _dv_modulo_11(numeros[:9], list(range(10, 1, -1)))
    dv2 = _dv_modulo_11(numeros[:9] + [dv1], list(range(11, 1, -1)))
    return numeros[9] == dv1 and numeros[10] == dv2


def cnpj_valido(cnpj: str) -> bool:
    cnpj = normalizar(cnpj) or ""
    if not _SO_CNPJ.match(cnpj) or cnpj == cnpj[0] * 14:
        return False
    valores = [ord(c) - 48 for c in cnpj]
    pesos_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    pesos_2 = [6] + pesos_1
    dv1 = _dv_modulo_11(valores[:12], pesos_1)
    dv2 = _dv_modulo_11(valores[:12] + [dv1], pesos_2)
    return valores[12] == dv1 and valores[13] == dv2


def tipo_do_documento(documento: str | None) -> str | None:
    """'cpf', 'cnpj' ou None quando não é nenhum dos dois válido."""
    doc = normalizar(documento)
    if not doc:
        return None
    if len(doc) == 11 and cpf_valido(doc):
        return "cpf"
    if len(doc) == 14 and cnpj_valido(doc):
        return "cnpj"
    return None


def formatar(documento: str | None) -> str:
    doc = normalizar(documento) or ""
    if len(doc) == 11:
        return f"{doc[:3]}.{doc[3:6]}.{doc[6:9]}-{doc[9:]}"
    if len(doc) == 14:
        return f"{doc[:2]}.{doc[2:5]}.{doc[5:8]}/{doc[8:12]}-{doc[12:]}"
    return doc
