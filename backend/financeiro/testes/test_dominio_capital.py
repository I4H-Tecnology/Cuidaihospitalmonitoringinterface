"""Empréstimos, depreciação, DRE e indicadores."""

import unittest
from datetime import date
from decimal import Decimal as D

from financeiro.dominio import depreciacao as dep
from financeiro.dominio import emprestimo as emp
from financeiro.dominio import indicadores as ind
from financeiro.dominio.demonstrativos import GRUPOS, montar_dre


class Emprestimo(unittest.TestCase):
    def test_price(self):
        parcelas = emp.cronograma("price", "10000.00", "1", 12, date(2026, 10, 31))
        self.assertEqual(len(parcelas), 12)
        primeira, segunda = parcelas[0], parcelas[1]
        self.assertEqual((primeira.juros, primeira.amortizacao, primeira.valor), (D("100.00"), D("788.49"), D("888.49")))
        self.assertEqual(segunda.juros, D("92.12"))
        self.assertTrue(all(p.valor == D("888.49") for p in parcelas[:-1]))
        self.assertEqual(parcelas[-1].saldo_final, D("0.00"))
        self.assertEqual(sum(p.amortizacao for p in parcelas), D("10000.00"))
        # Vencimento no dia 31 volta a ser 31 depois de passar por novembro.
        self.assertEqual([p.vencimento for p in parcelas[:3]], [date(2026, 10, 31), date(2026, 11, 30), date(2026, 12, 31)])

    def test_sac(self):
        parcelas = emp.cronograma("sac", "12000.00", "1", 12, date(2026, 10, 10))
        self.assertTrue(all(p.amortizacao == D("1000.00") for p in parcelas))
        self.assertEqual([p.valor for p in parcelas[:2]], [D("1120.00"), D("1110.00")])
        self.assertEqual(parcelas[-1].valor, D("1010.00"))
        self.assertEqual(emp.custo_total(parcelas)["juros"], D("780.00"))

    def test_carencia_com_juros_pagos(self):
        parcelas = emp.cronograma("price", "10000.00", "1", 12, date(2026, 10, 10), carencia=2)
        self.assertEqual(len(parcelas), 14)
        self.assertEqual([p.valor for p in parcelas[:2]], [D("100.00"), D("100.00")])
        self.assertTrue(all(p.carencia for p in parcelas[:2]))
        self.assertEqual(parcelas[2].valor, D("888.49"))

    def test_carencia_capitalizada(self):
        parcelas = emp.cronograma("price", "10000.00", "1", 12, date(2026, 10, 10), carencia=2, juros_na_carencia="capitalizados")
        self.assertEqual([p.valor for p in parcelas[:2]], [D("0.00"), D("0.00")])
        self.assertEqual(parcelas[2].saldo_inicial, D("10201.00"))
        self.assertEqual(parcelas[2].valor, D("906.35"))
        self.assertEqual(parcelas[-1].saldo_final, D("0.00"))

    def test_taxa_zero_e_validacoes(self):
        parcelas = emp.cronograma("price", "1200.00", "0", 12, date(2026, 10, 10))
        self.assertTrue(all(p.valor == D("100.00") for p in parcelas))
        with self.assertRaises(ValueError):
            emp.cronograma("alemao", "1000", "1", 12, date(2026, 10, 10))
        with self.assertRaises(ValueError):
            emp.cronograma("price", "1000", "1", 0, date(2026, 10, 10))


