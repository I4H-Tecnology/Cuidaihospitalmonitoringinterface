/**
 * A porta de entrada da interface do financeiro.
 *
 *   <ModuloFinanceiro
 *     cliente={criarClienteFinanceiro({ baseUrl, obterToken })}
 *     area="pagar"
 *     aoNavegar={(area) => irPara(area)}
 *   />
 *
 * O hospedeiro decide onde a área aparece (rota, menu, aba); o módulo
 * desenha a área e avisa quando quer ir para outra (um alerta da visão geral
 * que leva a contas a pagar, por exemplo).
 */

import { useMemo, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { ClienteFinanceiro } from './api/cliente';
import { AREAS_FINANCEIRO, descricaoDaArea, type AreaFinanceira } from './navegacao';
import { ProvedorFinanceiro, useFinanceiro } from './contexto';
import { Carregando, cartao, texto } from './ui/base';
import { VARIAVEIS_DE_COR } from './ui/graficos';
import { Cadastros } from './areas/Cadastros';
import { Caixa } from './areas/Caixa';
import { Capital } from './areas/Capital';
import { Conciliacao } from './areas/Conciliacao';
import { Configuracoes } from './areas/Configuracoes';
import { Pessoal } from './areas/Pessoal';
import { Planejamento } from './areas/Planejamento';
import { Relatorios } from './areas/Relatorios';
import { Titulos } from './areas/Titulos';
import { VisaoGeral } from './areas/VisaoGeral';

export interface PropsDoModulo {
  cliente: ClienteFinanceiro;
  area: AreaFinanceira;
  aoNavegar: (area: AreaFinanceira) => void;
  /** Opcional: cadastros do sistema hospedeiro que podem virar clientes (ex.: pacientes). */
  pessoasExternas?: () => Promise<Array<{ referenciaExterna: string; nome: string; observacao?: string }>>;
  rotuloPessoasExternas?: string;
}

export function ModuloFinanceiro({ cliente, area, aoNavegar, pessoasExternas, rotuloPessoasExternas }: PropsDoModulo) {
  return (
    <ProvedorFinanceiro api={cliente} navegar={aoNavegar} pessoasExternas={pessoasExternas} rotuloPessoasExternas={rotuloPessoasExternas}>
      <div className={`${VARIAVEIS_DE_COR} px-8 py-6`}>
        <Area area={area} />
      </div>
    </ProvedorFinanceiro>
  );
}

function Area({ area }: { area: AreaFinanceira }) {
  const { sessao, pode } = useFinanceiro();
  const descricao = descricaoDaArea(area);
  const telas = useMemo<Record<AreaFinanceira, ReactNode>>(() => ({
    'visao-geral': <VisaoGeral />,
    pagar: <Titulos tipo="pagar" />,
    receber: <Titulos tipo="receber" />,
    caixa: <Caixa />,
    conciliacao: <Conciliacao />,
    pessoal: <Pessoal />,
    capital: <Capital />,
    planejamento: <Planejamento />,
    relatorios: <Relatorios />,
    cadastros: <Cadastros />,
    configuracoes: <Configuracoes />,
  }), []);

  if (!sessao) return <Carregando texto="Abrindo o financeiro…" />;
  if (!pode(descricao.recurso, 'ver')) {
    return (
      <div className={`${cartao} flex items-start gap-3 p-6`}>
        <ShieldAlert className="h-5 w-5 text-amber-500" />
        <div>
          <h2 className={texto.titulo}>Acesso não liberado</h2>
          <p className={`mt-1 text-sm ${texto.suave}`}>
            Seu perfil não tem acesso a {descricao.rotulo.toLowerCase()}. Quem administra os perfis pode liberar.
          </p>
        </div>
      </div>
    );
  }
  // key por área: trocar de área começa do zero (filtros, abas abertas).
  return <div key={area}>{telas[area]}</div>;
}

export { AREAS_FINANCEIRO };
