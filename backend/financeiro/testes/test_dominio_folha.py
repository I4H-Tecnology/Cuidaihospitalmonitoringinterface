"""Folha de pagamento contra a conta feita à mão, com as tabelas de 2026."""

import unittest
from datetime import date
from decimal import Decimal as D

from financeiro.dominio import folha as f
from financeiro.dominio.calendario import Calendario

from .tabelas_2026 import INSS_2026, IRRF_2026

INSS = f.TabelaInss.de_dados(INSS_2026)
IRRF = f.TabelaIrrf.de_dados(IRRF_2026)
SETEMBRO = date(2026, 9, 1)
CAL = Calendario()
SIMPLES = f.Encargos()  # Simples Nacional: patronal no DAS
PRESUMIDO = f.Encargos(inss_patronal=D("20"), rat=D("2"), terceiros=D("5.8"))

HORA_EXTRA_50 = f.Rubrica("he50", "Hora extra 50%", "provento", True, True, True, entra_dsr=True)
FALTA = f.Rubrica("falta", "Faltas", "desconto", True, True, True)
PENSAO = f.Rubrica("pensao", "Pensão alimentícia", "desconto", deduz_irrf=True)
VALE_TRANSPORTE = f.Rubrica("vt", "Vale-transporte", "desconto")
VALE_REFEICAO = f.Rubrica("vr", "Vale-refeição (empresa)", "informativo")


class Inss(unittest.TestCase):
    def test_faixas_2026(self):
        self.assertEqual(f.inss_empregado(D("1621.00"), INSS), D("121.58"))  # mínimo oficial
        self.assertEqual(f.inss_empregado(D("3000.00"), INSS), D("248.60"))
        self.assertEqual(f.inss_empregado(D("5000.00"), INSS), D("501.51"))

    def test_teto_e_o_maximo_oficial(self):
        # Arredondando faixa a faixa daria 988,10: a soma é arredondada no fim.
        self.assertEqual(f.inss_empregado(D("8475.55"), INSS), D("988.09"))
        self.assertEqual(f.inss_empregado(D("20000.00"), INSS), D("988.09"))
        self.assertEqual(f.inss_empregado(D("0"), INSS), D("0.00"))

    def test_prolabore_11_por_cento_ate_o_teto(self):
        self.assertEqual(f.inss_contribuinte_individual(D("3000.00"), INSS), D("330.00"))
        self.assertEqual(f.inss_contribuinte_individual(D("10000.00"), INSS), D("932.31"))

    def test_tabela_fora_de_ordem_e_recusada(self):
        with self.assertRaises(ValueError):
            f.TabelaInss.de_dados({"faixas": [{"ate": "2000", "aliquota": "9"}, {"ate": "1000", "aliquota": "7.5"}]})


class Irrf(unittest.TestCase):
    def test_ate_5000_nao_paga(self):
        r = f.irrf_mensal(D("5000.00"), D("501.51"), 0, D("0"), IRRF)
        # Simplificado dá 312,89 pela tabela; a redução zera.
        self.assertTrue(r.simplificado)
        self.assertEqual(r.imposto_pela_tabela, D("312.89"))
        self.assertEqual(r.reducao, D("312.89"))
        self.assertEqual(r.imposto, D("0.00"))

    def test_faixa_de_transicao_6000(self):
        r = f.irrf_mensal(D("6000.00"), D("641.51"), 0, D("0"), IRRF)
        self.assertFalse(r.simplificado)
        self.assertEqual(r.base, D("5358.49"))
        self.assertEqual(r.imposto_pela_tabela, D("564.85"))
        self.assertEqual(r.reducao, D("179.75"))  # 978,62 − 0,133145 × 6000
        self.assertEqual(r.imposto, D("385.10"))

    def test_acima_de_7350_sem_reducao_com_dependentes(self):
        r = f.irrf_mensal(D("8000.00"), D("921.51"), 2, D("0"), IRRF)
        self.assertEqual(r.deducoes_legais, D("1300.69"))
        self.assertEqual(r.imposto, D("933.58"))
        self.assertEqual(r.reducao, D("0"))

    def test_retencao_ate_dez_reais_e_dispensada(self):
        # Estagiário (sem INSS) com R$ 5.020: 317,39 − 310,23 = 7,16.
        r = f.irrf_mensal(D("5020.00"), D("0"), 0, D("0"), IRRF)
        self.assertEqual(r.imposto_pela_tabela, D("317.39"))
        self.assertEqual(r.reducao, D("310.23"))
        self.assertTrue(r.dispensado)
        self.assertEqual(r.imposto, D("0.00"))

    def test_pensao_deduz_da_base(self):
        sem = f.irrf_mensal(D("9000.00"), D("988.09"), 0, D("0"), IRRF)
        com = f.irrf_mensal(D("9000.00"), D("988.09"), 0, D("1000.00"), IRRF)
        self.assertEqual(sem.imposto - com.imposto, D("275.00"))  # 27,5% de 1.000

    def test_ultima_faixa_precisa_ser_aberta(self):
        dados = dict(IRRF_2026, faixas=[{"ate": "2000", "aliquota": "0", "deducao": "0"}])
        with self.assertRaises(ValueError):
            f.TabelaIrrf.de_dados(dados)


