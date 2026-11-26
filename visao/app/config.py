"""Configuração do serviço de visão, lida do ambiente.

Uma decisão central: `MEDSIGNAL_MODO_TESTE` vale para o projeto inteiro, não só
para este serviço. Quando ligada, o sistema assume que está sendo exercitado —
usa a webcam local, marca visualmente a interface e nunca se passa por operação
real. Ver `docs/modo-teste.md`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import Enum


def _bool(nome: str, padrao: bool = False) -> bool:
    bruto = os.environ.get(nome)
    if bruto is None:
        return padrao
    return bruto.strip().lower() in {"1", "true", "t", "sim", "yes", "on"}


def _int(nome: str, padrao: int) -> int:
    try:
        return int(os.environ.get(nome, padrao))
    except ValueError:
        return padrao


def _float(nome: str, padrao: float) -> float:
    try:
        return float(os.environ.get(nome, padrao))
    except ValueError:
        return padrao


# Retenção máxima do clipe de evidência (RNF05, RN08): 24 h em operação real.
# Em MODO DE TESTE (demonstração, sem paciente real) o teto sobe para 30 dias,
# para a banca poder rever o clipe do alerta. É uma exceção deliberada do TCC,
# por isso só existe com MEDSIGNAL_MODO_TESTE=true: sem ele, 24 h continua sendo
# o limite. O backend aplica a mesma regra (backend/app/clipes.py).
RETENCAO_MAXIMA_HORAS = 24.0
RETENCAO_MAXIMA_EM_TESTE_HORAS = 30 * 24.0


class Fonte(str, Enum):
    """De onde os frames vêm."""

    WEBCAM = "webcam"
    RTSP = "rtsp"
    ARQUIVO = "arquivo"


@dataclass(frozen=True)
class Config:
    # --- modo de teste ---------------------------------------------------
    modo_teste: bool = field(default_factory=lambda: _bool("MEDSIGNAL_MODO_TESTE"))

    # --- fonte de vídeo --------------------------------------------------
    fonte: Fonte = field(
        default_factory=lambda: Fonte(os.environ.get("VISAO_FONTE", "webcam").strip().lower())
    )
    webcam_indice: int = field(default_factory=lambda: _int("VISAO_WEBCAM_INDICE", 0))
    rtsp_url: str = field(default_factory=lambda: os.environ.get("VISAO_RTSP_URL", "").strip())
    arquivo: str = field(default_factory=lambda: os.environ.get("VISAO_ARQUIVO", "").strip())
    # Como um ARQUIVO é lido. Em tempo real (padrão), o vídeo se comporta como
    # uma câmera: os quadros chegam no ritmo do relógio e o timestamp é o
    # horário de agora — é o modo da demonstração, em que a ocorrência
    # registrada precisa ter data e hora de verdade. Desligado, o arquivo é
    # lido o mais rápido possível e o timestamp é a posição no vídeo, em
    # segundos: é o que o arnês de avaliação precisa para casar a ocorrência
    # com a anotação (`inicio_s`, `fim_s`) do mesmo clipe.
    arquivo_tempo_real: bool = field(
        default_factory=lambda: _bool("VISAO_ARQUIVO_TEMPO_REAL", True)
    )

    # --- amostragem ------------------------------------------------------
    # A RFC pede alerta em até 5s. Processar 30 fps é desperdício: queda é um
    # evento de ~1s, e 8 fps já dá margem de sobra para a análise temporal.
    fps_alvo: float = field(default_factory=lambda: _float("VISAO_FPS_ALVO", 8.0))
    largura: int = field(default_factory=lambda: _int("VISAO_LARGURA", 640))

    # --- clipe de evidência (RNF05, RN08, RN09) --------------------------
    # 5 s antes + 5 s depois da ocorrência, apagado após 24 h (até 30 dias em
    # modo de teste, ver RETENCAO_MAXIMA_EM_TESTE_HORAS). A pasta é a mesma
    # que o backend monta para servir o clipe ao painel.
    clipes_ativos: bool = field(default_factory=lambda: _bool("VISAO_CLIPES", True))
    clipes_pasta: str = field(default_factory=lambda: os.environ.get("VISAO_CLIPES_PASTA", "").strip())
    clipes_segundos_antes: float = field(default_factory=lambda: _float("VISAO_CLIPES_SEGUNDOS_ANTES", 5.0))
    clipes_segundos_depois: float = field(default_factory=lambda: _float("VISAO_CLIPES_SEGUNDOS_DEPOIS", 5.0))
    clipes_retencao_horas: float = field(default_factory=lambda: _float("VISAO_CLIPES_RETENCAO_HORAS", 24.0))

    # --- integração ------------------------------------------------------
    api_url: str = field(default_factory=lambda: os.environ.get("VISAO_API_URL", "http://localhost:8000").rstrip("/"))
    tenant: str = field(default_factory=lambda: os.environ.get("VISAO_TENANT", "clinica-demo"))

    # Câmera cadastrada que este processo observa. Vazio = não publica: o
    # pipeline roda, mostra na tela e não registra nada. É o modo de quem está
    # só ensaiando o enquadramento, e continua sendo o padrão.
    camera_id: str = field(default_factory=lambda: os.environ.get("VISAO_CAMERA_ID", "").strip())
    # Credencial do usuário de serviço. O serviço faz login como qualquer outro
    # usuário e recebe um JWT — reaproveitar a autenticação que já existe é
    # menos código e menos superfície de ataque que inventar um token estático
    # sem prazo de validade só para máquina.
    api_login: str = field(default_factory=lambda: os.environ.get("VISAO_API_LOGIN", "").strip())
    api_senha: str = field(default_factory=lambda: os.environ.get("VISAO_API_SENHA", ""))

    @property
    def publica_ocorrencias(self) -> bool:
        return bool(self.camera_id)

    def validar(self) -> None:
        """Falha cedo e com mensagem clara, em vez de travar em runtime."""
        if self.fonte is Fonte.RTSP and not self.rtsp_url:
            raise ValueError(
                "VISAO_FONTE=rtsp exige VISAO_RTSP_URL "
                "(ex.: rtsp://usuario:senha@192.168.0.10:554/stream)"
            )
        if self.fonte is Fonte.ARQUIVO and not self.arquivo:
            raise ValueError("VISAO_FONTE=arquivo exige VISAO_ARQUIVO com o caminho do vídeo")
        if self.fonte is Fonte.WEBCAM and not self.modo_teste:
            raise ValueError(
                "Webcam só é permitida com MEDSIGNAL_MODO_TESTE=true. "
                "Em operação real a fonte é a câmera IP (VISAO_FONTE=rtsp)."
            )
        if self.fps_alvo <= 0:
            raise ValueError("VISAO_FPS_ALVO precisa ser maior que zero")
        # A RFC fixa o teto em 24 h (RNF05). Guardar mais seria descumprir a
        # própria regra que o sistema promete — falha na subida, não em auditoria.
        # Exceção: em modo de teste o teto é de 30 dias (ver RETENCAO_MAXIMA_EM_TESTE_HORAS).
        teto = RETENCAO_MAXIMA_EM_TESTE_HORAS if self.modo_teste else RETENCAO_MAXIMA_HORAS
        if not 0 < self.clipes_retencao_horas <= teto:
            raise ValueError(
                f"VISAO_CLIPES_RETENCAO_HORAS precisa estar entre 0 e {teto:g} (RNF05)"
                + ("" if self.modo_teste else
                   "; acima de 24 h só com MEDSIGNAL_MODO_TESTE=true (demonstração, até 30 dias)")
            )
        # Câmera configurada sem credencial publicaria em silêncio no vazio: o
        # pipeline detectaria, tentaria enviar, tomaria 401 a cada evento e o
        # banco ficaria vazio. Melhor não subir.
        if self.camera_id and not (self.api_login and self.api_senha):
            raise ValueError(
                "VISAO_CAMERA_ID exige VISAO_API_LOGIN e VISAO_API_SENHA "
                "(usuário de serviço criado por db/scripts/criar-servico-visao.sql)"
            )

    def descrever_fonte(self) -> str:
        if self.fonte is Fonte.WEBCAM:
            return f"webcam local (índice {self.webcam_indice})"
        if self.fonte is Fonte.RTSP:
            # Nunca imprimir a URL inteira: costuma carregar usuário e senha.
            visivel = self.rtsp_url.split("@")[-1] if "@" in self.rtsp_url else self.rtsp_url
            return f"câmera IP ({visivel})"
        return f"arquivo ({self.arquivo})"


def carregar() -> Config:
    cfg = Config()
    cfg.validar()
    return cfg
