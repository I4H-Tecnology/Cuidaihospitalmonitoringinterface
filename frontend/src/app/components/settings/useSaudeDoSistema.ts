import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, fetchSaude, type SaudeApi } from '../../data/api';

/** `/api/saude` para as seções que mostram estado real (detecção, integrações, sobre). */
export function useSaudeDoSistema() {
  const { tenantId } = useAuth();
  const [saude, setSaude] = useState<SaudeApi | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      setSaude(await fetchSaude(tenantId));
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError && err.status === 403
        ? 'Seu perfil não tem acesso ao monitoramento, então o estado ao vivo não aparece aqui.'
        : 'Não foi possível consultar o servidor agora.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { saude, erro, carregando, recarregar };
}
