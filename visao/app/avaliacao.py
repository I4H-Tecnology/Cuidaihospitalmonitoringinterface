"""Validação do detector de quedas: da anotação à matriz de confusão.

É o estágio 6 do pipeline da seção 5.5 da RFC — o único que não roda ao vivo.
Nesta linha de projeto não há meta de cobertura de testes unitários; o que
substitui a garantia de qualidade é a validação do modelo. Este módulo é ela.

Dois cuidados sustentam tudo o que sai daqui:

1. **É o mesmo pipeline do ao vivo.** As features vêm do `PipelineDeteccao`
   real, lendo o arquivo com timestamp em segundos de vídeo. Um caminho
   separado só para avaliar mediria outra coisa.
2. **Não classificar não é "normal".** Um clipe em que o pipeline não
   conseguiu classificar ninguém (enquadramento ruim, pessoa não detectada)
   sai da matriz como *não avaliável*. Contá-lo como verdadeiro negativo
   inflaria a precisão com um número que o sistema não produziu.
"""

from __future__ import annotations

import csv
import hashlib
import json
import logging
import random
import statistics
import subprocess
from collections import Counter
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .caracteristicas import Caracteristicas
from .config import Config, Fonte
from .regras import ClassificadorQuedas, Limiares

logger = logging.getLogger(__name__)

SIM = {"sim", "s", "1", "true", "yes", "y"}
NAO = {"nao", "não", "n", "0", "false", "no"}
CONJUNTOS = {"calibracao", "teste"}


# ---------------------------------------------------------------------------
# Anotações
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Anotacao:
    """Uma linha de `anotacoes.csv`: o que deveria acontecer num clipe."""

    arquivo: str
    tem_queda: bool
    inicio_s: float | None
    fim_s: float | None
    cenario: str = ""
    observacao: str = ""
    # Opcional. Quando preenchido no CSV, fixa a divisão holdout à mão;
    # quando vazio, `calibrar.py` sorteia com semente e registra.
    conjunto: str = ""


class AnotacaoInvalida(ValueError):
    pass


def _float_ou_none(bruto: str) -> float | None:
    bruto = (bruto or "").strip().replace(",", ".")
    if not bruto:
        return None
    return float(bruto)


def carregar_anotacoes(caminho: Path) -> list[Anotacao]:
    """Lê e valida o CSV. Falha na primeira linha errada, dizendo qual."""
    if not caminho.exists():
        raise AnotacaoInvalida(
            f"Arquivo de anotações não encontrado: {caminho}\n"
            "  Modelo em visao/dados/anotacoes.exemplo.csv"
        )
    with caminho.open(encoding="utf-8-sig", newline="") as f:
        leitor = csv.DictReader(f)
        obrigatorias = {"arquivo", "tem_queda", "inicio_s", "fim_s"}
        faltando = obrigatorias - set(leitor.fieldnames or [])
        if faltando:
            raise AnotacaoInvalida(f"Colunas ausentes em {caminho.name}: {sorted(faltando)}")

        anotacoes: list[Anotacao] = []
        vistos: set[str] = set()
        for numero, linha in enumerate(leitor, start=2):
            arquivo = (linha.get("arquivo") or "").strip()
            if not arquivo:
                continue
            if arquivo in vistos:
                raise AnotacaoInvalida(f"linha {numero}: {arquivo} anotado duas vezes")
            vistos.add(arquivo)

            bruto = (linha.get("tem_queda") or "").strip().lower()
            if bruto in SIM:
                tem_queda = True
            elif bruto in NAO:
                tem_queda = False
            else:
                raise AnotacaoInvalida(f"linha {numero}: tem_queda deve ser sim/nao, veio {bruto!r}")

            try:
                inicio = _float_ou_none(linha.get("inicio_s", ""))
                fim = _float_ou_none(linha.get("fim_s", ""))
            except ValueError as erro:
                raise AnotacaoInvalida(f"linha {numero}: inicio_s/fim_s inválidos ({erro})") from None

            if tem_queda:
                if inicio is None or fim is None:
                    raise AnotacaoInvalida(
                        f"linha {numero}: {arquivo} tem queda mas falta inicio_s ou fim_s"
                    )
                if fim < inicio:
                    raise AnotacaoInvalida(f"linha {numero}: fim_s ({fim}) antes de inicio_s ({inicio})")
            conjunto = (linha.get("conjunto") or "").strip().lower()
            if conjunto and conjunto not in CONJUNTOS:
                raise AnotacaoInvalida(
                    f"linha {numero}: conjunto deve ser 'calibracao' ou 'teste', veio {conjunto!r}"
                )

            anotacoes.append(
                Anotacao(
                    arquivo=arquivo,
                    tem_queda=tem_queda,
                    inicio_s=inicio if tem_queda else None,
                    fim_s=fim if tem_queda else None,
                    cenario=(linha.get("cenario") or "").strip(),
                    observacao=(linha.get("observacao") or "").strip(),
                    conjunto=conjunto,
                )
            )
    if not anotacoes:
        raise AnotacaoInvalida(f"{caminho.name} não tem nenhuma linha anotada")
    return anotacoes


