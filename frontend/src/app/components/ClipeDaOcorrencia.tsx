import { Film, Loader2 } from 'lucide-react';
import type { OcorrenciaResumo } from '../data/api';
import { useClipeDaOcorrencia } from '../data/useClipeDaOcorrencia';

/** Clipe de evidência na central de alertas: botão, depois o vídeo no lugar. */
export function ClipeDaOcorrencia({ ocorrencia }: { ocorrencia: OcorrenciaResumo }) {
  const { url, carregando, aviso, situacao, abrir } = useClipeDaOcorrencia(ocorrencia);

  if (url) {
    return (
      <video
        controls
        autoPlay
        muted
        src={url}
        className="mt-3 w-full max-w-md rounded bg-black"
        aria-label="Clipe de evidência da ocorrência"
      />
    );
  }

  if (situacao !== 'disponivel') {
    const texto =
      situacao === 'expurgado' ? 'Vídeo expurgado após o prazo de retenção (RNF05). O registro permanece.'
        : situacao === 'gravando' ? 'Clipe em gravação…'
          : 'Sem vídeo disponível para esta ocorrência.';
    return <p className="mt-3 text-xs text-gray-400">{texto}</p>;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={abrir}
        disabled={carregando}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5
                   text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
        Ver clipe (10 s)
      </button>
      {aviso && <p className="mt-1 text-xs text-amber-700">{aviso}</p>}
    </div>
  );
}
