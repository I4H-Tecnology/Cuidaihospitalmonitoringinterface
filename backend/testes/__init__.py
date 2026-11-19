"""Testes do backend principal (backend/app): autenticação e autorização.

    python -m unittest discover -s backend/testes -t backend -v

Rodam sem banco e sem Docker: o acesso ao Postgres (`app.db`) é substituído
por respostas combinadas. O que se testa é a regra, não o SQL; as consultas em
si só um banco de verdade prova (como o job `financeiro` faz com o dele).
"""

import os

# `app.seguranca` recusa importar sem chave de assinatura (de propósito: chave
# com valor padrão é chave publicada). Este valor só existe nos testes e precisa
# estar definido ANTES de qualquer teste importar o módulo; por isso fica aqui,
# no __init__ do pacote, que o unittest importa primeiro.
os.environ.setdefault("SECRET_KEY", "chave-que-so-existe-nos-testes-0123456789")

# `app.db` também recusa importar sem DATABASE_URL. O pool nasce fechado
# (open=False), então esta URL, sem senha, nunca chega a conectar: os testes
# trocam o acesso ao banco por respostas combinadas.
os.environ.setdefault("DATABASE_URL", "postgresql://teste@localhost:5432/teste")