def dividir_holdout(
    anotacoes: list[Anotacao], semente: int, fracao_teste: float = 0.5
) -> dict[str, str]:
    """Separa calibração e teste, estratificando por `tem_queda`.

    Linhas com `conjunto` preenchido no CSV são respeitadas; as demais são
    sorteadas com a semente, para a divisão ser reproduzível e registrável.
    Devolve {arquivo: 'calibracao' | 'teste'}.
    """
    if not 0.0 < fracao_teste < 1.0:
        raise ValueError("fracao_teste precisa estar entre 0 e 1 (exclusivos)")
    divisao = {a.arquivo: a.conjunto for a in anotacoes if a.conjunto}
    gerador = random.Random(semente)
    for positivo in (True, False):
        livres = sorted(a.arquivo for a in anotacoes if a.tem_queda is positivo and not a.conjunto)
        gerador.shuffle(livres)
        n_teste = int(round(len(livres) * fracao_teste))
        for i, arquivo in enumerate(livres):
            divisao[arquivo] = "teste" if i < n_teste else "calibracao"
    return divisao


# ---------------------------------------------------------------------------
# Trilha: o que o pipeline viu em cada quadro, sem a decisão
# ---------------------------------------------------------------------------


@dataclass
class PessoaTrilha:
    id_rastreio: int
    caracteristicas: Caracteristicas | None
    # None = classificada. Qualquer texto = por que não foi.
    impedimento: str | None


@dataclass
class QuadroTrilha:
    indice: int
    timestamp: float
    ms_total: float
    pessoas: list[PessoaTrilha] = field(default_factory=list)


@dataclass
class Trilha:
    """Saída dos estágios de percepção para um clipe inteiro.

    Guarda o suficiente para reproduzir a camada de regras quantas vezes for
    preciso sem rodar YOLO e MediaPipe de novo — é o que torna a varredura de
    limiares viável em CPU.
    """

    arquivo: str
    meta: dict
    quadros: list[QuadroTrilha] = field(default_factory=list)

    @property
    def quadros_com_pessoa(self) -> int:
        return sum(1 for q in self.quadros if q.pessoas)

    @property
    def quadros_classificados(self) -> int:
        return sum(1 for q in self.quadros if any(p.impedimento is None for p in q.pessoas))

    def impedimentos(self) -> Counter[str]:
        contagem: Counter[str] = Counter()
        for q in self.quadros:
            for p in q.pessoas:
                if p.impedimento is not None:
                    contagem[p.impedimento] += 1
        return contagem

    def latencias_ms(self) -> list[float]:
        return [q.ms_total for q in self.quadros]

    # -- serialização -----------------------------------------------------

    def para_json(self) -> dict:
        return {
            "arquivo": self.arquivo,
            "meta": self.meta,
            "quadros": [
                {
                    "i": q.indice,
                    "t": round(q.timestamp, 4),
                    "ms": round(q.ms_total, 1),
                    "pessoas": [
                        {
                            "id": p.id_rastreio,
                            "c": [float(v) for v in p.caracteristicas.como_vetor()] if p.caracteristicas else None,
                            "imp": p.impedimento,
                        }
                        for p in q.pessoas
                    ],
                }
                for q in self.quadros
            ],
        }

    @classmethod
    def de_json(cls, dados: dict) -> "Trilha":
        quadros = []
        for q in dados["quadros"]:
            pessoas = []
            for p in q["pessoas"]:
                c = Caracteristicas(*p["c"]) if p["c"] is not None else None
                pessoas.append(PessoaTrilha(id_rastreio=p["id"], caracteristicas=c, impedimento=p["imp"]))
            quadros.append(QuadroTrilha(indice=q["i"], timestamp=q["t"], ms_total=q["ms"], pessoas=pessoas))
        return cls(arquivo=dados["arquivo"], meta=dados["meta"], quadros=quadros)


