import { Bell, CheckCircle2, Eye, Film, Siren, Stethoscope } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Screen } from '../../data/rbac';
import { Aviso, BOTAO_SECUNDARIO, CabecalhoSecao, Carregando, Cartao, Dado } from './ui';
import { useSaudeDoSistema } from './useSaudeDoSistema';

/**
 * Detecção e alertas: o que o sistema detecta de fato e o caminho de um
 * alerta, com os números ao vivo de `/api/saude`.
 *
 * Substitui a lista de "tipos de alerta" com saída de leito, agitação e IA
 * ligável por checkbox — nada daquilo existia. O produto detecta queda por
 * câmera; a tela diz isso e mostra o fluxo que a equipe realmente segue.
 */

const ETAPAS = [
  { Icone: Eye, titulo: 'Detecção', texto: 'O serviço de visão analisa o vídeo da câmera e registra a ocorrência com um clipe de evidência.' },
  { Icone: Siren, titulo: 'Aviso em todas as telas', texto: 'Borda amarela e cartão em todo painel aberto da clínica, até alguém dar ciência.' },
  { Icone: Bell, titulo: 'Ciência', texto: 'Quem viu confirma. O aviso some de todos os painéis ao mesmo tempo.' },
  { Icone: Stethoscope, titulo: 'Atendimento', texto: 'Alguém assume e vai até o ambiente.' },
  { Icone: CheckCircle2, titulo: 'Encerramento', texto: 'Classificada como queda confirmada, falso positivo ou encerrada, com observação.' },
];

export function SecaoDeteccao({ onNavigate }: { onNavigate?: (tela: Screen) => void }) {
  const { can } = useAuth();
  const { saude, erro, carregando } = useSaudeDoSistema();

  return (
    <div className="space-y-6">
      <CabecalhoSecao
        titulo="Detecção e alertas"
        descricao="O que o sistema detecta e o caminho de um alerta até o encerramento."
        acao={onNavigate && can('alerts', 'view') ? (
          <button type="button" onClick={() => onNavigate('alerts')} className={BOTAO_SECUNDARIO}>Abrir Central de Alertas</button>
        ) : undefined}
      />

      <Cartao titulo="O que é detectado">
        <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
            <Siren className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Queda, por câmera <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Crítico</span></p>
            <p className="mt-1 text-sm text-gray-600">
              É o único evento detectado hoje. Saída de leito, agitação e sinais vitais não são monitorados: não há sensor
              nem modelo para isso, e a tela não finge que há.
            </p>
          </div>
        </div>
        {carregando ? <Carregando /> : erro ? <div className="pb-5"><Aviso>{erro}</Aviso></div> : saude && (
          <dl className="grid grid-cols-2 gap-4 border-t border-gray-100 py-5 lg:grid-cols-4">
            <Dado rotulo="Câmeras conectadas">{saude.cameras.conectadas} de {saude.cameras.total}</Dado>
            <Dado rotulo="Painéis recebendo alertas">{saude.canal_alertas.ouvintes_desta_clinica}</Dado>
            <Dado rotulo="Ocorrências em 24 h">{saude.ocorrencias.ultimas_24h}</Dado>
            <Dado rotulo="Abertas agora">{saude.ocorrencias.abertas}</Dado>
          </dl>
        )}
      </Cartao>

      <Cartao titulo="Caminho de um alerta">
        <ol className="grid grid-cols-1 gap-4 py-5 md:grid-cols-5">
          {ETAPAS.map(({ Icone, titulo, texto }, i) => (
            <li key={titulo} className="relative rounded-lg bg-gray-50 p-4">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-marca text-xs text-white">{i + 1}</span>
                {titulo}
              </span>
              <Icone className="absolute right-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
              <p className="text-sm text-gray-600">{texto}</p>
            </li>
          ))}
        </ol>
      </Cartao>

      <Cartao titulo="Evidência em vídeo">
        <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center">
          <Film className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
          <p className="flex-1 text-sm text-gray-600">
            {saude
              ? <>Cada ocorrência guarda um clipe por <strong className="text-gray-900">{saude.clipes.retencao_horas} horas</strong>; depois o vídeo é apagado e a ocorrência continua no histórico. Há {saude.clipes.clipes_em_disco} clipe(s) em disco agora.</>
              : 'Cada ocorrência guarda um clipe por tempo limitado; depois o vídeo é apagado e a ocorrência continua no histórico.'}
          </p>
        </div>
      </Cartao>

      <p className="text-sm text-gray-600">
        Como o aviso chama a sua atenção (som, vibração, notificação) é ajuste pessoal, em Notificações.
      </p>
    </div>
  );
}
