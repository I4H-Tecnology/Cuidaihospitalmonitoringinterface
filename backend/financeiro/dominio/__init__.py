"""Regras puras do financeiro: só cálculo, nenhum banco, nenhuma rede.

Tudo aqui recebe valores e devolve valores. É a parte que mais importa estar
certa (imposto, parcela, juros, depreciação) e por isso a que tem mais teste:
sem banco nem HTTP no meio, cada regra é conferida com a conta feita à mão.
"""
