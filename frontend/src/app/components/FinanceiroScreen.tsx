import { useCallback, useMemo } from 'react';
import { ModuloFinanceiro, criarClienteFinanceiro, type AreaFinanceira } from '../../modulos/financeiro';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL, fetchPacientes, lerToken, perderSessao } from '../data/api';

/**
 * O módulo financeiro dentro do MedSignal.
 *
 * Tudo o que é do MedSignal fica aqui: de onde vem o token, o que fazer
 * quando a sessão cai e o que conta como "pessoa do sistema" (os pacientes,
 * que viram clientes para a mensalidade). O módulo em si
 * (src/modulos/financeiro) não importa nada do MedSignal.
 */
export function FinanceiroScreen({ area, aoNavegar }: { area: AreaFinanceira; aoNavegar: (area: AreaFinanceira) => void }) {
  const { tenantId } = useAuth();

  const cliente = useMemo(
    () => criarClienteFinanceiro({ baseUrl: API_BASE_URL, obterToken: lerToken, aoPerderSessao: perderSessao }),
    [],
  );

  const pacientes = useCallback(async () => {
    if (!tenantId) return [];
    const lista = await fetchPacientes(tenantId, true);
    return lista.map((p) => ({
      referenciaExterna: `paciente:${p.id}`,
      nome: p.nome,
      observacao: 'Paciente importado do MedSignal (quem paga a mensalidade pode ser outra pessoa).',
    }));
  }, [tenantId]);

  return (
    <ModuloFinanceiro
      cliente={cliente}
      area={area}
      aoNavegar={aoNavegar}
      pessoasExternas={pacientes}
      rotuloPessoasExternas="Importar pacientes como clientes"
    />
  );
}
