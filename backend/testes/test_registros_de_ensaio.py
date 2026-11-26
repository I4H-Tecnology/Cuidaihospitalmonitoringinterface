"""Testes do importador de registros de ensaio controlado (app/registros_de_ensaio.py).

    python -m unittest discover -s backend/testes -t backend

Três coisas são provadas aqui, sem banco:
  1. VALIDAÇÃO: o manifesto e cada clipe são conferidos ANTES de qualquer gravação, e todos os
     erros aparecem juntos.
  2. TEXTO FIXO: o aviso de ensaio controlado / dados de demonstração é do código e o manifesto
     não o remove.
  3. TRANSAÇÃO ÚNICA: o lote inteiro roda dentro de UMA abertura de transação, nenhuma exceção é
     engolida (o gerenciador real desfaz tudo ao ver a exceção) e um id de ocorrência real aborta o
     lote.
A prova de que o Postgres de fato desfaz (e de que repetir não duplica) é feita num banco descartável.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from app import clipes, registros_de_ensaio as ens

AGORA = datetime(2026, 11, 24, 12, 0, tzinfo=timezone.utc)
ID_1 = "b2c4e6f8-0000-4000-8000-000000000001"
ID_2 = "1a2b3c4d-0000-4000-8000-000000000002"
CABECALHO_MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"


def _bytes_do_clipe(semente: str) -> bytes:
    return CABECALHO_MP4 + semente.encode() * 50


def montar_pacote(pasta: Path, ids=(ID_1, ID_2), **alteracoes) -> dict:
    """Cria clipes e manifesto válidos na pasta; `alteracoes` sobrescreve campos do manifesto."""
    registros = []
    for i, rid in enumerate(ids):
        dados = _bytes_do_clipe(rid[:8])
        (pasta / f"{rid}.mp4").write_bytes(dados)
        registros.append({
            "id": rid,
            "arquivo": f"{rid}.mp4",
            "sha256": hashlib.sha256(dados).hexdigest(),
            "bytes": len(dados),
            "tipo_evento": "permanencia_solo",
            "confianca": 0.9 if i == 0 else None,
            "data_hora": f"2026-01-15T1{i}:10:16+00:00",
            "configuracao": "limiar de permanência reduzido a 1 s (lançador de teste)",
            "nota": "",
        })
    manifesto = {"versao": 1, "tenant": "clinica-demo", "camera": "CAM-QUARTO101", "registros": registros}
    manifesto.update(alteracoes)
    (pasta / "manifesto.json").write_text(json.dumps(manifesto), encoding="utf-8")
    return manifesto


def regravar(pasta: Path, manifesto: dict) -> None:
    (pasta / "manifesto.json").write_text(json.dumps(manifesto), encoding="utf-8")


class ComPasta(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.pasta = Path(self._t.name)
        self.addCleanup(self._t.cleanup)


class Validacao(ComPasta):
    def carregar(self):
        return ens.carregar_manifesto(self.pasta, agora=AGORA)

    def erros(self) -> list[str]:
        with self.assertRaises(ens.ManifestoInvalido) as ctx:
            self.carregar()
        return ctx.exception.erros

    def alterar_registro(self, indice=0, **campos):
        m = json.loads((self.pasta / "manifesto.json").read_text(encoding="utf-8"))
        m["registros"][indice].update(campos)
        regravar(self.pasta, m)

    def test_pacote_valido_carrega(self):
        montar_pacote(self.pasta)
        m = self.carregar()
        self.assertEqual((m.tenant, m.camera, len(m.registros)), ("clinica-demo", "CAM-QUARTO101", 2))
        self.assertEqual(m.registros[0].confianca, 0.9)
        self.assertIsNone(m.registros[1].confianca)
        self.assertEqual(m.registros[0].data_hora.tzinfo, timezone.utc)

    def test_sem_manifesto(self):
        self.assertIn("não há manifesto.json", self.erros()[0])

    def test_json_quebrado(self):
        (self.pasta / "manifesto.json").write_text("{nao e json", encoding="utf-8")
        self.assertIn("não é JSON", self.erros()[0])

    def test_raiz_que_nao_e_objeto(self):
        (self.pasta / "manifesto.json").write_text("[1, 2]", encoding="utf-8")
        self.assertIn("objeto JSON", self.erros()[0])

    def test_versao_desconhecida(self):
        montar_pacote(self.pasta, versao=2)
        self.assertTrue(any("'versao' deve ser 1" in e for e in self.erros()))

    def test_tenant_e_camera_invalidos(self):
        montar_pacote(self.pasta, tenant="Clinica Demo!", camera="../CAM")
        erros = " | ".join(self.erros())
        self.assertIn("'tenant'", erros)
        self.assertIn("'camera'", erros)

    def test_lista_vazia_e_lista_grande_demais(self):
        montar_pacote(self.pasta, registros=[])
        self.assertTrue(any("lista não vazia" in e for e in self.erros()))

    def test_id_que_nao_e_uuid_canonico(self):
        montar_pacote(self.pasta)
        self.alterar_registro(0, id="3BAE79FC-7DE1-4DCD-B508-4A8884660CA5")  # maiúsculas: não canônico
        self.assertTrue(any("UUID em minúsculas" in e for e in self.erros()))

    def test_id_repetido(self):
        montar_pacote(self.pasta, ids=(ID_1, ID_1))
        self.assertTrue(any("id repetido" in e for e in self.erros()))

    def test_arquivo_com_outro_nome_ou_caminho(self):
        montar_pacote(self.pasta)
        self.alterar_registro(0, arquivo="../fora.mp4")
        self.assertTrue(any(f"exatamente '{ID_1}.mp4'" in e for e in self.erros()))

    def test_clipe_ausente(self):
        montar_pacote(self.pasta)
        (self.pasta / f"{ID_2}.mp4").unlink()
        self.assertTrue(any("clipe ausente" in e for e in self.erros()))

    def test_tamanho_diferente_do_manifesto(self):
        montar_pacote(self.pasta)
        with (self.pasta / f"{ID_1}.mp4").open("ab") as f:
            f.write(b"lixo")
        self.assertTrue(any("tamanho do clipe" in e for e in self.erros()))

    def test_sha256_diferente_mesmo_com_o_tamanho_igual(self):
        montar_pacote(self.pasta)
        caminho = self.pasta / f"{ID_1}.mp4"
        dados = bytearray(caminho.read_bytes())
        dados[-1] ^= 0x01  # um bit trocado: mesmo tamanho, outro conteúdo
        caminho.write_bytes(bytes(dados))
        self.assertTrue(any("SHA-256 do clipe difere" in e for e in self.erros()))

    def test_arquivo_que_nao_e_mp4(self):
        montar_pacote(self.pasta)
        conteudo = b"isto nao e um video " * 10
        (self.pasta / f"{ID_1}.mp4").write_bytes(conteudo)
        self.alterar_registro(0, sha256=hashlib.sha256(conteudo).hexdigest(), bytes=len(conteudo))
        self.assertTrue(any("não parece um MP4" in e for e in self.erros()))

    def test_clipe_grande_demais_no_manifesto(self):
        montar_pacote(self.pasta)
        self.alterar_registro(0, bytes=ens.MAXIMO_DE_BYTES + 1)
        self.assertTrue(any("'bytes' deve ser um inteiro" in e for e in self.erros()))

    def test_tipo_de_evento_invalido(self):
        montar_pacote(self.pasta)
        self.alterar_registro(0, tipo_evento="explosao")
        self.assertTrue(any("'tipo_evento'" in e for e in self.erros()))

    def test_confianca_fora_da_faixa_ou_nao_finita(self):
        # NaN e Infinity não são JSON válido, mas o json do Python os aceita ao ler: o isfinite barra.
        for ruim in ("1.5", "-0.1", '"alta"', "true", "NaN", "Infinity", "-Infinity"):
            with self.subTest(confianca=ruim):
                montar_pacote(self.pasta)
                m = json.loads((self.pasta / "manifesto.json").read_text(encoding="utf-8"))
                m["registros"][0]["confianca"] = "@@"
                bruto = json.dumps(m).replace('"@@"', ruim)
                (self.pasta / "manifesto.json").write_text(bruto, encoding="utf-8")
                self.assertTrue(any("'confianca'" in e for e in self.erros()), ruim)

    def test_confianca_nula_e_valores_validos_passam(self):
        for bom in ("null", "0", "1", "0.5", "0.123456"):
            with self.subTest(confianca=bom):
                montar_pacote(self.pasta)
                m = json.loads((self.pasta / "manifesto.json").read_text(encoding="utf-8"))
                m["registros"][0]["confianca"] = "@@"
                (self.pasta / "manifesto.json").write_text(json.dumps(m).replace('"@@"', bom), encoding="utf-8")
                registro = self.carregar().registros[0]
                self.assertTrue(registro.confianca is None or 0 <= registro.confianca <= 1)
                if bom == "0.123456":
                    self.assertEqual(registro.confianca, 0.123)  # numeric(4,3): arredonda a 3 casas

    def test_data_sem_fuso_no_futuro_e_muito_antiga(self):
        montar_pacote(self.pasta)
        for valor, trecho in (("2026-01-15T13:10:16", "fuso"), ("2027-01-01T00:00:00+00:00", "futuro"), ("2019-05-01T00:00:00+00:00", "anterior a 2020"), ("ontem", "ISO 8601")):
            with self.subTest(data=valor):
                self.alterar_registro(0, data_hora=valor)
                self.assertTrue(any(trecho in e for e in self.erros()), self.erros())

    def test_configuracao_e_obrigatoria_e_limitada(self):
        montar_pacote(self.pasta)
        self.alterar_registro(0, configuracao="")
        self.assertTrue(any("'configuracao' é obrigatório" in e for e in self.erros()))
        self.alterar_registro(0, configuracao="x" * (ens.MAXIMO_DE_TEXTO + 1))
        self.assertTrue(any("passa de" in e for e in self.erros()))
        self.alterar_registro(0, configuracao="com\nquebra")
        self.assertTrue(any("caractere de controle" in e for e in self.erros()))

    def test_todos_os_erros_aparecem_juntos(self):
        montar_pacote(self.pasta)
        (self.pasta / f"{ID_2}.mp4").unlink()
        self.alterar_registro(0, tipo_evento="x", data_hora="amanha")
        erros = self.erros()
        self.assertGreaterEqual(len(erros), 3, erros)

    def test_symlink_nao_e_aceito_como_clipe(self):
        montar_pacote(self.pasta)
        alvo = self.pasta / "alvo.bin"
        alvo.write_bytes((self.pasta / f"{ID_1}.mp4").read_bytes())
        (self.pasta / f"{ID_1}.mp4").unlink()
        try:
            os.symlink(alvo, self.pasta / f"{ID_1}.mp4")
        except (OSError, NotImplementedError):
            self.skipTest("este sistema não cria link simbólico sem privilégio")
        self.assertTrue(any("clipe ausente ou não é arquivo comum" in e for e in self.erros()))


class TextoFixo(ComPasta):
    def registro(self, **alteracoes):
        montar_pacote(self.pasta, ids=(ID_1,))
        m = json.loads((self.pasta / "manifesto.json").read_text(encoding="utf-8"))
        m["registros"][0].update(alteracoes)
        regravar(self.pasta, m)
        return ens.carregar_manifesto(self.pasta, agora=AGORA).registros[0]

    def test_os_avisos_de_ensaio_estao_no_texto(self):
        texto = ens.observacao_do_registro(self.registro())
        for esperado in (
            "ENSAIO CONTROLADO", "DADOS DE DEMONSTRAÇÃO", "Registro de teste feito pelo autor",
            "NÃO é detecção ao vivo em produção", "NÃO mede o desempenho do detector", "NÃO houve atendimento real",
            "ciência do alerta foi pré-marcada, sem usuário",
            "limiar de permanência reduzido a 1 s",
        ):
            self.assertIn(esperado, texto)

    def test_a_data_e_a_do_fuso_de_brasilia(self):
        # 15/01 às 01:30 UTC é 14/01 às 22:30 em Brasília
        texto = ens.observacao_do_registro(self.registro(data_hora="2026-01-15T01:30:00+00:00"))
        self.assertIn("14/01/2026", texto)

    def test_a_nota_e_acrescentada_e_nao_remove_o_aviso(self):
        texto = ens.observacao_do_registro(self.registro(nota="ensaio da noite de sábado"))
        self.assertIn("NÃO houve atendimento real", texto)
        self.assertTrue(texto.endswith("ensaio da noite de sábado"))

    def test_o_texto_nao_afirma_queda_encenada(self):
        # As evidências do autor dizem o contrário: o detector classificou como permanência no chão,
        # em teste exploratório, sem queda padronizada. O texto fixo não pode prometer mais que isso.
        texto = ens.observacao_do_registro(self.registro()).lower()
        self.assertNotIn("encenad", texto)
        self.assertNotIn("queda confirmada", texto)

    def test_o_manifesto_nao_consegue_sobrescrever_o_aviso(self):
        # Campos desconhecidos como 'aviso' ou 'observacao' são ignorados: o texto é do código.
        texto = ens.observacao_do_registro(self.registro(observacao="Atendimento real concluido", aviso="nada"))
        self.assertNotIn("Atendimento real concluido", texto)
        self.assertIn("ENSAIO CONTROLADO", texto)


# --- transação única, com um cursor falso ------------------------------------------------

class CursorFalso:
    def __init__(self, roteiro):
        self.roteiro = roteiro
        self.executados: list[tuple[str, tuple]] = []
        self._linhas: list[dict] = []

    def execute(self, sql, params=()):
        sql = " ".join(sql.split())
        self.executados.append((sql, tuple(params)))
        self._linhas = self.roteiro(sql, tuple(params))

    def fetchone(self):
        return self._linhas[0] if self._linhas else None

    def fetchall(self):
        return list(self._linhas)


class Transacao:
    """Imita db.cursor: abre uma vez, e vê a exceção ao sair (o real desfaz tudo nesse caso)."""

    def __init__(self, cursor):
        self.cursor = cursor
        self.aberturas = 0
        self.excecao = None
        self.confirmou = False

    def __call__(self):
        self.aberturas += 1
        return self

    def __enter__(self):
        return self.cursor

    def __exit__(self, tipo, valor, tb):
        if tipo is None:
            self.confirmou = True
        else:
            self.excecao = valor
        return False


def roteiro(*, existentes=(), com_chave=(), clinica=True, cameras=1, falhar_em=None):
    def r(sql, params):
        if falhar_em and falhar_em in sql:
            raise RuntimeError("falha simulada do banco")
        if sql.startswith("SELECT id FROM clinica"):
            return [{"id": "clinica-1"}] if clinica else []
        if "FROM camera cam" in sql:
            return [{"id": "camera-1", "ambiente_id": "ambiente-1"}] * cameras
        if sql.startswith("INSERT INTO ocorrencia"):
            return [] if params[0] in existentes else [{"id": params[0]}]
        if sql.startswith("SELECT 1 AS ok FROM stub_evento_publicado"):
            return [{"ok": 1}] if params[0] in com_chave else []
        return []
    return r


class TransacaoUnica(ComPasta):
    def setUp(self):
        super().setUp()
        montar_pacote(self.pasta)
        self.manifesto = ens.carregar_manifesto(self.pasta, agora=AGORA)
        patcher = mock.patch.dict(os.environ, {"DATABASE_URL": "postgresql://teste@localhost:5432/teste"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def rodar(self, **kw):
        cur = CursorFalso(roteiro(**kw))
        tx = Transacao(cur)
        try:
            resultado = ens.importar(tx, self.manifesto)
        except Exception as erro:  # noqa: BLE001
            return cur, tx, None, erro
        return cur, tx, resultado, None

    def sqls(self, cur, comeca):
        return [(s, p) for s, p in cur.executados if s.startswith(comeca)]

    def test_o_lote_inteiro_usa_uma_unica_transacao(self):
        cur, tx, resultado, erro = self.rodar()
        self.assertIsNone(erro)
        self.assertEqual(tx.aberturas, 1)
        self.assertTrue(tx.confirmou)
        self.assertEqual((resultado.importados, resultado.ja_existiam), (2, 0))

    def test_cada_registro_grava_ocorrencia_alerta_e_chave_nessa_ordem(self):
        cur, *_ = self.rodar()
        grava = [s.split("(")[0].strip() for s, _ in cur.executados if s.startswith("INSERT INTO")]
        self.assertEqual(grava, ["INSERT INTO ocorrencia", "INSERT INTO alerta", "INSERT INTO stub_evento_publicado"] * 2)

    def test_a_ocorrencia_nasce_encerrada_sem_paciente_e_o_alerta_ciente_sem_usuario(self):
        cur, *_ = self.rodar()
        sql_o, params_o = self.sqls(cur, "INSERT INTO ocorrencia")[0]
        self.assertIn("NULL, %s, %s, %s, 'encerrada'", sql_o)     # paciente_id NULL, status fixo
        self.assertIn("ON CONFLICT (id) DO NOTHING", sql_o)
        sql_a, params_a = self.sqls(cur, "INSERT INTO alerta")[0]
        self.assertIn("'critico', 'ciente'", sql_a)
        self.assertTrue(sql_a.rstrip(") ").endswith("NULL"))      # ciencia_usuario_id NULL
        self.assertEqual(params_a[0], ID_1)

    def test_a_observacao_gravada_e_o_texto_fixo(self):
        cur, *_ = self.rodar()
        _, params = self.sqls(cur, "INSERT INTO ocorrencia")[0]
        self.assertTrue(params[-1].startswith("ENSAIO CONTROLADO · DADOS DE DEMONSTRAÇÃO"))

    def test_a_chave_do_evento_leva_o_prefixo_de_ensaio(self):
        cur, *_ = self.rodar()
        chaves = [p[0] for _, p in self.sqls(cur, "INSERT INTO stub_evento_publicado")]
        self.assertEqual(chaves, [f"ensaio:{ID_1}", f"ensaio:{ID_2}"])

    def test_repetir_nao_cria_nada_e_nao_mexe_no_que_existe(self):
        cur, tx, resultado, erro = self.rodar(existentes=(ID_1, ID_2), com_chave=(f"ensaio:{ID_1}", f"ensaio:{ID_2}"))
        self.assertIsNone(erro)
        self.assertEqual((resultado.importados, resultado.ja_existiam), (0, 2))
        self.assertEqual(self.sqls(cur, "INSERT INTO alerta"), [])
        self.assertEqual(self.sqls(cur, "INSERT INTO stub_evento_publicado"), [])
        self.assertEqual([s for s, _ in cur.executados if s.startswith(("UPDATE", "DELETE"))], [])

    def test_lote_parcialmente_importado_completa_so_o_que_falta(self):
        cur, tx, resultado, erro = self.rodar(existentes=(ID_1,), com_chave=(f"ensaio:{ID_1}",))
        self.assertIsNone(erro)
        self.assertEqual((resultado.importados, resultado.ja_existiam), (1, 1))

    def test_id_de_ocorrencia_real_aborta_o_lote_e_a_excecao_chega_ao_gerenciador(self):
        cur, tx, resultado, erro = self.rodar(existentes=(ID_2,), com_chave=())
        self.assertIsInstance(erro, ens.ImportacaoRecusada)
        self.assertIn("NÃO é de ensaio", str(erro))
        self.assertIsNotNone(tx.excecao)     # o gerenciador real desfaz tudo ao ver isto
        self.assertFalse(tx.confirmou)

    def test_clinica_inexistente(self):
        _, tx, _, erro = self.rodar(clinica=False)
        self.assertIsInstance(erro, ens.ImportacaoRecusada)
        self.assertFalse(tx.confirmou)

    def test_camera_ausente_ou_duplicada(self):
        for qtd in (0, 2):
            with self.subTest(cameras=qtd):
                _, tx, _, erro = self.rodar(cameras=qtd)
                self.assertIsInstance(erro, ens.ImportacaoRecusada)
                self.assertFalse(tx.confirmou)

    def test_falha_do_banco_no_meio_do_lote_nao_e_engolida(self):
        # Cai ao gravar o alerta do primeiro registro: a ocorrência dele já tinha sido inserida,
        # e só o ROLLBACK da transação única impede que ela fique sem alerta.
        cur, tx, resultado, erro = self.rodar(falhar_em="INSERT INTO alerta")
        self.assertIsInstance(erro, RuntimeError)
        self.assertEqual(tx.aberturas, 1)
        self.assertIsNotNone(tx.excecao)
        self.assertFalse(tx.confirmou)
        self.assertEqual(len(self.sqls(cur, "INSERT INTO ocorrencia")), 1)  # a que o rollback desfaria

    def test_nenhum_commit_ou_transacao_manual_no_codigo(self):
        # A atomicidade é do gerenciador de contexto: o módulo não pode confirmar por conta própria.
        fonte = Path(ens.__file__).read_text(encoding="utf-8")
        for proibido in (".commit(", "autocommit", ".rollback(", "BEGIN", "COMMIT"):
            self.assertNotIn(proibido, fonte)


# --- linha de comando --------------------------------------------------------------------

class BancoFalso:
    """Substitui app.db: nada conecta; guarda o que foi pedido."""

    def __init__(self, cursor=None, falha=None):
        self.transacao = Transacao(cursor or CursorFalso(roteiro()))
        self.falha = falha
        self.abriu = False
        self.fechou = False

    def abrir_pool(self):
        self.abriu = True

    def fechar_pool(self):
        self.fechou = True

    def cursor(self):
        if self.falha:
            raise self.falha
        return self.transacao()


class LinhaDeComando(ComPasta):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.dict(os.environ, {"DATABASE_URL": "postgresql://teste@localhost:5432/teste"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def rodar(self, argv=None, *, modo_teste=True, pasta="padrao", banco=None):
        ambiente = self.pasta if pasta == "padrao" else pasta
        saida = io.StringIO()
        import app as pacote
        with mock.patch.object(clipes, "MODO_TESTE", modo_teste), \
                mock.patch.object(clipes, "PASTA_ENSAIO", ambiente), \
                mock.patch.object(pacote, "db", banco or BancoFalso(), create=True), \
                contextlib.redirect_stdout(saida):
            codigo = ens.main(argv or [])
        return codigo, saida.getvalue()

    def test_modo_de_teste_desligado_nao_faz_nada(self):
        montar_pacote(self.pasta)
        banco = BancoFalso()
        codigo, texto = self.rodar(modo_teste=False, banco=banco)
        self.assertEqual(codigo, ens.SAIDA_DESLIGADO)
        self.assertIn("modo de teste desligado", texto)
        self.assertFalse(banco.abriu)

    def test_pasta_nao_configurada(self):
        codigo, texto = self.rodar(pasta=None)
        self.assertEqual(codigo, ens.SAIDA_DESLIGADO)
        self.assertIn("CLIPES_ENSAIO_DIR", texto)

    def test_sem_manifesto_nao_e_erro(self):
        banco = BancoFalso()
        codigo, texto = self.rodar(banco=banco)
        self.assertEqual(codigo, ens.SAIDA_OK)
        self.assertIn("nada a importar", texto)
        self.assertFalse(banco.abriu)

    def test_manifesto_invalido_para_antes_do_banco(self):
        montar_pacote(self.pasta)
        (self.pasta / f"{ID_1}.mp4").unlink()
        banco = BancoFalso()
        codigo, texto = self.rodar(banco=banco)
        self.assertEqual(codigo, ens.SAIDA_INVALIDO)
        self.assertIn("NADA foi gravado", texto)
        self.assertIn("clipe ausente", texto)
        self.assertFalse(banco.abriu)  # o banco nem foi aberto

    def test_validar_apenas_nao_toca_no_banco(self):
        montar_pacote(self.pasta)
        banco = BancoFalso()
        codigo, texto = self.rodar(["--validar-apenas"], banco=banco)
        self.assertEqual(codigo, ens.SAIDA_OK)
        self.assertIn("validado=sim gravado=nao", texto)
        self.assertFalse(banco.abriu)

    def test_importacao_bem_sucedida(self):
        montar_pacote(self.pasta)
        banco = BancoFalso()
        codigo, texto = self.rodar(banco=banco)
        self.assertEqual(codigo, ens.SAIDA_OK)
        self.assertIn("RESULTADO: importados=2 ja_existiam=0", texto)
        self.assertTrue(banco.abriu and banco.fechou)
        self.assertTrue(banco.transacao.confirmou)

    def test_falha_do_banco_devolve_codigo_proprio_e_diz_que_nada_foi_gravado(self):
        montar_pacote(self.pasta)
        banco = BancoFalso(falha=RuntimeError("conexao recusada"))
        codigo, texto = self.rodar(banco=banco)
        self.assertEqual(codigo, ens.SAIDA_BANCO)
        self.assertIn("NADA foi gravado", texto)
        self.assertIn("conexao recusada", texto)
        self.assertTrue(banco.fechou)  # o pool é fechado mesmo na falha

    def test_recusa_do_lote_devolve_o_codigo_de_invalido(self):
        montar_pacote(self.pasta)
        banco = BancoFalso(cursor=CursorFalso(roteiro(clinica=False)))
        codigo, texto = self.rodar(banco=banco)
        self.assertEqual(codigo, ens.SAIDA_INVALIDO)
        self.assertIn("RECUSADA", texto)


if __name__ == "__main__":
    unittest.main()
