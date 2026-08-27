"""Diagnóstico da fonte de vídeo.

Roda antes de qualquer coisa do pipeline e responde uma pergunta só: a câmera
configurada abre e entrega frames de verdade?

    python verificar_camera.py            # usa o .env
    python verificar_camera.py --listar   # descobre os índices de webcam
    python verificar_camera.py --salvar   # grava uma amostra em capturas/

Existe porque falha de câmera no dia da apresentação é o pior momento possível
para descobrir que o índice era outro ou que o RTSP estava errado.
"""

from __future__ import annotations

import argparse
import logging
import os
import statistics
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ.parent))


def carregar_env() -> None:
    """Lê o .env da raiz do projeto sem depender de python-dotenv."""
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

from visao.app.config import Fonte, carregar  # noqa: E402
from visao.app.fonte_video import FonteVideo, listar_webcams  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")


def listar() -> int:
    print("Procurando webcams...\n")
    indices = listar_webcams()
    if not indices:
        print("  Nenhuma webcam respondeu.")
        print("  Verifique Configurações > Privacidade e Segurança > Câmera,")
        print("  e feche programas que possam estar usando o dispositivo.")
        return 1
    for i in indices:
        print(f"  índice {i}  ->  VISAO_WEBCAM_INDICE={i}")
    return 0


def verificar(salvar: bool, segundos: float) -> int:
    try:
        cfg = carregar()
    except ValueError as erro:
        print(f"Configuração inválida:\n  {erro}")
        return 2

    print(f"Modo de teste : {'LIGADO' if cfg.modo_teste else 'desligado'}")
    print(f"Fonte         : {cfg.descrever_fonte()}")
    print(f"Taxa alvo     : {cfg.fps_alvo:.1f} fps")
    print(f"Largura alvo  : {cfg.largura}px")
    print()

    if cfg.fonte is Fonte.WEBCAM and not cfg.modo_teste:
        print("Webcam exige MEDSIGNAL_MODO_TESTE=true.")
        return 2

    inicio_abertura = time.monotonic()
    try:
        fonte = FonteVideo(cfg)
        fonte.abrir()
    except RuntimeError as erro:
        print(f"FALHOU\n\n{erro}")
        return 1
    abertura = time.monotonic() - inicio_abertura
    print(f"Abriu em {abertura:.2f}s\n")

    intervalos: list[float] = []
    anterior = None
    ultimo = None
    limite = time.monotonic() + segundos

    try:
        for quadro in fonte.quadros():
            agora = time.monotonic()
            if anterior is not None:
                intervalos.append(agora - anterior)
            anterior = agora
            ultimo = quadro
            if agora >= limite:
                break
    finally:
        fonte.fechar()

    if ultimo is None:
        print("A fonte abriu mas não entregou nenhum quadro.")
        return 1

    fps_real = 1.0 / statistics.mean(intervalos) if intervalos else 0.0
    print(f"Quadros lidos : {ultimo.indice}")
    print(f"Resolução     : {ultimo.largura}x{ultimo.altura}")
    print(f"Taxa medida   : {fps_real:.1f} fps (alvo {cfg.fps_alvo:.1f})")

    if intervalos:
        pior = max(intervalos)
        print(f"Maior intervalo entre quadros: {pior * 1000:.0f} ms")
        # A RFC promete alerta em até 5s. Se um único intervalo já passa disso,
        # a fonte não sustenta a promessa.
        if pior > 5.0:
            print("  ATENÇÃO: intervalo acima dos 5s que a RFC promete para o alerta.")

    if salvar:
        import cv2

        pasta = RAIZ / "capturas"
        pasta.mkdir(exist_ok=True)
        destino = pasta / f"amostra-{int(time.time())}.jpg"
        cv2.imwrite(str(destino), ultimo.imagem)
        print(f"\nAmostra salva em: {destino}")

    print("\nFonte de vídeo operacional.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Verifica a fonte de vídeo do MedSignal")
    p.add_argument("--listar", action="store_true", help="lista os índices de webcam disponíveis")
    p.add_argument("--salvar", action="store_true", help="salva um quadro de amostra em capturas/")
    p.add_argument("--segundos", type=float, default=3.0, help="duração da medição (padrão: 3)")
    args = p.parse_args()

    return listar() if args.listar else verificar(args.salvar, args.segundos)


if __name__ == "__main__":
    raise SystemExit(main())
