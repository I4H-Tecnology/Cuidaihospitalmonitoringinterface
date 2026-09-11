import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X, AlertCircle, Info } from 'lucide-react';
import { ApiError, createCamera, fetchAmbientes } from '../data/api';
import type { AmbienteResumo, CameraResumo } from '../data/api';

/**
 * Configuração de uma câmera nova (RF07: vincular câmera a um ambiente).
 *
 * Os campos são exatamente os que a tabela `camera` exige — ambiente,
 * identificador e URL do stream. Pedir menos não cria o registro; pedir mais
 * seria inventar dado que ninguém guarda.
 */

interface ModalNovaCameraProps {
  tenantId: string;
  aoFechar: () => void;
  aoCriar: (camera: CameraResumo) => void;
}

const TIPO_LEGIVEL: Record<string, string> = {
  quarto: 'Quarto',
  corredor: 'Corredor',
  sala_convivencia: 'Sala de convivência',
  refeitorio: 'Refeitório',
  banheiro: 'Banheiro',
  outro: 'Outro',
};

export function ModalNovaCamera({ tenantId, aoFechar, aoCriar }: ModalNovaCameraProps) {
  const [ambientes, setAmbientes] = useState<AmbienteResumo[]>([]);
  const [ambienteId, setAmbienteId] = useState('');
  const [identificador, setIdentificador] = useState('');
  const [urlStream, setUrlStream] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregandoAmbientes, setCarregandoAmbientes] = useState(true);
  const primeiroCampo = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let vivo = true;
    fetchAmbientes(tenantId)
      .then((dados) => {
        if (!vivo) return;
        setAmbientes(dados);
        if (dados.length === 1) setAmbienteId(dados[0].id);
      })
      .catch(() => vivo && setErro('Não foi possível carregar os ambientes.'))
      .finally(() => vivo && setCarregandoAmbientes(false));
    return () => {
      vivo = false;
    };
  }, [tenantId]);

  // Esc fecha. Quem abre um modal por engano espera sair por onde entrou.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    primeiroCampo.current?.focus();
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!ambienteId) return setErro('Escolha o ambiente que esta câmera observa.');
    if (identificador.trim().length < 2) return setErro('Dê um identificador à câmera.');
    if (urlStream.trim().length < 4) return setErro('Informe o endereço do stream.');

    setSalvando(true);
    try {
      const nova = await createCamera({
        tenantId,
        ambienteId,
        identificador: identificador.trim(),
        urlStream: urlStream.trim(),
      });
      aoCriar(nova);
    } catch (e) {
      // A API já devolve o motivo legível (identificador repetido, ambiente
      // inexistente). Trocar por texto genérico esconderia o que resolve.
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a câmera.');
      setSalvando(false);
    }
  };

  const ambienteEscolhido = ambientes.find((a) => a.id === ambienteId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4
                 bg-gray-900/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Só fecha se o clique começou no fundo — arrastar de dentro para fora
        // ao selecionar texto não deve descartar o formulário preenchido.
        if (e.target === e.currentTarget) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-nova-camera"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E8F4F8] flex items-center justify-center">
              <Camera className="w-5 h-5 text-[#0A7EA4]" />
            </div>
            <div>
              <h2 id="titulo-nova-camera" className="text-gray-800">
                Adicionar câmera
              </h2>
              <p className="text-sm text-gray-500">Vincule o dispositivo a um ambiente monitorado</p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <form onSubmit={enviar} className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="ambiente" className="block text-sm text-gray-700 mb-1.5">
              Ambiente monitorado <span className="text-red-500">*</span>
            </label>
            <select
              id="ambiente"
              ref={primeiroCampo}
              value={ambienteId}
              onChange={(e) => setAmbienteId(e.target.value)}
              disabled={carregandoAmbientes}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]
                         disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {carregandoAmbientes ? 'Carregando…' : 'Selecione o ambiente'}
              </option>
              {ambientes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} · {TIPO_LEGIVEL[a.tipo] ?? a.tipo}
                  {a.cameras > 0 ? ` (${a.cameras} câmera${a.cameras > 1 ? 's' : ''})` : ''}
                </option>
              ))}
            </select>
            {ambienteEscolhido?.pacienteNome && (
              <p className="mt-1.5 text-xs text-gray-500">
                As ocorrências deste ambiente serão vinculadas a{' '}
                <strong className="text-gray-700">{ambienteEscolhido.pacienteNome}</strong>.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="identificador" className="block text-sm text-gray-700 mb-1.5">
              Identificador <span className="text-red-500">*</span>
            </label>
            <input
              id="identificador"
              type="text"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              placeholder="CAM-QUARTO103"
              maxLength={60}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              É o nome que aparece nos alertas. Precisa ser único dentro do ambiente.
            </p>
          </div>

          <div>
            <label htmlFor="url" className="block text-sm text-gray-700 mb-1.5">
              Endereço do stream <span className="text-red-500">*</span>
            </label>
            <input
              id="url"
              type="text"
              value={urlStream}
              onChange={(e) => setUrlStream(e.target.value)}
              placeholder="rtsp://usuario:senha@192.168.0.10:554/stream1"
              maxLength={500}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono
                         focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]"
            />
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                A senha embutida na URL é mascarada antes de voltar para a tela — mas fica
                legível no banco. Prefira uma conta só de leitura na câmera.
              </span>
            </p>
          </div>

          {erro && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          {/* Expectativa honesta: a câmera nasce desconectada, e o painel vai
              mostrá-la assim até o serviço de visão apontar para ela. Sem este
              aviso, quem cadastra acha que quebrou. */}
          <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
            <Info className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
            <p className="text-xs text-gray-600">
              A câmera entra como <strong>desconectada</strong>. Ela só aparece no monitoramento
              ao vivo depois que o serviço de visão for apontado para ela e enviar o primeiro
              sinal de vida.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={aoFechar}
              className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0A7EA4] px-5 py-2.5
                         text-sm text-white hover:bg-[#0EA5E9] transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
              {salvando ? 'Salvando…' : 'Salvar câmera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
