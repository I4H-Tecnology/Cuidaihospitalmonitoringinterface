import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Camera, Edit, Loader2, Phone, Plus, Power, PowerOff, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, createCamera, editarCamera, fetchAmbientes, fetchCameras } from '../../data/api';
import type { AmbienteResumo, CameraResumo } from '../../data/api';
import { quandoFoi } from '../../data/tempo';

/**
 * Configurações → Dispositivos: o parque de câmeras, direto de `/api/cameras`.
 *
 * O único dispositivo que existe no produto é a câmera. Sensor e tablet
 * continuam no formulário, desabilitados e com o motivo: a detecção é por
 * câmera, e não há hardware de sensor nem cadastro de tablet no sistema.
 * Os números do rodapé contam o cadastro real; sensores e tablets são zero
 * porque são zero, não porque alguém digitou zero.
 */

const MOTIVO_SENSOR = 'Não há sensor no produto: a detecção de queda é feita pela câmera.';
const MOTIVO_TABLET = 'Não há cadastro de tablet: o app da enfermagem roda em qualquer celular, sem vínculo de dispositivo.';
const MOTIVO_NOME = 'A câmera é identificada pelo ID; não existe nome separado no cadastro.';

const INTERVALO_MS = 30000;

export function AbaCameras() {
  const { tenantId, can } = useAuth();
  const [cameras, setCameras] = useState<CameraResumo[]>([]);
  const [ambientes, setAmbientes] = useState<AmbienteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modal, setModal] = useState<'novo' | CameraResumo | null>(null);
  const podeEditar = can('monitoring', 'edit');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [c, a] = await Promise.all([fetchCameras(tenantId), fetchAmbientes(tenantId)]);
      setCameras(c);
      setAmbientes(a);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar as câmeras.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
    const timer = window.setInterval(carregar, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const offline = cameras.filter((c) => !c.conectada).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">Câmeras cadastradas, com o estado de conexão real</p>
        <button
          type="button"
          onClick={() => setModal('novo')}
          disabled={!podeEditar}
          title={podeEditar ? undefined : 'Seu perfil não permite cadastrar dispositivos'}
          className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Adicionar Dispositivo
        </button>
      </div>

      {aviso && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</p>}
      {erro && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" /> {erro}
        </p>
      )}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
      ) : cameras.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Nenhuma câmera cadastrada. Cadastre a primeira em "Adicionar Dispositivo".
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cameras.map((c) => (
            <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-gray-800 mb-1">{c.identificador}</h3>
                    <p className="text-xs text-gray-500 mb-2">
                      {c.ambienteNome}{c.pacienteNome ? ` · ${c.pacienteNome}` : ' · sem paciente vinculado'}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">Câmera</span>
                      <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${c.conectada ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {c.conectada ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                        {c.conectada ? 'Conectada' : 'Sem sinal'}
                      </span>
                      {c.ocorrencias24h > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">{c.ocorrencias24h} ocorrência(s) em 24 h</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModal(c)}
                  disabled={!podeEditar}
                  title={podeEditar ? 'Editar' : 'Seu perfil não permite editar'}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Edit className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between text-xs">
                <span className="text-gray-500 truncate" title={c.urlStream}>{c.urlStream}</span>
                <span className="text-gray-500 shrink-0 ml-3">
                  {c.ultimoPing ? `Último sinal ${quandoFoi(c.ultimoPing)}` : 'Nunca enviou sinal'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
          <Camera className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-2xl text-gray-800">{carregando ? '—' : cameras.length}</p>
          <p className="text-xs text-gray-600">Câmeras</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-4" title={MOTIVO_SENSOR}>
          <Settings className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-2xl text-gray-800">0</p>
          <p className="text-xs text-gray-600">Sensores · não há nesta versão</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4" title={MOTIVO_TABLET}>
          <Phone className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-2xl text-gray-800">0</p>
          <p className="text-xs text-gray-600">Tablets · não há nesta versão</p>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-100 p-4">
          <PowerOff className="w-8 h-8 text-orange-600 mb-2" />
          <p className="text-2xl text-gray-800">{carregando ? '—' : offline}</p>
          <p className="text-xs text-gray-600">Sem sinal</p>
        </div>
      </div>

      {modal && (
        <ModalCamera
          camera={modal === 'novo' ? null : modal}
          ambientes={ambientes}
          aoFechar={() => setModal(null)}
          aoSalvar={(salva, nova) => {
            setModal(null);
            setAviso(nova ? `Câmera ${salva.identificador} cadastrada.` : `Câmera ${salva.identificador} atualizada.`);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function ModalCamera({
  camera, ambientes, aoFechar, aoSalvar,
}: {
  camera: CameraResumo | null;
  ambientes: AmbienteResumo[];
  aoFechar: () => void;
  aoSalvar: (camera: CameraResumo, nova: boolean) => void;
}) {
  const { tenantId } = useAuth();
  const editando = camera !== null;
  const [tipo, setTipo] = useState<'camera' | 'sensor' | 'tablet'>('camera');
  const [identificador, setIdentificador] = useState(camera?.identificador ?? '');
  // Em edição a URL vem mascarada pela API (sem credencial); só é enviada se
  // o usuário digitar outra. Vazio = manter a atual.
  const [urlStream, setUrlStream] = useState(editando ? '' : '');
  const [ambienteId, setAmbienteId] = useState(camera?.ambienteId ?? ambientes[0]?.id ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (tipo !== 'camera') return setErro('Só câmeras podem ser cadastradas nesta versão.');
    if (identificador.trim().length < 2) return setErro('Informe o ID da câmera.');
    if (!ambienteId) return setErro('Escolha o ambiente onde a câmera está.');
    if (!editando && urlStream.trim().length < 4) return setErro('Informe a URL do stream (RTSP ou HTTP).');

    setSalvando(true);
    try {
      if (editando) {
        const salva = await editarCamera(camera.id, {
          tenantId: tenantId!,
          identificador: identificador.trim(),
          ambienteId,
          ...(urlStream.trim() ? { urlStream: urlStream.trim() } : {}),
        });
        aoSalvar(salva, false);
      } else {
        const salva = await createCamera({ tenantId: tenantId!, ambienteId, identificador: identificador.trim(), urlStream: urlStream.trim() });
        aoSalvar(salva, true);
      }
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar a câmera.');
      setSalvando(false);
    }
  };

  const campo = 'w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]';
  const travado = 'w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <form onSubmit={enviar} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 className="text-white text-lg">{editando ? `Editar ${camera.identificador}` : 'Adicionar Dispositivo'}</h3>
          <button type="button" onClick={aoFechar} disabled={salvando} className="text-white hover:bg-white/20 rounded-lg p-1 text-2xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-gray-700 mb-2">Nome do Dispositivo</label>
              <input type="text" disabled title={MOTIVO_NOME} value={identificador} placeholder="Igual ao ID" className={travado} />
              <p className="mt-1 text-xs text-gray-500">{MOTIVO_NOME}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-2">Tipo *</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} disabled={editando} className={editando ? travado : campo}>
                <option value="camera">Câmera</option>
                <option value="sensor" disabled title={MOTIVO_SENSOR}>Sensor (indisponível nesta versão)</option>
                <option value="tablet" disabled title={MOTIVO_TABLET}>Tablet (indisponível nesta versão)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-2">ID do Dispositivo *</label>
              <input type="text" value={identificador} onChange={(e) => setIdentificador(e.target.value)} maxLength={60} placeholder="CAM-QUARTO101" className={campo} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-700 mb-2">Localização (ambiente monitorado) *</label>
              <select value={ambienteId} onChange={(e) => setAmbienteId(e.target.value)} className={campo}>
                {ambientes.length === 0 && <option value="">Nenhum ambiente cadastrado</option>}
                {ambientes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}{a.pacienteNome ? ` · ${a.pacienteNome}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">A câmera se vincula a um ambiente cadastrado, não a um texto livre: é o vínculo que diz a quem atribuir a queda.</p>
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-700 mb-2">URL do stream {editando ? '' : '*'}</label>
              <input
                type="text"
                value={urlStream}
                onChange={(e) => setUrlStream(e.target.value)}
                maxLength={500}
                placeholder={editando ? `Atual: ${camera.urlStream} (deixe em branco para manter)` : 'rtsp://usuario:senha@192.168.0.10:554/stream'}
                className={campo}
              />
            </div>
          </div>
          {erro && (
            <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4" /> {erro}
            </p>
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button type="button" onClick={aoFechar} disabled={salvando} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={salvando || tipo !== 'camera'} title={tipo !== 'camera' ? 'Só câmeras podem ser cadastradas' : undefined} className="inline-flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors disabled:opacity-60">
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {editando ? 'Salvar' : 'Adicionar Dispositivo'}
          </button>
        </div>
      </form>
    </div>
  );
}
