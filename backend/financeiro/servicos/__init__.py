"""Serviços: cada caso de uso do financeiro, do pedido à transação.

Camadas do módulo, de fora para dentro:

    api/        HTTP: valida o formato, confere a permissão, chama o serviço
    servicos/   caso de uso: abre a transação, lê e grava, usa o domínio
    dominio/    regra pura: imposto, parcela, juros, depreciação, DRE
    banco.py    o Postgres, com auditoria e tradução de erro

Convenção: funções públicas recebem um `Contexto` e abrem a própria
transação; as que começam com `_` recebem uma `Consulta` já aberta, para
serem compostas dentro da transação de outra (fechar a folha cria títulos
usando `titulos._inserir_titulo`, na mesma transação do fechamento).
"""
