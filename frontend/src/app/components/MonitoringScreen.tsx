import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Camera, CameraOff, Clock, Loader2, Plus, RefreshCw,
} from 'lucide-react';
import { CameraAoVivo } from './CameraAoVivo';
import { ModalNovaCamera } from './ModalNovaCamera';
import { useAuth } from '../contexts/AuthContext';
import { fetchCameras, fetchOcorrencias } from '../data/api';
import type { CameraResumo, OcorrenciaResumo } from '../data/api';

/**
 * Monitoramento em tempo real.
 *
 * Tudo aqui vem do banco. A tela antiga listava seis câmeras inventadas e uma
 * "precisão de 97,4%" que ninguém mediu — número de IA fabricado é justamente
 * o que a linha de projeto trata como resultado não replicável.
 *
 * A lista mostra só as câmeras CONECTADAS, e "conectada" é decidido no
 * servidor pelo último sinal de vida, não por uma coluna que alguém precisa
 * lembrar de atualizar quando o dispositivo cai.
 */

const INTERVALO_ATUALIZACAO_MS = 15000;

const ROTULO_EVENTO: Record<string, string> = {
  queda: 'Queda',
  permanencia_solo: 'Permanência no chão',
  perda_verticalidade: 'Perda de verticalidade',
  ausencia_prolongada: 'Ausência prolongada',
};

const ESTILO_STATUS: Record<string, { chip: string; texto: string }> = {
  pendente: { chip: 'bg-red-500', texto: 'Pendente' },
  em_atendimento: { chip: 'bg-yellow-500', texto: 'Em atendimento' },
  encerrada: { chip: 'bg-gray-500', texto: 'Encerrada' },
  falso_positivo: { chip: 'bg-gray-400', texto: 'Falso positivo' },
  queda_confirmada: { chip: 'bg-red-700', texto: 'Queda confirmada' },
};

function tempoRelativo(iso?: string | null): string {
  if (!iso) return 'sem registro';
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `${minutos} min atrás`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h atrás`;
  return `${Math.floor(horas / 24)}d atrás`;
}

export function MonitoringScreen() {
  const { tenantId, can } = useAuth();
  const [cameras, setCameras] = useState<CameraResumo[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const podeAdicionar = can('monitoring', 'edit');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [c, o] = await Promise.all([
        fetchCameras(tenantId),
        fetchOcorrencias(tenantId, 20),
      ]);
      setCameras(c);
      setOcorrencias(o);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar os dados do monitoramento.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
    const timer = window.setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const conectadas = useMemo(() => cameras.filter((c) => c.conectada), [cameras]);
  const eventos24h = useMemo(() => {
    const limite = Date.now() - 24 * 3600 * 1000;
    return ocorrencias.filter((o) => new Date(o.dataHora).getTime() >= limite).length;
  }, [ocorrencias]);
  const pendentes = useMemo(
    () => ocorrencias.filter((o) => o.status === 'pendente').length,
    [ocorrencias]
  );

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Monitoramento em tempo real</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>YOLOv8</span><span>•</span>
            <span>MediaPipe Pose</span><span>•</span>
            <span>Camada de regras</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={carregar}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700
                       hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>

          {/* O botão que o operador procura quando chega um dispositivo novo.
              Fica em destaque no topo e se repete no estado vazio, que é
              justamente onde ele é mais necessário. */}
          {podeAdicionar && (
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="px-5 py-2.5 bg-[#0A7EA4] text-white rounded-lg text-sm
                         hover:bg-[#0EA5E9] transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar câmera
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      {/* Números medidos. Não há card de "precisão" porque precisão ainda não
          foi aferida — ela sai do arnês de avaliação sobre vídeos anotados, e
          exibir um valor antes disso seria inventar resultado. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Indicador
          icone={<Camera className="w-5 h-5 text-green-600" />}
          fundo="bg-green-100"
          valor={carregando ? '—' : String(conectadas.length)}
          rotulo="Câmeras conectadas"
        />
        <Indicador
          icone={<CameraOff className="w-5 h-5 text-gray-600" />}
          fundo="bg-gray-100"
          valor={carregando ? '—' : String(cameras.length - conectadas.length)}
          rotulo="Cadastradas sem sinal"
        />
        <Indicador
          icone={<Activity className="w-5 h-5 text-[#0A7EA4]" />}
          fundo="bg-[#E8F4F8]"
          valor={carregando ? '—' : String(eventos24h)}
          rotulo="Ocorrências (24h)"
        />
        <Indicador
          icone={<AlertTriangle className="w-5 h-5 text-red-600" />}
          fundo="bg-red-100"
          valor={carregando ? '—' : String(pendentes)}
          rotulo="Aguardando atendimento"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="mb-6">
            <CameraAoVivo />
          </div>

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-800">Câmeras conectadas</h2>
            {!carregando && cameras.length > conectadas.length && (
              <span className="text-sm text-gray-500">
                {cameras.length - conectadas.length} cadastrada
                {cameras.length - conectadas.length > 1 ? 's' : ''} sem sinal
              </span>
            )}
          </div>

          {carregando ? (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-8 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando câmeras…</span>
            </div>
          ) : conectadas.length === 0 ? (
            <SemCameraConectada
              cadastradas={cameras.length}
              podeAdicionar={podeAdicionar}
              aoAdicionar={() => setModalAberto(true)}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {conectadas.map((camera) => (
                <CartaoCamera key={camera.id} camera={camera} />
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <h2 className="text-gray-800 mb-4">Últimas detecções</h2>

          {carregando ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
              Carregando…
            </div>
          ) : ocorrencias.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
              <p className="text-sm text-gray-600">Nenhuma ocorrência registrada.</p>
              <p className="mt-1 text-xs text-gray-500">
                O que aparecer aqui vem do serviço de visão, não de dado de exemplo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ocorrencias.map((o) => (
                <CartaoOcorrencia key={o.id} ocorrencia={o} />
              ))}
            </div>
          )}
        </div>
      </div>

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
    </main>
  );
}

function Indicador({
  icone, fundo, valor, rotulo,
}: { icone: React.ReactNode; fundo: string; valor: string; rotulo: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${fundo} rounded-lg flex items-center justify-center`}>
          {icone}
        </div>
        <div>
          <p className="text-2xl text-gray-800">{valor}</p>
          <p className="text-xs text-gray-500">{rotulo}</p>
        </div>
      </div>
    </div>
  );
}

