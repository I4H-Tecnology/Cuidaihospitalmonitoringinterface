import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Camera, CameraOff, ClipboardList, Loader2, Plus, RefreshCw, Search,
} from 'lucide-react';
import { CameraAoVivo } from './CameraAoVivo';
import { CartaoAlerta } from './AlertsScreen';
import { ModalEncerrarOcorrencia } from './ModalEncerrarOcorrencia';
import { ModalNovaCamera } from './ModalNovaCamera';
import { useAuth } from '../contexts/AuthContext';
import {
  ApiError, darCiencia, encerrarOcorrencia, fetchCameras, fetchPaciente, iniciarAtendimento,
} from '../data/api';
import type { CameraResumo, ClassificacaoOcorrencia, OcorrenciaResumo, PacienteResumo } from '../data/api';
import { estaAberta } from '../data/ocorrencias';
import { useAlertas } from '../data/useAlertas';
import { VISAO_URL, fetchServicoPadrao, urlDoVideoAoVivo } from '../data/visao';

/**
 * Monitoramento em tempo real: o vídeo é o centro da tela.
 *
 * Tudo aqui vem do banco. A tela antiga listava seis câmeras inventadas e uma
 * "precisão de 97,4%" que ninguém mediu — número de IA fabricado é justamente
 * o que a linha de projeto trata como resultado não replicável.
 *
 * Mosaico com um quadro por câmera, inclusive as sem sinal: esconder quarto
 * desconectado era esconder justamente o paciente que ninguém está vendo.
 * Clicar num quadro abre o quarto em foco — vídeo grande, prontuário e as
 * ocorrências dali, com o mesmo ciclo da central de alertas. Queda sem
 * ciência abre o foco sozinha, no quarto dela.
 *
 * "Conectada" é decidido no servidor pelo último sinal de vida, não por uma
 * coluna que alguém precisa lembrar de atualizar quando o dispositivo cai.
 */

const INTERVALO_ATUALIZACAO_MS = 15000;

