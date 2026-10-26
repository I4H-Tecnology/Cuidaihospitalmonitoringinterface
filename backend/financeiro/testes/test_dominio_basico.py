"""Dinheiro, documentos, calendário e recorrência."""

import unittest
from datetime import date
from decimal import Decimal as D

from financeiro.dominio import calendario as cal
from financeiro.dominio import documentos as doc
from financeiro.dominio.dinheiro import (
    ValorInvalido,
    dinheiro,
    dividir_em_parcelas,
    percentual_de,
    ratear,
)
from financeiro.dominio.recorrencia import ocorrencias


class Dinheiro(unittest.TestCase):
    def test_arredonda_meio_para_cima(self):
        self.assertEqual(dinheiro("10.005"), D("10.01"))
        self.assertEqual(dinheiro("10.004"), D("10.00"))
        self.assertEqual(dinheiro(3), D("3.00"))

    def test_recusa_float_e_bool(self):
        with self.assertRaises(TypeError):
            dinheiro(0.1)
        with self.assertRaises(TypeError):
            dinheiro(True)
        with self.assertRaises(ValorInvalido):
            dinheiro("abc")
        with self.assertRaises(ValorInvalido):
            dinheiro("NaN")

    def test_parcelas_somam_o_total_e_sobra_vai_na_primeira(self):
        self.assertEqual(dividir_em_parcelas("100.00", 3), [D("33.34"), D("33.33"), D("33.33")])
        partes = dividir_em_parcelas("1000.01", 7)
        self.assertEqual(sum(partes), D("1000.01"))
        self.assertTrue(all(p == partes[1] for p in partes[1:]))

    def test_rateio_fecha_no_centavo(self):
        self.assertEqual(ratear("100.00", [1, 1, 1]), [D("33.34"), D("33.33"), D("33.33")])
        partes = ratear("10.00", [D("2500.00"), D("7500.00")])
        self.assertEqual(partes, [D("2.50"), D("7.50")])
        partes = ratear("-0.05", [1, 1])
        self.assertEqual(sum(partes), D("-0.05"))
        with self.assertRaises(ValorInvalido):
            ratear("10", [0, 0])

    def test_percentual(self):
        self.assertEqual(percentual_de("3000", "7.5"), D("225.00"))


class Documentos(unittest.TestCase):
    def test_cpf(self):
        self.assertTrue(doc.cpf_valido("529.982.247-25"))
        self.assertFalse(doc.cpf_valido("529.982.247-26"))
        self.assertFalse(doc.cpf_valido("111.111.111-11"))

    def test_cnpj_numerico(self):
        self.assertTrue(doc.cnpj_valido("11.222.333/0001-81"))
        self.assertFalse(doc.cnpj_valido("11.222.333/0001-82"))

    def test_cnpj_alfanumerico_exemplo_da_receita(self):
        # Exemplo oficial: 12.ABC.345/01DE-35 (vale desde julho de 2026).
        self.assertTrue(doc.cnpj_valido("12.ABC.345/01DE-35"))
        self.assertTrue(doc.cnpj_valido("12abc34501de35"))
        self.assertFalse(doc.cnpj_valido("12.ABC.345/01DE-36"))
        self.assertEqual(doc.tipo_do_documento("12ABC34501DE35"), "cnpj")

    def test_formatar(self):
        self.assertEqual(doc.formatar("52998224725"), "529.982.247-25")
        self.assertEqual(doc.formatar("12ABC34501DE35"), "12.ABC.345/01DE-35")


