"""Testes do módulo financeiro.

Rodar a partir da raiz do MedSignal:

    visao/.venv/Scripts/python.exe -m unittest discover -s backend/financeiro/testes -t backend

Os de domínio (test_dominio_*) não precisam de nada além do Python. Os de
integração (test_integracao_*) precisam de um Postgres e só rodam com a
variável FINANCEIRO_TESTE_DSN apontando para um banco DESCARTÁVEL — eles
apagam e recriam o schema `financeiro` nele.
"""