class Holerite(unittest.TestCase):
    def test_hora_extra_com_reflexo_no_dsr(self):
        colab = f.Colaborador("clt", D("2200.00"), data_admissao=date(2025, 1, 10))
        he = f.valor_por_calculo("horas", D("2200"), D("220"), D("10"), None, D("150"))
        self.assertEqual(he, D("150.00"))
        # Adicional noturno de 20%: só o adicional, 10 h × R$ 10 × 20%.
        self.assertEqual(f.valor_por_calculo("horas", D("2200"), D("220"), D("10"), None, D("20")), D("20.00"))
        h = f.calcular_holerite(colab, SETEMBRO, [f.Lancamento(HORA_EXTRA_50, he, D("10"))], INSS, IRRF, SIMPLES, CAL)
        por = {i.chave: i.valor for i in h.itens}
        self.assertEqual(por["dsr"], D("30.00"))  # 150 ÷ 25 dias úteis × 5 descansos
        self.assertEqual(h.total_proventos, D("2380.00"))
        self.assertEqual(h.inss, D("189.89"))
        self.assertEqual(h.irrf, D("0.00"))
        self.assertEqual(h.fgts, D("190.40"))
        self.assertEqual(h.liquido, D("2190.11"))
        self.assertEqual(h.custo_total, D("2570.40"))

    def test_encargos_do_presumido(self):
        colab = f.Colaborador("clt", D("2380.00"))
        h = f.calcular_holerite(colab, SETEMBRO, [], INSS, IRRF, PRESUMIDO, CAL)
        self.assertEqual(h.encargos_patronais, D("661.64"))  # 27,8% sem teto
        self.assertEqual(h.custo_total, D("3232.04"))

    def test_admissao_no_meio_do_mes_e_proporcional(self):
        colab = f.Colaborador("clt", D("3000.00"), data_admissao=date(2026, 9, 16))
        h = f.calcular_holerite(colab, SETEMBRO, [], INSS, IRRF, SIMPLES, CAL)
        self.assertEqual(h.dias_trabalhados, 15)
        self.assertEqual(h.total_proventos, D("1500.00"))

    def test_desligado_antes_do_mes_nao_recebe(self):
        colab = f.Colaborador("clt", D("3000.00"), data_admissao=date(2025, 1, 1), data_desligamento=date(2026, 8, 31))
        h = f.calcular_holerite(colab, SETEMBRO, [], INSS, IRRF, SIMPLES, CAL)
        self.assertEqual(h.total_proventos, D("0.00"))
        self.assertTrue(h.avisos)

    def test_falta_reduz_as_bases_e_vale_transporte_nao(self):
        colab = f.Colaborador("clt", D("3000.00"))
        falta = f.valor_por_calculo("dias", D("3000"), D("220"), D("1"), None, None)
        vt = f.valor_por_calculo("percentual_salario", D("3000"), D("220"), None, None, D("6"), limite=D("150.00"))
        self.assertEqual(vt, D("150.00"))  # 6% seria 180; o vale custa 150
        h = f.calcular_holerite(
            colab, SETEMBRO,
            [f.Lancamento(FALTA, falta, D("1")), f.Lancamento(VALE_TRANSPORTE, vt)],
            INSS, IRRF, SIMPLES, CAL,
        )
        self.assertEqual(h.base_inss, D("2900.00"))
        self.assertEqual(h.base_fgts, D("2900.00"))
        self.assertEqual(h.inss, f.inss_empregado(D("2900.00"), INSS))
        self.assertEqual(h.liquido, D("3000.00") - falta - vt - h.inss - h.irrf)

    def test_beneficio_informativo_entra_no_custo_nao_no_liquido(self):
        colab = f.Colaborador("clt", D("3000.00"))
        h = f.calcular_holerite(colab, SETEMBRO, [f.Lancamento(VALE_REFEICAO, D("600.00"))], INSS, IRRF, SIMPLES, CAL)
        self.assertEqual(h.liquido, D("3000.00") - h.inss - h.irrf)
        self.assertEqual(h.beneficios, D("600.00"))
        self.assertEqual(h.custo_total, D("3000.00") + h.fgts + D("600.00"))

    def test_estagiario_sem_inss_nem_fgts(self):
        h = f.calcular_holerite(f.Colaborador("estagio", D("1500.00")), SETEMBRO, [], INSS, IRRF, PRESUMIDO, CAL)
        self.assertEqual((h.inss, h.fgts, h.encargos_patronais), (D("0.00"), D("0.00"), D("0.00")))
        self.assertEqual(h.liquido, D("1500.00"))

    def test_prolabore(self):
        h = f.calcular_holerite(f.Colaborador("prolabore", D("10000.00")), SETEMBRO, [], INSS, IRRF, PRESUMIDO, CAL)
        self.assertEqual(h.inss, D("932.31"))
        self.assertEqual(h.irrf, D("1584.88"))
        self.assertEqual(h.fgts, D("0.00"))
        self.assertEqual(h.encargos_patronais, D("2000.00"))  # só os 20% da CPP
        self.assertEqual(h.liquido, D("7482.81"))

    def test_pj_nao_entra_em_folha(self):
        with self.assertRaises(ValueError):
            f.calcular_holerite(f.Colaborador("pj", D("5000")), SETEMBRO, [], INSS, IRRF, SIMPLES, CAL)

    def test_adiantamento_sem_imposto(self):
        h = f.calcular_adiantamento(f.Colaborador("clt", D("3000.00")), SETEMBRO, D("40"))
        self.assertEqual(h.liquido, D("1200.00"))
        self.assertEqual(h.custo_total, D("0.00"))

    def test_provisao_de_ferias_e_decimo(self):
        p = f.provisao_mensal(f.Colaborador("clt", D("3000.00")), SIMPLES)
        self.assertEqual(p.ferias, D("333.33"))
        self.assertEqual(p.decimo_terceiro, D("250.00"))
        self.assertEqual(p.encargos, D("46.67"))  # 8% de FGTS sobre 583,33


