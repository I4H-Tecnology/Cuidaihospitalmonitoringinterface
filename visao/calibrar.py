"""Calibração dos limiares por holdout.

    python visao/calibrar.py                     # divide, varre a grade, escolhe
    python visao/calibrar.py --semente 7 --fracao-teste 0.4

O critério está escrito aqui antes de qualquer resultado ser olhado, e é o
que a seção 1.6 da RFC prioriza:

    maximizar recall, sujeito a precisão >= 0,80

Deixar de detectar uma queda real é mais grave do que gerar um alerta
indevido; por isso recall vem antes. Empates são desfeitos por precisão, depois
por latência menor, depois pela combinação mais próxima dos valores padrão.

Os clipes são divididos em CALIBRAÇÃO e TESTE antes de qualquer varredura. Só
o conjunto de calibração é usado aqui. O número que vai para a RFC sai de uma
rodada única de `avaliar.py --conjunto teste` com os limiares vencedores —
medir no mesmo conjunto em que se calibrou produz um número que não se
sustenta.

Saída em visao/dados/resultados/calibracao-<timestamp>/:
    divisao.csv      qual clipe caiu em qual conjunto (registro do holdout)
    grade.csv        todas as combinações testadas, com as métricas de cada uma
    limiares.json    os vencedores, prontos para `avaliar.py --limiares`
    calibracao.md    resumo legível
"""

from __future__ import annotations

import argparse
import csv
import itertools
import json
import logging
import os
import sys
import time
from dataclasses import fields
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
logger = logging.getLogger("calibrar")

PADRAO_ANOTACOES = RAIZ / "dados" / "anotacoes.csv"
PADRAO_VIDEOS = RAIZ / "dados" / "videos"
PADRAO_CACHE = RAIZ / "dados" / "cache"
PADRAO_SAIDA = RAIZ / "dados" / "resultados"

# A grade padrão varia cada limiar em torno do valor justificado em regras.py.
# `quadros_para_recuperar` fica fixo de propósito: ele decide quando SAIR do
# alerta, não quando entrar, e não muda TP/FP/FN de um clipe curto.
GRADE_PADRAO: dict[str, list] = {
    "angulo_caido": [45.0, 55.0, 65.0],
    "razao_aspecto_caido": [0.8, 0.9, 1.0],
    "razao_altura_caido": [0.45, 0.55, 0.65],
    "velocidade_queda": [0.5, 0.8, 1.1],
    "quadros_para_confirmar": [4, 6, 8],
    "quadros_para_recuperar": [10],
    "segundos_para_ocorrencia": [2.0, 3.0, 4.0],
}

PADROES = Limiares()


def combinacoes(grade: dict[str, list]):
    nomes = [f.name for f in fields(Limiares)]
    desconhecidos = set(grade) - set(nomes)
    if desconhecidos:
        raise SystemExit(f"Grade com limiares desconhecidos: {sorted(desconhecidos)}")
    eixos = [grade.get(nome, [getattr(PADROES, nome)]) for nome in nomes]
    for valores in itertools.product(*eixos):
        yield Limiares(**dict(zip(nomes, valores)))


def distancia_dos_padroes(limiares: Limiares) -> float:
    """Distância relativa aos valores de regras.py. Desempate final: entre
    combinações iguais nas métricas, fica a que menos se afasta do que já foi
    justificado na geometria."""
    total = 0.0
    for f in fields(Limiares):
        padrao = float(getattr(PADROES, f.name))
        atual = float(getattr(limiares, f.name))
        total += abs(atual - padrao) / padrao if padrao else abs(atual - padrao)
    return total


def chave_de_ordenacao(linha: dict) -> tuple:
    latencia = linha["latencia_media_s"]
    return (
        -(linha["recall"] if linha["recall"] is not None else -1.0),
        -(linha["precisao"] if linha["precisao"] is not None else -1.0),
        latencia if latencia is not None else float("inf"),
        linha["distancia"],
    )