@dataclass(frozen=True)
class Evento:
    """Uma ocorrência gerada pela camada de regras."""

    timestamp: float
    id_rastreio: int
    inicio_caido: float | None
    viu_transicao: bool
    motivo: str


def reproduzir(trilha: Trilha, limiares: Limiares) -> list[Evento]:
    """Aplica a camada de regras a uma trilha, do jeito que o pipeline aplica.

    Segue o mesmo protocolo de `PipelineDeteccao.processar_quadro`: esquece
    quem saiu de cena, e só avalia quem foi classificável naquele quadro.
    """
    classificador = ClassificadorQuedas(limiares)
    eventos: list[Evento] = []
    for quadro in trilha.quadros:
        classificador.esquecer({p.id_rastreio for p in quadro.pessoas})
        for p in quadro.pessoas:
            if p.impedimento is not None or p.caracteristicas is None:
                continue
            avaliacao = classificador.avaliar(p.id_rastreio, p.caracteristicas, quadro.timestamp)
            if avaliacao.deve_gerar_ocorrencia:
                eventos.append(
                    Evento(
                        timestamp=quadro.timestamp,
                        id_rastreio=p.id_rastreio,
                        inicio_caido=avaliacao.inicio_caido,
                        viu_transicao=avaliacao.viu_transicao,
                        motivo=avaliacao.motivo,
                    )
                )
    return eventos


# ---------------------------------------------------------------------------
# Execução do pipeline real sobre um clipe
# ---------------------------------------------------------------------------


def config_para_clipe(caminho: Path, base: Config | None = None) -> Config:
    """Config que lê `caminho` em tempo de vídeo e nunca publica nada."""
    base = base or Config()
    return Config(
        modo_teste=True,
        fonte=Fonte.ARQUIVO,
        arquivo=str(caminho),
        arquivo_tempo_real=False,
        fps_alvo=base.fps_alvo,
        largura=base.largura,
        camera_id="",
        api_login="",
        api_senha="",
    )


def fixar_semente(semente: int) -> None:
    """Fixa as sementes que os modelos consultam. Em CPU o resultado do YOLO
    e do MediaPipe já é determinístico; isto garante que continue sendo."""
    random.seed(semente)
    try:
        import numpy as np

        np.random.seed(semente)
    except ImportError:  # pragma: no cover
        pass
    try:
        import torch

        torch.manual_seed(semente)
    except ImportError:  # pragma: no cover
        pass


def sha256_de(caminho: Path, blocos: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        while True:
            bloco = f.read(blocos)
            if not bloco:
                break
            h.update(bloco)
    return h.hexdigest()


def versao_do_ambiente(pasta_pesos: Path, peso: str = "yolov8n.pt") -> dict:
    """Tudo o que precisa estar igual para o resultado sair igual."""
    info: dict = {"peso_yolo": peso}
    caminho = pasta_pesos / peso
    info["peso_yolo_sha256"] = sha256_de(caminho) if caminho.exists() else None
    for nome in ("ultralytics", "mediapipe", "cv2", "numpy", "torch"):
        try:
            modulo = __import__(nome)
            info[f"versao_{nome}"] = getattr(modulo, "__version__", "?")
        except ImportError:
            info[f"versao_{nome}"] = None
    try:
        info["git_commit"] = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL, text=True
        ).strip()
    except Exception:
        info["git_commit"] = None
    return info


