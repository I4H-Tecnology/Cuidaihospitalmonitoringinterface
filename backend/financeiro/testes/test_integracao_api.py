"""A API HTTP montada numa aplicação qualquer, com um operador de mentira.

É o que um hospedeiro faz: monta o router e diz quem está chamando. Aqui o
"quem" vem de cabeçalhos de teste — prova de que o módulo não depende de
nenhum jeito específico de autenticar.
"""

import unittest
from datetime import date

from .apoio import BancoDeTeste


def setUpModule():
    BancoDeTeste.preparar()


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi import FastAPI, Header, HTTPException, Request
        from fastapi.responses import JSONResponse
        from fastapi.testclient import TestClient

        from financeiro.acesso import Operador, todas_as_permissoes
        from financeiro.api import criar_router

        def operador(x_empresa: str = Header(), x_permissoes: str = Header(default="*")) -> Operador:
            permissoes = todas_as_permissoes() if x_permissoes == "*" else frozenset(filter(None, x_permissoes.split(",")))
            return Operador("u-api", "Usuária da API", x_empresa, f"Empresa {x_empresa}", permissoes)

        app = FastAPI()

        @app.exception_handler(HTTPException)
        async def erro(_: Request, exc: HTTPException):
            return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

        app.include_router(criar_router(BancoDeTeste.banco, operador))
        cls.cliente = TestClient(app)

    def pedir(self, metodo, caminho, empresa="api-empresa", permissoes="*", **kw):
        return self.cliente.request(
            metodo, f"/api/financeiro{caminho}", headers={"x-empresa": empresa, "x-permissoes": permissoes}, **kw
        )

    def test_sessao_e_formato_da_resposta(self):
        r = self.pedir("GET", "/sessao")
        self.assertEqual(r.status_code, 200)
        corpo = r.json()
        self.assertEqual(corpo["organizacao"]["nome"], "Empresa api-empresa")
        self.assertIn("operacao:criar", corpo["permissoes"])

        categorias = self.pedir("GET", "/categorias").json()
        mensalidade = next(c["id"] for c in categorias if c["nome"] == "Mensalidades")
        caixa = next(c["id"] for c in self.pedir("GET", "/contas").json() if c["nome"] == "Caixa")
        r = self.pedir("POST", "/titulos", json={
            "tipo": "receber", "descricao": "Mensalidade via API", "valorTotal": "1234.50",
            "competencia": "2026-09", "rateio": [{"categoriaId": mensalidade}],
            "pagamento": {"contaId": caixa, "data": "2026-09-10"},
        })
        self.assertEqual(r.status_code, 201, r.text)
        titulo = r.json()
        # camelCase nas chaves e dinheiro como texto: nada de float.
        self.assertEqual(titulo["valorTotal"], "1234.50")
        self.assertEqual(titulo["competencia"], "2026-09-01")
        self.assertEqual(titulo["parcelas"][0]["valorPago"], "1234.50")
        self.assertIsInstance(titulo["parcelas"][0]["baixas"][0]["valor"], str)

    def test_permissao_e_mensagem_de_erro(self):
        r = self.pedir("GET", "/parcelas", params={"tipo": "pagar"}, empresa="api-restrita", permissoes="relatorios:ver")
        self.assertEqual(r.status_code, 403)
        self.assertIn("error", r.json())
        self.assertEqual(self.pedir("GET", "/painel", empresa="api-restrita", permissoes="relatorios:ver").status_code, 200)

        # Regra de negócio sai como 422 com a mensagem do serviço.
        r = self.pedir("POST", "/titulos", empresa="api-restrita", json={
            "tipo": "pagar", "descricao": "Sem categoria", "valorTotal": "10.00", "primeiroVencimento": "2026-09-20",
        })
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["error"], "Escolha a categoria.")

    def test_empresas_nao_se_enxergam(self):
        conta = self.pedir("POST", "/contas", empresa="api-a", json={"nome": "Conta da A", "tipo": "corrente"}).json()
        r = self.pedir("GET", f"/contas/{conta['id']}/extrato", empresa="api-b")
        self.assertEqual(r.status_code, 404)
        self.assertNotIn("Conta da A", [c["nome"] for c in self.pedir("GET", "/contas", empresa="api-b").json()])

    def test_rotas_de_leitura_respondem(self):
        for caminho in (
            "/painel", "/indicadores", "/grupos", "/organizacao", "/feriados", "/tabelas-fiscais",
            "/centros-custo", "/pessoas", "/recorrencias", "/colaboradores", "/rubricas", "/folhas",
            "/pessoal/custos", "/socios", "/emprestimos", "/investimentos", "/ativos", "/capital/resumo",
            f"/orcamento/{date.today().year}", f"/orcamento/{date.today().year}/comparativo",
            "/relatorios/dre", "/relatorios/fluxo-caixa", "/relatorios/fluxo-projetado",
            "/relatorios/inadimplencia", "/auditoria",
        ):
            with self.subTest(caminho=caminho):
                r = self.pedir("GET", caminho, empresa="api-leitura")
                self.assertEqual(r.status_code, 200, r.text)

    def test_reparcelar_pela_api(self):
        empresa = "api-reparcela"
        categorias = self.pedir("GET", "/categorias", empresa=empresa).json()
        aluguel = next(c["id"] for c in categorias if c["nome"] == "Aluguel e condomínio")
        t = self.pedir("POST", "/titulos", empresa=empresa, json={
            "tipo": "pagar", "descricao": "Aluguel em 2x", "valorTotal": "1000.00", "competencia": "2026-09",
            "quantidadeParcelas": 2, "primeiroVencimento": "2026-09-10", "rateio": [{"categoriaId": aluguel}],
        }).json()
        self.assertIsInstance(t["numero"], int)
        p1, p2 = t["parcelas"]
        plano = {"parcelas": [
            {"id": p1["id"], "vencimento": "2026-09-10", "valor": "400.00"},
            {"id": p2["id"], "vencimento": "2026-10-10", "valor": "600.00", "codigoBarras": "8364000000"},
        ]}
        r = self.pedir("PUT", f"/titulos/{t['id']}/parcelas", empresa=empresa, json=plano)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual([p["valor"] for p in r.json()["parcelas"]], ["400.00", "600.00"])
        self.assertEqual(r.json()["parcelas"][1]["codigoBarras"], "8364000000")

        # Só ver não basta para editar.
        r = self.pedir("PUT", f"/titulos/{t['id']}/parcelas", empresa=empresa, permissoes="operacao:ver", json=plano)
        self.assertEqual(r.status_code, 403)
        # Editar sem poder excluir: juntar as duas numa só é recusado com a mensagem do módulo.
        r = self.pedir(
            "PUT", f"/titulos/{t['id']}/parcelas", empresa=empresa, permissoes="operacao:ver,operacao:editar",
            json={"parcelas": [{"id": p1["id"], "vencimento": "2026-09-10", "valor": "1000.00"}], "motivo": "à vista"},
        )
        self.assertEqual(r.status_code, 403)
        self.assertIn("excluir", r.json()["error"])


if __name__ == "__main__":
    unittest.main()
