"""Testes do arnês de avaliação — a parte que NÃO depende de vídeo.

Rodar da raiz do projeto:

    visao/.venv/Scripts/python.exe -m unittest discover -s visao/testes -t .

Cobre o que pode estar errado sem nenhum modelo envolvido: a leitura das
anotações, a divisão holdout, o casamento entre alerta e janela, o cálculo das
métricas (inclusive "não medido") e a reprodução da camada de regras sobre uma
trilha sintética. Se isto estiver errado, a matriz de confusão mente, e nada
que o pipeline faça depois conserta.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))

from visao.app import avaliacao as av  # noqa: E402
from visao.app.caracteristicas import Caracteristicas  # noqa: E402
from visao.app.regras import Limiares  # noqa: E402

FPS = 8.0
EM_PE = Caracteristicas(angulo_tronco=5.0, razao_aspecto=0.4, razao_altura=1.0, velocidade_queda=0.0, abertura_vertical=0.9)
NO_CHAO = Caracteristicas(angulo_tronco=80.0, razao_aspecto=1.6, razao_altura=0.3, velocidade_queda=0.0, abertura_vertical=0.2)
CAINDO = Caracteristicas(angulo_tronco=40.0, razao_aspecto=0.8, razao_altura=0.6, velocidade_queda=1.2, abertura_vertical=0.5)
AGACHADO = Caracteristicas(angulo_tronco=30.0, razao_aspecto=0.7, razao_altura=0.6, velocidade_queda=0.3, abertura_vertical=0.6)


def trilha_de(sequencia: list[Caracteristicas | str | None], id_rastreio: int = 1) -> av.Trilha:
    """Monta uma trilha quadro a quadro a 8 fps.

    Cada item é: features (classificada), uma string (impedimento) ou None
    (nenhuma pessoa no quadro).
    """
    trilha = av.Trilha(arquivo="sintetico.mp4", meta={})
    for i, item in enumerate(sequencia):
        quadro = av.QuadroTrilha(indice=i + 1, timestamp=i / FPS, ms_total=40.0)
        if isinstance(item, str):
            quadro.pessoas.append(av.PessoaTrilha(id_rastreio, None, item))
        elif item is not None:
            quadro.pessoas.append(av.PessoaTrilha(id_rastreio, item, None))
        trilha.quadros.append(quadro)
    return trilha


def queda_sintetica(segundos_em_pe: float = 2.0, segundos_no_chao: float = 6.0) -> av.Trilha:
    em_pe = [EM_PE] * int(segundos_em_pe * FPS)
    no_chao = [NO_CHAO] * int(segundos_no_chao * FPS)
    return trilha_de(em_pe + [CAINDO] + no_chao)


class Anotacoes(unittest.TestCase):
    def escrever(self, conteudo: str) -> Path:
        pasta = Path(tempfile.mkdtemp())
        caminho = pasta / "anotacoes.csv"
        caminho.write_text(conteudo, encoding="utf-8")
        return caminho

    def test_le_positivos_e_negativos(self):
        caminho = self.escrever(
            "arquivo,tem_queda,inicio_s,fim_s,cenario,observacao\n"
            "queda-01.mp4,sim,4.2,6.0,queda_da_cama,\n"
            "sentar-01.mp4,nao,,,sentar,negativo dificil\n"
        )
        anotacoes = av.carregar_anotacoes(caminho)
        self.assertEqual(len(anotacoes), 2)
        self.assertTrue(anotacoes[0].tem_queda)
        self.assertEqual((anotacoes[0].inicio_s, anotacoes[0].fim_s), (4.2, 6.0))
        self.assertFalse(anotacoes[1].tem_queda)
        self.assertIsNone(anotacoes[1].inicio_s)
        self.assertEqual(anotacoes[1].observacao, "negativo dificil")

    def test_aceita_virgula_decimal(self):
        caminho = self.escrever("arquivo,tem_queda,inicio_s,fim_s\nq.mp4,sim,\"4,5\",\"6,0\"\n")
        self.assertEqual(av.carregar_anotacoes(caminho)[0].inicio_s, 4.5)

    def test_positivo_sem_janela_e_erro(self):
        caminho = self.escrever("arquivo,tem_queda,inicio_s,fim_s\nq.mp4,sim,,\n")
        with self.assertRaises(av.AnotacaoInvalida):
            av.carregar_anotacoes(caminho)

    def test_fim_antes_do_inicio_e_erro(self):
        caminho = self.escrever("arquivo,tem_queda,inicio_s,fim_s\nq.mp4,sim,6,4\n")
        with self.assertRaises(av.AnotacaoInvalida):
            av.carregar_anotacoes(caminho)

    def test_tem_queda_invalido_e_erro(self):
        caminho = self.escrever("arquivo,tem_queda,inicio_s,fim_s\nq.mp4,talvez,,\n")
        with self.assertRaises(av.AnotacaoInvalida):
            av.carregar_anotacoes(caminho)

    def test_arquivo_repetido_e_erro(self):
        caminho = self.escrever("arquivo,tem_queda,inicio_s,fim_s\nq.mp4,nao,,\nq.mp4,nao,,\n")
        with self.assertRaises(av.AnotacaoInvalida):
            av.carregar_anotacoes(caminho)

    def test_coluna_conjunto_opcional(self):
        caminho = self.escrever("arquivo,tem_queda,inicio_s,fim_s,conjunto\nq.mp4,nao,,,teste\n")
        self.assertEqual(av.carregar_anotacoes(caminho)[0].conjunto, "teste")


class Holdout(unittest.TestCase):
    def anotacoes(self, n_pos: int, n_neg: int) -> list[av.Anotacao]:
        pos = [av.Anotacao(f"q{i}.mp4", True, 1.0, 2.0) for i in range(n_pos)]
        neg = [av.Anotacao(f"n{i}.mp4", False, None, None) for i in range(n_neg)]
        return pos + neg

    def test_estratifica_e_e_reproduzivel(self):
        anotacoes = self.anotacoes(10, 10)
        a = av.dividir_holdout(anotacoes, semente=42, fracao_teste=0.5)
        b = av.dividir_holdout(anotacoes, semente=42, fracao_teste=0.5)
        self.assertEqual(a, b)
        teste_pos = sum(1 for x in anotacoes if x.tem_queda and a[x.arquivo] == "teste")
        teste_neg = sum(1 for x in anotacoes if not x.tem_queda and a[x.arquivo] == "teste")
        self.assertEqual((teste_pos, teste_neg), (5, 5))

    def test_semente_diferente_muda_a_divisao(self):
        anotacoes = self.anotacoes(10, 10)
        a = av.dividir_holdout(anotacoes, semente=1)
        b = av.dividir_holdout(anotacoes, semente=2)
        self.assertNotEqual(a, b)

    def test_respeita_conjunto_fixado_no_csv(self):
        anotacoes = self.anotacoes(4, 4)
        anotacoes[0] = av.Anotacao("q0.mp4", True, 1.0, 2.0, conjunto="teste")
        divisao = av.dividir_holdout(anotacoes, semente=3)
        self.assertEqual(divisao["q0.mp4"], "teste")
        self.assertEqual(set(divisao.values()), {"calibracao", "teste"})


class Reproducao(unittest.TestCase):
    def test_queda_sintetica_gera_uma_ocorrencia_no_tempo_certo(self):
        trilha = queda_sintetica(segundos_em_pe=2.0, segundos_no_chao=6.0)
        eventos = av.reproduzir(trilha, Limiares())
        self.assertEqual(len(eventos), 1)
        evento = eventos[0]
        # Chegou ao chão após quadros_para_confirmar (6) quadros de postura
        # caída; a ocorrência vem segundos_para_ocorrencia (3 s) depois.
        self.assertTrue(evento.viu_transicao)
        self.assertAlmostEqual(evento.timestamp - evento.inicio_caido, 3.0, delta=1 / FPS + 1e-6)
        self.assertGreaterEqual(evento.timestamp, 2.0 + 6 / FPS + 3.0 - 1e-6)

    def test_ja_no_chao_gera_ocorrencia_sem_transicao(self):
        trilha = trilha_de([NO_CHAO] * int(6 * FPS))
        eventos = av.reproduzir(trilha, Limiares())
        self.assertEqual(len(eventos), 1)
        self.assertFalse(eventos[0].viu_transicao)

    def test_agachar_nao_gera_ocorrencia(self):
        trilha = trilha_de([EM_PE] * 16 + [AGACHADO] * 40 + [EM_PE] * 16)
        self.assertEqual(av.reproduzir(trilha, Limiares()), [])

    def test_deitar_e_levantar_rapido_nao_gera_ocorrencia(self):
        # 2 s no chão < 3 s de permanência.
        trilha = trilha_de([EM_PE] * 16 + [NO_CHAO] * 16 + [EM_PE] * 16)
        self.assertEqual(av.reproduzir(trilha, Limiares()), [])

    def test_quadros_com_impedimento_nao_sao_classificados(self):
        trilha = trilha_de(["quadris fora de vista"] * 80)
        self.assertEqual(av.reproduzir(trilha, Limiares()), [])
        self.assertEqual(trilha.quadros_classificados, 0)
        self.assertEqual(trilha.quadros_com_pessoa, 80)

    def test_limiares_mudam_o_resultado(self):
        trilha = queda_sintetica()
        exigente = Limiares(segundos_para_ocorrencia=30.0)
        self.assertEqual(av.reproduzir(trilha, exigente), [])

    def test_trilha_sobrevive_ao_json(self):
        trilha = queda_sintetica()
        copia = av.Trilha.de_json(json.loads(json.dumps(trilha.para_json())))
        self.assertEqual(len(copia.quadros), len(trilha.quadros))
        self.assertEqual(av.reproduzir(copia, Limiares()), av.reproduzir(trilha, Limiares()))


class Casamento(unittest.TestCase):
    def evento(self, t: float) -> av.Evento:
        return av.Evento(timestamp=t, id_rastreio=1, inicio_caido=t - 3.0, viu_transicao=True, motivo="teste")

    def test_tp_dentro_da_janela_com_latencia(self):
        trilha = queda_sintetica()
        anotacao = av.Anotacao("q.mp4", True, 2.0, 3.0)
        r = av.casar(anotacao, trilha, [self.evento(6.0)], tolerancia_s=5.0, minimo_quadros_classificados=8)
        self.assertEqual(r.veredito, av.TP)
        self.assertAlmostEqual(r.latencia_s, 4.0)
        self.assertAlmostEqual(r.tempo_ate_chao_s, 1.0)

    def test_fn_quando_alerta_chega_tarde_demais(self):
        trilha = queda_sintetica()
        anotacao = av.Anotacao("q.mp4", True, 2.0, 3.0)
        r = av.casar(anotacao, trilha, [self.evento(9.5)], tolerancia_s=5.0, minimo_quadros_classificados=8)
        self.assertEqual(r.veredito, av.FN)
        self.assertEqual(len(r.eventos_fora_da_janela), 1)

    def test_fn_sem_alerta(self):
        r = av.casar(av.Anotacao("q.mp4", True, 2.0, 3.0), queda_sintetica(), [], 5.0, 8)
        self.assertEqual(r.veredito, av.FN)

    def test_fp_em_negativo(self):
        trilha = trilha_de([EM_PE] * 80)
        r = av.casar(av.Anotacao("n.mp4", False, None, None), trilha, [self.evento(4.0)], 5.0, 8)
        self.assertEqual(r.veredito, av.FP)

    def test_tn_em_negativo_limpo(self):
        trilha = trilha_de([EM_PE] * 80)
        r = av.casar(av.Anotacao("n.mp4", False, None, None), trilha, [], 5.0, 8)
        self.assertEqual(r.veredito, av.TN)
        self.assertEqual(r.cobertura, 1.0)

    def test_negativo_sem_classificacao_nao_vira_tn(self):
        trilha = trilha_de(["quadris fora de vista"] * 80)
        r = av.casar(av.Anotacao("n.mp4", False, None, None), trilha, [], 5.0, 8)
        self.assertEqual(r.veredito, av.NAO_AVALIAVEL)
        self.assertIn("quadris fora de vista", r.observacao)
        self.assertEqual(r.cobertura, 0.0)

    def test_clipe_sem_pessoa_nao_vira_tn(self):
        trilha = trilha_de([None] * 80)
        r = av.casar(av.Anotacao("n.mp4", False, None, None), trilha, [], 5.0, 8)
        self.assertEqual(r.veredito, av.NAO_AVALIAVEL)
        self.assertIsNone(r.cobertura)


class CalculoDeMetricas(unittest.TestCase):
    def resultado(self, veredito: str, latencia: float | None = None) -> av.ResultadoClipe:
        return av.ResultadoClipe(
            arquivo=f"{veredito}.mp4", tem_queda=veredito in (av.TP, av.FN), cenario="", veredito=veredito,
            eventos=[], eventos_fora_da_janela=[], latencia_s=latencia, tempo_ate_chao_s=None,
            quadros=80, quadros_com_pessoa=80, quadros_classificados=80, impedimentos={}, ms_medio=40.0,
        )

    def test_matriz_completa(self):
        resultados = (
            [self.resultado(av.TP, 4.0)] * 9 + [self.resultado(av.FN)]
            + [self.resultado(av.TN)] * 8 + [self.resultado(av.FP)] * 2
            + [self.resultado(av.NAO_AVALIAVEL)]
        )
        m = av.calcular_metricas(resultados)
        self.assertEqual((m.tp, m.fn, m.fp, m.tn, m.nao_avaliaveis), (9, 1, 2, 8, 1))
        self.assertAlmostEqual(m.recall, 0.9)
        self.assertAlmostEqual(m.precisao, 9 / 11)
        self.assertAlmostEqual(m.taxa_fp, 0.2)
        self.assertAlmostEqual(m.acuracia, 17 / 20)
        self.assertAlmostEqual(m.latencia_media_s, 4.0)
        self.assertEqual(m.latencias_medidas, 9)

    def test_sem_negativos_precisao_nao_e_inventada(self):
        m = av.calcular_metricas([self.resultado(av.TP, 4.0)])
        self.assertEqual(m.recall, 1.0)
        self.assertEqual(m.precisao, 1.0)
        self.assertIsNone(m.taxa_fp)

    def test_tudo_nao_avaliavel_nao_mede_nada(self):
        m = av.calcular_metricas([self.resultado(av.NAO_AVALIAVEL)] * 3)
        self.assertIsNone(m.recall)
        self.assertIsNone(m.precisao)
        self.assertIsNone(m.acuracia)
        self.assertIsNone(m.f1)
        self.assertIsNone(m.latencia_media_s)

    def test_relatorio_grava_os_quatro_arquivos_e_diz_nao_medido(self):
        pasta = Path(tempfile.mkdtemp()) / "saida"
        resultados = [self.resultado(av.TP, 4.0), self.resultado(av.NAO_AVALIAVEL)]
        anotacoes = [av.Anotacao("TP.mp4", True, 1.0, 2.0), av.Anotacao("NAO_AVALIAVEL.mp4", False, None, None)]
        contexto = {"limiares": av.limiares_para_json(Limiares()), "tolerancia_s": 5.0, "semente": 42}
        av.escrever_relatorio(pasta, av.calcular_metricas(resultados), resultados, anotacoes, contexto)
        for nome in ("metricas.json", "metricas.md", "erros.csv", "clipes.csv"):
            self.assertTrue((pasta / nome).exists(), nome)
        md = (pasta / "metricas.md").read_text(encoding="utf-8")
        self.assertIn("não medido", md)
        self.assertIn("NAO_AVALIAVEL", md)
        dados = json.loads((pasta / "metricas.json").read_text(encoding="utf-8"))
        self.assertIsNone(dados["metricas"]["taxa_fp"])
        self.assertEqual(dados["contexto"]["semente"], 42)

    def test_limiares_json_ida_e_volta(self):
        limiares = Limiares(angulo_caido=60.0, quadros_para_confirmar=4)
        self.assertEqual(av.limiares_de_json(av.limiares_para_json(limiares)), limiares)
        with self.assertRaises(ValueError):
            av.limiares_de_json({"inexistente": 1})


if __name__ == "__main__":
    unittest.main()
