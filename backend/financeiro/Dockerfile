# O módulo financeiro como serviço próprio (ver servidor.py).
#
#   docker build -t financeiro ./backend/financeiro
#   docker run -p 8100:8100 -e FINANCEIRO_DATABASE_URL=... -e FINANCEIRO_JWT_SEGREDO=... financeiro
#
# O contexto de build é a própria pasta do módulo: ela é autossuficiente, e é
# o que permite copiá-la para outro projeto e construir do mesmo jeito.
FROM python:3.12-slim

WORKDIR /srv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt /srv/financeiro/requirements.txt
RUN pip install --no-cache-dir -r /srv/financeiro/requirements.txt

COPY . /srv/financeiro

RUN useradd --system --no-create-home financeiro
USER financeiro

EXPOSE 8100

CMD ["uvicorn", "financeiro.servidor:app", "--host", "0.0.0.0", "--port", "8100"]