def chave_de_cache(caminho_video: Path, cfg: Config, ambiente: dict) -> str:
    """Identifica uma trilha: muda se o vídeo, a amostragem ou os modelos mudarem."""
    partes = [
        sha256_de(caminho_video),
        f"fps={cfg.fps_alvo}",
        f"largura={cfg.largura}",
        str(ambiente.get("peso_yolo_sha256")),
        str(ambiente.get("versao_ultralytics")),
        str(ambiente.get("versao_mediapipe")),
    ]
    return hashlib.sha256("|".join(partes).encode()).hexdigest()[:12]


def extrair_trilha(pipeline, caminho_video: Path, cfg: Config, meta: dict) -> tuple[Trilha, list[Evento]]:
    """Roda o pipeline inteiro num clipe.

    Devolve a trilha (para reproduzir depois) e os eventos que o próprio
    pipeline gerou nesta passada — os dois saem da mesma execução, então
    `reproduzir(trilha, limiares_atuais)` tem de devolver os mesmos eventos.
    """
    trilha = Trilha(arquivo=caminho_video.name, meta=meta)
    eventos: list[Evento] = []
    for resultado in pipeline.executar(cfg=cfg):
        quadro = QuadroTrilha(
            indice=resultado.quadro.indice,
            timestamp=resultado.quadro.timestamp,
            ms_total=resultado.ms_total,
        )
        for r in resultado.pessoas:
            quadro.pessoas.append(
                PessoaTrilha(
                    id_rastreio=r.pessoa.id_rastreio,
                    caracteristicas=r.caracteristicas,
                    impedimento=r.impedimento,
                )
            )
            if r.avaliacao is not None and r.avaliacao.deve_gerar_ocorrencia:
                eventos.append(
                    Evento(
                        timestamp=resultado.quadro.timestamp,
                        id_rastreio=r.pessoa.id_rastreio,
                        inicio_caido=r.avaliacao.inicio_caido,
                        viu_transicao=r.avaliacao.viu_transicao,
                        motivo=r.avaliacao.motivo,
                    )
                )
        trilha.quadros.append(quadro)
    return trilha, eventos


def carregar_ou_extrair(
    pipeline,
    caminho_video: Path,
    cfg: Config,
    pasta_cache: Path | None,
    ambiente: dict,
    usar_cache: bool = True,
) -> tuple[Trilha, list[Evento] | None]:
    """Devolve a trilha do clipe, do cache quando existir e for válida.

    Quando vem do cache, os eventos são None: quem precisa deles reproduz a
    camada de regras sobre a trilha, que é barato.
    """
    chave = chave_de_cache(caminho_video, cfg, ambiente)
    arquivo_cache = None
    if pasta_cache is not None:
        arquivo_cache = pasta_cache / f"{caminho_video.stem}-{chave}.json"
        if usar_cache and arquivo_cache.exists():
            logger.info("Trilha em cache: %s", arquivo_cache.name)
            return Trilha.de_json(json.loads(arquivo_cache.read_text(encoding="utf-8"))), None

    meta = {"chave": chave, "extraido_em": datetime.now(timezone.utc).isoformat(), **ambiente}
    pipeline.reiniciar()
    trilha, eventos = extrair_trilha(pipeline, caminho_video, cfg, meta)
    if arquivo_cache is not None:
        arquivo_cache.parent.mkdir(parents=True, exist_ok=True)
        arquivo_cache.write_text(json.dumps(trilha.para_json()), encoding="utf-8")
    return trilha, eventos


# ---------------------------------------------------------------------------
# Casamento entre o que aconteceu e o que deveria acontecer
# ---------------------------------------------------------------------------

TP, FN, FP, TN, NAO_AVALIAVEL = "TP", "FN", "FP", "TN", "NAO_AVALIAVEL"


@dataclass
class ResultadoClipe:
    arquivo: str
    tem_queda: bool
    cenario: str
    veredito: str
    eventos: list[Evento]
    # Alertas em clipe positivo, mas fora da janela anotada. Não entram na
    # matriz (o clipe já é TP ou FN); ficam listados para análise.
    eventos_fora_da_janela: list[Evento]
    latencia_s: float | None            # primeiro alerta correto - inicio_s
    tempo_ate_chao_s: float | None      # inicio_caido - inicio_s
    quadros: int
    quadros_com_pessoa: int
    quadros_classificados: int
    impedimentos: dict[str, int]
    ms_medio: float | None
    observacao: str = ""

    @property
    def cobertura(self) -> float | None:
        """Fração dos quadros com pessoa em que ela foi classificada."""
        if self.quadros_com_pessoa == 0:
            return None
        return self.quadros_classificados / self.quadros_com_pessoa