function CartaoCamera({ camera }: { camera: CameraResumo }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="relative bg-gray-100 h-40 flex items-center justify-center">
        <Camera className="w-12 h-12 text-gray-400" />
        <span className="absolute top-3 left-3 px-2 py-1 bg-green-500 text-white text-xs rounded flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          AO VIVO
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-gray-800 mb-1">{camera.identificador}</h3>
        <p className="text-sm text-gray-600">{camera.ambienteNome}</p>
        {camera.pacienteNome && (
          <p className="text-sm text-gray-500 mt-0.5">{camera.pacienteNome}</p>
        )}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {camera.ultimaOcorrencia
              ? `última: ${tempoRelativo(camera.ultimaOcorrencia)}`
              : 'sem ocorrência'}
          </span>
          {camera.ocorrencias24h > 0 && (
            <span className="text-gray-600">{camera.ocorrencias24h} em 24h</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SemCameraConectada({
  cadastradas, podeAdicionar, aoAdicionar,
}: { cadastradas: number; podeAdicionar: boolean; aoAdicionar: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <CameraOff className="mx-auto mb-3 h-8 w-8 text-gray-400" />
      <p className="text-gray-700">Nenhuma câmera enviando sinal.</p>
      {/* Diz o que fazer, não só o que faltou: quem abre esta tela precisa
          saber por onde sair do problema. */}
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
        {cadastradas > 0
          ? `Há ${cadastradas} câmera${cadastradas > 1 ? 's' : ''} cadastrada${
              cadastradas > 1 ? 's' : ''
            }, mas nenhuma enviou sinal de vida nos últimos 90 segundos. Verifique se o serviço de visão está apontado para ela.`
          : 'Nenhuma câmera cadastrada ainda nesta clínica.'}
      </p>
      {podeAdicionar && (
        <button
          type="button"
          onClick={aoAdicionar}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0A7EA4] px-5 py-2.5
                     text-sm text-white hover:bg-[#0EA5E9] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar câmera
        </button>
      )}
    </div>
  );
}

function CartaoOcorrencia({ ocorrencia }: { ocorrencia: OcorrenciaResumo }) {
  const status = ESTILO_STATUS[ocorrencia.status] ?? { chip: 'bg-gray-400', texto: ocorrencia.status };
  const critica = ocorrencia.status === 'pendente' || ocorrencia.status === 'queda_confirmada';

  return (
    <div
      className={`rounded-lg border-l-4 p-4 shadow-sm ${
        critica ? 'bg-red-50 border-l-red-500' : 'bg-white border-l-gray-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-700">
          {ROTULO_EVENTO[ocorrencia.tipoEvento] ?? ocorrencia.tipoEvento}
        </span>
        <span className={`px-2 py-1 ${status.chip} text-white rounded text-xs`}>
          {status.texto}
        </span>
      </div>

      {ocorrencia.cameraIdentificador && (
        <p className="text-sm text-gray-800">{ocorrencia.cameraIdentificador}</p>
      )}
      <p className="text-sm text-gray-600">{ocorrencia.ambienteNome}</p>
      {ocorrencia.pacienteNome && (
        <p className="text-sm text-gray-600">{ocorrencia.pacienteNome}</p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">{tempoRelativo(ocorrencia.dataHora)}</span>
        {ocorrencia.confianca !== null && ocorrencia.confianca !== undefined && (
          // Rótulo explícito: é o escore da camada de regras, não a precisão
          // do modelo. Chamar isto de "precisão" confundiria as duas coisas.
          <span className="text-gray-500">
            escore {ocorrencia.confianca.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