def main() -> int:
    p = argparse.ArgumentParser(description="Calibração dos limiares do detector de quedas")
    p.add_argument("--anotacoes", type=Path, default=PADRAO_ANOTACOES)
    p.add_argument("--videos", type=Path, default=PADRAO_VIDEOS)
    p.add_argument("--semente", type=int, default=42, help="semente do sorteio da divisão")
    p.add_argument("--fracao-teste", type=float, default=0.5)
    p.add_argument("--grade", type=Path, help="JSON {limiar: [valores]} no lugar da grade padrão")
    p.add_argument("--precisao-minima", type=float, default=av.ALVOS_RFC["precisao"])
    p.add_argument("--tolerancia", type=float, default=5.0)
    p.add_argument("--minimo-quadros", type=int, default=8)
    p.add_argument("--sem-cache", action="store_true")
    p.add_argument("--saida", type=Path, default=PADRAO_SAIDA)
    args = p.parse_args()

    try:
        anotacoes = av.carregar_anotacoes(args.anotacoes)
    except av.AnotacaoInvalida as erro:
        print(f"Anotações inválidas:\n  {erro}")
        return 2

    ausentes = [a.arquivo for a in anotacoes if not (args.videos / a.arquivo).exists()]
    if ausentes:
        print(f"Clipes anotados que não existem em {args.videos}:")
        for nome in ausentes:
            print(f"  - {nome}")
        return 2

    grade = GRADE_PADRAO
    if args.grade:
        grade = json.loads(args.grade.read_text(encoding="utf-8"))

    # 1. Divisão holdout — antes de olhar qualquer resultado.
    divisao = av.dividir_holdout(anotacoes, args.semente, args.fracao_teste)
    calibracao = [a for a in anotacoes if divisao[a.arquivo] == "calibracao"]
    teste = [a for a in anotacoes if divisao[a.arquivo] == "teste"]
    positivos = sum(1 for a in calibracao if a.tem_queda)
    if not calibracao or positivos == 0 or positivos == len(calibracao):
        print("O conjunto de calibração precisa ter clipes com E sem queda. Ajuste --fracao-teste ou anote mais clipes.")
        return 2

    gerado_em = datetime.now(timezone.utc)
    pasta = args.saida / f"calibracao-{gerado_em.strftime('%Y%m%d-%H%M%S')}"
    pasta.mkdir(parents=True, exist_ok=True)
    with (pasta / "divisao.csv").open("w", encoding="utf-8", newline="") as f:
        escritor = csv.writer(f)
        escritor.writerow(["arquivo", "conjunto", "tem_queda", "cenario"])
        for a in anotacoes:
            escritor.writerow([a.arquivo, divisao[a.arquivo], "sim" if a.tem_queda else "nao", a.cenario])

    print(f"Calibração : {len(calibracao)} clipes ({positivos} com queda)")
    print(f"Teste      : {len(teste)} clipes ({sum(1 for a in teste if a.tem_queda)} com queda) — não são tocados aqui")
    print(f"Critério   : maximizar recall, sujeito a precisão >= {args.precisao_minima:.2f}")
    total = 1
    for valores in grade.values():
        total *= len(valores)
    print(f"Grade      : {total} combinações\n")

    # 2. Percepção uma vez só, por clipe. A varredura reaproveita.
    av.fixar_semente(args.semente)
    base = Config()
    ambiente = av.versao_do_ambiente(RAIZ / "pesos")
    pipeline = PipelineDeteccao(base, pasta_pesos=RAIZ / "pesos")
    trilhas: dict[str, av.Trilha] = {}
    inicio = time.monotonic()
    try:
        pipeline.preparar()
        for i, a in enumerate(calibracao, start=1):
            caminho = args.videos / a.arquivo
            cfg = av.config_para_clipe(caminho, base)
            trilha, _ = av.carregar_ou_extrair(
                pipeline, caminho, cfg, PADRAO_CACHE, ambiente, usar_cache=not args.sem_cache
            )
            trilhas[a.arquivo] = trilha
            print(f"  [{i:2d}/{len(calibracao)}] {a.arquivo:40s} {trilha.quadros_classificados:4d} quadros classificados")
    finally:
        pipeline.fechar()

    # 3. Varredura — só a camada de regras roda de novo.
    logging.getLogger("visao.app.regras").setLevel(logging.WARNING)
    linhas: list[dict] = []
    nomes = [f.name for f in fields(Limiares)]
    for n, limiares in enumerate(combinacoes(grade), start=1):
        resultados = [
            av.casar(a, trilhas[a.arquivo], av.reproduzir(trilhas[a.arquivo], limiares), args.tolerancia, args.minimo_quadros)
            for a in calibracao
        ]
        m = av.calcular_metricas(resultados)
        linhas.append({
            **av.limiares_para_json(limiares),
            "tp": m.tp, "fn": m.fn, "fp": m.fp, "tn": m.tn, "nao_avaliaveis": m.nao_avaliaveis,
            "recall": m.recall, "precisao": m.precisao, "f1": m.f1, "taxa_fp": m.taxa_fp,
            "latencia_media_s": m.latencia_media_s,
            "distancia": round(distancia_dos_padroes(limiares), 4),
            "atende_criterio": m.precisao is not None and m.precisao >= args.precisao_minima,
        })
        if n % 100 == 0:
            print(f"  {n}/{total} combinações...")

    with (pasta / "grade.csv").open("w", encoding="utf-8", newline="") as f:
        escritor = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
        escritor.writeheader()
        escritor.writerows(linhas)

    # 4. Escolha, pelo critério declarado.
    viaveis = [l for l in linhas if l["atende_criterio"]]
    criterio_atendido = bool(viaveis)
    if viaveis:
        vencedora = min(viaveis, key=chave_de_ordenacao)
    else:
        # Nenhuma combinação chega à precisão mínima. Escolhe a de maior F1 e
        # diz isso com todas as letras: o alvo não foi atingido na calibração.
        vencedora = min(linhas, key=lambda l: (-(l["f1"] if l["f1"] is not None else -1.0), l["distancia"]))
    limiares_vencedores = {nome: vencedora[nome] for nome in nomes}
    padrao = next(l for l in linhas if all(l[n] == getattr(PADROES, n) for n in nomes)) if all(
        getattr(PADROES, n) in grade.get(n, [getattr(PADROES, n)]) for n in nomes
    ) else None

    (pasta / "limiares.json").write_text(
        json.dumps(
            {
                "limiares": limiares_vencedores,
                "criterio": f"maximizar recall, sujeito a precisao >= {args.precisao_minima}",
                "criterio_atendido": criterio_atendido,
                "metricas_na_calibracao": {k: vencedora[k] for k in ("tp", "fn", "fp", "tn", "nao_avaliaveis", "recall", "precisao", "f1", "taxa_fp", "latencia_media_s")},
                "conjunto_calibracao": [a.arquivo for a in calibracao],
                "conjunto_teste": [a.arquivo for a in teste],
                "semente": args.semente,
                "fracao_teste": args.fracao_teste,
                "tolerancia_s": args.tolerancia,
                "minimo_quadros_classificados": args.minimo_quadros,
                "grade": grade,
                "gerado_em": gerado_em.isoformat(),
                **ambiente,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    def pct(v):
        return "não medido" if v is None else f"{v * 100:.1f}%"

    def seg(v):
        return "não medido" if v is None else f"{v:.2f} s"

    melhores = sorted(linhas, key=chave_de_ordenacao)[:10]
    md = [
        "# Calibração dos limiares",
        "",
        f"Gerado em {gerado_em.isoformat()} · semente {args.semente} · commit `{ambiente.get('git_commit') or '?'}`",
        "",
        f"**Critério (fixado antes da varredura):** maximizar recall, sujeito a precisão ≥ {args.precisao_minima:.2f}.",
        "",
        f"**Critério atendido na calibração:** {'sim' if criterio_atendido else 'NÃO — nenhuma combinação chegou à precisão mínima; a escolhida é a de maior F1'}.",
        "",
        "## Divisão holdout",
        "",
        f"- Calibração: {len(calibracao)} clipes ({positivos} com queda) — usados aqui",
        f"- Teste: {len(teste)} clipes ({sum(1 for a in teste if a.tem_queda)} com queda) — reservados para `avaliar.py --conjunto teste`",
        "",
        "Registro completo em `divisao.csv`.",
        "",
        "## Limiares vencedores (métricas no conjunto de CALIBRAÇÃO, não no de teste)",
        "",
        "| Parâmetro | Padrão (regras.py) | Vencedor |",
        "|---|---:|---:|",
    ]
    for nome in nomes:
        md.append(f"| `{nome}` | {getattr(PADROES, nome)} | {vencedora[nome]} |")
    md += [
        "",
        "| Métrica | Padrão | Vencedor |",
        "|---|---:|---:|",
        f"| Recall | {pct(padrao['recall']) if padrao else '—'} | {pct(vencedora['recall'])} |",
        f"| Precisão | {pct(padrao['precisao']) if padrao else '—'} | {pct(vencedora['precisao'])} |",
        f"| Taxa de FP | {pct(padrao['taxa_fp']) if padrao else '—'} | {pct(vencedora['taxa_fp'])} |",
        f"| F1 | {pct(padrao['f1']) if padrao else '—'} | {pct(vencedora['f1'])} |",
        f"| Latência média | {seg(padrao['latencia_media_s']) if padrao else '—'} | {seg(vencedora['latencia_media_s'])} |",
        f"| Não avaliáveis | {padrao['nao_avaliaveis'] if padrao else '—'} | {vencedora['nao_avaliaveis']} |",
        "",
        "## Dez melhores combinações",
        "",
        "| " + " | ".join(nomes) + " | recall | precisão | F1 | latência |",
        "|" + "---:|" * (len(nomes) + 4),
    ]
    for l in melhores:
        md.append(
            "| " + " | ".join(str(l[n]) for n in nomes)
            + f" | {pct(l['recall'])} | {pct(l['precisao'])} | {pct(l['f1'])} | {seg(l['latencia_media_s'])} |"
        )
    md += [
        "",
        "## Próximo passo",
        "",
        "Medir UMA vez no conjunto de teste. Esse é o número que vai para a RFC:",
        "",
        "```bash",
        f"visao/.venv/Scripts/python.exe visao/avaliar.py --conjunto teste --divisao {pasta / 'divisao.csv'} --limiares {pasta / 'limiares.json'}",
        "```",
        "",
    ]
    (pasta / "calibracao.md").write_text("\n".join(md), encoding="utf-8")

    print()
    print("\n".join(md))
    print(f"Varredura em {time.monotonic() - inicio:.0f}s · resultados em {pasta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
