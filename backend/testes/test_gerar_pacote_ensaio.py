"""Testes do gerador do pacote de registros de ensaio (scripts/gerar-pacote-ensaio.py).

    python -m unittest discover -s backend/testes -t backend

O gerador não tem dado do autor dentro; aqui o banco é substituído por linhas falsas, e o que se
prova é o que protege o autor: não inventar texto, não gravar onde o Git veja, ler o banco só em
modo leitura e entregar um pacote que o importador da VPS aceita.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

RAIZ = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("gerar_pacote_ensaio", RAIZ / "scripts" / "gerar-pacote-ensaio.py")
gerador = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gerador)

ID_1 = "b2c4e6f8-0000-4000-8000-000000000001"
ID_2 = "1a2b3c4d-0000-4000-8000-000000000002"
MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"


def linha(rid: str, hora: str, **extra) -> dict:
    base = {"id": rid, "tipo_evento": "permanencia_solo", "confianca": 1.0, "data_hora": hora,
            "tenant": "clinica-demo", "camera": "CAM-QUARTO101"}
    base.update(extra)
    return base


LINHAS = [linha(ID_1, "2026-01-15T13:10:17.277075+00:00"), linha(ID_2, "2026-01-15T13:14:15.297861+00:00")]
TEXTOS = {ID_1: "teste exploratório com a RN10 em 1 s", ID_2: "teste exploratório com a RN10 em 1 s"}


class ComPastas(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        raiz = Path(self._t.name)
        self.clipes = raiz / "clipes"
        self.clipes.mkdir()
        self.saida = raiz / "pacote"  # fora do repositório
        for rid in (ID_1, ID_2):
            (self.clipes / f"{rid}.mp4").write_bytes(MP4 + rid[:8].encode() * 40)

    def gerar(self, linhas=LINHAS, textos=TEXTOS, notas=None, ignorado=lambda p: False):
        return gerador.gerar(self.clipes, self.saida, dict(textos), notas or {}, lambda ids: list(linhas), ignorado)


class PacoteValido(ComPastas):
    def test_gera_manifesto_e_copia_os_clipes_com_o_hash_certo(self):
        manifesto, escritos = self.gerar()

        self.assertEqual(manifesto["versao"], 1)
        self.assertEqual((manifesto["tenant"], manifesto["camera"]), ("clinica-demo", "CAM-QUARTO101"))
        self.assertEqual([r["id"] for r in manifesto["registros"]], [ID_1, ID_2])  # por horário
        for r in manifesto["registros"]:
            copia = (self.saida / r["arquivo"]).read_bytes()
            self.assertEqual(r["sha256"], hashlib.sha256(copia).hexdigest())
            self.assertEqual(r["bytes"], len(copia))
            self.assertEqual(copia, (self.clipes / r["arquivo"]).read_bytes())
        self.assertEqual(len(escritos), 3)
        self.assertEqual(json.loads((self.saida / "manifesto.json").read_text(encoding="utf-8")), manifesto)

    def test_o_texto_das_condicoes_vem_de_quem_gera_e_nao_do_script(self):
        manifesto, _ = self.gerar(textos={ID_1: "condição A", ID_2: "condição B"})
        self.assertEqual([r["configuracao"] for r in manifesto["registros"]], ["condição A", "condição B"])

    def test_a_confianca_nula_e_aceita_e_a_nota_so_entra_quando_dada(self):
        manifesto, _ = self.gerar(linhas=[linha(ID_1, "2026-01-15T13:10:17+00:00", confianca=None), LINHAS[1]], notas={ID_2: "observação do autor"})
        por_id = {r["id"]: r for r in manifesto["registros"]}
        self.assertIsNone(por_id[ID_1]["confianca"])
        self.assertNotIn("nota", por_id[ID_1])
        self.assertEqual(por_id[ID_2]["nota"], "observação do autor")

    def test_prefixo_de_8_caracteres_basta_para_apontar_o_registro(self):
        manifesto, _ = self.gerar(textos={ID_1[:8]: "A", ID_2[:8]: "B"})
        self.assertEqual({r["id"]: r["configuracao"] for r in manifesto["registros"]}, {ID_1: "A", ID_2: "B"})


class NadaEInventado(ComPastas):
    def test_sem_texto_de_condicoes_para_um_registro_ele_para_e_diz_qual(self):
        with self.assertRaises(gerador.Erro) as ctx:
            self.gerar(textos={ID_1: "só o primeiro"})
        self.assertIn(ID_2[:8], str(ctx.exception))
        self.assertIn("--configuracao-de", str(ctx.exception))
        self.assertFalse(self.saida.exists(), "nada pode ser gravado quando falta informação")

    def test_prefixo_curto_demais_e_recusado(self):
        with self.assertRaises(gerador.Erro):
            self.gerar(textos={ID_1[:4]: "x", ID_2: "y"})

    def test_prefixo_que_nao_bate_com_nenhum_clipe_e_recusado(self):
        with self.assertRaises(gerador.Erro):
            self.gerar(textos={"00000000": "x", ID_1: "a", ID_2: "b"})

    def test_clipe_sem_ocorrencia_no_banco_local_e_recusado(self):
        with self.assertRaises(gerador.Erro) as ctx:
            self.gerar(linhas=[LINHAS[0]])
        self.assertIn(ID_2, str(ctx.exception))

    def test_cameras_diferentes_nao_cabem_num_so_manifesto(self):
        with self.assertRaises(gerador.Erro) as ctx:
            self.gerar(linhas=[LINHAS[0], linha(ID_2, "2026-01-15T13:14:15+00:00", camera="CAM-OUTRA")])
        self.assertIn("UMA câmera", str(ctx.exception))
        self.assertFalse(self.saida.exists())


class OndeOPacoteVai(ComPastas):
    def test_pasta_dentro_do_repositorio_que_o_git_nao_ignora_e_recusada(self):
        dentro = RAIZ / "pasta-que-nao-existe-e-nao-e-ignorada"
        with self.assertRaises(gerador.Erro) as ctx:
            gerador.conferir_saida(dentro, [ID_1], ignorado=lambda p: False)
        self.assertIn("NÃO a ignora", str(ctx.exception))
        self.assertFalse(dentro.exists())

    def test_pasta_dentro_do_repositorio_ignorada_pelo_git_e_aceita(self):
        gerador.conferir_saida(RAIZ / "pacote-ensaio-teste", [ID_1], ignorado=lambda p: True)

    def test_pasta_fora_do_repositorio_nao_precisa_de_regra_do_git(self):
        gerador.conferir_saida(self.saida, [ID_1], ignorado=lambda p: False)

    def test_pasta_de_saida_com_conteudo_nao_e_sobrescrita(self):
        self.saida.mkdir()
        (self.saida / "velho.txt").write_text("não apague", encoding="utf-8")
        with self.assertRaises(gerador.Erro):
            self.gerar()
        self.assertEqual((self.saida / "velho.txt").read_text(encoding="utf-8"), "não apague")

    def test_a_pasta_real_do_pacote_e_ignorada_pelo_git_de_verdade(self):
        # Integração com o .gitignore do projeto: se alguém apagar a regra, este teste acusa.
        for nome in ("manifesto.json", f"{ID_1}.mp4"):
            self.assertTrue(gerador.git_ignora(RAIZ / "pacote-ensaio" / nome), nome)
            self.assertTrue(gerador.git_ignora(RAIZ / "deploy" / "clipes-ensaio" / nome), nome)


class EntradaDosClipes(ComPastas):
    def test_arquivo_mp4_com_nome_fora_do_padrao_e_recusado(self):
        (self.clipes / "meu-video.mp4").write_bytes(MP4)
        with self.assertRaises(gerador.Erro) as ctx:
            gerador.ids_dos_clipes(self.clipes)
        self.assertIn("meu-video.mp4", str(ctx.exception))

    def test_pasta_sem_clipes_e_pasta_inexistente_sao_recusadas(self):
        vazia = Path(self._t.name) / "vazia"
        vazia.mkdir()
        for pasta in (vazia, Path(self._t.name) / "nao-existe"):
            with self.assertRaises(gerador.Erro):
                gerador.ids_dos_clipes(pasta)


class ConferenciaFinal(ComPastas):
    def test_pacote_que_o_importador_recusa_nao_fica_no_disco(self):
        (self.clipes / f"{ID_1}.mp4").write_bytes(b"isto nao e um mp4 " * 10)  # sem 'ftyp'
        with self.assertRaises(gerador.Erro) as ctx:
            self.gerar()
        self.assertIn("validação do importador", str(ctx.exception))
        self.assertIn("ftyp", str(ctx.exception))
        self.assertEqual(list(self.saida.glob("*")) if self.saida.exists() else [], [])

    def test_data_no_futuro_tambem_e_barrada_pela_mesma_validacao(self):
        with self.assertRaises(gerador.Erro) as ctx:
            self.gerar(linhas=[LINHAS[0], linha(ID_2, "2099-01-01T00:00:00+00:00")])
        self.assertIn("futuro", str(ctx.exception))


class BancoSoLeitura(unittest.TestCase):
    def test_a_consulta_roda_em_modo_somente_leitura_e_nao_leva_senha(self):
        resposta = mock.Mock(returncode=0, stdout=json.dumps(LINHAS), stderr="")
        with mock.patch.object(gerador.subprocess, "run", return_value=resposta) as run:
            linhas = gerador.consultar_no_docker([ID_1, ID_2], "medsignal-db", "medsignal", "medsignal")
        comando = run.call_args.args[0]
        self.assertIn("PGOPTIONS=-c default_transaction_read_only=on", comando)
        self.assertNotIn("PGPASSWORD", " ".join(comando))
        sql = run.call_args.kwargs["input"].upper()
        self.assertTrue(sql.strip().startswith("SELECT"))
        for proibido in ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE"):
            self.assertNotIn(proibido, sql)
        self.assertEqual(linhas, LINHAS)

    def test_id_que_nao_e_uuid_nunca_chega_ao_sql(self):
        with mock.patch.object(gerador.subprocess, "run") as run:
            with self.assertRaises(gerador.Erro):
                gerador.consultar_no_docker(["x'; DROP TABLE ocorrencia; --"], "c", "b", "u")
        run.assert_not_called()

    def test_falha_do_banco_vira_mensagem_clara(self):
        resposta = mock.Mock(returncode=2, stdout="", stderr="psql: error: connection refused\n")
        with mock.patch.object(gerador.subprocess, "run", return_value=resposta):
            with self.assertRaises(gerador.Erro) as ctx:
                gerador.consultar_no_docker([ID_1], "medsignal-db", "medsignal", "medsignal")
        self.assertIn("connection refused", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
