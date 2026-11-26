"""Importa os REGISTROS DE ENSAIO CONTROLADO para a demonstração em produção.

    python -m app.registros_de_ensaio                  # na VPS, dentro do contêiner do backend
    python -m app.registros_de_ensaio --validar-apenas # confere o manifesto e os clipes, sem banco

Contexto: em produção não há câmera. Para o professor ver, em Alertas Clínicos, o que o detector
registrou, as ocorrências que o autor gerou em testes com a webcam do notebook e os clipes
de 10 s são trazidos para a VPS FORA do Git: os arquivos e o manifesto ficam numa pasta da VPS
(CLIPES_ENSAIO_DIR), enviada por scp, nunca no repositório. O código deste módulo é genérico: não
tem dado do autor dentro.

O que este módulo garante:
  * Só roda em MODO DE TESTE (MEDSIGNAL_MODO_TESTE=true). Fora dele, não faz nada.
  * VALIDA TUDO ANTES de abrir o banco: manifesto, e cada clipe (existe, tamanho, SHA-256, é MP4).
    Junta todos os erros e para: nada é gravado com manifesto ou clipe inválido.
  * Grava TUDO NUMA ÚNICA TRANSAÇÃO. Se qualquer passo falhar, nada fica: não sobra ocorrência sem
    alerta, nem registro pela metade, nem alguns registros de um lote que falhou.
  * NÃO DUPLICA: ids fixos e ON CONFLICT DO NOTHING. Rodar de novo não cria nada. Nunca atualiza
    nem apaga linha existente (não desfaz edição de ninguém). Se o id já pertence a uma ocorrência
    que NÃO é de ensaio, aborta tudo: não mistura ensaio com registro real.
  * Grava direto no banco, não pela API: a API anunciaria um alerta novo pelo WebSocket e o criaria
    pendente. Aqui nada é anunciado e a ocorrência nasce encerrada.
  * Identifica cada registro como ENSAIO CONTROLADO / DADOS DE DEMONSTRAÇÃO, com texto FIXO deste
    módulo (o manifesto não altera o aviso), e o exclui das estatísticas (ver ensaio.py).

O status é sempre `encerrada` e o alerta `ciente` SEM usuário: a ciência é pré-marcada só para o
alerta não aparecer "sem ciência" nem contar como pendente. Não há atendimento. Isso fica dito no
texto de cada registro.

Códigos de saída: 0 ok (ou nada a fazer); 2 manifesto/clipe inválido; 3 falha no banco;
4 modo de teste desligado ou pasta não configurada.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import uuid
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from . import clipes
from .ensaio import chave_do_registro

MANIFESTO = "manifesto.json"
VERSAO_DO_MANIFESTO = 1
TIPOS_DE_EVENTO = ("queda", "perda_verticalidade", "permanencia_solo", "ausencia_prolongada")
MAXIMO_DE_REGISTROS = 50
MAXIMO_DE_BYTES = 25 * 1024 * 1024
MAXIMO_DE_TEXTO = 200
TOLERANCIA_DO_RELOGIO = timedelta(minutes=5)

_SLUG = re.compile(r"[a-z0-9][a-z0-9_-]{0,62}")
_IDENTIFICADOR = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,62}")
_SHA256 = re.compile(r"[0-9a-f]{64}")

SAIDA_OK = 0
SAIDA_INVALIDO = 2
SAIDA_BANCO = 3
SAIDA_DESLIGADO = 4


class ManifestoInvalido(Exception):
    """O manifesto ou algum clipe não passou na validação. `erros` traz TODOS os problemas."""

    def __init__(self, erros: list[str]):
        super().__init__("; ".join(erros))
        self.erros = erros


class ImportacaoRecusada(Exception):
    """O banco não tem o que o manifesto pede (clínica ou câmera) ou há conflito com registro real."""


@dataclass(frozen=True)
class Registro:
    id: str
    arquivo: str
    sha256: str
    bytes: int
    tipo_evento: str
    confianca: float | None
    data_hora: datetime
    configuracao: str
    nota: str


@dataclass(frozen=True)
class Manifesto:
    tenant: str
    camera: str
    registros: tuple[Registro, ...]


@dataclass
class Resultado:
    importados: int = 0
    ja_existiam: int = 0


# --------------------------------------------------------------------------------------
# Validação (sem banco)
# --------------------------------------------------------------------------------------

def _sha256_do_arquivo(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


def _texto(valor: object, nome: str, erros: list[str], *, obrigatorio: bool, onde: str) -> str:
    if valor is None or valor == "":
        if obrigatorio:
            erros.append(f"{onde}: '{nome}' é obrigatório")
        return ""
    if not isinstance(valor, str):
        erros.append(f"{onde}: '{nome}' deve ser texto")
        return ""
    limpo = valor.strip()
    if len(limpo) > MAXIMO_DE_TEXTO:
        erros.append(f"{onde}: '{nome}' passa de {MAXIMO_DE_TEXTO} caracteres")
    if any(ord(c) < 32 for c in limpo):
        erros.append(f"{onde}: '{nome}' tem caractere de controle")
    return limpo


def _registro(bruto: object, indice: int, pasta: Path, agora: datetime, vistos: set[str], erros: list[str]) -> Registro | None:
    onde = f"registros[{indice}]"
    if not isinstance(bruto, dict):
        erros.append(f"{onde}: deve ser um objeto")
        return None
    antes = len(erros)

    rid = bruto.get("id")
    try:
        canonico = str(uuid.UUID(str(rid)))
        if canonico != str(rid):
            raise ValueError
    except (ValueError, AttributeError):
        erros.append(f"{onde}: 'id' deve ser um UUID em minúsculas com hifens")
        canonico = ""
    else:
        if canonico in vistos:
            erros.append(f"{onde}: id repetido no manifesto ({canonico})")
        vistos.add(canonico)
        onde = f"registros[{indice}] ({canonico[:8]})"

    arquivo = bruto.get("arquivo")
    if canonico and arquivo != f"{canonico}.mp4":
        erros.append(f"{onde}: 'arquivo' deve ser exatamente '{canonico}.mp4'")

    sha = bruto.get("sha256")
    if not isinstance(sha, str) or not _SHA256.fullmatch(sha):
        erros.append(f"{onde}: 'sha256' deve ter 64 hexadecimais minúsculos")
        sha = ""
    tamanho = bruto.get("bytes")
    if not isinstance(tamanho, int) or isinstance(tamanho, bool) or not 0 < tamanho <= MAXIMO_DE_BYTES:
        erros.append(f"{onde}: 'bytes' deve ser um inteiro entre 1 e {MAXIMO_DE_BYTES}")
        tamanho = 0

    # O clipe em si: existe, é arquivo comum, tamanho e SHA-256 conferem, é MP4.
    if canonico and arquivo == f"{canonico}.mp4" and sha and tamanho:
        caminho = pasta / arquivo
        if caminho.is_symlink() or not caminho.is_file():
            erros.append(f"{onde}: clipe ausente ou não é arquivo comum ({arquivo})")
        else:
            real = caminho.stat().st_size
            if real != tamanho:
                erros.append(f"{onde}: tamanho do clipe é {real} bytes, o manifesto diz {tamanho}")
            else:
                with caminho.open("rb") as f:
                    cabecalho = f.read(12)
                if len(cabecalho) < 12 or cabecalho[4:8] != b"ftyp":
                    erros.append(f"{onde}: o arquivo não parece um MP4 (sem 'ftyp')")
                if _sha256_do_arquivo(caminho) != sha:
                    erros.append(f"{onde}: SHA-256 do clipe difere do manifesto (arquivo alterado ou corrompido)")

    tipo = bruto.get("tipo_evento")
    if tipo not in TIPOS_DE_EVENTO:
        erros.append(f"{onde}: 'tipo_evento' deve ser um de {', '.join(TIPOS_DE_EVENTO)}")

    confianca = bruto.get("confianca")
    if confianca is not None:
        if isinstance(confianca, bool) or not isinstance(confianca, (int, float)) or not math.isfinite(confianca) or not 0 <= confianca <= 1:
            erros.append(f"{onde}: 'confianca' deve ser nula ou um número entre 0 e 1")
            confianca = None
        else:
            confianca = round(float(confianca), 3)

    quando = None
    bruto_quando = bruto.get("data_hora")
    try:
        quando = datetime.fromisoformat(str(bruto_quando))
    except ValueError:
        erros.append(f"{onde}: 'data_hora' deve ser data e hora ISO 8601 com fuso (ex.: 2026-01-15T13:10:16+00:00)")
    else:
        if quando.tzinfo is None:
            erros.append(f"{onde}: 'data_hora' precisa de fuso horário")
            quando = None
        elif quando > agora + TOLERANCIA_DO_RELOGIO:
            erros.append(f"{onde}: 'data_hora' está no futuro")
        elif quando.year < 2020:
            erros.append(f"{onde}: 'data_hora' anterior a 2020")

    configuracao = _texto(bruto.get("configuracao"), "configuracao", erros, obrigatorio=True, onde=onde)
    nota = _texto(bruto.get("nota"), "nota", erros, obrigatorio=False, onde=onde)

    if len(erros) > antes or quando is None:
        return None
    return Registro(canonico, f"{canonico}.mp4", sha, tamanho, tipo, confianca, quando.astimezone(timezone.utc), configuracao, nota)


def carregar_manifesto(pasta: Path, agora: datetime | None = None) -> Manifesto:
    """Lê e VALIDA o manifesto e os clipes. Levanta ManifestoInvalido com todos os erros."""
    agora = agora or datetime.now(timezone.utc)
    caminho = pasta / MANIFESTO
    if not caminho.is_file():
        raise ManifestoInvalido([f"não há {MANIFESTO} em {pasta}"])
    try:
        bruto = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        raise ManifestoInvalido([f"{MANIFESTO} ilegível ou não é JSON: {erro}"]) from erro
    if not isinstance(bruto, dict):
        raise ManifestoInvalido([f"{MANIFESTO} deve ser um objeto JSON"])

    erros: list[str] = []
    if bruto.get("versao") != VERSAO_DO_MANIFESTO:
        erros.append(f"'versao' deve ser {VERSAO_DO_MANIFESTO}")
    tenant = bruto.get("tenant")
    if not isinstance(tenant, str) or not _SLUG.fullmatch(tenant):
        erros.append("'tenant' deve ser o slug da clínica (letras minúsculas, números, - e _)")
        tenant = ""
    camera = bruto.get("camera")
    if not isinstance(camera, str) or not _IDENTIFICADOR.fullmatch(camera):
        erros.append("'camera' deve ser o identificador da câmera (ex.: CAM-QUARTO101)")
        camera = ""
    lista = bruto.get("registros")
    if not isinstance(lista, list) or not lista:
        erros.append("'registros' deve ser uma lista não vazia")
        lista = []
    elif len(lista) > MAXIMO_DE_REGISTROS:
        erros.append(f"'registros' passa de {MAXIMO_DE_REGISTROS} itens")
        lista = lista[:MAXIMO_DE_REGISTROS]

    vistos: set[str] = set()
    registros = [_registro(r, i, pasta, agora, vistos, erros) for i, r in enumerate(lista)]
    if erros:
        raise ManifestoInvalido(erros)
    return Manifesto(tenant, camera, tuple(r for r in registros if r is not None))


# --------------------------------------------------------------------------------------
# Texto fixo do registro (o manifesto não altera o aviso)
# --------------------------------------------------------------------------------------

def _data_local(quando: datetime) -> str:
    try:
        from zoneinfo import ZoneInfo

        fuso = ZoneInfo("America/Sao_Paulo")
    except Exception:  # noqa: BLE001  (sem tzdata: usa o deslocamento fixo de Brasília)
        fuso = timezone(timedelta(hours=-3))
    return quando.astimezone(fuso).strftime("%d/%m/%Y")


def observacao_do_registro(r: Registro) -> str:
    texto = (
        "ENSAIO CONTROLADO · DADOS DE DEMONSTRAÇÃO. "
        f"Registro de teste feito pelo autor com a webcam do notebook em {_data_local(r.data_hora)}, "
        "em que o detector classificou o evento; "
        f"{r.configuracao}. "
        "NÃO é detecção ao vivo em produção, NÃO mede o desempenho do detector e NÃO houve "
        "atendimento real: a ciência do alerta foi pré-marcada, sem usuário, apenas para a demonstração."
    )
    return f"{texto} {r.nota}".strip() if r.nota else texto


# --------------------------------------------------------------------------------------
# Gravação: UMA transação para o lote inteiro
# --------------------------------------------------------------------------------------

def importar(abrir_cursor: Callable[[], AbstractContextManager], manifesto: Manifesto) -> Resultado:
    """Grava o lote. `abrir_cursor` é chamado UMA vez: tudo acontece dentro da mesma transação.

    O gerenciador de contexto real (db.cursor) confirma ao sair e DESFAZ TUDO se houver exceção;
    por isso nenhuma exceção é engolida aqui. Só funções de escrita deste bloco tocam o banco.
    """
    from .comum import TABELA_EVENTOS  # import tardio: comum puxa o banco, e a validação não precisa dele

    resultado = Resultado()
    with abrir_cursor() as cur:
        cur.execute(TABELA_EVENTOS)  # idempotente; o boot do backend já a cria

        cur.execute("SELECT id FROM clinica WHERE slug = %s", (manifesto.tenant,))
        clinica = cur.fetchone()
        if not clinica:
            raise ImportacaoRecusada(f"clínica '{manifesto.tenant}' não existe neste banco")

        cur.execute(
            """
            SELECT cam.id, cam.ambiente_id
              FROM camera cam JOIN ambiente amb ON amb.id = cam.ambiente_id
             WHERE cam.identificador = %s AND amb.clinica_id = %s
            """,
            (manifesto.camera, clinica["id"]),
        )
        cameras = cur.fetchall()
        if len(cameras) != 1:
            raise ImportacaoRecusada(
                f"a câmera '{manifesto.camera}' deveria existir uma vez na clínica '{manifesto.tenant}' (achei {len(cameras)})"
            )
        camera = cameras[0]

        for r in manifesto.registros:
            chave = chave_do_registro(r.id)
            cur.execute(
                """
                INSERT INTO ocorrencia
                  (id, clinica_id, paciente_id, ambiente_id, camera_id, tipo_evento, status,
                   confianca, data_hora, encerrada_em, observacao)
                VALUES (%s, %s, NULL, %s, %s, %s, 'encerrada', %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                RETURNING id
                """,
                (r.id, clinica["id"], camera["ambiente_id"], camera["id"], r.tipo_evento,
                 r.confianca, r.data_hora, r.data_hora, observacao_do_registro(r)),
            )
            if cur.fetchone() is None:
                # O id já existe. Só é aceitável se for um registro de ensaio já importado.
                cur.execute("SELECT 1 AS ok FROM stub_evento_publicado WHERE chave = %s", (chave,))
                if cur.fetchone() is None:
                    raise ImportacaoRecusada(
                        f"o id {r.id} já pertence a uma ocorrência que NÃO é de ensaio; lote abortado, nada foi gravado"
                    )
                resultado.ja_existiam += 1
                continue

            cur.execute(
                """
                INSERT INTO alerta (ocorrencia_id, nivel, status, enviado_em, ciencia_em, ciencia_usuario_id)
                VALUES (%s, 'critico', 'ciente', %s, %s, NULL)
                """,
                (r.id, r.data_hora, r.data_hora),
            )
            cur.execute(
                "INSERT INTO stub_evento_publicado (chave, ocorrencia_id) VALUES (%s, %s)",
                (chave, r.id),
            )
            resultado.importados += 1
    return resultado


# --------------------------------------------------------------------------------------
# Linha de comando
# --------------------------------------------------------------------------------------

def _linhas(erros: list[str]) -> str:
    return "\n".join(f"  - {e}" for e in erros)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Importa os registros de ensaio controlado (ver o cabeçalho deste arquivo).")
    ap.add_argument("--pasta", help="pasta com o manifesto e os clipes (padrão: CLIPES_ENSAIO_DIR)")
    ap.add_argument("--validar-apenas", action="store_true", help="valida o manifesto e os clipes e para, sem tocar no banco")
    args = ap.parse_args(argv)

    if not clipes.MODO_TESTE:
        print("Registros de ensaio: modo de teste desligado (MEDSIGNAL_MODO_TESTE); nada a fazer.")
        return SAIDA_DESLIGADO
    pasta = Path(args.pasta) if args.pasta else clipes.PASTA_ENSAIO
    if pasta is None:
        print("Registros de ensaio: CLIPES_ENSAIO_DIR não está configurada; nada a fazer.")
        return SAIDA_DESLIGADO
    if not (pasta / MANIFESTO).is_file():
        print(f"Registros de ensaio: sem {MANIFESTO} em {pasta}; nada a importar.")
        return SAIDA_OK

    try:
        manifesto = carregar_manifesto(pasta)
    except ManifestoInvalido as erro:
        print(f"Registros de ensaio: manifesto ou clipes INVÁLIDOS; NADA foi gravado.\n{_linhas(erro.erros)}")
        return SAIDA_INVALIDO
    print(f"Registros de ensaio: manifesto válido ({len(manifesto.registros)} registro(s), câmera {manifesto.camera}, clínica {manifesto.tenant}).")
    if args.validar_apenas:
        print("RESULTADO: validado=sim gravado=nao")
        return SAIDA_OK

    try:
        from . import db  # import tardio: exige DATABASE_URL

        db.abrir_pool()
        try:
            resultado = importar(db.cursor, manifesto)
        finally:
            db.fechar_pool()
    except ImportacaoRecusada as erro:
        print(f"Registros de ensaio: importação RECUSADA; NADA foi gravado.\n  - {erro}")
        return SAIDA_INVALIDO
    except Exception as erro:  # noqa: BLE001  (qualquer falha do banco: a transação já foi desfeita)
        print(f"Registros de ensaio: FALHA ao gravar; a transação foi desfeita, NADA foi gravado.\n  - {type(erro).__name__}: {erro}")
        return SAIDA_BANCO
    print(f"RESULTADO: importados={resultado.importados} ja_existiam={resultado.ja_existiam}")
    return SAIDA_OK


if __name__ == "__main__":
    sys.exit(main())