class Calendario(unittest.TestCase):
    def test_pascoa(self):
        self.assertEqual(cal.pascoa(2024), date(2024, 3, 31))
        self.assertEqual(cal.pascoa(2025), date(2025, 4, 20))
        self.assertEqual(cal.pascoa(2026), date(2026, 4, 5))
        self.assertEqual(cal.pascoa(2027), date(2027, 3, 28))

    def test_feriados_moveis_2026(self):
        bancarios = cal.dias_sem_expediente_bancario(2026)
        self.assertIn(date(2026, 2, 16), bancarios)  # Carnaval
        self.assertIn(date(2026, 2, 17), bancarios)
        self.assertIn(date(2026, 4, 3), bancarios)  # Paixão
        self.assertIn(date(2026, 6, 4), bancarios)  # Corpus Christi
        # Carnaval não é feriado em lei: conta para o prazo do salário.
        self.assertNotIn(date(2026, 2, 16), cal.feriados_nacionais(2026))

    def test_consciencia_negra_so_a_partir_de_2024(self):
        self.assertIn(date(2024, 11, 20), cal.feriados_nacionais(2024))
        self.assertNotIn(date(2023, 11, 20), cal.feriados_nacionais(2023))

    def test_dia_util_bancario_antecipa_tributo(self):
        c = cal.Calendario()
        # 20/11/2026 é sexta e é feriado: a guia vence na quinta, 19.
        self.assertEqual(c.antecipar_para_dia_util(date(2026, 11, 20)), date(2026, 11, 19))
        # 20/09/2026 é domingo: antecipa para sexta, 18.
        self.assertEqual(c.antecipar_para_dia_util(date(2026, 9, 20)), date(2026, 9, 18))
        self.assertEqual(c.prorrogar_para_dia_util(date(2026, 9, 20)), date(2026, 9, 21))

    def test_quinto_dia_util_conta_sabado(self):
        c = cal.Calendario()
        # Outubro/2026: 1 qui, 2 sex, 3 sáb, 5 seg, 6 ter.
        self.assertEqual(c.enesimo_dia_util_trabalhista(2026, 10, 5), date(2026, 10, 6))
        # Novembro/2026: 1 dom, 2 Finados; 3, 4, 5, 6 e sábado 7.
        self.assertEqual(c.enesimo_dia_util_trabalhista(2026, 11, 5), date(2026, 11, 7))

    def test_feriado_da_empresa(self):
        c = cal.Calendario(feriados_extras={date(2026, 10, 6)})
        self.assertEqual(c.enesimo_dia_util_trabalhista(2026, 10, 5), date(2026, 10, 7))

    def test_dias_uteis_e_descansos_setembro_2026(self):
        # 30 dias, 4 domingos e o 7 de setembro numa segunda.
        self.assertEqual(cal.Calendario().dias_uteis_e_descansos(date(2026, 9, 1)), (25, 5))

    def test_meses(self):
        self.assertEqual(cal.somar_meses(date(2026, 1, 31), 1), date(2026, 2, 28))
        self.assertEqual(cal.somar_meses(date(2026, 2, 28), 1, 31), date(2026, 3, 31))
        self.assertEqual(cal.somar_meses(date(2026, 11, 15), 3), date(2027, 2, 15))
        self.assertEqual(cal.ler_competencia("2026-09"), date(2026, 9, 1))
        self.assertEqual(cal.escrever_competencia(date(2026, 9, 17)), "2026-09")
        with self.assertRaises(ValueError):
            cal.ler_competencia("09/2026")
        self.assertEqual(len(cal.meses_entre(date(2026, 11, 5), date(2027, 2, 1))), 4)


class Recorrencia(unittest.TestCase):
    def test_mensal_dia_31_respeita_mes_curto(self):
        datas = ocorrencias(date(2026, 1, 15), "mensal", date(2026, 5, 31), dia_vencimento=31)
        self.assertEqual(
            datas,
            [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30), date(2026, 5, 31)],
        )

    def test_mensal_comeca_no_mes_seguinte_se_o_dia_ja_passou(self):
        datas = ocorrencias(date(2026, 9, 15), "mensal", date(2026, 12, 31), dia_vencimento=10)
        self.assertEqual(datas, [date(2026, 10, 10), date(2026, 11, 10), date(2026, 12, 10)])

    def test_semanal_e_fim(self):
        self.assertEqual(len(ocorrencias(date(2026, 9, 1), "semanal", date(2026, 9, 29))), 5)
        datas = ocorrencias(date(2026, 1, 1), "mensal", date(2026, 12, 31), fim=date(2026, 3, 15), dia_vencimento=1)
        self.assertEqual(datas, [date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1)])

    def test_anual_e_continua_de_onde_parou(self):
        self.assertEqual(
            ocorrencias(date(2026, 3, 5), "anual", date(2027, 12, 31), dia_vencimento=5),
            [date(2026, 3, 5), date(2027, 3, 5)],
        )
        datas = ocorrencias(
            date(2026, 1, 10), "mensal", date(2026, 6, 30), dia_vencimento=10, depois_de=date(2026, 3, 10)
        )
        self.assertEqual(datas, [date(2026, 4, 10), date(2026, 5, 10), date(2026, 6, 10)])

    def test_frequencia_desconhecida(self):
        with self.assertRaises(ValueError):
            ocorrencias(date(2026, 1, 1), "diaria", date(2026, 2, 1))


if __name__ == "__main__":
    unittest.main()
