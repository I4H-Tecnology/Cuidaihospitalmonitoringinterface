"""Conciliação bancária: casar cada linha do extrato com o que foi lançado.

A regra é conservadora de propósito. O valor precisa ser IGUAL ao centavo —
valor parecido não é o mesmo pagamento — e a data precisa estar perto. Dentro
disso, a descrição e o número do documento desempatam. O resultado é sempre
SUGESTÃO: quem confirma é a pessoa. Conciliação automática errada esconde
exatamente o erro que a conciliação existe para achar.

Dois tipos de candidato:
  movimento  algo que já saiu ou entrou no caixa pelo sistema (baixa lançada);
  parcela    uma conta em aberto que o extrato mostra que foi paga — confirmar
             a sugestão registra a baixa na data do banco.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

JANELA_MOVIMENTO = 3  # dias entre o lançamento e o banco
JANELA_PARCELA = 7  # vencimento x pagamento: boleto pago uns dias antes ou depois
PONTUACAO_MINIMA = 30

_PALAVRAS_VAZIAS = {
    "pix", "ted", "doc", "tev", "pagamento", "pagto", "pgto", "transf", "transferencia",
    "recebido", "recebida", "enviado", "enviada", "compra", "debito", "credito", "boleto",
    "conta", "cartao", "ltda", "eireli", "com", "para", "dos", "das", "the",
}


@dataclass(frozen=True)
class LinhaDoBanco:
    id: str
    data: date
    valor: Decimal  # com sinal
    descricao: str
    documento: str | None = None


@dataclass(frozen=True)
class Candidato:
    id: str
    tipo: str  # movimento | parcela
    data: date  # data do movimento, ou vencimento da parcela
    valor: Decimal  # com o mesmo sinal que teria no extrato
    descricao: str
    documento: str | None = None


@dataclass
class Sugestao:
    candidato: Candidato
    pontuacao: int
    motivos: list[str] = field(default_factory=list)


def palavras(texto: str | None) -> set[str]:
    sem_acento = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    return {p for p in re.findall(r"[a-z0-9]+", sem_acento.lower()) if len(p) >= 3 and p not in _PALAVRAS_VAZIAS}


def pontuar(linha: LinhaDoBanco, cand: Candidato) -> Sugestao | None:
    if cand.valor != linha.valor:
        return None
    distancia = abs((linha.data - cand.data).days)
    janela = JANELA_MOVIMENTO if cand.tipo == "movimento" else JANELA_PARCELA
    if distancia > janela:
        return None

    motivos = ["mesmo valor"]
    pontos = {0: 50, 1: 40, 2: 30, 3: 20}.get(distancia, 10)
    motivos.append("mesma data" if distancia == 0 else f"{distancia} dia(s) de diferença")

    a, b = palavras(linha.descricao), palavras(cand.descricao)
    if a and b:
        comuns = a & b
        if comuns:
            pontos += round(40 * len(comuns) / len(a | b))
            motivos.append("descrição parecida")

    if linha.documento and cand.documento and linha.documento.strip() == cand.documento.strip():
        pontos += 20
        motivos.append("mesmo documento")

    if cand.tipo == "movimento":
        # Já lançado no caixa é o par mais provável: a conciliação é só a conferência.
        pontos += 5

    return Sugestao(cand, pontos, motivos)


@dataclass
class ResultadoDaLinha:
    principal: Sugestao | None  # o par exclusivo proposto, se houver
    alternativas: list[Sugestao] = field(default_factory=list)


def sugerir(
    linhas: list[LinhaDoBanco], candidatos: list[Candidato], quantas_alternativas: int = 3
) -> dict[str, ResultadoDaLinha]:
    """Para cada linha, o par proposto e as alternativas.

    O par proposto é escolhido no conjunto, do mais forte para o mais fraco:
    dois lançamentos iguais no extrato não podem os dois casar com o mesmo
    movimento. As alternativas ficam para a pessoa escolher outra.
    """
    todas: dict[str, list[Sugestao]] = {}
    pares: list[tuple[int, str, str]] = []
    for linha in linhas:
        lista = [s for s in (pontuar(linha, c) for c in candidatos) if s and s.pontuacao >= PONTUACAO_MINIMA]
        lista.sort(key=lambda s: (-s.pontuacao, s.candidato.data, s.candidato.id))
        todas[linha.id] = lista
        pares.extend((s.pontuacao, linha.id, s.candidato.id) for s in lista)

    escolhido: dict[str, str] = {}
    usados: set[str] = set()
    for _, linha_id, cand_id in sorted(pares, key=lambda p: (-p[0], p[1], p[2])):
        if linha_id in escolhido or cand_id in usados:
            continue
        escolhido[linha_id] = cand_id
        usados.add(cand_id)

    saida: dict[str, ResultadoDaLinha] = {}
    for linha in linhas:
        lista = todas[linha.id]
        principal_id = escolhido.get(linha.id)
        principal = next((s for s in lista if s.candidato.id == principal_id), None)
        # Alternativas: o que sobrou, sem o que já é par proposto de outra linha.
        resto = [s for s in lista if s.candidato.id != principal_id and s.candidato.id not in usados]
        saida[linha.id] = ResultadoDaLinha(principal, resto[:quantas_alternativas])
    return saida
