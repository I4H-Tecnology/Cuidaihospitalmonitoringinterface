"""Login, bloqueio, política de senha e recuperação (app/rotas/autenticacao.py).

RF01 é o login do administrador no dashboard web e RF02, o de enfermeiros e
cuidadores no aplicativo. No código os dois passam pelo MESMO endpoint
(`/api/auth/login`), então estes testes provam o que ele garante para qualquer
perfil: token com o perfil certo, mensagem que não entrega quem existe,
bloqueio por tentativas e conta inativa barrada.

O SQL (`crypt`, o JOIN) não é exercitado: `app.db` é substituído e a resposta
do banco, combinada em cada teste.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

import jwt
from fastapi import HTTPException

from app import seguranca
from app.comum import POLITICA_PADRAO
from app.rotas import autenticacao
from app.schemas import ForgotPasswordRequest, ForgotPasswordReset, LoginRequest

CLINICA = {"id": "c-1", "slug": "clinica-demo", "ativa": True}


def usuario_do_banco(**extras) -> dict:
    """Uma linha de `usuario` + o nome do perfil, como o login a consulta."""
    linha = {
        "id": "u-1", "login": "ana", "nome": "Ana", "status": "ativo",
        "perfil_nome": "NURSE", "senha_confere": True,
        "bloqueado_ate": None, "tentativas_falhas": 0,
        "ultimo_acesso": None, "senha_alterada_em": None,
    }
    linha.update(extras)
    return linha


class ComBancoCombinado(unittest.TestCase):
    """Troca o acesso ao banco e à clínica por respostas combinadas."""

    def setUp(self):
        self.consulta = mock.patch.object(autenticacao.db, "buscar_um").start()
        self.escrita = mock.patch.object(autenticacao.db, "executar", return_value=1).start()
        mock.patch.object(autenticacao, "clinica_por_slug", return_value=CLINICA).start()
        mock.patch.object(autenticacao, "ler_politica", return_value=dict(POLITICA_PADRAO)).start()
        self.addCleanup(mock.patch.stopall)

    def entrar(self, **extras):
        self.consulta.return_value = usuario_do_banco(**extras)
        return autenticacao.login(LoginRequest(tenant="clinica-demo", username="ana", password="x"))

    def sqls_gravados(self) -> list[str]:
        return [chamada.args[0] for chamada in self.escrita.call_args_list]


class Login(ComBancoCombinado):
    def test_administrador_e_enfermeiro_entram_pelo_mesmo_fluxo_com_o_proprio_perfil(self):
        for perfil in ("ADMIN", "MANAGER", "NURSE", "VISITOR"):
            with self.subTest(perfil=perfil):
                resposta = self.entrar(perfil_nome=perfil)
                self.assertEqual(resposta.role, perfil)
                carga = jwt.decode(resposta.token, seguranca.SECRET_KEY, algorithms=[seguranca.ALGORITMO])
                self.assertEqual((carga["papel"], carga["tenant"], carga["sub"]), (perfil, "clinica-demo", "u-1"))

    def test_usuario_inexistente_e_senha_errada_dao_a_mesma_resposta(self):
        # Dizer qual dos dois falhou entrega quem tem conta a quem tenta adivinhar.
        self.consulta.return_value = None
        with self.assertRaises(HTTPException) as inexistente:
            autenticacao.login(LoginRequest(tenant="clinica-demo", username="fantasma", password="x"))
        with self.assertRaises(HTTPException) as errada:
            self.entrar(senha_confere=False)
        self.assertEqual(inexistente.exception.status_code, 401)
        self.assertEqual(errada.exception.status_code, 401)
        self.assertEqual(inexistente.exception.detail, errada.exception.detail)

    def test_senha_errada_conta_uma_tentativa(self):
        with self.assertRaises(HTTPException):
            self.entrar(senha_confere=False, tentativas_falhas=2)
        sql, params = self.escrita.call_args.args
        self.assertIn("tentativas_falhas", sql)
        self.assertNotIn("bloqueado_ate", sql)
        self.assertEqual(params, (3, "u-1"))

    def test_na_quinta_falha_a_conta_e_bloqueada(self):
        # Política padrão: 5 tentativas, 5 minutos.
        with self.assertRaises(HTTPException):
            self.entrar(senha_confere=False, tentativas_falhas=4)
        sql, params = self.escrita.call_args.args
        self.assertIn("bloqueado_ate", sql)
        self.assertEqual(params, (5, "5", "u-1"))

    def test_conta_bloqueada_recusa_ate_com_a_senha_certa(self):
        futuro = datetime.now(timezone.utc) + timedelta(minutes=5)
        with self.assertRaises(HTTPException) as erro:
            self.entrar(bloqueado_ate=futuro, senha_confere=True)
        self.assertEqual(erro.exception.status_code, 423)
        self.escrita.assert_not_called()

    def test_bloqueio_vencido_deixa_entrar(self):
        passado = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.assertTrue(self.entrar(bloqueado_ate=passado).token)

    def test_usuario_inativo_com_a_senha_certa_e_403(self):
        with self.assertRaises(HTTPException) as erro:
            self.entrar(status="inativo")
        self.assertEqual(erro.exception.status_code, 403)

    def test_entrar_zera_as_falhas_e_o_bloqueio(self):
        self.entrar(tentativas_falhas=3)
        self.assertTrue(any("tentativas_falhas = 0" in sql for sql in self.sqls_gravados()))


class ForcaDaSenha(unittest.TestCase):
    def recusa(self, senha: str, politica: dict | None = None) -> str:
        with self.assertRaises(HTTPException) as erro:
            autenticacao.validar_forca_da_senha(senha, politica or dict(POLITICA_PADRAO))
        self.assertEqual(erro.exception.status_code, 400)
        return erro.exception.detail

    def test_senha_forte_passa(self):
        autenticacao.validar_forca_da_senha("Segura#2026", dict(POLITICA_PADRAO))

    def test_cada_regra_da_politica_e_cobrada(self):
        casos = {
            "Ab#1": "mínimo de 8",
            "segura#2026": "maiúscula",
            "SEGURA#2026": "minúscula",
            "Segura#abcd": "número",
            "Segura2026a": "especial",
        }
        for senha, trecho in casos.items():
            with self.subTest(senha=senha):
                self.assertIn(trecho, self.recusa(senha))

    def test_senha_da_lista_de_bloqueadas_e_recusada(self):
        politica = {"requireStrongPassword": True, "minPasswordLength": 1, "requireUppercase": False,
                    "requireLowercase": False, "requireNumber": False, "requireSpecialChar": False,
                    "blockedPasswords": ["Clinica123"]}
        self.assertIn("bloqueadas", self.recusa("clinica123", politica))

    def test_politica_desligada_aceita_qualquer_senha(self):
        autenticacao.validar_forca_da_senha("a", {"requireStrongPassword": False})


class Recuperacao(ComBancoCombinado):
    def setUp(self):
        super().setUp()
        autenticacao._codigos_recuperacao.clear()
        self.addCleanup(autenticacao._codigos_recuperacao.clear)

    def pedir(self, existe: bool, ambiente: str):
        self.consulta.return_value = {"id": "u-1"} if existe else None
        with mock.patch.object(autenticacao, "AMBIENTE", ambiente):
            return autenticacao.pedir_recuperacao(ForgotPasswordRequest(tenant="clinica-demo", email="ana@clinica.com"))

    def concluir(self, codigo: str):
        return autenticacao.concluir_recuperacao(
            ForgotPasswordReset(tenant="clinica-demo", email="ana@clinica.com", code=codigo, newPassword="Segura#2026")
        )

    def test_resposta_e_igual_exista_ou_nao_a_conta(self):
        com_conta = self.pedir(existe=True, ambiente="producao")
        sem_conta = self.pedir(existe=False, ambiente="producao")
        self.assertEqual(com_conta.message, sem_conta.message)

    def test_codigo_so_volta_na_resposta_em_desenvolvimento(self):
        self.assertIsNone(self.pedir(existe=True, ambiente="producao").devResetCode)
        self.assertRegex(self.pedir(existe=True, ambiente="dev").devResetCode, r"^\d{6}$")

    def test_codigo_certo_troca_a_senha_e_so_vale_uma_vez(self):
        codigo = self.pedir(existe=True, ambiente="dev").devResetCode
        self.assertTrue(self.concluir(codigo).ok)
        with self.assertRaises(HTTPException) as erro:
            self.concluir(codigo)
        self.assertEqual(erro.exception.status_code, 400)

    def test_cinco_erros_invalidam_o_codigo_ate_para_quem_acerta_depois(self):
        codigo = self.pedir(existe=True, ambiente="dev").devResetCode
        errado = "000000" if codigo != "000000" else "111111"
        # A invalidação por excesso de tentativas fica registrada no log.
        with self.assertLogs(autenticacao.logger, "WARNING"):
            for _ in range(autenticacao.MAX_TENTATIVAS_CODIGO):
                with self.assertRaises(HTTPException):
                    self.concluir(errado)
        with self.assertRaises(HTTPException) as erro:
            self.concluir(codigo)
        self.assertEqual(erro.exception.status_code, 400)

    def test_codigo_vencido_e_recusado(self):
        codigo = self.pedir(existe=True, ambiente="dev").devResetCode
        for registro in autenticacao._codigos_recuperacao.values():
            registro["expira_em"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        with self.assertRaises(HTTPException) as erro:
            self.concluir(codigo)
        self.assertEqual(erro.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
