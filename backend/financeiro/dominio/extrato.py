"""Leitura de extrato bancário: OFX (o arquivo do internet banking) e CSV.

OFX tem duas gerações e os bancos brasileiros mandam as duas:

  1.x  SGML com cabeçalho "OFXHEADER:100", tag de valor sem fechamento
       (<TRNAMT>-50.00 e fim de linha) e, quase sempre, CHARSET:1252.
  2.x  XML de verdade, com fechamento em tudo.

O leitor abaixo não depende de nenhuma das duas estruturas estar perfeita: pega
cada bloco <STMTTRN> e lê as tags de valor por expressão regular. Já vi banco
mandar valor com vírgula decimal e FITID repetido no mesmo arquivo; os dois
casos são tratados, porque a alternativa é conciliar errado em silêncio.

Cada linha sai com um `identificador` estável (o FITID, ou um hash do conteúdo
quando o banco não manda). Com ele, importar o mesmo arquivo duas vezes não
duplica lançamento: o banco de dados recusa o identificador repetido na conta.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from .dinheiro import dinheiro


@dataclass(frozen=True)
class LinhaLida:
    data: date
    valor: Decimal  # positivo entra, negativo sai
    descricao: str
    documento: str | None
    identificador: str


@dataclass
class ExtratoLido:
    banco: str | None = None
    conta: str | None = None
    inicio: date | None = None
    fim: date | None = None
    saldo_final: Decimal | None = None
    data_saldo: date | None = None
    linhas: list[LinhaLida] = field(default_factory=list)


class ExtratoInvalido(ValueError):
    pass


# --------------------------------------------------------------------------
# Texto e valores
# --------------------------------------------------------------------------

def decodificar(conteudo: bytes) -> str:
    cabecalho = conteudo[:2048].decode("ascii", errors="ignore").upper()
    candidatos = ["utf-8", "cp1252", "latin-1"]
    if "CHARSET:1252" in cabecalho or "WINDOWS-1252" in cabecalho or "ISO-8859-1" in cabecalho:
        candidatos = ["cp1252", "utf-8", "latin-1"]
    for codificacao in candidatos:
        try:
            return conteudo.decode(codificacao)
        except UnicodeDecodeError:
            continue
    return conteudo.decode("latin-1", errors="replace")


def ler_valor_texto(texto: str, decimal: str = ",") -> Decimal:
    """'1.234,56', '-1234.56', '(12,00)', '12,00-', 'R$ 5,00 D' -> Decimal com sinal."""
    t = (texto or "").strip().upper().replace("R$", "").replace("\xa0", " ").strip()
    if not t:
        raise ExtratoInvalido("Valor vazio.")
    negativo = False
    # "150,00 D" / "150,00C": sufixo de débito ou crédito, comum em extrato brasileiro.
    sufixo = re.fullmatch(r"(.*\d)\s*([DC])", t)
    if sufixo:
        t = sufixo.group(1).strip()
        negativo = sufixo.group(2) == "D"
    if t.startswith("(") and t.endswith(")"):
        negativo, t = True, t[1:-1]
    if t.endswith("-"):
        negativo, t = True, t[:-1]
    if t.startswith("-"):
        negativo, t = not negativo, t[1:]
    elif t.startswith("+"):
        t = t[1:]
    t = t.replace(" ", "")
    if decimal == ",":
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(",", "")
    try:
        valor = dinheiro(t)
    except (ValueError, InvalidOperation) as exc:
        raise ExtratoInvalido(f"Valor inválido: {texto!r}.") from exc
    return -valor if negativo else valor


def _valor_ofx(texto: str) -> Decimal:
    t = texto.strip()
    # Alguns bancos brasileiros mandam "-123,45" contra a especificação.
    if "," in t and "." not in t:
        t = t.replace(",", ".")
    elif "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".") if t.rfind(",") > t.rfind(".") else t.replace(",", "")
    try:
        return dinheiro(t)
    except (ValueError, InvalidOperation) as exc:
        raise ExtratoInvalido(f"Valor inválido no OFX: {texto!r}.") from exc


def _data_ofx(texto: str) -> date:
    # AAAAMMDD[HHMMSS[.XXX]][[-3:BRT]] — só a data interessa.
    digitos = re.sub(r"\D", "", texto or "")[:8]
    try:
        return datetime.strptime(digitos, "%Y%m%d").date()
    except ValueError as exc:
        raise ExtratoInvalido(f"Data inválida no OFX: {texto!r}.") from exc


def _hash(*partes) -> str:
    return hashlib.sha1("|".join(str(p) for p in partes).encode("utf-8"), usedforsecurity=False).hexdigest()[:20]


# --------------------------------------------------------------------------
# OFX
# --------------------------------------------------------------------------

_TAG = re.compile(r"<([A-Za-z0-9.]+)>([^<\r\n]*)")


def _campos(trecho: str) -> dict[str, str]:
    campos: dict[str, str] = {}
    for nome, valor in _TAG.findall(trecho):
        valor = valor.strip()
        if valor:
            campos.setdefault(nome.upper(), valor)
    return campos


def ler_ofx(conteudo: bytes | str) -> ExtratoLido:
    texto = decodificar(conteudo) if isinstance(conteudo, bytes) else conteudo
    if "<OFX" not in texto.upper():
        raise ExtratoInvalido("O arquivo não parece um OFX (sem a tag <OFX>).")

    geral = _campos(re.split(r"<BANKTRANLIST>", texto, flags=re.I)[0])
    extrato = ExtratoLido(banco=geral.get("BANKID"), conta=geral.get("ACCTID"))

    lista = re.search(r"<BANKTRANLIST>(.*?)(</BANKTRANLIST>|$)", texto, flags=re.I | re.S)
    if lista:
        cabeca = _campos(re.split(r"<STMTTRN>", lista.group(1), flags=re.I)[0])
        if "DTSTART" in cabeca:
            extrato.inicio = _data_ofx(cabeca["DTSTART"])
        if "DTEND" in cabeca:
            extrato.fim = _data_ofx(cabeca["DTEND"])

    saldo = re.search(r"<LEDGERBAL>(.*?)(</LEDGERBAL>|<AVAILBAL>|</STMTRS>|$)", texto, flags=re.I | re.S)
    if saldo:
        campos_saldo = _campos(saldo.group(1))
        if "BALAMT" in campos_saldo:
            extrato.saldo_final = _valor_ofx(campos_saldo["BALAMT"])
        if "DTASOF" in campos_saldo:
            extrato.data_saldo = _data_ofx(campos_saldo["DTASOF"])

    vistos: dict[str, tuple] = {}
    repetidos: dict[tuple, int] = {}
    blocos = re.split(r"<STMTTRN>", texto, flags=re.I)[1:]
    for bloco in blocos:
        trecho = re.split(r"</STMTTRN>|</BANKTRANLIST>", bloco, flags=re.I)[0]
        campos = _campos(trecho)
        if "TRNAMT" not in campos or "DTPOSTED" not in campos:
            continue
        data = _data_ofx(campos["DTPOSTED"])
        valor = _valor_ofx(campos["TRNAMT"])
        descricao = " ".join(
            dict.fromkeys(filter(None, [campos.get("NAME"), campos.get("MEMO"), campos.get("PAYEE")]))
        ).strip() or "(sem descrição)"
        documento = campos.get("CHECKNUM") or campos.get("REFNUM")
        conteudo_linha = (data, valor, descricao, documento)

        identificador = campos.get("FITID")
        if identificador and identificador in vistos and vistos[identificador] != conteudo_linha:
            # FITID repetido para transações diferentes: o arquivo está errado,
            # mas descartar a segunda seria perder um lançamento.
            identificador = f"{identificador}#{_hash(*conteudo_linha)[:8]}"
        if not identificador:
            ordem = repetidos.get(conteudo_linha, 0)
            repetidos[conteudo_linha] = ordem + 1
            # Duas tarifas iguais no mesmo dia são duas linhas: a ordem entra no hash.
            identificador = "h:" + _hash(*conteudo_linha, ordem)
        vistos[identificador] = conteudo_linha
        extrato.linhas.append(LinhaLida(data, valor, descricao[:500], documento, identificador[:120]))

    if not extrato.linhas:
        raise ExtratoInvalido("Nenhum lançamento encontrado no OFX.")
    datas = [linha.data for linha in extrato.linhas]
    extrato.inicio = extrato.inicio or min(datas)
    extrato.fim = extrato.fim or max(datas)
    return extrato


# --------------------------------------------------------------------------
# CSV
# --------------------------------------------------------------------------

def _coluna(cabecalho: list[str], nome: str | int | None) -> int | None:
    if nome is None or nome == "":
        return None
    if isinstance(nome, int):
        return nome
    alvo = nome.strip().lower()
    for i, titulo in enumerate(cabecalho):
        if titulo.strip().lower() == alvo:
            return i
    raise ExtratoInvalido(f"Coluna {nome!r} não existe no CSV. Colunas: {', '.join(cabecalho)}.")


def ler_csv(
    texto: str,
    coluna_data: str | int,
    coluna_descricao: str | int,
    coluna_valor: str | int | None = None,
    coluna_debito: str | int | None = None,
    coluna_credito: str | int | None = None,
    coluna_documento: str | int | None = None,
    formato_data: str = "%d/%m/%Y",
    decimal: str = ",",
    separador: str | None = None,
) -> ExtratoLido:
    """CSV com cabeçalho. Valor numa coluna só (com sinal) ou em débito e crédito."""
    if coluna_valor is None and coluna_debito is None and coluna_credito is None:
        raise ExtratoInvalido("Informe a coluna de valor, ou as de débito e crédito.")
    texto = texto.lstrip("﻿")
    primeira = texto.splitlines()[0] if texto.strip() else ""
    if separador is None:
        separador = ";" if primeira.count(";") >= primeira.count(",") else ","
    leitor = csv.reader(io.StringIO(texto), delimiter=separador)
    linhas = [linha for linha in leitor if any(c.strip() for c in linha)]
    if len(linhas) < 2:
        raise ExtratoInvalido("O CSV não tem lançamentos (só cabeçalho, ou vazio).")

    cabecalho = linhas[0]
    i_data = _coluna(cabecalho, coluna_data)
    i_desc = _coluna(cabecalho, coluna_descricao)
    i_valor = _coluna(cabecalho, coluna_valor)
    i_deb = _coluna(cabecalho, coluna_debito)
    i_cred = _coluna(cabecalho, coluna_credito)
    i_doc = _coluna(cabecalho, coluna_documento)

    extrato = ExtratoLido()
    repetidos: dict[tuple, int] = {}
    for numero, linha in enumerate(linhas[1:], start=2):
        def celula(indice: int | None) -> str:
            return linha[indice].strip() if indice is not None and indice < len(linha) else ""

        try:
            data = datetime.strptime(celula(i_data), formato_data).date()
        except ValueError as exc:
            raise ExtratoInvalido(f"Linha {numero}: data {celula(i_data)!r} fora do formato {formato_data}.") from exc

        if i_valor is not None:
            valor = ler_valor_texto(celula(i_valor), decimal)
        else:
            debito = celula(i_deb)
            credito = celula(i_cred)
            valor = ler_valor_texto(credito, decimal) if credito else -abs(ler_valor_texto(debito, decimal))
        if valor == 0:
            continue
        descricao = celula(i_desc) or "(sem descrição)"
        documento = celula(i_doc) or None
        conteudo_linha = (data, valor, descricao, documento)
        ordem = repetidos.get(conteudo_linha, 0)
        repetidos[conteudo_linha] = ordem + 1
        extrato.linhas.append(
            LinhaLida(data, valor, descricao[:500], documento, "c:" + _hash(*conteudo_linha, ordem))
        )

    if not extrato.linhas:
        raise ExtratoInvalido("Nenhum lançamento com valor no CSV.")
    extrato.inicio = min(linha.data for linha in extrato.linhas)
    extrato.fim = max(linha.data for linha in extrato.linhas)
    return extrato