def casar(
    anotacao: Anotacao,
    trilha: Trilha,
    eventos: list[Evento],
    tolerancia_s: float,
    minimo_quadros_classificados: int,
) -> ResultadoClipe:
    """Decide em que célula da matriz o clipe cai.

    - TP: clipe com queda e algum alerta em [inicio_s, fim_s + tolerância]
    - FN: clipe com queda e nenhum alerta nessa janela
    - FP: clipe sem queda e qualquer alerta
    - TN: clipe sem queda e nenhum alerta
    - NAO_AVALIAVEL: o pipeline classificou gente em menos quadros do que o
      mínimo — não dá para dizer que o sistema "acertou" o que não avaliou
    """
    impedimentos = trilha.impedimentos()
    latencias = trilha.latencias_ms()
    comum = dict(
        arquivo=anotacao.arquivo,
        tem_queda=anotacao.tem_queda,
        cenario=anotacao.cenario,
        eventos=list(eventos),
        quadros=len(trilha.quadros),
        quadros_com_pessoa=trilha.quadros_com_pessoa,
        quadros_classificados=trilha.quadros_classificados,
        impedimentos=dict(impedimentos),
        ms_medio=statistics.mean(latencias) if latencias else None,
        observacao=anotacao.observacao,
    )

    if trilha.quadros_classificados < minimo_quadros_classificados:
        principal = impedimentos.most_common(1)[0][0] if impedimentos else "nenhuma pessoa detectada"
        comum["observacao"] = f"{principal} | {anotacao.observacao}".strip(" |")
        return ResultadoClipe(
            veredito=NAO_AVALIAVEL,
            eventos_fora_da_janela=[],
            latencia_s=None,
            tempo_ate_chao_s=None,
            **comum,
        )

    if not anotacao.tem_queda:
        return ResultadoClipe(
            veredito=FP if eventos else TN,
            eventos_fora_da_janela=[],
            latencia_s=None,
            tempo_ate_chao_s=None,
            **comum,
        )

    assert anotacao.inicio_s is not None and anotacao.fim_s is not None
    inicio, fim = anotacao.inicio_s, anotacao.fim_s + tolerancia_s
    dentro = sorted((e for e in eventos if inicio <= e.timestamp <= fim), key=lambda e: e.timestamp)
    fora = [e for e in eventos if not (inicio <= e.timestamp <= fim)]
    if not dentro:
        return ResultadoClipe(
            veredito=FN,
            eventos_fora_da_janela=fora,
            latencia_s=None,
            tempo_ate_chao_s=None,
            **comum,
        )
    primeiro = dentro[0]
    return ResultadoClipe(
        veredito=TP,
        eventos_fora_da_janela=fora,
        latencia_s=primeiro.timestamp - anotacao.inicio_s,
        tempo_ate_chao_s=(
            primeiro.inicio_caido - anotacao.inicio_s if primeiro.inicio_caido is not None else None
        ),
        **comum,
    )


# ---------------------------------------------------------------------------
# Métricas
# ---------------------------------------------------------------------------


def _percentil(valores: list[float], p: float) -> float:
    ordenados = sorted(valores)
    if len(ordenados) == 1:
        return ordenados[0]
    posicao = (len(ordenados) - 1) * p
    baixo = int(posicao)
    alto = min(baixo + 1, len(ordenados) - 1)
    fracao = posicao - baixo
    return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * fracao


@dataclass
class Metricas:
    """As seis métricas da RFC, mais o que é preciso para lê-las com honestidade.

    Qualquer valor None quer dizer *não medido* — o denominador era zero. É
    assim que aparece no relatório, e nunca como 0% ou 100%.
    """

    tp: int = 0
    fn: int = 0
    fp: int = 0
    tn: int = 0
    nao_avaliaveis: int = 0
    alertas_fora_da_janela: int = 0

    acuracia: float | None = None
    precisao: float | None = None
    recall: float | None = None
    f1: float | None = None
    taxa_fp: float | None = None

    latencia_media_s: float | None = None
    latencia_p95_s: float | None = None
    latencia_max_s: float | None = None
    latencias_medidas: int = 0

    # Custo por quadro do pipeline, em ms. Não é a latência do alerta — é
    # quanto tempo cada quadro levou para ser processado.
    ms_por_quadro_medio: float | None = None
    ms_por_quadro_p95: float | None = None

    @property
    def avaliados(self) -> int:
        return self.tp + self.fn + self.fp + self.tn

    def para_json(self) -> dict:
        return asdict(self)


