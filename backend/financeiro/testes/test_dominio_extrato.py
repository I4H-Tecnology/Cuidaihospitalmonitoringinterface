"""Leitura de OFX e CSV, e a sugestão de pares da conciliação."""

import unittest
from datetime import date
from decimal import Decimal as D

from financeiro.dominio import conciliacao as conc
from financeiro.dominio.extrato import ExtratoInvalido, ler_csv, ler_ofx, ler_valor_texto

OFX_SGML = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260925120000[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0001
<BRANCHID>1234-5
<ACCTID>98765-4
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260901
<DTEND>20260925
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260902100000[-3:BRT]
<TRNAMT>1500.00
<FITID>2026090201
<CHECKNUM>000123
<MEMO>PIX RECEBIDO MARIA SILVA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260905
<TRNAMT>-89,90
<FITID>2026090501
<MEMO>PAGTO BOLETO INTERNET FIBRA
</STMTTRN>
<STMTTRN>
<TRNTYPE>FEE
<DTPOSTED>20260910
<TRNAMT>-12.50
<MEMO>TARIFA PACOTE SERVICOS
</STMTTRN>
<STMTTRN>
<TRNTYPE>FEE
<DTPOSTED>20260910
<TRNAMT>-12.50
<MEMO>TARIFA PACOTE SERVICOS
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>3385.10
<DTASOF>20260925
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""

OFX_XML = """<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>341</BANKID><ACCTID>55555</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901</DTSTART><DTEND>20260930</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260915</DTPOSTED><TRNAMT>-250.00</TRNAMT><FITID>A1</FITID><NAME>ALUGUEL</NAME></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260916</DTPOSTED><TRNAMT>-30.00</TRNAMT><FITID>A1</FITID><NAME>OUTRA COISA</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
"""


class Ofx(unittest.TestCase):
    def test_sgml_brasileiro(self):
        extrato = ler_ofx(OFX_SGML.encode("cp1252"))
        self.assertEqual((extrato.banco, extrato.conta), ("0001", "98765-4"))
        self.assertEqual((extrato.inicio, extrato.fim), (date(2026, 9, 1), date(2026, 9, 25)))
        self.assertEqual(extrato.saldo_final, D("3385.10"))
        self.assertEqual(len(extrato.linhas), 4)
        credito, boleto, tarifa1, tarifa2 = extrato.linhas
        self.assertEqual((credito.data, credito.valor, credito.documento), (date(2026, 9, 2), D("1500.00"), "000123"))
        self.assertEqual(boleto.valor, D("-89.90"))  # vírgula decimal, contra a especificação
        # Duas tarifas iguais no mesmo dia e sem FITID continuam sendo duas.
        self.assertNotEqual(tarifa1.identificador, tarifa2.identificador)

    def test_mesmo_arquivo_da_os_mesmos_identificadores(self):
        a = [l.identificador for l in ler_ofx(OFX_SGML).linhas]
        b = [l.identificador for l in ler_ofx(OFX_SGML).linhas]
        self.assertEqual(a, b)

    def test_xml_e_fitid_repetido(self):
        extrato = ler_ofx(OFX_XML)
        self.assertEqual(extrato.banco, "341")
        self.assertEqual([l.valor for l in extrato.linhas], [D("-250.00"), D("-30.00")])
        self.assertEqual(extrato.linhas[0].identificador, "A1")
        self.assertTrue(extrato.linhas[1].identificador.startswith("A1#"))

    def test_acentos_em_cp1252(self):
        texto = OFX_SGML.replace("MARIA SILVA", "JOÃO CONCEIÇÃO")
        extrato = ler_ofx(texto.encode("cp1252"))
        self.assertIn("JOÃO CONCEIÇÃO", extrato.linhas[0].descricao)

    def test_arquivo_que_nao_e_ofx(self):
        with self.assertRaises(ExtratoInvalido):
            ler_ofx("data;valor\n01/09/2026;10,00")


class Csv(unittest.TestCase):
    def test_valor_unico_com_sinal(self):
        texto = "Data;Descrição;Valor\n01/09/2026;PIX RECEBIDO JOAO;1.500,00\n02/09/2026;TARIFA;-12,50\n"
        extrato = ler_csv(texto, "Data", "Descrição", coluna_valor="Valor")
        self.assertEqual([l.valor for l in extrato.linhas], [D("1500.00"), D("-12.50")])
        self.assertEqual(extrato.inicio, date(2026, 9, 1))

    def test_debito_e_credito_separados(self):
        texto = "data,historico,debito,credito\n2026-09-03,ALUGUEL,2000.00,\n2026-09-04,VENDA,,350.00\n"
        extrato = ler_csv(
            texto, "data", "historico", coluna_debito="debito", coluna_credito="credito",
            formato_data="%Y-%m-%d", decimal=".",
        )
        self.assertEqual([l.valor for l in extrato.linhas], [D("-2000.00"), D("350.00")])

    def test_erros_com_linha(self):
        with self.assertRaises(ExtratoInvalido) as erro:
            ler_csv("Data;Desc;Valor\n31/02/2026;X;1,00\n", "Data", "Desc", coluna_valor="Valor")
        self.assertIn("Linha 2", str(erro.exception))
        with self.assertRaises(ExtratoInvalido):
            ler_csv("Data;Desc;Valor\n01/09/2026;X;1,00\n", "Dia", "Desc", coluna_valor="Valor")

    def test_formatos_de_valor(self):
        self.assertEqual(ler_valor_texto("1.234,56"), D("1234.56"))
        self.assertEqual(ler_valor_texto("(12,00)"), D("-12.00"))
        self.assertEqual(ler_valor_texto("12,00-"), D("-12.00"))
        self.assertEqual(ler_valor_texto("R$ 5,00 D"), D("-5.00"))
        self.assertEqual(ler_valor_texto("150,00C"), D("150.00"))
        self.assertEqual(ler_valor_texto("-1,234.56", decimal="."), D("-1234.56"))


class Conciliacao(unittest.TestCase):
    def test_pares_exclusivos_e_conservadores(self):
        linhas = [
            conc.LinhaDoBanco("L1", date(2026, 9, 2), D("1500.00"), "PIX RECEBIDO MARIA SILVA"),
            conc.LinhaDoBanco("L2", date(2026, 9, 10), D("-12.50"), "TARIFA"),
            conc.LinhaDoBanco("L3", date(2026, 9, 10), D("-12.50"), "TARIFA"),
            conc.LinhaDoBanco("L4", date(2026, 9, 12), D("-100.00"), "SAQUE"),
            conc.LinhaDoBanco("L5", date(2026, 9, 8), D("-89.90"), "PAGTO BOLETO INTERNET FIBRA"),
        ]
        candidatos = [
            conc.Candidato("M1", "movimento", date(2026, 9, 2), D("1500.00"), "Mensalidade Maria Silva"),
            conc.Candidato("M2", "movimento", date(2026, 9, 10), D("-12.50"), "Tarifa bancária"),
            conc.Candidato("M3", "movimento", date(2026, 9, 11), D("-12.50"), "Tarifa bancária"),
            conc.Candidato("M4", "movimento", date(2026, 8, 20), D("-100.00"), "Saque"),  # longe demais
            conc.Candidato("P1", "parcela", date(2026, 9, 5), D("-89.90"), "Internet fibra"),
        ]
        r = conc.sugerir(linhas, candidatos)
        self.assertEqual(r["L1"].principal.candidato.id, "M1")
        self.assertEqual(r["L2"].principal.candidato.id, "M2")
        self.assertEqual(r["L3"].principal.candidato.id, "M3")  # M2 já é o par de L2
        self.assertIsNone(r["L4"].principal)
        self.assertEqual(r["L5"].principal.candidato.id, "P1")
        self.assertIn("mesmo valor", r["L1"].principal.motivos)

    def test_valor_diferente_nunca_casa(self):
        linha = conc.LinhaDoBanco("L", date(2026, 9, 2), D("100.00"), "X")
        cand = conc.Candidato("C", "movimento", date(2026, 9, 2), D("100.01"), "X")
        self.assertIsNone(conc.pontuar(linha, cand))

    def test_palavras_ignoram_acento_e_termos_bancarios(self):
        self.assertEqual(conc.palavras("PIX recebido de João Conceição"), {"joao", "conceicao"})


if __name__ == "__main__":
    unittest.main()
