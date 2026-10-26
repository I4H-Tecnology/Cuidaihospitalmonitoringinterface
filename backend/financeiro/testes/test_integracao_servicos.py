"""Serviços contra um Postgres de verdade: regras, gatilhos e as contas de ponta a ponta.

Cada teste usa uma empresa própria (a chave vem do nome do teste), então a
ordem de execução não importa e um teste não enxerga o dado do outro — que é,
aliás, a garantia de isolamento entre empresas sendo exercitada o tempo todo.
"""

import base64
import unittest
from datetime import date
from decimal import Decimal as D

from .apoio import BancoDeTeste
from .test_dominio_extrato import OFX_SGML


def setUpModule():
    BancoDeTeste.preparar()


class Base(unittest.TestCase):
    def setUp(self):
        self.ctx = BancoDeTeste.contexto(self.id())

    def categoria(self, nome, ctx=None):
        from financeiro.servicos import cadastros

        return next(c["id"] for c in cadastros.listar_categorias(ctx or self.ctx) if c["nome"] == nome)

    def conta(self, nome, saldo="0", data=date(2026, 9, 1), tipo="corrente"):
        from financeiro.servicos import cadastros

        return cadastros.criar_conta(
            self.ctx, {"nome": nome, "tipo": tipo, "saldo_inicial": D(saldo), "data_saldo_inicial": data}
        )["id"]

    def saldo(self, conta_id):
        from financeiro.servicos import cadastros

        return next(c["saldo"] for c in cadastros.listar_contas(self.ctx) if c["id"] == conta_id)


class Provisionamento(Base):
    def test_empresa_nasce_pronta_para_usar(self):
        from financeiro.servicos import cadastros, organizacao, padroes, pessoal

        self.assertEqual(len(cadastros.listar_categorias(self.ctx)), len(padroes.CATEGORIAS))
        self.assertEqual(len(pessoal.listar_rubricas(self.ctx)), len(padroes.RUBRICAS))
        contas = cadastros.listar_contas(self.ctx)
        self.assertEqual([(c["nome"], c["saldo"]) for c in contas], [("Caixa", D("0"))])
        # Resolver de novo devolve a mesma empresa, sem provisionar duas vezes.
        self.assertEqual(organizacao.resolver(self.ctx.banco, self.ctx.operador), self.ctx.org_id)


