import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CameraOff, Loader2, Activity, RefreshCw } from 'lucide-react';
import { VISAO_URL, diagnosticarCaptura } from '../data/visao';
import type { Captura } from '../data/visao';

/**
 * Vídeo ao vivo do serviço de visão, com o resultado da detecção sobreposto.
 *
 * O vídeo chega por MJPEG — o mesmo formato que uma câmera IP entrega. Isso
 * permite exibir com um <img> comum: sem WebRTC, sem WebSocket, sem
 * biblioteca. O navegador mantém a conexão aberta e troca o quadro sozinho.
 *
 * O <img> não devolve dado estruturado, então o estado (quem está em cena, em
 * que estado, latência) vem de `/estado` por polling.
 */

interface PessoaDetectada {
  id: number;
  estado: 'normal' | 'caindo' | 'caido';
  confianca: number | null;
  impedimento: string | null;
  caracteristicas: {
    angulo_tronco: number;
    razao_aspecto: number;
    razao_altura: number;
    velocidade_queda: number;
  } | null;
}

interface EstadoVisao {
  rodando: boolean;
  erro: string | null;
  fonte: string;
  modo_teste: boolean;
  latencia_ms?: number;
  fps_real?: number | null;
  /** Estado da fonte: capturando, reconectando, parado. */
  captura?: Captura;
  pessoas?: PessoaDetectada[];
  caidos?: number;
  ocorrencias_totais?: number;
}

const ROTULO: Record<PessoaDetectada['estado'], string> = {
  normal: 'Normal',
  caindo: 'Queda em curso',
  caido: 'No chão',
};

const CLASSE_ESTADO: Record<PessoaDetectada['estado'], string> = {
  normal: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  caindo: 'bg-amber-100 text-amber-800 border-amber-200',
  caido: 'bg-red-100 text-red-800 border-red-200',
};

/**
 * `url` é o processo do serviço de visão desta câmera. Cada processo observa
 * uma câmera só; quem troca de câmera troca de url (e de `key`, para o estado
 * do vídeo anterior não vazar para o novo).
 *
 * `compacto` é o quadro do mosaico do monitoramento: só o vídeo, sem cabeçalho
 * nem lista de pessoas, sem botão (o quadro inteiro já é clicável) e com o
 * estado consultado mais devagar, porque são vários ao mesmo tempo.
 */
