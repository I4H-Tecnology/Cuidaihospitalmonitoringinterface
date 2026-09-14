"""Sobe o serviço de visão com o vídeo anotado acessível pelo navegador.

    python servir.py                 # usa o .env
    python servir.py --porta 8001

Depois disso:
    http://localhost:8001/stream     vídeo anotado (MJPEG)
    http://localhost:8001/estado     estado da detecção em JSON
    http://localhost:8001/health     diagnóstico

O frontend consome o /stream num <img> e o /estado por polling. Encerra com
Ctrl+C.
"""

from __future__ import annotations

import argparse
import os
import sys
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

from visao.app import registro  # noqa: E402
from visao.app.config import carregar  # noqa: E402
from visao.app.servidor import criar_app  # noqa: E402

# Log estruturado: LOG_LEVEL e LOG_FORMATO (json|texto), como no backend.
registro.configurar()


def main() -> int:
    p = argparse.ArgumentParser(description="Serviço de visão do MedSignal")
    p.add_argument("--porta", type=int, default=int(os.environ.get("VISAO_PORTA", "8001")))
    # 0.0.0.0 de propósito: o frontend e o contêiner da API precisam alcançar
    # o serviço; na rede local a exposição é a intenção, não um descuido.
    p.add_argument("--host", default="0.0.0.0")  # nosec B104
    args = p.parse_args()

    try:
        cfg = carregar()
    except ValueError as erro:
        print(f"Configuração inválida:\n  {erro}")
        return 2

    print(f"Modo de teste : {'LIGADO' if cfg.modo_teste else 'desligado'}")
    print(f"Fonte         : {cfg.descrever_fonte()}")
    registro = f"camera {cfg.camera_id}" if cfg.publica_ocorrencias else "DESLIGADO (VISAO_CAMERA_ID vazio)"
    print(f"Registro      : {registro}")
    print(f"Vídeo         : http://localhost:{args.porta}/stream")
    print(f"Estado        : http://localhost:{args.porta}/estado")
    print(f"Saúde         : http://localhost:{args.porta}/health")
    print(f"Clipes        : {'ligados' if cfg.clipes_ativos else 'DESLIGADOS (VISAO_CLIPES=false)'}")
    print("\nCarregando modelos...\n")

    import uvicorn

    uvicorn.run(
        criar_app(cfg, pasta_pesos=RAIZ / "pesos"),
        host=args.host,
        port=args.porta,
        log_level="warning",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