function tempoRelativo(iso?: string | null): string {
  if (!iso) return 'sem registro';
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `${minutos} min atrás`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h atrás`;
  return `${Math.floor(horas / 24)}d atrás`;
}

function aguardaCiencia(o: OcorrenciaResumo): boolean {
  return o.status === 'pendente' && o.alertaStatus !== 'ciente';
}

type Contagem = { abertas: number; semCiencia: number };

interface Props {
  aoAbrirPaciente?: (paciente: PacienteResumo) => void;
}

export function MonitoringScreen({ aoAbrirPaciente }: Props) {
  const { tenantId, can, podeAbrirTela } = useAuth();
  const { ocorrencias, carregando: carregandoOcorrencias, recarregar } = useAlertas(tenantId);
  const [cameras, setCameras] = useState<CameraResumo[]>([]);
  const [padrao, setPadrao] = useState<{ noAr: boolean; camera: string | null }>({ noAr: false, camera: null });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [focoId, setFocoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<OcorrenciaResumo | null>(null);
  const [abrindoProntuario, setAbrindoProntuario] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  // Entra na key dos vídeos: "Atualizar" também reabre cada stream, que é o
  // que quem olha para um quadro preto espera do botão.
  const [rodada, setRodada] = useState(0);

  const podeAdicionar = can('monitoring', 'edit');
  const podeAtender = can('alerts', 'edit');
  const podeAbrirProntuario = !!aoAbrirPaciente && podeAbrirTela('pep');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [c, p] = await Promise.all([fetchCameras(tenantId), fetchServicoPadrao()]);
      setCameras(c);
      setPadrao(p);
      setErro(null);
      setAtualizadoEm(new Date());
    } catch {
      setErro('Não foi possível carregar os dados do monitoramento.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  // Queda sem ciência abre o quarto dela em foco: na primeira carga (quem
  // chegou pelo aviso de queda) e a cada queda nova com a tela aberta. Uma vez
  // por ocorrência — quem voltou ao mosaico não é puxado de novo pela mesma.
  const vistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (carregandoOcorrencias) return;
    // Na primeira carga o conjunto está vazio, então "nova" é a queda sem
    // ciência mais recente (a lista vem da mais nova para a mais antiga).
    const jaVistas = vistas.current ?? new Set<string>();
    const nova = ocorrencias.find((o) => !jaVistas.has(o.id) && aguardaCiencia(o) && o.cameraId);
    ocorrencias.forEach((o) => jaVistas.add(o.id));
    vistas.current = jaVistas;
    if (nova?.cameraId) setFocoId(nova.cameraId);
  }, [ocorrencias, carregandoOcorrencias]);

  const porCamera = useMemo(() => {
    const mapa = new Map<string, Contagem>();
    for (const o of ocorrencias) {
      if (!o.cameraId || !estaAberta(o)) continue;
      const atual = mapa.get(o.cameraId) ?? { abertas: 0, semCiencia: 0 };
      atual.abertas += 1;
      if (aguardaCiencia(o)) atual.semCiencia += 1;
      mapa.set(o.cameraId, atual);
    }
    return mapa;
  }, [ocorrencias]);

  // Quarto com queda sem ciência vai para o primeiro quadro; o resto mantém a
  // ordem da API (conectadas primeiro, depois por nome). sort é estável.
  const quartos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cameras
      .filter((c) =>
        !termo ||
        c.ambienteNome.toLowerCase().includes(termo) ||
        (c.pacienteNome ?? '').toLowerCase().includes(termo) ||
        c.identificador.toLowerCase().includes(termo))
      .sort((a, b) => (porCamera.get(b.id)?.semCiencia ?? 0) - (porCamera.get(a.id)?.semCiencia ?? 0));
  }, [cameras, busca, porCamera]);

  const focada = focoId ? cameras.find((c) => c.id === focoId) ?? null : null;

  // Esc volta ao mosaico, a menos que um modal esteja aberto: aí o Esc é dele.
  useEffect(() => {
    if (!focada || encerrando || modalAberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocoId(null);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [focada, encerrando, modalAberto]);

  const conectadas = cameras.filter((c) => c.conectada).length;
  const eventos24h = useMemo(() => {
    const limite = Date.now() - 24 * 3600 * 1000;
    return ocorrencias.filter((o) => new Date(o.dataHora).getTime() >= limite).length;
  }, [ocorrencias]);
  const pendentes = ocorrencias.filter((o) => o.status === 'pendente').length;

  const atualizar = async () => {
    setAtualizando(true);
    setRodada((r) => r + 1);
    try {
      // A API responde em milissegundos; sem um mínimo o giro do ícone nem
      // aparece, e o clique parece não ter feito nada.
      await Promise.all([carregar(), recarregar(), new Promise((r) => setTimeout(r, 400))]);
    } finally {
      setAtualizando(false);
    }
  };

  const agir = async (id: string, acao: () => Promise<unknown>) => {
    setOcupado(id);
    setFalha(null);
    try {
      await acao();
      await recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setOcupado(null);
    }
  };

  const abrirProntuario = async (pacienteId: string) => {
    if (!tenantId || !aoAbrirPaciente) return;
    setAbrindoProntuario(true);
    setFalha(null);
    try {
      aoAbrirPaciente(await fetchPaciente(tenantId, pacienteId));
    } catch {
      setFalha('Não foi possível abrir o prontuário deste paciente.');
      setAbrindoProntuario(false);
    }
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Monitoramento em tempo real</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>YOLOv8</span><span>•</span>
            <span>MediaPipe Pose</span><span>•</span>
            <span>Camada de regras</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {atualizadoEm && (
            <span className="text-xs text-gray-400" aria-live="polite">
              Atualizado às {atualizadoEm.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button
            type="button"
            onClick={atualizar}
            disabled={atualizando}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700
                       hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${atualizando ? 'animate-spin' : ''}`} />
            {atualizando ? 'Atualizando…' : 'Atualizar'}
          </button>

          {/* O botão que o operador procura quando chega um dispositivo novo.
              Fica em destaque no topo e se repete no estado vazio, que é
              justamente onde ele é mais necessário. */}
          {podeAdicionar && (
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="px-5 py-2.5 bg-marca text-white rounded-lg text-sm
                         hover:bg-marca-hover transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar câmera
            </button>
          )}
        </div>
      </div>

      {(erro || falha) && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{falha ?? erro}</p>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-8 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Carregando quartos…</span>
        </div>
      ) : cameras.length === 0 ? (
        <SemCameraCadastrada podeAdicionar={podeAdicionar} aoAdicionar={() => setModalAberto(true)} />
      ) : focada ? (
        <FocoDoQuarto
          camera={focada}
          ocorrencias={ocorrencias.filter((o) => o.cameraId === focada.id)}
          carregandoOcorrencias={carregandoOcorrencias}
          urlVideo={urlDoVideoAoVivo(focada, padrao.camera)}
          rodada={rodada}
          padraoNoAr={padrao.noAr}
          podeAtender={podeAtender}
          ocupado={ocupado}
          podeAbrirProntuario={podeAbrirProntuario}
          abrindoProntuario={abrindoProntuario}
          aoAbrirProntuario={abrirProntuario}
          aoDarCiencia={(o) => agir(o.id, () => darCiencia(tenantId!, o.id))}
          aoAtender={(o) => agir(o.id, () => iniciarAtendimento(tenantId!, o.id))}
          aoEncerrar={setEncerrando}
          aoVoltar={() => setFocoId(null)}
        />
      ) : (
        <>
          {/* Números medidos, numa linha só: o espaço da tela é dos vídeos.
              Não há "precisão" porque ela ainda não foi aferida — sai do arnês
              de avaliação, e exibir um valor antes seria inventar resultado. */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Etiqueta classe="bg-green-100 text-green-800" icone={<Camera className="h-4 w-4" />}>
                {conectadas} de {cameras.length} ao vivo
              </Etiqueta>
              <Etiqueta classe="bg-marca-suave text-marca-texto" icone={<Activity className="h-4 w-4" />}>
                {carregandoOcorrencias ? '—' : eventos24h} ocorrência{eventos24h === 1 ? '' : 's'} em 24 h
              </Etiqueta>
              {pendentes > 0 && (
                <Etiqueta classe="bg-red-100 text-red-700" icone={<AlertTriangle className="h-4 w-4" />}>
                  {pendentes} aguardando atendimento
                </Etiqueta>
              )}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar paciente ou quarto"
                className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm
                           focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
              />
            </div>
          </div>

          {quartos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              Nenhum quarto com esse nome ou paciente.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {quartos.map((c) => (
                <QuadroDoQuarto
                  key={c.id}
                  camera={c}
                  urlVideo={urlDoVideoAoVivo(c, padrao.camera)}
                  rodada={rodada}
                  contagem={porCamera.get(c.id)}
                  aoAbrir={() => setFocoId(c.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {modalAberto && tenantId && (
        <ModalNovaCamera
          tenantId={tenantId}
          aoFechar={() => setModalAberto(false)}
          aoCriar={(nova) => {
            setCameras((atuais) => [...atuais, nova]);
            setModalAberto(false);
          }}
        />
      )}

      {encerrando && tenantId && (
        <ModalEncerrarOcorrencia
          ocorrencia={encerrando}
          aoFechar={() => setEncerrando(null)}
          aoConfirmar={async (classificacao: ClassificacaoOcorrencia, observacao?: string) => {
            await agir(encerrando.id, () =>
              encerrarOcorrencia(tenantId, encerrando.id, classificacao, observacao)
            );
            setEncerrando(null);
          }}
        />
      )}
    </main>
  );
}

function Etiqueta({
  classe, icone, children,
}: { classe: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${classe}`}>
      {icone}
      {children}
    </span>
  );
}

function QuadroDoQuarto({
  camera, urlVideo, rodada, contagem, aoAbrir,
}: {
  camera: CameraResumo;
  urlVideo: string | null;
  rodada: number;
  contagem?: Contagem;
  aoAbrir: () => void;
}) {
  const queda = (contagem?.semCiencia ?? 0) > 0;
  const emAtendimento = !queda && (contagem?.abertas ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={`Abrir ${camera.ambienteNome}${camera.pacienteNome ? `, ${camera.pacienteNome}` : ''}`}
      className={`relative block w-full overflow-hidden rounded-xl bg-gray-900 text-left shadow-sm transition
                  focus:outline-none focus-visible:ring-4 focus-visible:ring-marca-viva ${
        queda ? 'ring-4 ring-amber-400' : 'ring-1 ring-gray-200 hover:ring-2 hover:ring-marca-viva'
      }`}
    >
      {/* key: cada quadro é um processo de visão; trocar o endereço (ou
          clicar em Atualizar) reabre o vídeo do zero. */}
      {urlVideo ? <CameraAoVivo key={`${urlVideo}#${rodada}`} url={urlVideo} compacto /> : <SemVideo compacto />}

      {(queda || emAtendimento) && (
        <span
          className={`absolute left-2 top-2 rounded px-2 py-1 text-xs font-medium text-white ${
            queda ? 'bg-red-600' : 'bg-blue-600'
          }`}
        >
          {queda ? `QUEDA${contagem!.semCiencia > 1 ? ` (${contagem!.semCiencia})` : ''} · sem ciência` : 'Em atendimento'}
        </span>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2
                      bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-10">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{camera.ambienteNome}</p>
          <p className="truncate text-xs text-white/75">{camera.pacienteNome ?? 'Sem paciente internado'}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/90">
          <span className={`h-2 w-2 rounded-full ${camera.conectada ? 'bg-green-400' : 'bg-gray-400'}`} aria-hidden="true" />
          {camera.conectada ? 'Ao vivo' : 'Sem sinal'}
        </span>
      </div>
    </button>
  );
}

function FocoDoQuarto({
  camera, ocorrencias, carregandoOcorrencias, urlVideo, rodada, padraoNoAr, podeAtender, ocupado,
  podeAbrirProntuario, abrindoProntuario, aoAbrirProntuario, aoDarCiencia, aoAtender, aoEncerrar, aoVoltar,
}: {
  camera: CameraResumo;
  ocorrencias: OcorrenciaResumo[];
  carregandoOcorrencias: boolean;
  urlVideo: string | null;
  rodada: number;
  padraoNoAr: boolean;
  podeAtender: boolean;
  ocupado: string | null;
  podeAbrirProntuario: boolean;
  abrindoProntuario: boolean;
  aoAbrirProntuario: (pacienteId: string) => void;
  aoDarCiencia: (o: OcorrenciaResumo) => void;
  aoAtender: (o: OcorrenciaResumo) => void;
  aoEncerrar: (o: OcorrenciaResumo) => void;
  aoVoltar: () => void;
}) {
  const situacao = camera.conectada
    ? 'ao vivo'
    : camera.ultimoPing
      ? `sem sinal · último ${tempoRelativo(camera.ultimoPing)}`
      : 'nunca enviou sinal';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={aoVoltar}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2
                       text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Todos os quartos
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg text-gray-800">
              {camera.ambienteNome}
              <span className="text-gray-400"> · </span>
              <span className="text-gray-600">{camera.pacienteNome ?? 'Sem paciente internado'}</span>
            </h2>
            <p className="text-xs text-gray-400">{camera.identificador} · {situacao}</p>
          </div>
        </div>
        {podeAbrirProntuario && camera.pacienteId && (
          <button
            type="button"
            onClick={() => aoAbrirProntuario(camera.pacienteId!)}
            disabled={abrindoProntuario}
            className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white
                       hover:bg-marca-hover transition-colors disabled:opacity-60"
          >
            {abrindoProntuario ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Abrir prontuário
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {/* key: trocar de quarto troca de processo de visão, e o estado do
              vídeo anterior (carregado, pessoas em cena) não pode vazar. */}
          {urlVideo ? <CameraAoVivo key={`${urlVideo}#${rodada}`} url={urlVideo} /> : <SemVideo padraoNoAr={padraoNoAr} />}
        </div>

        <aside className="xl:col-span-1">
          <h3 className="mb-3 text-gray-800">Ocorrências deste quarto</h3>
          {carregandoOcorrencias ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : ocorrencias.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
              Nenhuma ocorrência recente neste quarto.
            </p>
          ) : (
            <div className="space-y-3">
              {ocorrencias.map((o) => (
                <CartaoAlerta
                  key={o.id}
                  ocorrencia={o}
                  ocupado={ocupado === o.id}
                  podeAtender={podeAtender}
                  aoDarCiencia={() => aoDarCiencia(o)}
                  aoAtender={() => aoAtender(o)}
                  aoEncerrar={() => aoEncerrar(o)}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SemVideo({ compacto = false, padraoNoAr = true }: { compacto?: boolean; padraoNoAr?: boolean }) {
  if (compacto) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 px-4 text-center">
        <CameraOff className="h-6 w-6 text-gray-500" aria-hidden="true" />
        <p className="text-xs text-gray-400">Sem vídeo ao vivo</p>
      </div>
    );
  }

  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg bg-gray-900 px-6 text-center">
      <CameraOff className="h-8 w-8 text-white/40" aria-hidden="true" />
      <p className="text-sm text-gray-300">Sem vídeo ao vivo deste quarto.</p>
      {/* Diz o que fazer em cada caso. Mostrar o vídeo de outro quarto aqui
          seria pior do que não mostrar nada. */}
      <p className="max-w-md text-xs text-white/60">
        Nenhum serviço de visão está ligado a esta câmera. Informe o endereço do processo que a
        analisa em Configurações → Dispositivos.
      </p>
      {!padraoNoAr && (
        <p className="max-w-md text-xs text-white/60">
          O serviço de visão padrão ({VISAO_URL}) também não está respondendo. Se for ele que analisa
          este quarto, suba com{' '}
          <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-300">
            visao\.venv\Scripts\python.exe visao/servir.py
          </code>
        </p>
      )}
    </div>
  );
}

function SemCameraCadastrada({
  podeAdicionar, aoAdicionar,
}: { podeAdicionar: boolean; aoAdicionar: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <CameraOff className="mx-auto mb-3 h-8 w-8 text-gray-400" />
      <p className="text-gray-700">Nenhuma câmera cadastrada ainda nesta clínica.</p>
      {podeAdicionar && (
        <button
          type="button"
          onClick={aoAdicionar}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-marca px-5 py-2.5
                     text-sm text-white hover:bg-marca-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar câmera
        </button>
      )}
    </div>
  );
}
