"""Roda o pipeline de detecção de quedas sobre a fonte configurada.

    python detectar.py                 # usa o .env
    python detectar.py --janela        # abre uma janela com a anotação ao vivo
    python detectar.py --segundos 30   # roda por 30s e sai
    python detectar.py --features      # imprime as features quadro a quadro

Sair: Q na janela, ou Ctrl+C no terminal.
"""

from __future__ import annotations

import argparse
import logging
from collections import Counter
import os
import statistics
import sys
import time
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

from visao.app.config import carregar  # noqa: E402
from visao.app.pipeline import PipelineDeteccao, ResultadoQuadro  # noqa: E402
from visao.app.regras import Estado  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
logging.getLogger("ultralytics").setLevel(logging.WARNING)

CORES = {
    Estado.NORMAL: (120, 200, 120),   # verde
    Estado.CAINDO: (60, 190, 245),    # âmbar
    Estado.CAIDO: (60, 60, 235),      # vermelho
}


def anotar(resultado: ResultadoQuadro):
    """Desenha caixa, esqueleto e estado sobre o quadro."""
    import cv2

    imagem = resultado.quadro.imagem.copy()

    for r in resultado.pessoas:
        cor = CORES[r.estado]
        p = r.pessoa
        cv2.rectangle(imagem, (int(p.x1), int(p.y1)), (int(p.x2), int(p.y2)), cor, 2)

        rotulo = f"#{p.id_rastreio} {r.estado.value}"
        if r.avaliacao:
            rotulo += f" {r.avaliacao.confianca:.2f}"
        cv2.putText(
            imagem, rotulo, (int(p.x1), max(14, int(p.y1) - 6)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, cor, 2, cv2.LINE_AA,
        )

        if r.pose is not None:
            for (x, y), vis in zip(r.pose.pontos, r.pose.visibilidade):
                if vis >= r.pose.LIMIAR_VISIVEL:
                    cv2.circle(imagem, (int(x), int(y)), 2, cor, -1)

    rodape = f"{resultado.ms_total:.0f}ms  |  {len(resultado.pessoas)} pessoa(s)"
    cv2.putText(
        imagem, rodape, (8, imagem.shape[0] - 8),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 240, 240), 1, cv2.LINE_AA,
    )
    return imagem


def main() -> int:
    p = argparse.ArgumentParser(description="Detecção de quedas do MedSignal")
    p.add_argument("--janela", action="store_true", help="mostra o vídeo anotado")
    p.add_argument("--features", action="store_true", help="imprime as features de cada pessoa")
    p.add_argument("--segundos", type=float, default=0, help="para depois de N segundos (0 = sem limite)")
    args = p.parse_args()

    try:
        cfg = carregar()
    except ValueError as erro:
        print(f"Configuração inválida:\n  {erro}")
        return 2

    print(f"Modo de teste : {'LIGADO' if cfg.modo_teste else 'desligado'}")
    print(f"Fonte         : {cfg.descrever_fonte()}")
    print("Carregando modelos (a primeira execução baixa o peso do YOLO)...\n")

    pipeline = PipelineDeteccao(cfg, pasta_pesos=RAIZ / "pesos")
    latencias: list[float] = []
    ocorrencias = 0
    impedimentos: Counter[str] = Counter()
    limite = time.monotonic() + args.segundos if args.segundos > 0 else None

    try:
        for resultado in pipeline.executar():
            latencias.append(resultado.ms_total)

            for r in resultado.ocorrencias:
                ocorrencias += 1
                print(
                    f"\n  >>> OCORRÊNCIA — pessoa #{r.pessoa.id_rastreio}: "
                    f"{r.avaliacao.motivo}\n"
                )

            if args.features:
                for r in resultado.pessoas:
                    if r.caracteristicas is None:
                        # Silêncio aqui era o comportamento antigo, e escondia
                        # o problema mais comum em campo: enquadramento ruim.
                        impedimentos[r.impedimento or "desconhecido"] += 1
                        print(f"  #{r.pessoa.id_rastreio} sem classificação: {r.impedimento}")
                        continue
                    c = r.caracteristicas
                    print(
                        f"  #{r.pessoa.id_rastreio} {r.estado.value:7s}"
                        f" tronco={c.angulo_tronco:5.1f}°"
                        f" aspecto={c.razao_aspecto:4.2f}"
                        f" altura={c.razao_altura:4.2f}"
                        f" veloc={c.velocidade_queda:+5.2f}"
                        f" abertura={c.abertura_vertical:4.2f}"
                    )

            if args.janela:
                import cv2

                cv2.imshow("MedSignal", anotar(resultado))
                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    break

            if limite and time.monotonic() >= limite:
                break
    except KeyboardInterrupt:
        print("\ninterrompido")
    finally:
        pipeline.fechar()
        if args.janela:
            import cv2

            cv2.destroyAllWindows()

    if latencias:
        print("\n" + "=" * 52)
        print(f"Quadros processados : {len(latencias)}")
        print(f"Latência média      : {statistics.mean(latencias):.0f} ms")
        print(f"Latência p95        : {sorted(latencias)[int(len(latencias) * 0.95) - 1]:.0f} ms")
        print(f"Latência máxima     : {max(latencias):.0f} ms")
        print(f"Ocorrências geradas : {ocorrencias}")
        if impedimentos:
            print("\nPor que pessoas não foram classificadas:")
            for motivo, vezes in impedimentos.most_common():
                print(f"  {vezes:5d}x  {motivo}")
        print("=" * 52)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