def calcular_metricas(resultados: Iterable[ResultadoClipe]) -> Metricas:
    m = Metricas()
    latencias: list[float] = []
    ms: list[float] = []
    for r in resultados:
        if r.veredito == TP:
            m.tp += 1
            if r.latencia_s is not None:
                latencias.append(r.latencia_s)
        elif r.veredito == FN:
            m.fn += 1
        elif r.veredito == FP:
            m.fp += 1
        elif r.veredito == TN:
            m.tn += 1
        else:
            m.nao_avaliaveis += 1
        m.alertas_fora_da_janela += len(r.eventos_fora_da_janela)
        if r.ms_medio is not None and r.veredito != NAO_AVALIAVEL:
            ms.append(r.ms_medio)

    def razao(num: int, den: int) -> float | None:
        return num / den if den > 0 else None

    m.acuracia = razao(m.tp + m.tn, m.avaliados)
    m.precisao = razao(m.tp, m.tp + m.fp)
    m.recall = razao(m.tp, m.tp + m.fn)
    if m.precisao is not None and m.recall is not None and (m.precisao + m.recall) > 0:
        m.f1 = 2 * m.precisao * m.recall / (m.precisao + m.recall)
    m.taxa_fp = razao(m.fp, m.fp + m.tn)

    if latencias:
        m.latencia_media_s = statistics.mean(latencias)
        m.latencia_p95_s = _percentil(latencias, 0.95)
        m.latencia_max_s = max(latencias)
        m.latencias_medidas = len(latencias)
    if ms:
        m.ms_por_quadro_medio = statistics.mean(ms)
        m.ms_por_quadro_p95 = _percentil(ms, 0.95)
    return m


# ---------------------------------------------------------------------------
# Relatório
# ---------------------------------------------------------------------------

ALVOS_RFC = {"recall": 0.90, "precisao": 0.80, "taxa_fp": 0.15, "latencia_s": 5.0}


def _pct(valor: float | None) -> str:
    return "não medido" if valor is None else f"{valor * 100:.1f}%"


def _seg(valor: float | None) -> str:
    return "não medido" if valor is None else f"{valor:.2f} s"


def _ms(valor: float | None) -> str:
    return "não medido" if valor is None else f"{valor:.0f} ms"


def _alvo(valor: float | None, alvo: float, maior_melhor: bool) -> str:
    if valor is None:
        return "—"
    ok = valor >= alvo if maior_melhor else valor <= alvo
    return "atingido" if ok else "não atingido"


def limiares_para_json(limiares: Limiares) -> dict:
    return {f.name: getattr(limiares, f.name) for f in fields(Limiares)}


def limiares_de_json(dados: dict) -> Limiares:
    nomes = {f.name for f in fields(Limiares)}
    desconhecidos = set(dados) - nomes
    if desconhecidos:
        raise ValueError(f"Limiares desconhecidos: {sorted(desconhecidos)}")
    return Limiares(**dados)


