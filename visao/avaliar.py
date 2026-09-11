"""Arnês de avaliação: roda o pipeline nos clipes anotados e mede.

    python visao/avaliar.py                          # todos os clipes anotados
    python visao/avaliar.py --conjunto teste \
        --divisao visao/dados/resultados/calibracao-.../divisao.csv \
        --limiares visao/dados/resultados/calibracao-.../limiares.json

Saída em visao/dados/resultados/<timestamp>/:
    metricas.json   leitura por máquina; o CI compara com os alvos da RFC
    metricas.md     a tabela que vai para a RFC e para o pôster
    erros.csv       cada FP, FN e clipe não avaliável, com o segundo
    clipes.csv      uma linha por clipe

É o MESMO PipelineDeteccao do serviço ao vivo, lendo o arquivo com timestamp
em segundos de vídeo. Não há câmera envolvida: VISAO_FONTE é ignorado.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ.parent))


def carregar_env() -> None:
    env = RAIZ.parent / ".env"
    if not env.exists():
        return
    for linha in env.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        os.environ.setdefault(chave.strip(), valor.strip())


carregar_env()

from visao.app import avaliacao as av  # noqa: E402
from visao.app.config import Config  # noqa: E402
from visao.app.pipeline import PipelineDeteccao  # noqa: E402
from visao.app.regras import Limiares  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
logging.getLogger("ultralytics").setLevel(logging.WARNING)
logger = logging.getLogger("avaliar")

PADRAO_ANOTACOES = RAIZ / "dados" / "anotacoes.csv"
PADRAO_VIDEOS = RAIZ / "dados" / "videos"
PADRAO_CACHE = RAIZ / "dados" / "cache"
PADRAO_SAIDA = RAIZ / "dados" / "resultados"


def carregar_divisao(caminho: Path) -> dict[str, str]:
    import csv

    with caminho.open(encoding="utf-8-sig", newline="") as f:
        return {l["arquivo"].strip(): l["conjunto"].strip().lower() for l in csv.DictReader(f)}


def selecionar(anotacoes: list[av.Anotacao], conjunto: str, divisao: dict[str, str] | None) -> list[av.Anotacao]:
    if conjunto == "todos":
        return anotacoes
    escolhidas = []
    for a in anotacoes:
        rotulo = (divisao or {}).get(a.arquivo) or a.conjunto
        if not rotulo:
            raise SystemExit(
                f"{a.arquivo} não tem conjunto definido. Preencha a coluna `conjunto` no CSV "
                "ou passe --divisao com o divisao.csv gerado por calibrar.py."
            )
        if rotulo == conjunto:
            escolhidas.append(a)
    if not escolhidas:
        raise SystemExit(f"Nenhum clipe no conjunto '{conjunto}'.")
    return escolhidas


def main() -> int:
    p = argparse.ArgumentParser(description="Avaliação do detector de quedas do MedSignal")
    p.add_argument("--anotacoes", type=Path, default=PADRAO_ANOTACOES)
    p.add_argument("--videos", type=Path, default=PADRAO_VIDEOS, help="pasta com os clipes")
    p.add_argument("--conjunto", choices=["todos", "teste", "calibracao"], default="todos")
    p.add_argument("--divisao", type=Path, help="divisao.csv gerado por calibrar.py")
    p.add_argument("--limiares", type=Path, help="limiares.json (de calibrar.py). Sem ele, usa os padrões de regras.py")
    p.add_argument("--tolerancia", type=float, default=5.0, help="segundos aceitos após fim_s (padrão: os 5 s de latência da RFC)")
    p.add_argument("--minimo-quadros", type=int, default=8, help="quadros classificados para o clipe contar (padrão 8 = 1 s a 8 fps)")
    p.add_argument("--semente", type=int, default=42)
    p.add_argument("--sem-cache", action="store_true", help="ignora trilhas em cache e roda os modelos de novo")
    p.add_argument("--saida", type=Path, default=PADRAO_SAIDA)
    p.add_argument("--exigir-alvos", action="store_true", help="sai com código 1 se algum alvo da RFC não for atingido")
    args = p.parse_args()

    try:
        anotacoes = av.carregar_anotacoes(args.anotacoes)
    except av.AnotacaoInvalida as erro:
        print(f"Anotações inválidas:\n  {erro}")
        return 2

    divisao = carregar_divisao(args.divisao) if args.divisao else None
    anotacoes = selecionar(anotacoes, args.conjunto, divisao)

    ausentes = [a.arquivo for a in anotacoes if not (args.videos / a.arquivo).exists()]
    if ausentes:
        print(f"Clipes anotados que não existem em {args.videos}:")
        for nome in ausentes:
            print(f"  - {nome}")
        return 2

    limiares = Limiares()
    if args.limiares:
        limiares = av.limiares_de_json(json.loads(args.limiares.read_text(encoding="utf-8"))["limiares"])

    av.fixar_semente(args.semente)
    base = Config()
    ambiente = av.versao_do_ambiente(RAIZ / "pesos")
    pipeline = PipelineDeteccao(base, limiares=limiares, pasta_pesos=RAIZ / "pesos")

    print(f"Clipes         : {len(anotacoes)} ({args.conjunto})")
    print(f"Limiares       : {'padrões de regras.py' if not args.limiares else args.limiares}")
    print(f"Peso YOLO      : {(ambiente.get('peso_yolo_sha256') or '?')[:12]}")
    print("Carregando modelos...\n")

    resultados: list[av.ResultadoClipe] = []
    inicio = time.monotonic()
    try:
        pipeline.preparar()
        for i, anotacao in enumerate(anotacoes, start=1):
            caminho = args.videos / anotacao.arquivo
            cfg = av.config_para_clipe(caminho, base)
            trilha, eventos = av.carregar_ou_extrair(
                pipeline, caminho, cfg, PADRAO_CACHE, ambiente, usar_cache=not args.sem_cache
            )
            reproduzidos = av.reproduzir(trilha, limiares)
            if eventos is None:
                eventos = reproduzidos
            elif [e.timestamp for e in eventos] != [e.timestamp for e in reproduzidos]:
                # Se isto disparar, a reprodução da camada de regras diverge do
                # pipeline ao vivo — e a calibração estaria medindo outra coisa.
                logger.warning("%s: reprodução da regra divergiu do pipeline ao vivo", anotacao.arquivo)
            r = av.casar(anotacao, trilha, eventos, args.tolerancia, args.minimo_quadros)
            resultados.append(r)
            latencia = "" if r.latencia_s is None else f"  latência {r.latencia_s:.1f}s"
            print(f"  [{i:2d}/{len(anotacoes)}] {anotacao.arquivo:40s} {r.veredito:13s}{latencia}")
    finally:
        pipeline.fechar()

    metricas = av.calcular_metricas(resultados)
    gerado_em = datetime.now(timezone.utc)
    pasta = args.saida / gerado_em.strftime("%Y%m%d-%H%M%S")
    contexto = {
        "gerado_em": gerado_em.isoformat(),
        "conjunto": args.conjunto,
        "divisao": str(args.divisao) if args.divisao else None,
        "anotacoes": str(args.anotacoes),
        "semente": args.semente,
        "tolerancia_s": args.tolerancia,
        "minimo_quadros_classificados": args.minimo_quadros,
        "limiares": av.limiares_para_json(limiares),
        "origem_limiares": str(args.limiares) if args.limiares else "padrões de regras.py",
        "fps_alvo": base.fps_alvo,
        "largura": base.largura,
        "duracao_s": round(time.monotonic() - inicio, 1),
        **ambiente,
    }
    av.escrever_relatorio(pasta, metricas, resultados, anotacoes, contexto)

    print()
    print((pasta / "metricas.md").read_text(encoding="utf-8"))
    print(f"Relatório em {pasta}")

    if args.exigir_alvos:
        faltou = []
        if metricas.recall is None or metricas.recall < av.ALVOS_RFC["recall"]:
            faltou.append("recall")
        if metricas.precisao is None or metricas.precisao < av.ALVOS_RFC["precisao"]:
            faltou.append("precisão")
        if metricas.taxa_fp is None or metricas.taxa_fp > av.ALVOS_RFC["taxa_fp"]:
            faltou.append("taxa de FP")
        if metricas.latencia_media_s is None or metricas.latencia_media_s > av.ALVOS_RFC["latencia_s"]:
            faltou.append("latência")
        if faltou:
            print(f"\nAlvos da RFC não atingidos: {', '.join(faltou)}")
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
