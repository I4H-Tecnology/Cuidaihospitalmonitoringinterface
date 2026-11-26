# Serviço de visão para a VPS: SEM GPU e SEM webcam.
# A fonte é um arquivo de vídeo gravado, em laço (VISAO_FONTE=arquivo). Demonstração.
#
# O contexto de build é a RAIZ do repositório (o código importa "visao.app"):
#   docker build -f deploy/visao.Dockerfile .
# O que entra na imagem é limitado por deploy/visao.Dockerfile.dockerignore.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    YOLO_CONFIG_DIR=/tmp/ultralytics

# libgl1 e libglib2.0-0: o OpenCV (e o mediapipe, que traz o seu) carrega as duas ao importar.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY visao/requirements.txt /tmp/requirements.txt
# Torch de CPU PRIMEIRO. Sem isso o ultralytics puxa o build com CUDA (mais de 2 GB) e
# a imagem não cabe com folga numa VPS de 50 GB nem se constrói em tempo razoável.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 torchvision==0.20.1 \
 && pip install -r /tmp/requirements.txt

COPY visao /srv/visao

# Os pesos do YOLO não são versionados no git: precisam vir no pacote (visao/pesos/yolov8n.pt).
# Falha aqui, com mensagem clara, em vez de tentar baixar em runtime como usuário sem escrita.
RUN test -f /srv/visao/pesos/yolov8n.pt \
 || (echo "ERRO: falta visao/pesos/yolov8n.pt no pacote enviado" && exit 1)

# Usuário sem privilégios. Os dois únicos lugares onde o serviço grava:
#   /clipes                 volume compartilhado com a API (clipes de evidência)
#   /srv/visao/dados/fila   fila em disco das ocorrências que a API ainda não recebeu
# Sem o chown, o serviço morre ao subir com VISAO_CAMERA_ID definido (PermissionError).
RUN useradd --system --uid 10001 --home-dir /tmp app \
 && mkdir -p /clipes /srv/videos /srv/visao/dados/fila \
 && chown -R app:app /clipes /srv/visao/dados
USER app

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=6s --start-period=150s --retries=4 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health', timeout=5).status == 200 else 1)"]

CMD ["python", "visao/servir.py", "--porta", "8001"]