class ContasAPagar(Base):
    def test_parcelas_rateio_pagamento_parcial_estorno_e_cancelamento(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import cadastros, titulos

        banco = self.conta("Banco X", "1000.00")
        fornecedor = cadastros.criar_pessoa(self.ctx, {"tipo": "juridica", "nome": "Imobiliária Teste", "fornecedor": True})["id"]
        t = titulos.criar(self.ctx, {
            "tipo": "pagar", "descricao": "Aluguel e luz", "pessoa_id": fornecedor, "valor_total": D("300.00"),
            "quantidade_parcelas": 3, "primeiro_vencimento": date(2026, 9, 10), "competencia": date(2026, 9, 1),
            "rateio": [
                {"categoria_id": self.categoria("Aluguel e condomínio"), "percentual": D("60")},
                {"categoria_id": self.categoria("Energia elétrica"), "percentual": D("40")},
            ],
        })
        self.assertEqual([p["valor"] for p in t["parcelas"]], [D("100.00")] * 3)
        self.assertEqual([p["vencimento"] for p in t["parcelas"]], [date(2026, 9, 10), date(2026, 10, 10), date(2026, 11, 10)])
        self.assertEqual(sorted(r["valor"] for r in t["rateio"]), [D("120.00"), D("180.00")])

        primeira = t["parcelas"][0]["id"]
        t = titulos.baixar(self.ctx, primeira, {"conta_id": banco, "data": date(2026, 9, 12), "valor": D("60.00"), "juros": D("2.00")})
        parcela = t["parcelas"][0]
        self.assertEqual((parcela["status"], parcela["saldo"]), ("parcial", D("40.00")))
        self.assertEqual(self.saldo(banco), D("938.00"))  # 60 de principal + 2 de juros

        with self.assertRaises(RegraDeNegocio):
            titulos.baixar(self.ctx, primeira, {"conta_id": banco, "valor": D("40.01")})
        with self.assertRaises(RegraDeNegocio):
            titulos.cancelar(self.ctx, t["id"], "tentativa com pagamento")

        baixa = parcela["baixas"][0]["id"]
        t = titulos.estornar_baixa(self.ctx, baixa, "lançado na conta errada")
        self.assertEqual(t["parcelas"][0]["status"], "aberta")
        self.assertEqual(self.saldo(banco), D("1000.00"))
        with self.assertRaises(RegraDeNegocio):
            titulos.estornar_baixa(self.ctx, baixa, "de novo")

        t = titulos.cancelar(self.ctx, t["id"], "lançamento duplicado")
        self.assertTrue(all(p["status"] == "cancelada" for p in t["parcelas"]))
        self.assertIn("baixa", {h["tabela"] for h in t["historico"]})

    def test_lancamento_a_vista_e_edicao(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import titulos

        caixa = self.conta("Caixa loja", "500.00")
        t = titulos.criar(self.ctx, {
            "tipo": "pagar", "descricao": "Material de limpeza", "valor_total": D("80.00"),
            "rateio": [{"categoria_id": self.categoria("Material de escritório e limpeza")}],
            "pagamento": {"conta_id": caixa, "data": date(2026, 9, 14), "forma": "dinheiro"},
        })
        self.assertEqual(t["parcelas"][0]["status"], "paga")
        self.assertEqual(self.saldo(caixa), D("420.00"))
        # Com pagamento, o valor não muda — mas a categoria pode ser corrigida.
        with self.assertRaises(RegraDeNegocio):
            titulos.editar(self.ctx, t["id"], {"valor_total": D("90.00")})
        t = titulos.editar(self.ctx, t["id"], {"rateio": [{"categoria_id": self.categoria("Manutenção e reparos")}]})
        self.assertEqual(t["rateio"][0]["categoria_nome"], "Manutenção e reparos")

    def test_categoria_de_receita_nao_serve_para_conta_a_pagar(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import titulos

        with self.assertRaises(RegraDeNegocio):
            titulos.criar(self.ctx, {
                "tipo": "pagar", "descricao": "Errado", "valor_total": D("10.00"),
                "primeiro_vencimento": date(2026, 9, 20),
                "rateio": [{"categoria_id": self.categoria("Mensalidades")}],
            })


class Reparcelamento(Base):
    """Refazer as parcelas em aberto de um título, inclusive depois de pagar alguma."""

    def titulo_de_tres(self, **extra):
        from financeiro.servicos import titulos

        return titulos.criar(self.ctx, {
            "tipo": "pagar", "descricao": "Equipamento em 3x", "valor_total": D("1200.00"),
            "competencia": date(2026, 9, 1), "quantidade_parcelas": 3, "primeiro_vencimento": date(2026, 9, 10),
            "rateio": [
                {"categoria_id": self.categoria("Manutenção e reparos"), "valor": D("900.00")},
                {"categoria_id": self.categoria("Materiais e insumos"), "valor": D("300.00")},
            ],
            **extra,
        })

    @staticmethod
    def plano(titulo, **mudancas):
        """As parcelas em aberto do título como plano; `p2={...}` muda a parcela 2."""
        return [
            {"id": p["id"], "vencimento": p["vencimento"], "valor": p["valor"], **mudancas.get(f"p{p['numero']}", {})}
            for p in titulo["parcelas"] if p["status"] in ("aberta", "parcial")
        ]

    def test_altera_parcelas_no_lugar_sem_mudar_o_total(self):
        from financeiro.servicos import titulos

        t = self.titulo_de_tres()
        novo = titulos.reparcelar(self.ctx, t["id"], self.plano(
            t, p2={"valor": D("500.00"), "vencimento": date(2026, 10, 20)}, p3={"valor": D("300.00")},
        ))
        self.assertEqual(novo["valor_total"], D("1200.00"))
        self.assertEqual([(p["numero"], p["vencimento"], p["valor"]) for p in novo["parcelas"]], [
            (1, date(2026, 9, 10), D("400.00")), (2, date(2026, 10, 20), D("500.00")), (3, date(2026, 11, 10), D("300.00")),
        ])
        # As mesmas parcelas, alteradas no lugar; categorias intactas.
        self.assertEqual([p["id"] for p in novo["parcelas"]], [p["id"] for p in t["parcelas"]])
        self.assertEqual(sorted(r["valor"] for r in novo["rateio"]), [D("300.00"), D("900.00")])

    def test_reparcela_o_saldo_depois_de_pagar_a_primeira(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import titulos

        banco = self.conta("Banco R", "5000.00")
        t = self.titulo_de_tres()
        titulos.baixar(self.ctx, t["parcelas"][0]["id"], {"conta_id": banco, "data": date(2026, 9, 10)})
        # O saldo de 800 em quatro vezes de 200: as duas em aberto saem, quatro entram.
        vencimentos = (date(2026, 10, 5), date(2026, 11, 5), date(2026, 12, 5), date(2027, 1, 5))
        plano = [{"vencimento": v, "valor": D("200.00")} for v in vencimentos]
        with self.assertRaises(RegraDeNegocio) as erro:
            titulos.reparcelar(self.ctx, t["id"], plano)
        self.assertIn("motivo", str(erro.exception))

        novo = titulos.reparcelar(self.ctx, t["id"], plano, "Fornecedor aceitou 4x de 200")
        self.assertEqual(novo["valor_total"], D("1200.00"))
        self.assertEqual([(p["numero"], p["status"], p["valor"]) for p in novo["parcelas"]], [
            (1, "paga", D("400.00")), (2, "aberta", D("200.00")), (3, "aberta", D("200.00")),
            (4, "aberta", D("200.00")), (5, "aberta", D("200.00")),
        ])
        self.assertEqual(novo["parcelas"][0]["id"], t["parcelas"][0]["id"])
        self.assertFalse({p["id"] for p in t["parcelas"][1:]} & {p["id"] for p in novo["parcelas"]})
        # O histórico do título conta o que houve, com o motivo.
        exclusoes = [h for h in novo["historico"] if h["tabela"] == "parcela" and h["operacao"] == "DELETE"]
        self.assertEqual(len(exclusoes), 2)
        self.assertEqual({h["motivo"] for h in exclusoes}, {"Fornecedor aceitou 4x de 200"})

    def test_mudar_o_total_leva_o_rateio_junto(self):
        from financeiro.servicos import titulos

        t = self.titulo_de_tres()
        # Juros da renegociação na última parcela: 400 vira 520, e o total, 1.320.
        novo = titulos.reparcelar(self.ctx, t["id"], self.plano(t, p3={"valor": D("520.00")}), "Juros da renegociação")
        self.assertEqual(novo["valor_total"], D("1320.00"))
        self.assertEqual(sorted(r["valor"] for r in novo["rateio"]), [D("330.00"), D("990.00")])  # 25% / 75%

    def test_parcela_parcial_fica_e_nao_desce_abaixo_do_pago(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import titulos

        banco = self.conta("Banco P2", "5000.00")
        t = self.titulo_de_tres()
        segunda = t["parcelas"][1]["id"]
        t = titulos.baixar(self.ctx, segunda, {"conta_id": banco, "data": date(2026, 9, 12), "valor": D("150.00")})
        with self.assertRaises(RegraDeNegocio):
            titulos.reparcelar(self.ctx, t["id"], [p for p in self.plano(t) if p["id"] != segunda], "tirar a parcial")
        with self.assertRaises(RegraDeNegocio):
            titulos.reparcelar(self.ctx, t["id"], self.plano(t, p2={"valor": D("100.00")}), "abaixo do pago")
        # Igual ao que já foi pago: a parcela fica quitada, e a diferença vai para a terceira.
        novo = titulos.reparcelar(self.ctx, t["id"], self.plano(t, p2={"valor": D("150.00")}, p3={"valor": D("650.00")}))
        self.assertEqual([p["status"] for p in novo["parcelas"]], ["aberta", "paga", "aberta"])
        self.assertEqual(novo["valor_total"], D("1200.00"))

    def test_excluir_parcela_exige_a_permissao_de_excluir(self):
        from financeiro.acesso import todas_as_permissoes
        from financeiro.erros import SemPermissao
        from financeiro.servicos import titulos

        t = self.titulo_de_tres()
        sem_excluir = BancoDeTeste.contexto(self.id(), permissoes=todas_as_permissoes() - {"operacao:excluir"})
        # Mudar vencimento e valor é editar...
        titulos.reparcelar(sem_excluir, t["id"], self.plano(t, p3={"vencimento": date(2026, 11, 20)}))
        # ...juntar as duas últimas numa só exclui uma delas.
        plano = [self.plano(t)[0], {"id": t["parcelas"][1]["id"], "vencimento": date(2026, 10, 10), "valor": D("800.00")}]
        with self.assertRaises(SemPermissao):
            titulos.reparcelar(sem_excluir, t["id"], plano, "juntar as duas últimas")
        novo = titulos.reparcelar(self.ctx, t["id"], plano, "juntar as duas últimas")
        self.assertEqual([p["valor"] for p in novo["parcelas"]], [D("400.00"), D("800.00")])

    def test_competencia_fechada_redistribui_sem_mudar_total(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import organizacao, titulos

        t = self.titulo_de_tres(competencia=date(2026, 7, 1))
        organizacao.alterar_fechamento(self.ctx, date(2026, 7, 1), "Fechamento de julho")
        with self.assertRaises(RegraDeNegocio) as erro:
            titulos.reparcelar(self.ctx, t["id"], self.plano(t, p3={"valor": D("500.00")}), "juros")
        self.assertIn("período fechado", str(erro.exception))
        novo = titulos.reparcelar(self.ctx, t["id"], self.plano(t, p2={"valor": D("300.00")}, p3={"valor": D("500.00")}))
        self.assertEqual(novo["valor_total"], D("1200.00"))

    def test_titulo_gerado_por_outra_parte_do_modulo_nao_reparcela(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import titulos

        with BancoDeTeste.banco.escrever(self.ctx.operador) as db:
            titulo_id = titulos._inserir_titulo(
                db, self.ctx.org_id, "Teste", tipo="pagar", descricao="Parcela do empréstimo",
                competencia=date(2026, 9, 1), parcelas=[titulos.ParcelaNova(date(2026, 9, 20), D("100.00"))],
                rateio=[titulos.RateioNovo(self.categoria("Aluguel e condomínio"), None, D("100.00"))],
                origem="emprestimo",
            )
        t = titulos.obter(self.ctx, titulo_id)
        with self.assertRaises(RegraDeNegocio):
            titulos.reparcelar(self.ctx, titulo_id, self.plano(t, p1={"valor": D("90.00")}), "tentar")

    def test_titulo_tem_numero_em_sequencia_por_empresa(self):
        from financeiro.servicos import titulos

        a = self.titulo_de_tres()
        b = self.titulo_de_tres()
        self.assertEqual(b["numero"], a["numero"] + 1)
        outra = BancoDeTeste.contexto(self.id() + "-outra")
        c = titulos.criar(outra, {
            "tipo": "pagar", "descricao": "Primeiro da outra", "valor_total": D("10.00"),
            "primeiro_vencimento": date(2026, 9, 20), "rateio": [{"categoria_id": self.categoria("Aluguel e condomínio", outra)}],
        })
        self.assertEqual(c["numero"], 1)
        # A busca da lista acha o título pelo número.
        lista = titulos.listar_parcelas(self.ctx, "pagar", "todos", busca=f"#{b['numero']}")
        self.assertEqual({p["titulo_id"] for p in lista["itens"]}, {b["id"]})
        self.assertEqual({p["titulo_numero"] for p in lista["itens"]}, {b["numero"]})


class GarantiasDoBanco(Base):
    def test_soma_das_parcelas_e_conferida_no_commit(self):
        from financeiro.erros import RegraDeNegocio

        categoria = self.categoria("Aluguel e condomínio")
        with self.assertRaises(RegraDeNegocio) as erro:
            with self.ctx.escrever() as db:
                titulo = db.valor(
                    "INSERT INTO financeiro.titulo (organizacao_id, tipo, descricao, competencia, valor_total) "
                    "VALUES (%s, 'pagar', 'Soma errada', '2026-09-01', 100) RETURNING id",
                    (self.ctx.org_id,),
                )
                db.executar(
                    "INSERT INTO financeiro.parcela (organizacao_id, titulo_id, numero, vencimento, valor) VALUES (%s, %s, 1, '2026-09-10', 90)",
                    (self.ctx.org_id, titulo),
                )
                db.executar(
                    "INSERT INTO financeiro.rateio (organizacao_id, titulo_id, categoria_id, valor) VALUES (%s, %s, %s, 100)",
                    (self.ctx.org_id, titulo, categoria),
                )
        self.assertIn("parcelas somam", str(erro.exception))
        with self.ctx.ler() as db:
            self.assertEqual(db.valor("SELECT count(*) FROM financeiro.titulo WHERE descricao = 'Soma errada'"), 0)

    def test_empresa_nao_referencia_dado_de_outra(self):
        from financeiro.erros import RegraDeNegocio

        outra = BancoDeTeste.contexto(self.id() + "-outra")
        categoria_de_a = self.categoria("Aluguel e condomínio")
        with self.assertRaises(RegraDeNegocio):
            with outra.escrever() as db:
                titulo = db.valor(
                    "INSERT INTO financeiro.titulo (organizacao_id, tipo, descricao, competencia, valor_total) "
                    "VALUES (%s, 'pagar', 'Intrusa', '2026-09-01', 100) RETURNING id",
                    (outra.org_id,),
                )
                db.executar(
                    "INSERT INTO financeiro.parcela (organizacao_id, titulo_id, numero, vencimento, valor) VALUES (%s, %s, 1, '2026-09-10', 100)",
                    (outra.org_id, titulo),
                )
                # A chave estrangeira é (organizacao_id, categoria_id): não fecha.
                db.executar(
                    "INSERT INTO financeiro.rateio (organizacao_id, titulo_id, categoria_id, valor) VALUES (%s, %s, %s, 100)",
                    (outra.org_id, titulo, categoria_de_a),
                )

    def test_auditoria_registra_quem_e_o_que_mudou(self):
        from financeiro.servicos import cadastros, organizacao

        conta = self.conta("Conta auditada")
        cadastros.editar_conta(self.ctx, conta, {"nome": "Conta renomeada"})
        trilha = organizacao.auditoria(self.ctx, "conta", str(conta))
        self.assertEqual([t["operacao"] for t in trilha], ["UPDATE", "INSERT"])
        self.assertEqual(trilha[0]["antes"], {"nome": "Conta auditada"})
        self.assertEqual(trilha[0]["depois"], {"nome": "Conta renomeada"})
        self.assertEqual(trilha[0]["usuario_nome"], "Teste")


class PeriodoFechado(Base):
    def test_fechar_bloqueia_o_passado_mas_deixa_estornar_hoje(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import organizacao, titulos

        banco = self.conta("Banco P", "500.00", date(2026, 7, 1))
        mensalidade = self.categoria("Mensalidades")
        julho = titulos.criar(self.ctx, {
            "tipo": "receber", "descricao": "Mensalidade julho", "valor_total": D("200.00"),
            "competencia": date(2026, 7, 1), "primeiro_vencimento": date(2026, 7, 10),
            "rateio": [{"categoria_id": mensalidade}],
            "pagamento": {"conta_id": banco, "data": date(2026, 7, 10)},
        })
        org = organizacao.alterar_fechamento(self.ctx, date(2026, 7, 1), "Fechamento de julho")
        self.assertEqual(org["fechado_ate"], date(2026, 7, 31))

        with self.assertRaises(RegraDeNegocio):
            titulos.criar(self.ctx, {
                "tipo": "receber", "descricao": "Retroativa", "valor_total": D("50.00"),
                "competencia": date(2026, 7, 1), "primeiro_vencimento": date(2026, 7, 20),
                "rateio": [{"categoria_id": mensalidade}],
            })
        setembro = titulos.criar(self.ctx, {
            "tipo": "receber", "descricao": "Mensalidade setembro", "valor_total": D("200.00"),
            "competencia": date(2026, 9, 1), "primeiro_vencimento": date(2026, 9, 10),
            "rateio": [{"categoria_id": mensalidade}],
        })
        with self.assertRaises(RegraDeNegocio):
            titulos.baixar(self.ctx, setembro["parcelas"][0]["id"], {"conta_id": banco, "data": date(2026, 7, 31)})
        with self.assertRaises(RegraDeNegocio):
            titulos.cancelar(self.ctx, julho["id"], "mudar o resultado de julho")

        # O estorno não reescreve julho: devolve o dinheiro hoje.
        titulos.estornar_baixa(self.ctx, julho["parcelas"][0]["baixas"][0]["id"], "cliente pediu devolução")
        self.assertEqual(self.saldo(banco), D("500.00"))

        with self.assertRaises(RegraDeNegocio):
            organizacao.alterar_fechamento(self.ctx, date(2026, 9, 1), "mês corrente")
        organizacao.alterar_fechamento(self.ctx, None, "Correção de julho")
        titulos.cancelar(self.ctx, julho["id"], "cobrança indevida")


class Caixa(Base):
    def test_transferencia_e_extrato(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import movimentos

        a = self.conta("Conta A", "1000.00")
        b = self.conta("Aplicação", "0", tipo="investimento")
        r = movimentos.transferir(self.ctx, {"conta_origem_id": a, "conta_destino_id": b, "valor": D("300.00"), "data": date(2026, 9, 5)})
        extrato = movimentos.extrato(self.ctx, a, date(2026, 9, 1), date(2026, 9, 30))
        self.assertEqual(extrato["saldo_final"], D("700.00"))
        self.assertEqual((extrato["entradas"], extrato["saidas"]), (D("0"), D("0")))  # transferência não é entrada nem saída
        self.assertEqual([m["saldo"] for m in extrato["movimentos"]], [D("1000.00"), D("700.00")])
        self.assertEqual(extrato["movimentos"][1]["conta_contrapartida"], "Aplicação")

        movimentos.estornar_transferencia(self.ctx, r["transferencia_id"], "valor errado")
        self.assertEqual(self.saldo(a), D("1000.00"))
        with self.assertRaises(RegraDeNegocio):
            movimentos.estornar_transferencia(self.ctx, r["transferencia_id"], "de novo")

    def test_ajuste_de_saldo(self):
        from financeiro.servicos import movimentos

        a = self.conta("Conta ajuste", "100.00")
        r = movimentos.ajustar_saldo(self.ctx, a, {"saldo_informado": D("95.50"), "motivo": "Diferença de centavos antiga"})
        self.assertEqual(r["diferenca"], D("-4.50"))
        self.assertEqual(self.saldo(a), D("95.50"))


class Recorrencias(Base):
    def test_gera_ate_o_horizonte_sem_duplicar(self):
        from financeiro.servicos import recorrencias, titulos

        rec = recorrencias.criar(self.ctx, {
            "tipo": "pagar", "descricao": "Internet", "valor": D("99.90"),
            "categoria_id": self.categoria("Internet e telefone"), "frequencia": "mensal",
            "dia_vencimento": 10, "inicio": date(2026, 9, 1),
        })
        self.assertEqual(rec["gerados"], 3)  # 10/09, 10/10 e 10/11 (horizonte: 14/11)
        self.assertEqual(recorrencias.gerar(self.ctx)["gerados"], 0)
        lista = titulos.listar_parcelas(self.ctx, "pagar", "todos")
        self.assertEqual(sorted(i["vencimento"] for i in lista["itens"]), [date(2026, 9, 10), date(2026, 10, 10), date(2026, 11, 10)])
        self.assertTrue(all(i["descricao"].startswith("Internet — ") for i in lista["itens"]))


class Folha(Base):
    def test_ciclo_completo_com_ajuste_da_contabilidade(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import cadastros, pessoal

        centro = cadastros.salvar_centro(self.ctx, {"nome": "Enfermagem"})["id"]
        ana = pessoal.criar_colaborador(self.ctx, {
            "pessoa": {"nome": "Ana Teste", "documento": "529.982.247-25"}, "vinculo": "clt",
            "salario_base": D("3000.00"), "data_admissao": date(2025, 1, 10), "centro_custo_id": centro,
        })
        pessoal.criar_colaborador(self.ctx, {
            "pessoa": {"nome": "Beto Sócio"}, "vinculo": "prolabore",
            "salario_base": D("5000.00"), "data_admissao": date(2024, 1, 1),
        })
        folha = pessoal.criar_folha(self.ctx, {"competencia": date(2026, 9, 1)})
        self.assertEqual(folha["status"], "calculada")
        self.assertEqual(len(folha["holerites"]), 2)
        h_ana = next(h for h in folha["holerites"] if h["nome"] == "Ana Teste")
        self.assertEqual((h_ana["inss"], h_ana["fgts"]), (D("248.60"), D("240.00")))

        he = next(r["id"] for r in pessoal.listar_rubricas(self.ctx) if r["codigo"] == "101")
        holerite = pessoal.lancar(self.ctx, folha["id"], {"colaborador_id": ana["id"], "rubrica_id": he, "referencia": D("10")})
        valores = {i["codigo"]: i["valor"] for i in holerite["itens"]}
        self.assertEqual(valores["101"], D("204.55"))  # 10 h × 3000/220 × 150%
        self.assertEqual(valores["010"], D("40.91"))  # DSR: 204,55 ÷ 25 × 5
        self.assertEqual(holerite["total_proventos"], D("3245.46"))

        holerite = pessoal.ajustar(self.ctx, holerite["id"], {"inss": D("260.00"), "observacao": "Valor da contabilidade"})
        self.assertEqual(holerite["inss"], D("260.00"))
        self.assertEqual(holerite["calculado"]["inss"], "278.06")
        self.assertEqual(holerite["liquido"], D("3245.46") - D("260.00"))

        fechada = pessoal.fechar(self.ctx, folha["id"])
        self.assertEqual(fechada["status"], "fechada")
        ativos = {t["descricao"]: t["valor_total"] for t in fechada["titulos"] if not t["cancelado_em"]}
        self.assertEqual(ativos["Salário 09/2026 — Ana Teste"], D("2985.46"))
        self.assertEqual(ativos["Pró-labore 09/2026 — Beto Sócio"], D("4450.00"))
        self.assertEqual(ativos["DCTFWeb (INSS e IRRF) 09/2026"], D("810.00"))  # 260 + 550; IRRF zerado pela redução
        self.assertEqual(ativos["FGTS 09/2026"], D("259.64"))
        with self.assertRaises(RegraDeNegocio):
            pessoal.lancar(self.ctx, folha["id"], {"colaborador_id": ana["id"], "rubrica_id": he, "referencia": D("1")})

        reaberta = pessoal.reabrir(self.ctx, folha["id"], "Faltou lançar comissão")
        self.assertEqual(reaberta["status"], "calculada")
        self.assertTrue(all(t["cancelado_em"] for t in reaberta["titulos"]))
        # Fechar de novo gera contas novas: a chave de idempotência só vale entre as ativas.
        refeita = pessoal.fechar(self.ctx, folha["id"])
        self.assertEqual(len([t for t in refeita["titulos"] if not t["cancelado_em"]]), 4)

    def test_sem_colaborador_nao_cria_folha(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import pessoal

        with self.assertRaises(RegraDeNegocio):
            pessoal.criar_folha(self.ctx, {"competencia": date(2026, 9, 1)})


class Capital(Base):
    def test_emprestimo_price(self):
        from financeiro.erros import RegraDeNegocio
        from financeiro.servicos import cadastros, capital, relatorios, titulos

        banco = self.conta("Banco empréstimo")
        credor = cadastros.criar_pessoa(self.ctx, {"tipo": "juridica", "nome": "Banco Credor", "fornecedor": True})["id"]
        emprestimo = capital.criar_emprestimo(self.ctx, {
            "pessoa_id": credor, "conta_id": banco, "sistema": "price", "valor_principal": D("10000.00"),
            "taxa_mensal": D("1"), "prazo": 12, "data_contratacao": date(2026, 9, 1),
            "primeiro_vencimento": date(2026, 10, 1), "custos_iniciais": D("150.00"),
        })
        self.assertEqual(self.saldo(banco), D("9850.00"))
        self.assertEqual(len(emprestimo["cronograma"]), 12)
        self.assertEqual(emprestimo["saldo_devedor"], D("10000.00"))
        primeira = emprestimo["cronograma"][0]
        self.assertEqual((primeira["juros"], primeira["amortizacao"]), (D("100.00"), D("788.49")))

        titulos.baixar(self.ctx, primeira["parcela_id"], {"conta_id": banco, "data": date(2026, 10, 1)})
        self.assertEqual(capital.obter_emprestimo(self.ctx, emprestimo["id"])["saldo_devedor"], D("9211.51"))
        with self.assertRaises(RegraDeNegocio):
            capital.cancelar_emprestimo(self.ctx, emprestimo["id"], "engano")

        # O dinheiro emprestado não é receita; o IOF é despesa financeira.
        dre = {l["chave"]: l["valor"] for l in relatorios.dre(self.ctx, date(2026, 9, 1), date(2026, 9, 1))["linhas"]}
        self.assertEqual(dre["receita_bruta"], D("0.00"))
        self.assertEqual(dre["despesas_financeiras"], D("-150.00"))

    def test_socio_patrimonio_e_investimento(self):
        from financeiro.servicos import cadastros, capital, movimentos, relatorios

        banco = self.conta("Banco capital")
        pessoa = cadastros.criar_pessoa(self.ctx, {"tipo": "fisica", "nome": "Sócia Única"})["id"]
        socios = capital.salvar_socio(self.ctx, {"pessoa_id": pessoa, "participacao": D("100"), "capital_subscrito": D("50000.00")})
        socio = socios["socios"][0]["id"]
        socios = capital.operacao_de_socio(self.ctx, socio, {"operacao": "integralizacao", "valor": D("20000.00"), "conta_id": banco, "data": date(2026, 1, 5)})
        self.assertEqual((socios["capital_integralizado"], socios["a_integralizar"]), (D("20000.00"), D("30000.00")))

        bem = capital.criar_ativo(self.ctx, {
            "descricao": "Computador", "classe": "informatica", "valor_aquisicao": D("6000.00"),
            "data_aquisicao": date(2026, 1, 10), "compra": {"conta_id": banco},
        })
        self.assertEqual(bem["vida_util_meses"], 60)
        self.assertEqual(bem["depreciacao_mensal"], D("100.00"))
        self.assertEqual(bem["valor_contabil"], D("5100.00"))  # janeiro a setembro

        aplicacao = self.conta("CDB", tipo="investimento")
        movimentos.transferir(self.ctx, {"conta_origem_id": banco, "conta_destino_id": aplicacao, "valor": D("1000.00"), "data": date(2026, 9, 1)})
        capital.atualizar_investimento(self.ctx, aplicacao, {"saldo_informado": D("1012.34"), "data": date(2026, 9, 14)})
        investimentos = capital.listar_investimentos(self.ctx)
        self.assertEqual(investimentos["contas"][0]["rendimento_acumulado"], D("12.34"))

        dre = {l["chave"]: l["valor"] for l in relatorios.dre(self.ctx, date(2026, 1, 1), date(2026, 9, 1))["linhas"]}
        self.assertEqual(dre["depreciacao"], D("-900.00"))
        self.assertEqual(dre["receitas_financeiras"], D("12.34"))
        # Compra do bem e integralização não são resultado.
        self.assertEqual(dre["lucro_liquido"], D("-887.66"))


class Relatorios(Base):
    def test_dre_nos_dois_regimes_e_fluxo(self):
        from financeiro.servicos import relatorios, titulos

        banco = self.conta("Banco relatórios")
        titulos.criar(self.ctx, {
            "tipo": "receber", "descricao": "Mensalidade", "valor_total": D("1000.00"),
            "competencia": date(2026, 9, 1), "rateio": [{"categoria_id": self.categoria("Mensalidades")}],
            "pagamento": {"conta_id": banco, "data": date(2026, 9, 10)},
        })
        aluguel = titulos.criar(self.ctx, {
            "tipo": "pagar", "descricao": "Aluguel", "valor_total": D("400.00"), "competencia": date(2026, 9, 1),
            "primeiro_vencimento": date(2026, 9, 12), "rateio": [{"categoria_id": self.categoria("Aluguel e condomínio")}],
        })
        titulos.baixar(self.ctx, aluguel["parcelas"][0]["id"], {"conta_id": banco, "data": date(2026, 9, 12), "desconto": D("10.00")})
        titulos.criar(self.ctx, {
            "tipo": "pagar", "descricao": "Energia", "valor_total": D("100.00"), "competencia": date(2026, 9, 1),
            "primeiro_vencimento": date(2026, 9, 25), "rateio": [{"categoria_id": self.categoria("Energia elétrica")}],
        })

        competencia = {l["chave"]: l["valor"] for l in relatorios.dre(self.ctx, date(2026, 9, 1), date(2026, 9, 1))["linhas"]}
        self.assertEqual(competencia["receita_bruta"], D("1000.00"))
        self.assertEqual(competencia["despesas_administrativas"], D("-500.00"))
        self.assertEqual(competencia["receitas_financeiras"], D("10.00"))
        self.assertEqual(competencia["lucro_liquido"], D("510.00"))

        caixa = {l["chave"]: l["valor"] for l in relatorios.dre(self.ctx, date(2026, 9, 1), date(2026, 9, 1), "caixa")["linhas"]}
        self.assertEqual(caixa["despesas_administrativas"], D("-400.00"))
        self.assertEqual(caixa["lucro_liquido"], D("610.00"))

        fluxo = relatorios.fluxo_caixa(self.ctx, date(2026, 9, 1), date(2026, 9, 30))
        periodo = fluxo["periodos"][0]
        # Igual ao extrato do banco: entrou 1.000, saiu 390.
        self.assertEqual((periodo["entradas"], periodo["saidas"]), (D("1000.00"), D("390.00")))
        self.assertEqual(periodo["operacional"], D("610.00"))

        projetado = relatorios.fluxo_projetado(self.ctx, 30, "semana")
        self.assertEqual(projetado["saldo_atual"], D("610.00"))
        self.assertEqual(projetado["periodos"][-1]["saldo_final"], D("510.00"))  # a energia vence dia 25

        atraso = relatorios.inadimplencia(self.ctx, "pagar")
        self.assertEqual(atraso["total_vencido"], D("0"))
        painel = relatorios.painel(self.ctx)
        self.assertEqual(painel["saldo_total"], D("610.00"))
        self.assertEqual(painel["resultado_mes"]["resultado"], D("510.00"))

    def test_orcamento_contra_realizado(self):
        from financeiro.servicos import planejamento, titulos

        aluguel = self.categoria("Aluguel e condomínio")
        planejamento.salvar(self.ctx, 2026, [{"categoria_id": aluguel, "valores": [D("400")] * 12}])
        titulos.criar(self.ctx, {
            "tipo": "pagar", "descricao": "Aluguel set", "valor_total": D("450.00"), "competencia": date(2026, 9, 1),
            "primeiro_vencimento": date(2026, 9, 10), "rateio": [{"categoria_id": aluguel}],
        })
        linha = next(l for l in planejamento.comparativo(self.ctx, 2026)["linhas"] if l["categoria_id"] == str(aluguel))
        self.assertEqual((linha["orcado"][8], linha["realizado"][8]), (D("400"), D("450.00")))
        self.assertTrue(linha["desfavoravel"])
        copia = planejamento.copiar(self.ctx, 2026, 2027, "orcado", D("10"))
        self.assertEqual(copia["linhas"][0]["valores"][0], D("440.00"))

    def test_comparativo_compara_o_mesmo_periodo(self):
        from financeiro.servicos import planejamento, titulos

        mensalidades = self.categoria("Mensalidades")
        planejamento.salvar(self.ctx, 2026, [{"categoria_id": mensalidades, "valores": [D("1000")] * 12}])
        for mes, valor in ((8, "800.00"), (9, "300.00")):
            titulos.criar(self.ctx, {
                "tipo": "receber", "descricao": f"Mensalidades {mes}", "valor_total": D(valor),
                "competencia": date(2026, mes, 1), "primeiro_vencimento": date(2026, mes, 10),
                "rateio": [{"categoria_id": mensalidades}],
            })

        def linha(comparativo):
            return next(l for l in comparativo["linhas"] if l["categoria_id"] == str(mensalidades))

        # Hoje é 15/09: setembro ainda está aberto, e receita que falta nele não é alerta.
        setembro = planejamento.comparativo(self.ctx, 2026)
        self.assertEqual((setembro["mes"], setembro["mes_encerrado"]), (9, False))
        self.assertEqual(linha(setembro)["variacao"], D("-700.00"))
        self.assertFalse(linha(setembro)["desfavoravel"])
        # O acumulado compara nove meses planejados com nove realizados, não com o ano inteiro.
        self.assertEqual((linha(setembro)["acumulado_orcado"], linha(setembro)["acumulado_realizado"]), (D("9000"), D("1100")))
        self.assertEqual((setembro["resumo"]["receitas_orcadas"], setembro["acumulado"]["receitas_realizadas"]), (D("1000"), D("1100")))

        agosto = planejamento.comparativo(self.ctx, 2026, mes=8)
        self.assertTrue(agosto["mes_encerrado"])
        self.assertEqual((linha(agosto)["variacao"], linha(agosto)["variacao_percentual"]), (D("-200"), D("-20")))
        self.assertTrue(linha(agosto)["desfavoravel"])

        # Sem mês escolhido: dezembro num ano que acabou, janeiro num que não começou.
        self.assertEqual((planejamento.comparativo(self.ctx, 2025)["mes"], planejamento.comparativo(self.ctx, 2027)["mes"]), (12, 1))


class Conciliacao(Base):
    def test_importa_sugere_e_concilia(self):
        from financeiro.servicos import conciliacao, titulos

        banco = self.conta("Banco OFX", "0", date(2026, 8, 31))
        mensalidade = titulos.criar(self.ctx, {
            "tipo": "receber", "descricao": "Mensalidade Maria Silva", "valor_total": D("1500.00"),
            "competencia": date(2026, 9, 1), "rateio": [{"categoria_id": self.categoria("Mensalidades")}],
            "pagamento": {"conta_id": banco, "data": date(2026, 9, 2)},
        })
        internet = titulos.criar(self.ctx, {
            "tipo": "pagar", "descricao": "Internet fibra", "valor_total": D("89.90"), "competencia": date(2026, 9, 1),
            "primeiro_vencimento": date(2026, 9, 5), "rateio": [{"categoria_id": self.categoria("Internet e telefone")}],
        })
        arquivo = {"formato": "ofx", "nome_arquivo": "setembro.ofx",
                   "conteudo_base64": base64.b64encode(OFX_SGML.encode("cp1252")).decode()}
        primeira = conciliacao.importar(self.ctx, banco, arquivo)
        self.assertEqual((primeira["novas"], primeira["repetidas"]), (4, 0))
        self.assertEqual(conciliacao.importar(self.ctx, banco, arquivo)["novas"], 0)

        linhas = {str(l["valor"]): l for l in conciliacao.pendencias(self.ctx, banco)["linhas"]}
        self.assertEqual(linhas["1500.00"]["sugestao"]["tipo"], "movimento")
        self.assertEqual(linhas["-89.90"]["sugestao"]["tipo"], "parcela")
        self.assertEqual(linhas["-89.90"]["sugestao"]["id"], str(internet["parcelas"][0]["id"]))

        conciliacao.conciliar(self.ctx, linhas["1500.00"]["id"], linhas["1500.00"]["sugestao"]["id"])
        conciliacao.conciliar_com_parcela(self.ctx, linhas["-89.90"]["id"], linhas["-89.90"]["sugestao"]["id"])
        self.assertEqual(titulos.obter(self.ctx, internet["id"])["parcelas"][0]["status"], "paga")

        tarifas = [l for l in conciliacao.pendencias(self.ctx, banco)["linhas"]]
        self.assertEqual(len(tarifas), 2)
        conciliacao.criar_lancamento(self.ctx, tarifas[0]["id"], {"categoria_id": self.categoria("Tarifas bancárias")})
        conciliacao.ignorar(self.ctx, tarifas[1]["id"], "Tarifa estornada pelo banco no dia seguinte")
        final = conciliacao.pendencias(self.ctx, banco)
        self.assertEqual(final["linhas"], [])
        self.assertIsNotNone(mensalidade)


if __name__ == "__main__":
    unittest.main()
