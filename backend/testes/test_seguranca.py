"""Autenticação por token e autorização no servidor (app/seguranca.py).

Cobre o que sustenta RF01 e RF02 (quem entra no dashboard e no app) e as regras
de acesso da RFC: o token expira, não se forja, não manda no perfil, e uma
clínica não lê dado de outra (RN02).
"""

from __future__ import annotations

import base64
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import seguranca


def credencial(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def linha_do_banco(**extras) -> dict:
    """Uma linha do JOIN usuario + clinica + perfil, como o banco devolveria."""
    linha = {
        "id": "u-1", "login": "ana", "nome": "Ana", "status": "ativo",
        "clinica_id": "c-1", "slug": "clinica-demo", "ativa": True, "papel": "NURSE",
    }
    linha.update(extras)
    return linha


def usuario(**extras) -> seguranca.UsuarioAutenticado:
    dados = dict(id="u-1", login="ana", nome="Ana", papel="NURSE", clinica_id="c-1", tenant="clinica-demo")
    dados.update(extras)
    return seguranca.UsuarioAutenticado(**dados)


class Token(unittest.TestCase):
    def test_carrega_quem_e_de_onde(self):
        token = seguranca.emitir_token("u-1", "clinica-demo", "NURSE")
        carga = jwt.decode(token, seguranca.SECRET_KEY, algorithms=[seguranca.ALGORITMO])
        self.assertEqual((carga["sub"], carga["tenant"], carga["papel"]), ("u-1", "clinica-demo", "NURSE"))

    def test_validade_e_a_configurada(self):
        token = seguranca.emitir_token("u-1", "clinica-demo", "NURSE")
        carga = jwt.decode(token, seguranca.SECRET_KEY, algorithms=[seguranca.ALGORITMO])
        self.assertEqual(carga["exp"] - carga["iat"], seguranca.HORAS_DE_VALIDADE * 3600)

    def test_expirado_e_401_com_mensagem_propria(self):
        passado = datetime.now(timezone.utc) - timedelta(hours=1)
        token = jwt.encode({"sub": "u-1", "exp": passado}, seguranca.SECRET_KEY, algorithm=seguranca.ALGORITMO)
        with self.assertRaises(HTTPException) as erro:
            seguranca._decodificar(token)
        self.assertEqual(erro.exception.status_code, 401)
        self.assertIn("expirada", erro.exception.detail)

    def test_assinado_com_outra_chave_e_401(self):
        token = jwt.encode({"sub": "u-1"}, "chave-de-quem-forja-o-token-123456", algorithm=seguranca.ALGORITMO)
        with self.assertRaises(HTTPException) as erro:
            seguranca._decodificar(token)
        self.assertEqual(erro.exception.status_code, 401)

    def test_payload_adulterado_para_virar_admin_e_401(self):
        # Quem troca "NURSE" por "ADMIN" no meio do token mantém a assinatura
        # antiga, que deixa de bater com o conteúdo.
        cabecalho, _, assinatura = seguranca.emitir_token("u-1", "clinica-demo", "NURSE").split(".")
        falso = {"sub": "u-1", "tenant": "clinica-demo", "papel": "ADMIN", "exp": 4102444800}
        corpo = base64.urlsafe_b64encode(json.dumps(falso).encode()).rstrip(b"=").decode()
        with self.assertRaises(HTTPException) as erro:
            seguranca._decodificar(f"{cabecalho}.{corpo}.{assinatura}")
        self.assertEqual(erro.exception.status_code, 401)

    def test_algoritmo_none_e_recusado(self):
        # Token sem assinatura: o servidor só aceita HS256.
        sem_assinatura = jwt.encode({"sub": "u-1"}, key="", algorithm="none")
        with self.assertRaises(HTTPException) as erro:
            seguranca._decodificar(sem_assinatura)
        self.assertEqual(erro.exception.status_code, 401)

    def test_texto_qualquer_nao_e_token(self):
        with self.assertRaises(HTTPException) as erro:
            seguranca._decodificar("isto-nao-e-um-jwt")
        self.assertEqual(erro.exception.status_code, 401)


class UsuarioAtual(unittest.TestCase):
    """`usuario_atual` protege as rotas: o token só abre a porta, o banco decide."""

    def chamar(self, token: str | None, linha: dict | None):
        cred = credencial(token) if token is not None else None
        with mock.patch.object(seguranca.db, "buscar_um", return_value=linha) as consulta:
            resultado = seguranca.usuario_atual(cred)
        return resultado, consulta

    def token_valido(self, **extras) -> str:
        return seguranca.emitir_token("u-1", extras.get("tenant", "clinica-demo"), extras.get("papel", "NURSE"))

    def test_sem_credencial_e_401(self):
        with self.assertRaises(HTTPException) as erro:
            self.chamar(None, None)
        self.assertEqual(erro.exception.status_code, 401)

    def test_credencial_vazia_e_401(self):
        with self.assertRaises(HTTPException) as erro:
            self.chamar("", None)
        self.assertEqual(erro.exception.status_code, 401)

    def test_token_de_usuario_que_nao_existe_mais_e_401(self):
        with self.assertRaises(HTTPException) as erro:
            self.chamar(self.token_valido(), None)
        self.assertEqual(erro.exception.status_code, 401)

    def test_usuario_inativo_ou_bloqueado_e_403_mesmo_com_token_valido(self):
        # O token vale oito horas; sem reler o banco, uma conta desativada
        # seguiria entrando até ele vencer.
        for status in ("inativo", "bloqueado"):
            with self.subTest(status=status), self.assertRaises(HTTPException) as erro:
                self.chamar(self.token_valido(), linha_do_banco(status=status))
            self.assertEqual(erro.exception.status_code, 403)

    def test_clinica_inativa_e_403(self):
        with self.assertRaises(HTTPException) as erro:
            self.chamar(self.token_valido(), linha_do_banco(ativa=False))
        self.assertEqual(erro.exception.status_code, 403)

    def test_usuario_ativo_passa(self):
        autenticado, _ = self.chamar(self.token_valido(), linha_do_banco())
        self.assertEqual((autenticado.id, autenticado.login, autenticado.tenant), ("u-1", "ana", "clinica-demo"))

    def test_papel_e_tenant_vem_do_banco_e_nao_do_token(self):
        # Mesmo que o token diga ADMIN de outra clínica, vale o que está gravado.
        token = self.token_valido(tenant="outra-clinica", papel="ADMIN")
        autenticado, _ = self.chamar(token, linha_do_banco(papel="NURSE", slug="clinica-demo"))
        self.assertEqual((autenticado.papel, autenticado.tenant), ("NURSE", "clinica-demo"))

    def test_rele_o_banco_pelo_id_do_token_a_cada_chamada(self):
        _, consulta = self.chamar(self.token_valido(), linha_do_banco())
        consulta.assert_called_once()
        self.assertEqual(consulta.call_args.args[1], ("u-1",))


class IdentificarPorToken(unittest.TestCase):
    """Versão para o WebSocket do alerta (RF16): recusa devolvendo None."""

    def identificar(self, token: str, linha: dict | None):
        with mock.patch.object(seguranca.db, "buscar_um", return_value=linha):
            return seguranca.identificar_por_token(token)

    def test_token_invalido_devolve_none(self):
        self.assertIsNone(self.identificar("lixo", linha_do_banco()))

    def test_usuario_inativo_devolve_none(self):
        token = seguranca.emitir_token("u-1", "clinica-demo", "NURSE")
        self.assertIsNone(self.identificar(token, linha_do_banco(status="inativo")))

    def test_clinica_inativa_devolve_none(self):
        token = seguranca.emitir_token("u-1", "clinica-demo", "NURSE")
        self.assertIsNone(self.identificar(token, linha_do_banco(ativa=False)))

    def test_usuario_valido_devolve_o_usuario(self):
        token = seguranca.emitir_token("u-1", "clinica-demo", "NURSE")
        self.assertEqual(self.identificar(token, linha_do_banco()).login, "ana")


class IsolamentoEntreClinicas(unittest.TestCase):
    def test_mesma_clinica_passa(self):
        self.assertIsNone(seguranca.exigir_tenant(usuario(tenant="clinica-demo"), "clinica-demo"))

    def test_outra_clinica_e_404_e_nao_403(self):
        # 403 confirmaria que a outra clínica existe; 404 não entrega nada.
        with self.assertRaises(HTTPException) as erro:
            seguranca.exigir_tenant(usuario(tenant="clinica-demo"), "clinica-vizinha")
        self.assertEqual(erro.exception.status_code, 404)


class Permissao(unittest.TestCase):
    PERMISSOES = {"alerts": {"view": True, "edit": False}}

    def verificar(self, modulo: str, acao: str):
        verificador = seguranca.exigir_permissao(modulo, acao)
        with mock.patch.object(seguranca, "permissoes_do_perfil", return_value=self.PERMISSOES):
            return verificador(usuario=usuario())

    def test_acao_permitida_devolve_o_usuario(self):
        self.assertEqual(self.verificar("alerts", "view").login, "ana")

    def test_acao_negada_e_403_com_a_acao_e_o_modulo(self):
        with self.assertRaises(HTTPException) as erro:
            self.verificar("alerts", "edit")
        self.assertEqual(erro.exception.status_code, 403)
        self.assertIn("edit", erro.exception.detail)
        self.assertIn("alerts", erro.exception.detail)

    def test_modulo_que_o_perfil_nao_tem_e_403(self):
        with self.assertRaises(HTTPException) as erro:
            self.verificar("financeiro", "view")
        self.assertEqual(erro.exception.status_code, 403)

    def test_acao_padrao_e_ver(self):
        verificador = seguranca.exigir_permissao("alerts")
        with mock.patch.object(seguranca, "permissoes_do_perfil", return_value=self.PERMISSOES):
            self.assertEqual(verificador(usuario=usuario()).login, "ana")


if __name__ == "__main__":
    unittest.main()
