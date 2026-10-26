"""O que uma empresa ganha pronto na primeira vez que usa o módulo.

Tudo aqui é ponto de partida e fica editável — menos a CHAVE `sistema`, que é
como o próprio módulo encontra "a categoria de juros pagos" ou "a rubrica do
INSS" sem depender do nome que a empresa deu a elas.
"""

# (grupo, nome, sistema, comportamento)
CATEGORIAS = [
    ("receita_operacional", "Prestação de serviços", None, "variavel"),
    ("receita_operacional", "Mensalidades", None, "variavel"),
    ("receita_operacional", "Venda de produtos", None, "variavel"),
    ("receita_financeira", "Rendimentos de aplicações", "investimento.rendimento", "variavel"),
    ("receita_financeira", "Juros e multas recebidos", "fin.juros_recebidos", "variavel"),
    ("receita_financeira", "Descontos obtidos", "fin.descontos_obtidos", "variavel"),
    ("outras_receitas", "Outras receitas", None, "variavel"),
    ("aporte_socio", "Integralização de capital", "capital.integralizacao", "variavel"),
    ("aporte_socio", "Aporte de sócio", "capital.aporte", "variavel"),
    ("captacao_emprestimo", "Empréstimos e financiamentos recebidos", "emprestimo.captacao", "variavel"),
    ("venda_ativo", "Venda de bens do patrimônio", "patrimonio.venda", "variavel"),
    ("deducao_receita", "Impostos sobre o faturamento (DAS, ISS, PIS, COFINS)", None, "variavel"),
    ("custo_direto", "Materiais e insumos", None, "variavel"),
    ("custo_direto", "Serviços de terceiros", None, "variavel"),
    ("despesa_pessoal", "Salários e ordenados", "folha.salarios", "fixo"),
    ("despesa_pessoal", "Pró-labore", "folha.prolabore", "fixo"),
    ("despesa_pessoal", "Encargos sociais (INSS patronal)", "folha.encargos", "fixo"),
    ("despesa_pessoal", "FGTS", "folha.fgts", "fixo"),
    ("despesa_pessoal", "Benefícios (vale-transporte, refeição, saúde)", "folha.beneficios", "fixo"),
    ("despesa_administrativa", "Aluguel e condomínio", None, "fixo"),
    ("despesa_administrativa", "Energia elétrica", None, "fixo"),
    ("despesa_administrativa", "Água e esgoto", None, "fixo"),
    ("despesa_administrativa", "Internet e telefone", None, "fixo"),
    ("despesa_administrativa", "Contabilidade", None, "fixo"),
    ("despesa_administrativa", "Sistemas e software", None, "fixo"),
    ("despesa_administrativa", "Material de escritório e limpeza", None, "variavel"),
    ("despesa_administrativa", "Manutenção e reparos", None, "variavel"),
    ("despesa_administrativa", "Seguros", None, "fixo"),
    ("despesa_administrativa", "Taxas e licenças", None, "fixo"),
    ("despesa_comercial", "Marketing e publicidade", None, "variavel"),
    ("despesa_comercial", "Comissões", None, "variavel"),
    ("despesa_financeira", "Tarifas bancárias", "fin.tarifas", "fixo"),
    ("despesa_financeira", "Juros e multas pagos", "fin.juros_pagos", "variavel"),
    ("despesa_financeira", "Descontos concedidos", "fin.descontos_concedidos", "variavel"),
    ("despesa_financeira", "Juros de empréstimos", "emprestimo.juros", "fixo"),
    ("despesa_financeira", "IOF e custos de empréstimos", "emprestimo.custos", "variavel"),
    ("despesa_financeira", "Perdas em aplicações", "investimento.perda", "variavel"),
    ("outras_despesas", "Outras despesas", None, "variavel"),
    ("impostos_lucro", "IRPJ", None, "variavel"),
    ("impostos_lucro", "CSLL", None, "variavel"),
    ("compra_ativo", "Compra de bens do patrimônio", "patrimonio.compra", "variavel"),
    ("amortizacao_emprestimo", "Amortização de empréstimos", "emprestimo.amortizacao", "fixo"),
    ("retirada_socio", "Distribuição de lucros", "capital.distribuicao", "variavel"),
    ("retirada_socio", "Devolução de capital", "capital.devolucao", "variavel"),
]

# Credores das guias da folha. Sem documento de propósito: número que não foi
# conferido não entra no cadastro.
PESSOAS_SISTEMA = [
    ("receita_federal", "Receita Federal (DCTFWeb e DARF)"),
    ("fgts", "FGTS Digital (Caixa)"),
]

# (codigo, nome, tipo, calculo, percentual, inss, irrf, fgts, deduz_irrf, entra_dsr, sistema)
RUBRICAS = [
    ("001", "Salário", "provento", "sistema", None, True, True, True, False, False, "salario"),
    ("002", "Pró-labore", "provento", "sistema", None, True, True, False, False, False, "prolabore"),
    ("003", "Bolsa-estágio", "provento", "sistema", None, False, True, False, False, False, "bolsa_estagio"),
    ("010", "DSR sobre variáveis", "provento", "sistema", None, True, True, True, False, False, "dsr"),
    ("050", "Adiantamento salarial", "provento", "sistema", None, False, False, False, False, False, "adiantamento"),
    ("101", "Hora extra 50%", "provento", "horas", "150", True, True, True, False, True, None),
    ("102", "Hora extra 100%", "provento", "horas", "200", True, True, True, False, True, None),
    ("103", "Adicional noturno 20%", "provento", "horas", "20", True, True, True, False, True, None),
    ("104", "Comissões", "provento", "valor", None, True, True, True, False, True, None),
    ("105", "Gratificação", "provento", "valor", None, True, True, True, False, False, None),
    ("106", "Adicional de insalubridade", "provento", "valor", None, True, True, True, False, False, None),
    ("107", "Adicional de periculosidade 30%", "provento", "percentual_salario", "30", True, True, True, False, False, None),
    ("108", "Reembolso de despesas", "provento", "valor", None, False, False, False, False, False, None),
    ("201", "Faltas", "desconto", "dias", None, True, True, True, False, False, None),
    ("202", "Atrasos", "desconto", "horas", "100", True, True, True, False, False, None),
    ("203", "Vale-transporte (6%)", "desconto", "percentual_salario", "6", False, False, False, False, False, None),
    ("204", "Plano de saúde (parte do colaborador)", "desconto", "valor", None, False, False, False, False, False, None),
    ("205", "Pensão alimentícia", "desconto", "valor", None, False, False, False, True, False, None),
    ("206", "Empréstimo consignado", "desconto", "valor", None, False, False, False, False, False, None),
    ("901", "INSS", "desconto", "sistema", None, False, False, False, False, False, "inss"),
    ("902", "IRRF", "desconto", "sistema", None, False, False, False, False, False, "irrf"),
    ("951", "Adiantamento salarial (desconto)", "desconto", "sistema", None, False, False, False, False, False, "desconto_adiantamento"),
    ("301", "Vale-refeição/alimentação (custo da empresa)", "informativo", "valor", None, False, False, False, False, False, None),
    ("302", "Plano de saúde (parte da empresa)", "informativo", "valor", None, False, False, False, False, False, None),
]