def gerar_markdown(m: Metricas, resultados: list[ResultadoClipe], contexto: dict) -> str:
    L = contexto.get("limiares", {})
    janelas = contexto.get("janelas", {})
    linhas = [
        f"# Validação do detector de quedas — {contexto.get('conjunto', 'todos os clipes')}",
        "",
        f"Gerado em {contexto.get('gerado_em', '?')} · semente {contexto.get('semente', '?')} · "
        f"peso YOLO `{(contexto.get('peso_yolo_sha256') or '?')[:12]}` · "
        f"commit `{contexto.get('git_commit') or '?'}`",
        "",
        f"Clipes: **{len(resultados)}** anotados, **{m.avaliados}** avaliados, "
        f"**{m.nao_avaliaveis}** não avaliáveis (não entram na matriz).",
        "",
        "## Matriz de confusão (por clipe)",
        "",
        "|                     | Alertou | Não alertou |",
        "|---------------------|--------:|------------:|",
        f"| **Tinha queda**     | TP {m.tp:>3} | FN {m.fn:>7} |",
        f"| **Não tinha queda** | FP {m.fp:>3} | TN {m.tn:>7} |",
        "",
        "## Métricas",
        "",
        "| Métrica | Valor | Alvo (RFC 1.6) | Situação |",
        "|---|---:|---:|---|",
        f"| Recall | {_pct(m.recall)} | ≥ 90% | {_alvo(m.recall, ALVOS_RFC['recall'], True)} |",
        f"| Precisão | {_pct(m.precisao)} | ≥ 80% | {_alvo(m.precisao, ALVOS_RFC['precisao'], True)} |",
        f"| Taxa de falso positivo | {_pct(m.taxa_fp)} | ≤ 15% | {_alvo(m.taxa_fp, ALVOS_RFC['taxa_fp'], False)} |",
        f"| Acurácia | {_pct(m.acuracia)} | — | |",
        f"| F1 | {_pct(m.f1)} | — | |",
        f"| Latência média (queda → alerta) | {_seg(m.latencia_media_s)} | ≤ 5 s | {_alvo(m.latencia_media_s, ALVOS_RFC['latencia_s'], False)} |",
        f"| Latência p95 | {_seg(m.latencia_p95_s)} | | |",
        f"| Latência máxima | {_seg(m.latencia_max_s)} | | |",
        "",
        f"Latência medida em {m.latencias_medidas} verdadeiro(s) positivo(s), do `inicio_s` anotado até o "
        f"primeiro alerta dentro da janela. Inclui, por construção, os "
        f"{L.get('segundos_para_ocorrencia', '?')} s de permanência no chão exigidos pela RN10.",
        "",
        f"Custo de processamento em CPU: {_ms(m.ms_por_quadro_medio)} por quadro em média, "
        f"p95 {_ms(m.ms_por_quadro_p95)}.",
        "",
        "Taxa de FP = FP / (FP + TN): fração dos clipes sem queda em que houve alerta. "
        f"Alertas fora da janela em clipes com queda: {m.alertas_fora_da_janela} "
        "(listados em `erros.csv`, fora da matriz).",
        "",
        "## Limiares usados",
        "",
        "| Parâmetro | Valor |",
        "|---|---:|",
    ]
    for nome, valor in L.items():
        linhas.append(f"| `{nome}` | {valor} |")
    linhas += [
        "",
        f"Tolerância após `fim_s`: {contexto.get('tolerancia_s', '?')} s · "
        f"mínimo de quadros classificados para avaliar: {contexto.get('minimo_quadros_classificados', '?')}",
        "",
        "## Por clipe",
        "",
        "| Clipe | Cenário | Esperado | Veredito | Latência | Cobertura | Observação |",
        "|---|---|---|---|---:|---:|---|",
    ]
    for r in resultados:
        cobertura = "—" if r.cobertura is None else f"{r.cobertura * 100:.0f}%"
        latencia = "—" if r.latencia_s is None else _seg(r.latencia_s)
        linhas.append(
            f"| {r.arquivo} | {r.cenario or '—'} | {'queda' if r.tem_queda else 'sem queda'} | "
            f"{r.veredito} | {latencia} | {cobertura} | {r.observacao or ''} |"
        )
    erros = [r for r in resultados if r.veredito in (FP, FN, NAO_AVALIAVEL)]
    linhas += ["", "## Erros e clipes não avaliáveis", ""]
    if not erros:
        linhas.append("Nenhum.")
    for r in erros:
        cobertura = "—" if r.cobertura is None else f"{r.cobertura * 100:.0f}%"
        if r.veredito == NAO_AVALIAVEL:
            principais = ", ".join(
                f"{k} ({v}×)" for k, v in Counter(r.impedimentos).most_common(2)
            ) or "nenhuma pessoa detectada"
            linhas.append(
                f"- **{r.arquivo}** — não avaliável: {r.quadros_classificados} quadro(s) classificado(s) "
                f"de {r.quadros_com_pessoa} com pessoa. Impedimentos: {principais}."
            )
        elif r.veredito == FN:
            linhas.append(
                f"- **{r.arquivo}** — FN: nenhum alerta entre {janelas.get(r.arquivo, '?')}. "
                f"Cobertura {cobertura}."
            )
        else:
            quando = ", ".join(f"{e.timestamp:.1f}s" for e in r.eventos)
            linhas.append(f"- **{r.arquivo}** — FP: alerta em {quando} ({r.eventos[0].motivo}).")
    linhas.append("")
    return "\n".join(linhas)