class Depreciacao(unittest.TestCase):
    BEM = dep.Bem(D("12000.00"), D("0.00"), 60, date(2026, 1, 15))

    def test_linear(self):
        meses = dep.cronograma(self.BEM, ate=date(2026, 12, 31))
        self.assertEqual(len(meses), 12)
        self.assertTrue(all(m.valor == D("200.00") for m in meses))
        self.assertEqual(meses[-1].valor_contabil, D("9600.00"))
        completo = dep.cronograma(self.BEM)
        self.assertEqual(len(completo), 60)
        self.assertEqual(sum(m.valor for m in completo), D("12000.00"))

    def test_ultima_parcela_fecha_o_arredondamento(self):
        meses = dep.cronograma(dep.Bem(D("1000.00"), D("0"), 3, date(2026, 1, 1)))
        self.assertEqual([m.valor for m in meses], [D("333.33"), D("333.33"), D("333.34")])

    def test_valor_contabil_e_baixa(self):
        self.assertEqual(dep.valor_contabil_em(self.BEM, date(2025, 12, 31)), D("12000.00"))
        vendido = dep.Bem(D("12000.00"), D("0"), 60, date(2026, 1, 15), baixado_em=date(2026, 6, 10))
        self.assertEqual(len(dep.cronograma(vendido)), 6)
        self.assertEqual(dep.valor_contabil_em(vendido, date(2026, 6, 30)), D("10800.00"))
        self.assertEqual(dep.resultado_da_baixa(vendido, D("11000.00")), D("200.00"))
        self.assertEqual(dep.depreciacao_no_periodo(self.BEM, date(2026, 3, 1), date(2026, 5, 31)), D("600.00"))

    def test_terreno_nao_deprecia(self):
        terreno = dep.Bem(D("50000"), D("0"), None, date(2026, 1, 1))
        self.assertEqual(dep.cronograma(terreno), [])
        self.assertEqual(dep.valor_contabil_em(terreno, date(2030, 1, 1)), D("50000"))


class Dre(unittest.TestCase):
    def test_estrutura_e_resultado(self):
        somas = {
            "receita_bruta": D("10000"), "deducoes": D("600"), "custos": D("2000"),
            "despesas_pessoal": D("3000"), "despesas_administrativas": D("1500"),
            "despesas_comerciais": D("400"), "receitas_financeiras": D("50"),
            "despesas_financeiras": D("150"), "outras_despesas": D("100"), "impostos_lucro": D("200"),
        }
        linhas = {l.chave: l for l in montar_dre(somas, depreciacao=D("300"), resultado_venda_de_bens=D("100"))}
        self.assertEqual(linhas["receita_liquida"].valor, D("9400.00"))
        self.assertEqual(linhas["lucro_bruto"].valor, D("7400.00"))
        self.assertEqual(linhas["ebitda"].valor, D("2500.00"))
        self.assertEqual(linhas["ebit"].valor, D("2200.00"))
        self.assertEqual(linhas["lair"].valor, D("2100.00"))
        self.assertEqual(linhas["lucro_liquido"].valor, D("1900.00"))
        self.assertEqual(linhas["lucro_liquido"].percentual, D("20.2"))
        self.assertEqual(linhas["deducoes"].valor, D("-600.00"))

    def test_sem_receita_nao_tem_percentual(self):
        linhas = montar_dre({"despesas_administrativas": D("100")})
        self.assertIsNone(linhas[-1].percentual)
        self.assertEqual(linhas[-1].valor, D("-100.00"))

    def test_grupos_fora_da_dre(self):
        for grupo in ("aporte_socio", "captacao_emprestimo", "compra_ativo", "amortizacao_emprestimo", "retirada_socio"):
            self.assertIsNone(GRUPOS[grupo].linha_dre, grupo)
        self.assertEqual(GRUPOS["compra_ativo"].atividade, "investimento")
        self.assertEqual(GRUPOS["aporte_socio"].atividade, "financiamento")


class Indicadores(unittest.TestCase):
    def test_contas(self):
        self.assertEqual(ind.capital_de_giro(D("10000"), D("5000"), D("8000")), D("7000.00"))
        self.assertEqual(ind.folego_de_caixa(D("12000"), [D("4000"), D("5000"), D("3000")]), D("3.0"))
        self.assertEqual(ind.folego_de_caixa(D("-10"), [D("4000")]), D("0.0"))
        self.assertIsNone(ind.folego_de_caixa(D("12000"), []))
        self.assertEqual(ind.ponto_de_equilibrio(D("10000"), D("4000"), D("3000")), D("5000.00"))
        self.assertIsNone(ind.ponto_de_equilibrio(D("0"), D("0"), D("3000")))
        dia = date(2026, 9, 1)
        pares = [(dia, date(2026, 9, 11), D("100")), (dia, date(2026, 10, 1), D("300"))]
        self.assertEqual(ind.prazo_medio(pares), D("25.0"))
        self.assertEqual(ind.percentual(D("25"), D("200")), D("12.5"))
        self.assertIsNone(ind.percentual(D("1"), D("0")))


if __name__ == "__main__":
    unittest.main()
