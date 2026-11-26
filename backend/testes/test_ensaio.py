"""Testes do módulo que define o que é um registro de ensaio controlado (app/ensaio.py).

    python -m unittest discover -s backend/testes -t backend

O que importa aqui é o fragmento SQL que exclui os registros de ensaio das estatísticas. Ele é um
objeto `psycopg.sql` (composto com `sql.SQL(...).format(...)`, nunca interpolado em f-string):
o alias vira identificador e o prefixo vira literal, escapados pelo driver. E, como as consultas
passam parâmetros, ele não pode ter `%` solto (o psycopg o leria como marcador).
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path
from unittest import mock

from psycopg import sql

from app.ensaio import PREFIXO_CHAVE, chave_do_registro, eh_ensaio, sem_ensaio


def texto(fragmento: sql.Composable) -> str:
    return fragmento.as_string()


class FragmentosSql(unittest.TestCase):
    def test_chave_leva_o_prefixo_e_o_id(self):
        self.assertEqual(chave_do_registro("abc"), f"{PREFIXO_CHAVE}abc")
        self.assertTrue(chave_do_registro("abc").startswith("ensaio:"))

    def test_os_fragmentos_sao_objetos_do_psycopg_e_nao_texto(self):
        # Texto puro convidaria a interpolar em f-string; um Composable só entra por .format().
        for fragmento in (eh_ensaio("o"), sem_ensaio("o")):
            self.assertIsInstance(fragmento, sql.Composable)
            self.assertNotIsInstance(fragmento, str)

    def test_eh_ensaio_olha_a_chave_do_evento_da_ocorrencia_do_alias(self):
        t = texto(eh_ensaio("o"))
        self.assertIn("stub_evento_publicado", t)
        self.assertIn('ev.ocorrencia_id = "o".id', t)  # o alias é identificador, com aspas do driver
        self.assertIn("starts_with(ev.chave, 'ensaio:')", t)  # o prefixo é literal, escapado pelo driver

    def test_sem_ensaio_e_a_negacao_exata(self):
        self.assertEqual(texto(sem_ensaio("o")), f"NOT {texto(eh_ensaio('o'))}")

    def test_nao_ha_percentual_no_sql_composto(self):
        # LIKE 'ensaio:%' quebraria as consultas parametrizadas (psycopg leria o %).
        for fragmento in (eh_ensaio("o"), sem_ensaio("o"), eh_ensaio("ocorr_2")):
            self.assertNotIn("%", texto(fragmento))

    def test_alias_invalido_e_recusado(self):
        for alias in ("o; DROP TABLE x", "o.id", "", "1o", "O", "o o", "o)--"):
            with self.assertRaises(ValueError, msg=f"alias {alias!r} deveria ser recusado"):
                eh_ensaio(alias)
            with self.assertRaises(ValueError):
                sem_ensaio(alias)

    def test_alias_simples_e_aceito(self):
        for alias in ("o", "oc", "ocorr_2", "_x"):
            self.assertIn(f'ev.ocorrencia_id = "{alias}".id', texto(eh_ensaio(alias)))

    def test_importar_o_modulo_nao_exige_o_driver(self):
        # O importador e o gerador do pacote validam sem banco nem psycopg: o import é tardio.
        codigo = ast.parse((Path(__file__).resolve().parents[1] / "app" / "ensaio.py").read_text(encoding="utf-8"))
        no_topo = [n for n in codigo.body if isinstance(n, (ast.Import, ast.ImportFrom))]
        modulos = {getattr(n, "module", None) or a.name for n in no_topo for a in getattr(n, "names", [])} | {
            getattr(n, "module", None) for n in no_topo
        }
        self.assertNotIn("psycopg", modulos)


class ConsultasComponhemOSqlSemTexto(unittest.TestCase):
    """Cada consulta que usa o filtro chega ao banco como `psycopg.sql`, com os marcadores intactos."""

    def capturar(self, alvo: str, chamada):
        visto: dict = {}

        class Parou(Exception):
            pass

        def falso(consulta, params=()):
            visto["sql"], visto["params"] = consulta, params
            raise Parou

        with mock.patch(alvo, falso):
            with self.assertRaises(Parou):
                chamada()
        self.assertIsInstance(visto["sql"], sql.Composable, "a consulta tem de ser composta, não texto")
        return visto["sql"].as_string(), visto["params"]

    def confere(self, consulta: str, marcadores: tuple[str, ...]):
        self.assertIn("NOT EXISTS (SELECT 1 FROM stub_evento_publicado ev", consulta)
        self.assertIn("starts_with(ev.chave, 'ensaio:')", consulta)
        for marcador in marcadores:
            self.assertIn(marcador, consulta)
        self.assertNotIn("{", consulta)  # nenhum campo do .format() ficou sem preencher
        self.assertNotIn("Composed", consulta)  # nem um objeto virou texto por engano (f-string)

    def test_estatisticas_do_periodo(self):
        from datetime import date

        from app.rotas import analytics

        consulta, params = self.capturar("app.db.buscar_todos", lambda: analytics.ocorrencias_do_periodo("c1", date(2026, 11, 1), date(2026, 11, 2)))
        self.confere(consulta, ("o.clinica_id = %s",))
        self.assertEqual(len(params), 3)

    def test_cameras_com_e_sem_filtro_de_camera(self):
        from app.rotas import cameras

        sem_filtro, _ = self.capturar("app.db.buscar_todos", lambda: cameras.consultar_cameras("c1"))
        self.confere(sem_filtro, ("%(cid)s", "interval '90 seconds'"))
        self.assertEqual(sem_filtro.count("NOT EXISTS (SELECT 1 FROM stub_evento_publicado"), 2)  # contagem e última ocorrência
        self.assertNotIn("cam.id = %(cam)s", sem_filtro)

        com_filtro, _ = self.capturar("app.db.buscar_todos", lambda: cameras.consultar_cameras("c1", "cam-9"))
        self.assertIn("AND cam.id = %(cam)s", com_filtro)

    def test_painel_operacional(self):
        from app.rotas import painel

        with mock.patch.object(painel, "exigir_tenant"), mock.patch.object(painel, "clinica_por_slug", return_value={"id": "c1"}):
            consulta, params = self.capturar("app.db.buscar_um", lambda: painel.visao_operacional("clinica-demo", mock.Mock()))
        self.confere(consulta, ("%(cid)s", "AS incidentes_24h"))
        self.assertEqual(params, {"cid": "c1"})

    def test_saude_do_sistema(self):
        from app.rotas import saude

        with mock.patch.object(saude, "exigir_tenant"), mock.patch.object(saude, "clinica_por_slug", return_value={"id": "c1"}), \
                mock.patch.object(saude, "_banco", return_value={"ok": True}):
            consulta, params = self.capturar("app.db.buscar_um", lambda: saude.saude("clinica-demo", mock.Mock()))
        self.confere(consulta, ("%(cid)s", "interval '90 seconds'", "AS ocorrencias_24h"))
        self.assertEqual(params, {"cid": "c1"})

    def test_lista_de_ocorrencias_marca_o_ensaio_e_junta_os_filtros(self):
        from app.rotas import ocorrencias

        def chamar(**filtros):
            with mock.patch.object(ocorrencias, "exigir_tenant"), mock.patch.object(ocorrencias, "clinica_por_slug", return_value={"id": "c1"}):
                return self.capturar_lista(ocorrencias, filtros)

        consulta, params = chamar(status="pendente", tipoEvento="queda")
        self.assertIn("EXISTS (SELECT 1 FROM stub_evento_publicado ev", consulta)
        self.assertIn('ev.ocorrencia_id = "o".id', consulta)
        self.assertIn(" AS ensaio", consulta)
        self.assertIn("WHERE o.clinica_id = %(cid)s AND o.status = %(status)s AND o.tipo_evento = %(tipoEvento)s", consulta)
        self.assertEqual({k: params[k] for k in ("cid", "status", "tipoEvento")}, {"cid": "c1", "status": "pendente", "tipoEvento": "queda"})
        self.assertNotIn("{", consulta)

        sem_filtros, _ = chamar()
        self.assertIn("WHERE o.clinica_id = %(cid)s\n", sem_filtros)

    def capturar_lista(self, ocorrencias, filtros):
        base = dict(tenantId="clinica-demo", pacienteId=None, ambienteId=None, status=None, tipoEvento=None, desde=None, ate=None, limite=100, usuario=mock.Mock())
        base.update(filtros)
        return self.capturar("app.db.buscar_todos", lambda: ocorrencias.listar_ocorrencias(**base))


class SqlSemInterpolacaoDeTexto(unittest.TestCase):
    def test_nenhuma_consulta_select_monta_sql_com_f_string(self):
        # É o que o Bandit (B608) acusa. Aqui vira regra nas rotas que usam o filtro de ensaio:
        # f-string com SELECT dentro e campos {…} é recusada. (O UPDATE de câmeras, de setembro,
        # monta o SET com fragmentos fixos do módulo e não usa o filtro: fica fora desta regra.)
        pasta = Path(__file__).resolve().parents[1] / "app" / "rotas"
        problemas = []
        for nome in ("analytics.py", "cameras.py", "ocorrencias.py", "painel.py", "saude.py"):
            arvore = ast.parse((pasta / nome).read_text(encoding="utf-8"))
            for no in ast.walk(arvore):
                if isinstance(no, ast.JoinedStr) and any(isinstance(v, ast.FormattedValue) for v in no.values):
                    literal = "".join(v.value for v in no.values if isinstance(v, ast.Constant) and isinstance(v.value, str)).upper()
                    if "SELECT " in literal:
                        problemas.append(f"{nome}:{no.lineno}")
        self.assertEqual(problemas, [], "SQL montado por f-string: use sql.SQL(...).format(...)")


if __name__ == "__main__":
    unittest.main()