class FechamentoDaFolha(unittest.TestCase):
    def _holerites(self):
        return [
            f.HoleriteParaFechar("a", "Ana", "enf", "clt", D("2190.11"), D("189.89"), D("0"), D("190.40"), D("0")),
            f.HoleriteParaFechar(
                "b", "Beto", "adm", "prolabore", D("7482.81"), D("932.31"), D("1584.88"), D("0"), D("2000.00"),
                repasses=(("p1", "pensão", D("500.00")),),
            ),
        ]

    def test_vencimentos_legais(self):
        v = f.vencimentos_padrao(SETEMBRO, CAL)
        self.assertEqual(v["salario"], date(2026, 10, 6))
        self.assertEqual(v["dctfweb"], date(2026, 10, 20))
        outubro = f.vencimentos_padrao(date(2026, 10, 1), CAL)
        self.assertEqual(outubro["fgts"], date(2026, 11, 19))  # 20/11 é feriado
        self.assertEqual(outubro["salario"], date(2026, 11, 7))

    def test_titulos_gerados_e_categorias(self):
        v = f.vencimentos_padrao(SETEMBRO, CAL)
        titulos = f.titulos_da_folha("mensal", SETEMBRO, self._holerites(), v["salario"], v)
        por_chave = {t.chave: t for t in titulos}
        self.assertEqual(set(por_chave), {"liquido:a", "liquido:b", "repasse:p1", "dctfweb", "fgts"})
        self.assertEqual(por_chave["liquido:b"].partes[0].categoria, "folha.prolabore")
        self.assertEqual(por_chave["liquido:b"].descricao, "Pró-labore 09/2026 — Beto")

        guia = por_chave["dctfweb"]
        self.assertEqual(guia.valor, D("189.89") + D("932.31") + D("1584.88") + D("2000.00"))
        partes = {(p.categoria, p.centro_custo): p.valor for p in guia.partes}
        self.assertEqual(partes[("folha.salarios", "enf")], D("189.89"))
        # INSS e IRRF do sócio ficam no pró-labore; a CPP, em encargos.
        self.assertEqual(partes[("folha.prolabore", "adm")], D("2517.19"))
        self.assertEqual(partes[("folha.encargos", "adm")], D("2000.00"))
        self.assertEqual(por_chave["fgts"].valor, D("190.40"))
        self.assertEqual(por_chave["fgts"].vencimento, date(2026, 10, 20))

    def test_guias_separadas(self):
        v = f.vencimentos_padrao(SETEMBRO, CAL)
        titulos = f.titulos_da_folha("mensal", SETEMBRO, self._holerites(), v["salario"], v, guia_unica=False)
        chaves = {t.chave for t in titulos}
        self.assertTrue({"inss", "irrf", "fgts"} <= chaves)
        self.assertNotIn("dctfweb", chaves)

    def test_adiantamento_so_gera_liquidos(self):
        holerites = [f.HoleriteParaFechar("a", "Ana", None, "clt", D("1200.00"), D("0"), D("0"), D("0"), D("0"))]
        titulos = f.titulos_da_folha("adiantamento", SETEMBRO, holerites, date(2026, 9, 20), {})
        self.assertEqual([t.chave for t in titulos], ["liquido:a"])
        self.assertTrue(titulos[0].descricao.startswith("Adiantamento"))


if __name__ == "__main__":
    unittest.main()
