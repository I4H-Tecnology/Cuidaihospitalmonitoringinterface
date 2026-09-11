import { useCallback, useEffect, useState } from 'react';
import { fetchOperationalOverview, fetchTenants } from './api';

/**
 * Numeros do shell: contadores do menu, do sino e o nome da clinica.
 *
 * Estavam fixos no codigo (3, 7, "Hospital Central") e por isso divergiam do
 * que as telas mostravam. Uma consulta so, aqui, alimenta sidebar e header --
 * cada um buscando por conta dobraria o trafego para exibir o mesmo numero.
 */

const INTERVALO_MS = 30000;

interface Resumo {
  alertasCriticos: number;
  casosAbertos: number;
  incidentes24h: number;
  nomeDaClinica: string | null;
}

export function useResumoOperacional(tenantId: string | null): Resumo & { recarregar: () => void } {
  const [resumo, setResumo] = useState<Resumo>({
    alertasCriticos: 0,
    casosAbertos: 0,
    incidentes24h: 0,
    nomeDaClinica: null,
  });

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const dados = await fetchOperationalOverview(tenantId);
      setResumo((atual) => ({
        ...atual,
        alertasCriticos: dados.criticalAlerts,
        casosAbertos: dados.criticalCases,
        incidentes24h: dados.incidentsLast24h,
      }));
    } catch {
      // Silencio de proposito: o shell nao deve exibir erro por nao ter
      // conseguido atualizar um contador. Fica com o valor anterior.
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
    const timer = window.setInterval(carregar, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  useEffect(() => {
    if (!tenantId) return;
    let vivo = true;
    fetchTenants()
      .then((lista) => {
        const minha = lista.find((t) => t.id === tenantId);
        if (vivo && minha) {
          setResumo((atual) => ({ ...atual, nomeDaClinica: minha.nome ?? minha.id }));
        }
      })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [tenantId]);

  return { ...resumo, recarregar: carregar };
}