def escrever_relatorio(
    pasta: Path,
    metricas: Metricas,
    resultados: list[ResultadoClipe],
    anotacoes: list[Anotacao],
    contexto: dict,
) -> None:
    """Grava metricas.json, metricas.md, erros.csv e clipes.csv em `pasta`."""
    pasta.mkdir(parents=True, exist_ok=True)
    contexto = dict(contexto)
    tolerancia = float(contexto.get("tolerancia_s", 0))
    contexto["janelas"] = {
        a.arquivo: f"{a.inicio_s:.1f}s e {a.fim_s + tolerancia:.1f}s"
        for a in anotacoes
        if a.tem_queda
    }

    (pasta / "metricas.json").write_text(
        json.dumps(
            {
                "contexto": {k: v for k, v in contexto.items() if k != "janelas"},
                "metricas": metricas.para_json(),
                "alvos_rfc": ALVOS_RFC,
                "clipes": [
                    {
                        **{
                            k: v
                            for k, v in asdict(r).items()
                            if k not in ("eventos", "eventos_fora_da_janela")
                        },
                        "cobertura": r.cobertura,
                        "eventos": [asdict(e) for e in r.eventos],
                        "eventos_fora_da_janela": [asdict(e) for e in r.eventos_fora_da_janela],
                    }
                    for r in resultados
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (pasta / "metricas.md").write_text(gerar_markdown(metricas, resultados, contexto), encoding="utf-8")

    with (pasta / "erros.csv").open("w", encoding="utf-8", newline="") as f:
        escritor = csv.writer(f)
        escritor.writerow(["arquivo", "tipo", "segundo", "cenario", "motivo", "cobertura", "observacao"])
        for r in resultados:
            cobertura = "" if r.cobertura is None else f"{r.cobertura:.2f}"
            if r.veredito == FN:
                escritor.writerow([r.arquivo, FN, "", r.cenario, "nenhum alerta na janela", cobertura, r.observacao])
            elif r.veredito == FP:
                for e in r.eventos:
                    escritor.writerow([r.arquivo, FP, f"{e.timestamp:.2f}", r.cenario, e.motivo, cobertura, r.observacao])
            elif r.veredito == NAO_AVALIAVEL:
                motivos = "; ".join(f"{k} ({v})" for k, v in r.impedimentos.items())
                escritor.writerow([r.arquivo, NAO_AVALIAVEL, "", r.cenario, motivos, cobertura, r.observacao])
            for e in r.eventos_fora_da_janela:
                escritor.writerow([r.arquivo, "FP_FORA_JANELA", f"{e.timestamp:.2f}", r.cenario, e.motivo, cobertura, r.observacao])

    with (pasta / "clipes.csv").open("w", encoding="utf-8", newline="") as f:
        escritor = csv.writer(f)
        escritor.writerow([
            "arquivo", "cenario", "tem_queda", "veredito", "latencia_s", "tempo_ate_chao_s",
            "quadros", "quadros_com_pessoa", "quadros_classificados", "cobertura", "ms_medio", "alertas",
        ])
        for r in resultados:
            escritor.writerow([
                r.arquivo, r.cenario, "sim" if r.tem_queda else "nao", r.veredito,
                "" if r.latencia_s is None else f"{r.latencia_s:.2f}",
                "" if r.tempo_ate_chao_s is None else f"{r.tempo_ate_chao_s:.2f}",
                r.quadros, r.quadros_com_pessoa, r.quadros_classificados,
                "" if r.cobertura is None else f"{r.cobertura:.2f}",
                "" if r.ms_medio is None else f"{r.ms_medio:.0f}",
                len(r.eventos),
            ])
