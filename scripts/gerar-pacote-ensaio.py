#!/usr/bin/env python3
"""Monta o PACOTE de registros de ensaio controlado: os clipes do autor + o manifesto.json.

    python scripts/gerar-pacote-ensaio.py \\
        --clipes docs/evidencias/PASTA/clipes --saida pacote-ensaio \\
        --configuracao-de ID8="texto" --configuracao-de ID8="texto" ...

O pacote vai para a VPS por scp (ver deploy/LEIA-ME.md) e é importado por
`python -m app.registros_de_ensaio` (o deploy/atualizar.sh chama isso em toda publicação).

Este script NÃO tem dado do autor dentro: ids, horários e confiança saem do banco LOCAL (só
leitura), e o que cada registro diz sobre as suas condições (--configuracao-de) quem escreve é
você. Garantias:

  * O banco local é consultado em transação SOMENTE LEITURA (default_transaction_read_only=on):
    este script não consegue gravar nele, mesmo com erro de código.
  * Recusa a pasta de saída se ela estiver dentro do repositório e o Git não a ignorar: assim os
    vídeos não entram num commit por descuido. (Fora do repositório, vale qualquer pasta.)
  * Nada é inventado: sem texto de condições para um registro, para e diz qual falta.
  * O pacote pronto é conferido com o MESMO código que a VPS usa (app.registros_de_ensaio): se
    passar aqui, passa lá.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable, Sequence

RAIZ = Path(__file__).resolve().parent.parent
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
VERSAO_DO_MANIFESTO = 1


class Erro(Exception):
    """Problema que o usuário resolve (mensagem em português, sem rastro de pilha)."""


# --------------------------------------------------------------------------------------
# Entrada
# --------------------------------------------------------------------------------------

def ids_dos_clipes(pasta: Path) -> list[str]:
    """Os ids vêm dos nomes dos arquivos: <uuid>.mp4 (é o nome que o backend dá ao clipe)."""
    if not pasta.is_dir():
        raise Erro(f"a pasta de clipes não existe: {pasta}")
    ids, estranhos = [], []
    for arquivo in sorted(pasta.iterdir()):
        if arquivo.suffix.lower() != ".mp4" or arquivo.is_symlink() or not arquivo.is_file():
            continue
        if UUID.fullmatch(arquivo.stem) and arquivo.suffix == ".mp4":
            ids.append(arquivo.stem)
        else:
            estranhos.append(arquivo.name)
    if estranhos:
        raise Erro("estes .mp4 não têm nome '<id-da-ocorrência>.mp4' (UUID em minúsculas): " + ", ".join(estranhos))
    if not ids:
        raise Erro(f"não há nenhum clipe .mp4 em {pasta}")
    return ids


def pares(valores: Sequence[str], opcao: str) -> dict[str, str]:
    """--configuracao-de ID=texto (repetível)."""
    resultado: dict[str, str] = {}
    for v in valores:
        chave, separador, texto = v.partition("=")
        if not separador or not chave.strip() or not texto.strip():
            raise Erro(f"{opcao}: use ID=texto (recebi {v!r})")
        resultado[chave.strip().lower()] = texto.strip()
    return resultado


def resolver_por_id(ids: Sequence[str], dados: dict[str, str], opcao: str) -> dict[str, str]:
    """Casa cada chave (id inteiro ou prefixo de 8+ caracteres) com exatamente um id do pacote."""
    resolvido: dict[str, str] = {}
    for chave, texto in dados.items():
        achados = [i for i in ids if i.startswith(chave)] if len(chave) >= 8 else []
        if len(achados) != 1:
            raise Erro(f"{opcao} {chave}: não bate com exatamente um clipe da pasta (use 8 ou mais caracteres do id)")
        if achados[0] in resolvido:
            raise Erro(f"{opcao}: o registro {achados[0]} apareceu duas vezes")
        resolvido[achados[0]] = texto
    return resolvido


# --------------------------------------------------------------------------------------
# Banco local (somente leitura)
# --------------------------------------------------------------------------------------

def consultar_no_docker(ids: Sequence[str], container: str, banco: str, usuario: str) -> list[dict]:
    """Lê as ocorrências no PostgreSQL do contêiner local. Os ids já foram validados como UUID."""
    if not all(UUID.fullmatch(i) for i in ids):
        raise Erro("id fora do formato UUID; recusado antes de montar a consulta")
    lista = ", ".join(f"'{i}'" for i in ids)
    sql = f"""
        SELECT coalesce(json_agg(t ORDER BY t.data_hora), '[]'::json)
          FROM (
            SELECT o.id::text AS id, o.tipo_evento, o.confianca::float8 AS confianca,
                   to_char(o.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD') || 'T' ||
                   to_char(o.data_hora AT TIME ZONE 'UTC', 'HH24:MI:SS.US') || '+00:00' AS data_hora,
                   c.slug AS tenant, cam.identificador AS camera
              FROM ocorrencia o
              JOIN clinica c ON c.id = o.clinica_id
              LEFT JOIN camera cam ON cam.id = o.camera_id
             WHERE o.id IN ({lista})
          ) t;
    """
    comando = [
        "docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
        container, "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-U", usuario, "-d", banco,
    ]
    try:
        r = subprocess.run(comando, input=sql, capture_output=True, text=True, encoding="utf-8", timeout=60)
    except FileNotFoundError as erro:
        raise Erro("não achei o comando 'docker' (o banco local roda em contêiner)") from erro
    except subprocess.TimeoutExpired as erro:
        raise Erro("o banco local não respondeu em 60 s") from erro
    if r.returncode != 0:
        detalhe = (r.stderr or "").strip().splitlines()[-1:] or ["sem detalhe"]
        raise Erro(f"não consegui ler o banco local no contêiner '{container}': {detalhe[0]}")
    try:
        return json.loads(r.stdout.strip() or "[]")
    except ValueError as erro:
        raise Erro("a resposta do banco não é JSON") from erro


# --------------------------------------------------------------------------------------
# Montagem
# --------------------------------------------------------------------------------------

def sha256_do_arquivo(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


def montar_manifesto(
    ids: Sequence[str],
    linhas: Sequence[dict],
    configuracoes: dict[str, str],
    notas: dict[str, str],
    pasta_clipes: Path,
) -> dict:
    por_id = {linha["id"]: linha for linha in linhas}
    faltam = [i for i in ids if i not in por_id]
    if faltam:
        raise Erro("estes clipes não têm ocorrência no banco local: " + ", ".join(faltam))
    sem_texto = [i for i in ids if not configuracoes.get(i)]
    if sem_texto:
        raise Erro(
            "falta dizer as CONDIÇÕES de cada registro (o texto aparece para quem vê a demonstração). "
            "Use --configuracao-de ID=texto para: " + ", ".join(i[:8] for i in sem_texto)
        )
    tenants = {por_id[i]["tenant"] for i in ids}
    cameras = {por_id[i]["camera"] for i in ids}
    if len(tenants) != 1 or len(cameras) != 1 or None in cameras:
        raise Erro(
            "um manifesto descreve UMA clínica e UMA câmera, e estes registros misturam "
            f"clínicas {sorted(tenants)} / câmeras {sorted(str(c) for c in cameras)}. Gere um pacote por câmera."
        )

    ordenados = sorted(ids, key=lambda i: por_id[i]["data_hora"])
    registros = []
    for i in ordenados:
        linha = por_id[i]
        arquivo = pasta_clipes / f"{i}.mp4"
        registro = {
            "id": i,
            "arquivo": f"{i}.mp4",
            "sha256": sha256_do_arquivo(arquivo),
            "bytes": arquivo.stat().st_size,
            "tipo_evento": linha["tipo_evento"],
            "confianca": linha["confianca"],
            "data_hora": linha["data_hora"],
            "configuracao": configuracoes[i],
        }
        if notas.get(i):
            registro["nota"] = notas[i]
        registros.append(registro)
    return {"versao": VERSAO_DO_MANIFESTO, "tenant": tenants.pop(), "camera": cameras.pop(), "registros": registros}


# --------------------------------------------------------------------------------------
# Saída: nunca onde o Git enxergue
# --------------------------------------------------------------------------------------

def git_ignora(caminho: Path) -> bool:
    r = subprocess.run(["git", "-C", str(RAIZ), "check-ignore", "-q", "--", str(caminho)], capture_output=True)
    return r.returncode == 0


def conferir_saida(saida: Path, ids: Sequence[str], ignorado: Callable[[Path], bool] = git_ignora) -> None:
    saida = saida.resolve()
    if saida.exists() and (not saida.is_dir() or any(saida.iterdir())):
        raise Erro(f"a pasta de saída já existe e não está vazia: {saida} (escolha uma nova; nada é sobrescrito)")
    if saida == RAIZ or not saida.is_relative_to(RAIZ):
        return  # fora do repositório: o Git não a enxerga
    candidatos = [saida / "manifesto.json", *(saida / f"{i}.mp4" for i in ids)]
    expostos = [c.name for c in candidatos if not ignorado(c)]
    if expostos:
        raise Erro(
            f"a pasta {saida} está DENTRO do repositório e o Git NÃO a ignora ({', '.join(expostos[:3])}...). "
            "Os vídeos poderiam entrar num commit. Use 'pacote-ensaio' (já ignorada) ou uma pasta fora do repositório."
        )


def gravar_pacote(saida: Path, pasta_clipes: Path, manifesto: dict) -> list[Path]:
    saida.mkdir(parents=True, exist_ok=True)
    escritos: list[Path] = []
    try:
        for r in manifesto["registros"]:
            destino = saida / r["arquivo"]
            shutil.copyfile(pasta_clipes / r["arquivo"], destino)
            escritos.append(destino)
        caminho = saida / "manifesto.json"
        caminho.write_text(json.dumps(manifesto, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        escritos.append(caminho)
    except BaseException:
        for f in escritos:
            f.unlink(missing_ok=True)
        raise
    return escritos


def validar_como_a_vps(saida: Path) -> int:
    """Roda a validação do importador (sem banco). Devolve quantos registros passaram."""
    sys.path.insert(0, str(RAIZ / "backend"))
    from app.registros_de_ensaio import ManifestoInvalido, carregar_manifesto  # noqa: PLC0415

    try:
        return len(carregar_manifesto(saida).registros)
    except ManifestoInvalido as erro:
        raise Erro("o pacote NÃO passou na validação do importador:\n" + "\n".join(f"  - {e}" for e in erro.erros)) from erro


def gerar(
    pasta_clipes: Path,
    saida: Path,
    configuracoes: dict[str, str],
    notas: dict[str, str],
    consulta: Callable[[Sequence[str]], list[dict]],
    ignorado: Callable[[Path], bool] = git_ignora,
) -> tuple[dict, list[Path]]:
    ids = ids_dos_clipes(pasta_clipes)
    conferir_saida(saida, ids, ignorado)
    configuracoes = resolver_por_id(ids, configuracoes, "--configuracao-de")
    notas = resolver_por_id(ids, notas, "--nota-de")
    manifesto = montar_manifesto(ids, consulta(ids), configuracoes, notas, pasta_clipes)
    escritos = gravar_pacote(saida, pasta_clipes, manifesto)
    try:
        validar_como_a_vps(saida)
    except BaseException:
        for f in escritos:
            f.unlink(missing_ok=True)
        try:
            saida.rmdir()  # só se ficou vazia (a conferência garantiu que nasceu vazia ou nova)
        except OSError:
            pass
        raise
    return manifesto, escritos


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Monta o pacote de registros de ensaio controlado (ver o cabeçalho).")
    ap.add_argument("--clipes", required=True, type=Path, help="pasta com os <id>.mp4")
    ap.add_argument("--saida", required=True, type=Path, help="pasta NOVA do pacote (ex.: pacote-ensaio)")
    ap.add_argument("--configuracao", default="", help="condições do teste, para os registros sem --configuracao-de")
    ap.add_argument("--configuracao-de", action="append", default=[], metavar="ID=texto", help="condições de um registro (até 200 caracteres)")
    ap.add_argument("--nota-de", action="append", default=[], metavar="ID=texto", help="nota opcional de um registro")
    ap.add_argument("--container", default="medsignal-db", help="contêiner do PostgreSQL local (padrão: medsignal-db)")
    ap.add_argument("--banco", default="medsignal")
    ap.add_argument("--usuario", default="medsignal")
    args = ap.parse_args(argv)

    try:
        configuracoes = pares(args.configuracao_de, "--configuracao-de")
        notas = pares(args.nota_de, "--nota-de")
        if args.configuracao.strip():
            # O padrão vale só para quem não tem texto próprio.
            for i in ids_dos_clipes(args.clipes):
                if not any(i.startswith(c) for c in configuracoes):
                    configuracoes[i] = args.configuracao.strip()
        manifesto, escritos = gerar(
            args.clipes, args.saida, configuracoes, notas,
            lambda ids: consultar_no_docker(ids, args.container, args.banco, args.usuario),
        )
    except Erro as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1

    print(f"Pacote pronto em {args.saida.resolve()} e aprovado pela validação do importador.")
    print(f"clínica: {manifesto['tenant']} | câmera: {manifesto['camera']} | registros: {len(manifesto['registros'])}\n")
    for r in manifesto["registros"]:
        confianca = "-" if r["confianca"] is None else f"{r['confianca']:.3f}"
        print(f"  {r['id'][:8]}  {r['tipo_evento']:<20} {r['data_hora']}  conf {confianca}  {r['bytes']:>8} bytes  sha256 {r['sha256'][:12]}…")
    print(
        "\nPróximos passos (ver deploy/LEIA-ME.md): envie por scp para ~/medsignal/deploy/clipes-ensaio/ na VPS,\n"
        "confira com sha256sum e publique. Nada disto vai para o Git: a pasta está ignorada."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