export function CameraAoVivo({ url = VISAO_URL, compacto = false }: { url?: string; compacto?: boolean }) {
  const [estado, setEstado] = useState<EstadoVisao | null>(null);
  const [servicoNoAr, setServicoNoAr] = useState<boolean | null>(null);
  // HTTP de erro em /estado: a porta respondeu, mas quem respondeu não é o
  // serviço de visão. Quase sempre outro programa ocupando a mesma porta.
  const [statusEstranho, setStatusEstranho] = useState<number | null>(null);
  const [videoCarregou, setVideoCarregou] = useState(false);
  // Muda a cada tentativa de reconexão: forçar um src novo é o que faz o
  // navegador reabrir o stream. Sem isso ele reaproveita a conexão morta.
  const tentativa = useRef(0);
  const [srcVideo, setSrcVideo] = useState(`${url}/stream?t=${Date.now()}`);

  useEffect(() => {
    let ativo = true;

    const consultar = async () => {
      try {
        const resposta = await fetch(`${url}/estado`, { cache: 'no-store' });
        if (!resposta.ok) {
          if (ativo) setStatusEstranho(resposta.status);
          throw new Error(String(resposta.status));
        }
        const dados: EstadoVisao = await resposta.json();
        if (!ativo) return;
        setEstado(dados);
        setServicoNoAr(true);
        setStatusEstranho(null);
      } catch (erro) {
        if (!ativo) return;
        // Rede recusada não tem status; não apaga o da tentativa anterior à toa.
        if (!(erro instanceof Error && /^\d+$/.test(erro.message))) setStatusEstranho(null);
        setServicoNoAr(false);
        setVideoCarregou(false);
      }
    };

    void consultar();
    // 1s é suficiente: o pipeline produz a 8 fps, e o texto não precisa
    // acompanhar quadro a quadro — quem faz isso é a imagem.
    const timer = window.setInterval(consultar, compacto ? 3000 : 1000);
    return () => {
      ativo = false;
      window.clearInterval(timer);
    };
  }, [url, compacto]);

  const reconectar = () => {
    tentativa.current += 1;
    setVideoCarregou(false);
    setSrcVideo(`${url}/stream?t=${Date.now()}`);
  };

  const pessoas = estado?.pessoas ?? [];
  const alguemNoChao = (estado?.caidos ?? 0) > 0;
  // "Serviço fora do ar" e "câmera fora do ar" são problemas diferentes, com
  // soluções diferentes. A tela precisa dizer qual dos dois é.
  const diagnostico = diagnosticarCaptura(servicoNoAr, estado?.captura);

  const areaDoVideo = (
    <div className="relative bg-gray-900 aspect-video">
      {diagnostico.tipo === 'servico-fora' ? (
        compacto ? (
          <AvisoNoQuadro
            icone={<CameraOff className="h-6 w-6 text-white/40" />}
            texto={statusEstranho ? `Outro programa responde em ${url}` : 'Serviço de visão não responde'}
          />
        ) : (
          <ServicoForaDoAr aoTentarDeNovo={reconectar} url={url} statusEstranho={statusEstranho} />
        )
      ) : diagnostico.tipo === 'camera-fora' ? (
        compacto ? (
          <AvisoNoQuadro
            icone={<RefreshCw className="h-6 w-6 animate-spin text-amber-400" />}
            texto="Câmera fora do ar, reconectando…"
          />
        ) : (
          <CameraForaDoAr
            tentativa={diagnostico.tentativa}
            proximaEmS={diagnostico.proximaEmS}
            erro={diagnostico.erro}
            fonte={estado?.fonte}
          />
        )
      ) : (
        <>
          <img
            key={srcVideo}
            src={srcVideo}
            alt="Transmissão da câmera com a detecção sobreposta"
            className="h-full w-full object-contain"
            onLoad={() => setVideoCarregou(true)}
            onError={() => setVideoCarregou(false)}
          />
          {!videoCarregou && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-300">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              <p className="text-sm">Conectando à câmera…</p>
            </div>
          )}
          {/* No quadro, o canto esquerdo é da etiqueta de queda do mosaico. */}
          {alguemNoChao && (
            <div
              role="alert"
              className={`absolute ${compacto ? 'right-2 top-2' : 'left-3 top-3'} flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-white`}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <span className="text-sm">Pessoa no chão detectada</span>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (compacto) return areaDoVideo;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-marca-texto" aria-hidden="true" />
          <h3 className="text-gray-800">Câmera ao vivo</h3>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {estado?.fonte && <span className="text-gray-500">{estado.fonte}</span>}
          {estado?.fps_real != null && <span className="text-gray-500">{estado.fps_real} fps</span>}
          {estado?.latencia_ms !== undefined && (
            <span className="flex items-center gap-1 text-gray-500">
              <Activity className="h-3 w-3" aria-hidden="true" />
              {estado.latencia_ms} ms
            </span>
          )}
        </div>
      </header>

      {areaDoVideo}

      <div className="px-4 py-3">
        {pessoas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma pessoa em cena.</p>
        ) : (
          <ul className="space-y-2">
            {pessoas.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm text-gray-700">Pessoa #{p.id}</span>
                  {/* O motivo de não classificar é informação operacional: sem
                      ele, o operador vê "Normal" e não sabe que na verdade o
                      sistema não conseguiu avaliar. */}
                  {p.impedimento && (
                    <p className="truncate text-xs text-gray-500" title={p.impedimento}>
                      {p.impedimento}
                    </p>
                  )}
                  {p.caracteristicas && (
                    <p className="text-xs text-gray-400">
                      tronco {p.caracteristicas.angulo_tronco}° · altura{' '}
                      {p.caracteristicas.razao_altura}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded border px-2 py-0.5 text-xs ${CLASSE_ESTADO[p.estado]}`}
                >
                  {ROTULO[p.estado]}
                  {p.confianca !== null && ` ${p.confianca}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AvisoNoQuadro({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
      {icone}
      <p className="text-xs text-white/70">{texto}</p>
    </div>
  );
}

function ServicoForaDoAr({
  aoTentarDeNovo, url, statusEstranho,
}: { aoTentarDeNovo: () => void; url: string; statusEstranho: number | null }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <CameraOff className="h-8 w-8 text-white/40" aria-hidden="true" />
      {statusEstranho ? (
        <>
          {/* Aconteceu de verdade: outro projeto no Docker publicava a mesma
              porta, e "não está respondendo" mandava procurar no lugar errado. */}
          <p className="text-sm text-gray-300">
            {url} respondeu, mas não é o serviço de visão (HTTP {statusEstranho}).
          </p>
          <p className="max-w-md text-xs text-white/60">
            Outro programa está usando essa porta. Troque VISAO_PORTA e VITE_VISAO_URL no .env por
            uma porta livre e suba o serviço de novo.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-300">Serviço de visão não está respondendo.</p>
          {/* Instrução concreta em vez de "erro de conexão": quem abre esta tela
              precisa saber o que fazer, não que algo deu errado. */}
          <p className="max-w-md text-xs text-white/60">
            Com a fonte em webcam, ele roda fora do Docker. Suba com:{' '}
            <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-300">
              visao\.venv\Scripts\python.exe visao/servir.py
            </code>
          </p>
        </>
      )}
      <button
        type="button"
        onClick={aoTentarDeNovo}
        className="rounded bg-marca px-3 py-1.5 text-sm text-white hover:bg-marca-hover"
      >
        Tentar novamente
      </button>
    </div>
  );
}

function CameraForaDoAr({
  tentativa, proximaEmS, erro, fonte,
}: {
  tentativa: number; proximaEmS: number | null; erro: string | null; fonte?: string;
}) {
  return (
    <div
      role="status"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <RefreshCw className="h-8 w-8 animate-spin text-amber-400" aria-hidden="true" />
      <p className="text-sm text-amber-200">Câmera fora do ar — o serviço está tentando reconectar.</p>
      <p className="text-xs text-white/70">
        Tentativa {tentativa}
        {proximaEmS != null && ` · próxima em ${Math.ceil(proximaEmS)} s`}
        {fonte && ` · ${fonte}`}
      </p>
      {/* O motivo cru ajuda quem vai ao local: "arquivo não encontrado" e
          "RTSP não responde" pedem ações diferentes. */}
      {erro && <p className="max-w-md truncate text-xs text-white/60" title={erro}>{erro}</p>}
      <p className="max-w-md text-xs text-white/60">
        O serviço de visão continua no ar. Confira cabo, rede ou a própria câmera; a
        captura volta sozinha quando a fonte responder.
      </p>
    </div>
  );
}
