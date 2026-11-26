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

# Cópia explícita, e não `COPY .`: copiar a pasta inteira levaria para a imagem
# tudo o que estiver nela (um .env esquecido, uma chave, anotações). O SonarQube
# aponta isso como docker:S6470. Arquivo ou pasta nova do módulo entra aqui.
COPY __init__.py acesso.py banco.py erros.py relogio.py servidor.py tarefas.py /srv/financeiro/
COPY api/ /srv/financeiro/api/
COPY dominio/ /srv/financeiro/dominio/
COPY migracoes/ /srv/financeiro/migracoes/
COPY servicos/ /srv/financeiro/servicos/

RUN useradd --system --no-create-home financeiro
USER financeiro

EXPOSE 8100

CMD ["uvicorn", "financeiro.servidor:app", "--host", "0.0.0.0", "--port", "8100"]
