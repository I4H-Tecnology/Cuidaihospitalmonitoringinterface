"""Prepara o UR Fall (câmera 0) para o arnês de avaliação.

    python visao/preparar_urfall.py
    python visao/preparar_urfall.py --pre-s 2 --pos-s 4

O UR Fall é um conjunto PÚBLICO (Kwolek e Kępski, 2014; CC BY-NC-SA 4.0, uso
acadêmico e não comercial). Serve para testar a camada de regras contra um
conjunto externo. Os números dele NÃO são os da RFC: esses saem só das
gravações próprias, e qualquer resultado daqui sai rotulado como "UR Fall".

O que o script faz, a partir de `dados/videos/ur-fall/` (70 mp4 e o CSV de
rótulos `urfall-cam0-falls.csv`):

1. Recorta o lado RGB. O quadro tem 640x240: mapa de profundidade à esquerda e
   RGB à direita. O YOLO veria uma "pessoa" nas duas metades, então fica só a
   metade direita, 320x240.
2. Grava duas pastas de clipes:
     ur-fall-rgb/      os clipes recortados, como são
     ur-fall-rgb-ext/  recortados e ESTENDIDOS (ver abaixo)
3. Escreve as anotações, com `inicio_s` (primeiro quadro rotulado "caindo") e
   `fim_s` (primeiro quadro rotulado "deitado"), tirados dos rótulos oficiais:
     anotacoes-urfall.csv      para ur-fall-rgb/
     anotacoes-urfall-ext.csv  para ur-fall-rgb-ext/ (tempos deslocados pelo
                               trecho acrescentado no começo)

Por que existe a pasta estendida. O detector tem duas exigências que os clipes
curtos do UR Fall não cumprem:

  - RN10: a ocorrência só nasce depois de 3 s no chão. Nas 30 quedas a pessoa
    fica no chão de 0,2 a 2,1 s até o clipe acabar (mediana 0,7 s).
  - Antes de classificar, o detector vê 8 quadros da pessoa para aprender a
    altura dela em pé. Os clipes começam quase direto na queda.

Sem a extensão, o que se mediria seria o tamanho do clipe, não o detector.
Então, na pasta -ext:

  - TODOS os clipes ganham o primeiro quadro repetido por `--pre-s` segundos
    (padrão 2): a pessoa em pé e parada, para o detector aprender a altura;
  - SÓ as quedas ganham o último quadro repetido por `--pos-s` segundos
    (padrão 4): os rótulos oficiais terminam com a pessoa deitada, e repetir o
    quadro simula ela ficar no chão. As atividades normais não têm rótulo de
    fim e não são estendidas no fim, para não inventar permanência no chão.

É dado SINTÉTICO. Todo resultado obtido na pasta -ext tem de dizer isso.

Os vídeos ficam em `dados/videos/`, que o Git ignora.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

import cv2

RAIZ = Path(__file__).resolve().parent
FPS_URFALL = 30.0
LARGURA_METADE = 320

PADRAO_ORIGEM = RAIZ / "dados" / "videos" / "ur-fall"
PADRAO_RGB = RAIZ / "dados" / "videos" / "ur-fall-rgb"
PADRAO_EXT = RAIZ / "dados" / "videos" / "ur-fall-rgb-ext"
PADRAO_ANOTACOES = RAIZ / "dados" / "anotacoes-urfall.csv"
PADRAO_ANOTACOES_EXT = RAIZ / "dados" / "anotacoes-urfall-ext.csv"


def ler_rotulos(csv_rotulos: Path) -> dict[str, list[tuple[int, int]]]:
    """sequência -> [(quadro, rótulo)]. Rótulo: -1 em pé, 0 caindo, 1 deitado."""
    rotulos: dict[str, list[tuple[int, int]]] = defaultdict(list)
    with csv_rotulos.open(encoding="utf-8", newline="") as f:
        for linha in csv.reader(f):
            rotulos[linha[0]].append((int(linha[1]), int(linha[2])))
    return {seq: sorted(q) for seq, q in rotulos.items()}


def momentos_da_queda(quadros: list[tuple[int, int]]) -> tuple[float, float] | None:
    """(inicio_s, fim_s): quando começa a cair e quando chega ao chão.

    O quadro 1 está em t = 0. Sem quadro "deitado" não há queda a anotar.
    """
    caindo = [q for q, r in quadros if r == 0]
    deitado = [q for q, r in quadros if r == 1]
    if not deitado:
        return None
    inicio = caindo[0] if caindo else deitado[0]
    return (inicio - 1) / FPS_URFALL, (deitado[0] - 1) / FPS_URFALL


def _abrir_saida(destino: Path, fps: float, altura: int) -> cv2.VideoWriter:
    destino.parent.mkdir(parents=True, exist_ok=True)
    saida = cv2.VideoWriter(str(destino), cv2.VideoWriter_fourcc(*"mp4v"), fps, (LARGURA_METADE, altura))
    if not saida.isOpened():
        raise RuntimeError(f"não conseguiu gravar {destino}")
    return saida


def recortar(origem: Path, destino_rgb: Path, destino_ext: Path, pre_s: float, pos_s: float) -> int:
    """Grava a metade RGB, pura e estendida. Devolve quantos quadros tem o original.

    Na versão estendida, o primeiro quadro se repete `pre_s` segundos antes do
    clipe e o último, `pos_s` segundos depois (`pos_s` = 0 não estende o fim).
    """
    leitor = cv2.VideoCapture(str(origem))
    if not leitor.isOpened():
        raise RuntimeError(f"não abriu {origem}")
    fps = leitor.get(cv2.CAP_PROP_FPS) or FPS_URFALL
    altura = int(leitor.get(cv2.CAP_PROP_FRAME_HEIGHT))
    puro = _abrir_saida(destino_rgb, fps, altura)
    estendido = _abrir_saida(destino_ext, fps, altura)

    n = 0
    ultimo = None
    while True:
        ok, quadro = leitor.read()
        if not ok:
            break
        ultimo = quadro[:, LARGURA_METADE:LARGURA_METADE * 2]
        if n == 0:
            for _ in range(round(pre_s * fps)):
                estendido.write(ultimo)
        puro.write(ultimo)
        estendido.write(ultimo)
        n += 1
    if ultimo is not None:
        for _ in range(round(pos_s * fps)):
            estendido.write(ultimo)
    leitor.release()
    puro.release()
    estendido.release()
    return n


def main() -> int:
    p = argparse.ArgumentParser(description="Prepara o UR Fall (cam0) para o arnês de avaliação")
    p.add_argument("--origem", type=Path, default=PADRAO_ORIGEM)
    p.add_argument("--pre-s", type=float, default=2.0, help="segundos do primeiro quadro repetidos antes de todo clipe (pasta -ext)")
    p.add_argument("--pos-s", type=float, default=4.0, help="segundos do último quadro repetidos depois de cada queda (pasta -ext)")
    p.add_argument("--refazer", action="store_true", help="regrava mesmo que o clipe já exista")
    args = p.parse_args()

    csv_rotulos = args.origem / "urfall-cam0-falls.csv"
    if not csv_rotulos.exists():
        print(f"Falta {csv_rotulos}. É o arquivo de rótulos oficial do UR Fall.")
        return 2
    rotulos = ler_rotulos(csv_rotulos)

    clipes = sorted(args.origem.glob("*.mp4"))
    if not clipes:
        print(f"Nenhum .mp4 em {args.origem}")
        return 2

    linhas: list[dict] = []
    linhas_ext: list[dict] = []
    for caminho in clipes:
        nome = caminho.name
        sequencia = nome.removesuffix("-cam0.mp4")
        eh_queda = sequencia.startswith("fall")
        destino_rgb = PADRAO_RGB / nome
        destino_ext = PADRAO_EXT / nome

        if args.refazer or not destino_rgb.exists() or not destino_ext.exists():
            # Quedas: o fim é estendido. Atividades normais: só o começo.
            n = recortar(caminho, destino_rgb, destino_ext, args.pre_s, args.pos_s if eh_queda else 0.0)
            print(f"  {nome:22s} {n:4d} quadros")

        if eh_queda:
            momentos = momentos_da_queda(rotulos.get(sequencia, []))
            if momentos is None:
                print(f"  ! {sequencia}: sem quadro rotulado como deitado; fica de fora")
                continue
            inicio, fim = momentos
            base = {
                "arquivo": nome, "tem_queda": "sim", "cenario": "queda_ur_fall", "conjunto": "",
                "observacao": "UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais)",
            }
            linhas.append({**base, "inicio_s": f"{inicio:.2f}", "fim_s": f"{fim:.2f}"})
            linhas_ext.append({
                **base,
                "inicio_s": f"{inicio + args.pre_s:.2f}", "fim_s": f"{fim + args.pre_s:.2f}",
                "observacao": base["observacao"] + f"; clipe estendido (+{args.pre_s:g} s no inicio, +{args.pos_s:g} s no fim): SINTETICO",
            })
        else:
            base = {
                "arquivo": nome, "tem_queda": "nao", "inicio_s": "", "fim_s": "",
                "cenario": "adl_ur_fall", "conjunto": "",
            }
            linhas.append({**base, "observacao": "UR Fall cam0; atividade normal"})
            linhas_ext.append({**base, "observacao": f"UR Fall cam0; atividade normal; +{args.pre_s:g} s no inicio: SINTETICO"})

    campos = ["arquivo", "tem_queda", "inicio_s", "fim_s", "cenario", "observacao", "conjunto"]
    for destino, conteudo in ((PADRAO_ANOTACOES, linhas), (PADRAO_ANOTACOES_EXT, linhas_ext)):
        with destino.open("w", encoding="utf-8", newline="") as f:
            escritor = csv.DictWriter(f, fieldnames=campos)
            escritor.writeheader()
            escritor.writerows(conteudo)

    quedas = sum(1 for l in linhas if l["tem_queda"] == "sim")
    print(f"\nAnotações: {len(linhas)} clipes ({quedas} com queda)")
    print(f"  puros     : {PADRAO_ANOTACOES}  <->  {PADRAO_RGB}")
    print(f"  estendidos: {PADRAO_ANOTACOES_EXT}  <->  {PADRAO_EXT}")
    print(f"            (+{args.pre_s:g} s no inicio de todos; +{args.pos_s:g} s no fim das quedas)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
