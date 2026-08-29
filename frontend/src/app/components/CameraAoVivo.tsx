import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CameraOff, Loader2, Activity } from 'lucide-react';

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

const VISAO_URL: string = import.meta.env.VITE_VISAO_URL || 'http://localhost:8001';

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

export function CameraAoVivo() {
  const [estado, setEstado] = useState<EstadoVisao | null>(null);
  const [servicoNoAr, setServicoNoAr] = useState<boolean | null>(null);
  const [videoCarregou, setVideoCarregou] = useState(false);
  // Muda a cada tentativa de reconexão: forçar um src novo é o que faz o
  // navegador reabrir o stream. Sem isso ele reaproveita a conexão morta.
  const tentativa = useRef(0);
  const [srcVideo, setSrcVideo] = useState(`${VISAO_URL}/stream?t=${Date.now()}`);

  useEffect(() => {
    let ativo = true;

    const consultar = async () => {
      try {
        const resposta = await fetch(`${VISAO_URL}/estado`, { cache: 'no-store' });
        if (!resposta.ok) throw new Error(String(resposta.status));
        const dados: EstadoVisao = await resposta.json();
        if (!ativo) return;
        setEstado(dados);
        setServicoNoAr(true);
      } catch {
        if (!ativo) return;
        setServicoNoAr(false);
        setVideoCarregou(false);
      }
    };

    consultar();
    // 1s é suficiente: o pipeline produz a 8 fps, e o texto não precisa
    // acompanhar quadro a quadro — quem faz isso é a imagem.
    const timer = window.setInterval(consultar, 1000);
    return () => {
      ativo = false;
      window.clearInterval(timer);
    };
  }, []);

  const reconectar = () => {
    tentativa.current += 1;
    setVideoCarregou(false);
    setSrcVideo(`${VISAO_URL}/stream?t=${Date.now()}`);
  };

  const pessoas = estado?.pessoas ?? [];
  const alguemNoChao = (estado?.caidos ?? 0) > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-[#0A7EA4]" aria-hidden="true" />
          <h3 className="text-gray-800">Câmera ao vivo</h3>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {estado?.fonte && <span className="text-gray-500">{estado.fonte}</span>}
          {estado?.latencia_ms !== undefined && (
            <span className="flex items-center gap-1 text-gray-500">
              <Activity className="h-3 w-3" aria-hidden="true" />
              {estado.latencia_ms} ms
            </span>
          )}
        </div>
      </header>

      <div className="relative bg-gray-900 aspect-video">
        {servicoNoAr === false ? (
          <ServicoForaDoAr aoTentarDeNovo={reconectar} />
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
            {alguemNoChao && (
              <div
                role="alert"
                className="absolute left-3 top-3 flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-white"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">Pessoa no chão detectada</span>
              </div>
            )}
            {estado?.modo_teste && (
              <span className="absolute right-3 top-3 rounded bg-amber-500 px-2 py-1 text-xs text-amber-950">
                MODO DE TESTE
              </span>
            )}
          </>
        )}
      </div>

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

function ServicoForaDoAr({ aoTentarDeNovo }: { aoTentarDeNovo: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <CameraOff className="h-8 w-8 text-gray-500" aria-hidden="true" />
      <p className="text-sm text-gray-300">Serviço de visão não está respondendo.</p>
      {/* Instrução concreta em vez de "erro de conexão": quem abre esta tela
          precisa saber o que fazer, não que algo deu errado. */}
      <p className="max-w-md text-xs text-gray-500">
        Com a fonte em webcam, ele roda fora do Docker. Suba com:{' '}
        <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-300">
          visao\.venv\Scripts\python.exe visao/servir.py
        </code>
      </p>
      <button
        type="button"
        onClick={aoTentarDeNovo}
        className="rounded bg-[#0A7EA4] px-3 py-1.5 text-sm text-white hover:bg-[#0EA5E9]"
      >
        Tentar novamente
      </button>
    </div>
  );
}
