import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, fetchClipeDaOcorrencia } from './api';
import type { OcorrenciaResumo } from './api';

const VINTE_E_QUATRO_HORAS_MS = 24 * 3600 * 1000;
const JANELA_DE_GRAVACAO_MS = 30 * 1000;

export type SituacaoDoClipe = 'disponivel' | 'gravando' | 'expurgado' | 'sem_video';

/**
 * Clipe de evidência: 5 s antes e 5 s depois da ocorrência (RNF05).
 *
 * O vídeo é buscado com o token e vira uma URL de objeto — a tag <video> não
 * manda cabeçalho, e o clipe nunca é servido sem autenticação. Após 24 h o
 * arquivo é expurgado e a ocorrência continua, sem vídeo (RN09, RNF18).
 *
 * Hook à parte porque a central de alertas e o aviso de queda mostram o mesmo
 * clipe com layouts diferentes.
 */
export function useClipeDaOcorrencia(o: OcorrenciaResumo) {
  const { tenantId } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const idade = Date.now() - new Date(o.dataHora).getTime();
  const situacao: SituacaoDoClipe = o.temClipe
    ? 'disponivel'
    : idade > VINTE_E_QUATRO_HORAS_MS
      ? 'expurgado'
      : idade < JANELA_DE_GRAVACAO_MS
        ? 'gravando'
        : 'sem_video';

  const abrir = async () => {
    if (!tenantId) return;
    setCarregando(true);
    setAviso(null);
    try {
      const blob = await fetchClipeDaOcorrencia(tenantId, o.id);
      setUrl(URL.createObjectURL(blob));
    } catch (erro) {
      setAviso(
        erro instanceof ApiError && erro.status === 404
          ? 'Clipe indisponível: ainda em gravação ou já expurgado (retenção de 24 h).'
          : 'Não foi possível carregar o clipe.',
      );
    } finally {
      setCarregando(false);
    }
  };

  return { url, carregando, aviso, situacao, abrir, fechar: () => setUrl(null) };
}
