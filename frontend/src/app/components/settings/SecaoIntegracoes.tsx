import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, Eye, Radio, Server, Wallet } from 'lucide-react';
import { API_BASE_URL, urlDoCanalDeAlertas } from '../../data/api';
import { VISAO_URL, fetchServicoPadrao } from '../../data/visao';
import { CabecalhoSecao, Cartao } from './ui';
import { useSaudeDoSistema } from './useSaudeDoSistema';

/**
 * Integrações: as que existem de verdade, com o estado medido agora.
 *
 * A versão anterior listava "Webhook - Alertas Telegram" e "Sistema HIS
 * Legado" com endereços e sincronizações inventados. Nenhuma das duas existe.
 * O que existe é a API REST, o serviço de visão, o canal de alertas em tempo
 * real e o módulo financeiro; é isso que aparece, e o resto fica dito.
 */

type Estado = 'no-ar' | 'fora' | 'verificando' | 'sem-dado';

const ROTULO: Record<Estado, { texto: string; classe: string }> = {
  'no-ar': { texto: 'No ar', classe: 'bg-green-100 text-green-700' },
  fora: { texto: 'Fora do ar', classe: 'bg-red-100 text-red-700' },
  verificando: { texto: 'Verificando…', classe: 'bg-gray-100 text-gray-700' },
  'sem-dado': { texto: 'Sem acesso ao estado', classe: 'bg-gray-100 text-gray-700' },
};

export function SecaoIntegracoes() {
  const { saude, erro } = useSaudeDoSistema();
  const [visao, setVisao] = useState<Estado>('verificando');
  const baseDaApi = API_BASE_URL || window.location.origin;

  useEffect(() => {
    let vivo = true;
    void fetchServicoPadrao().then((r) => vivo && setVisao(r.noAr ? 'no-ar' : 'fora'));
    return () => { vivo = false; };
  }, []);

  const estadoApi: Estado = saude ? (saude.status === 'ok' ? 'no-ar' : 'fora') : erro ? 'sem-dado' : 'verificando';
  const estadoCanal: Estado = saude ? 'no-ar' : erro ? 'sem-dado' : 'verificando';

  return (
    <div className="space-y-6">
      <CabecalhoSecao titulo="Integrações" descricao="Os serviços que o MedSignal usa e expõe, com o estado medido agora." />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CartaoIntegracao
          Icone={Server}
          titulo="API REST"
          estado={estadoApi}
          descricao="Todos os dados do painel e do app vêm daqui. Autenticação por token, com as permissões do perfil."
          endereco={baseDaApi}
          extra={
            <a href={`${baseDaApi}/docs`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-marca-texto hover:underline">
              Documentação interativa <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          }
        />
        <CartaoIntegracao
          Icone={Eye}
          titulo="Serviço de visão (padrão)"
          estado={visao}
          descricao="Analisa o vídeo das câmeras e registra as quedas. Câmeras podem apontar para outro serviço em Dispositivos."
          endereco={VISAO_URL}
        />
        <CartaoIntegracao
          Icone={Radio}
          titulo="Canal de alertas em tempo real"
          estado={estadoCanal}
          descricao={saude
            ? `WebSocket que empurra as quedas para os painéis. ${saude.canal_alertas.ouvintes_desta_clinica} painel(is) desta clínica conectado(s) agora.`
            : 'WebSocket que empurra as quedas para os painéis abertos.'}
          endereco={urlDoCanalDeAlertas()}
        />
        <CartaoIntegracao
          Icone={Wallet}
          titulo="Módulo financeiro"
          estado="no-ar"
          descricao="Roda dentro do MedSignal, com o mesmo login e as permissões de Financeiro, Folha e Administração financeira."
        />
      </div>

      <p className="text-sm text-gray-600">
        Webhooks de saída e integração com HIS/prontuário externo ainda não existem. Quando existirem, aparecem aqui.
      </p>
    </div>
  );
}

function CartaoIntegracao({ Icone, titulo, estado, descricao, endereco, extra }: {
  Icone: typeof Server; titulo: string; estado: Estado; descricao: string; endereco?: string; extra?: React.ReactNode;
}) {
  const [copiado, setCopiado] = useState(false);
  const { texto, classe } = ROTULO[estado];

  const copiar = async () => {
    if (!endereco) return;
    try {
      await navigator.clipboard.writeText(endereco);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // sem permissão de área de transferência: o endereço continua à vista
    }
  };

  return (
    <Cartao>
      <div className="flex h-full flex-col gap-3 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-suave text-marca-texto">
            <Icone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base text-gray-900">{titulo}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs ${classe}`}>{texto}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">{descricao}</p>
          </div>
        </div>
        {endereco && (
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-gray-800" title={endereco}>{endereco}</code>
            <button type="button" onClick={copiar} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-700 hover:bg-gray-200" aria-label={`Copiar endereço de ${titulo}`}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}
        {extra}
      </div>
    </Cartao>
  );
}
