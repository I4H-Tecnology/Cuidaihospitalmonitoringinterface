import { useState } from 'react';
import { BellRing, Volume2 } from 'lucide-react';
import {
  pedirPermissaoDeNotificacao, permissaoDeNotificacao, tocarSomDeQueda, type PermissaoDeNotificacao,
} from '../../data/alertaDeQueda';
import { usePreferencias } from '../../data/preferencias';
import { Aviso, BOTAO_SECUNDARIO, CabecalhoSecao, Cartao, Interruptor, LinhaAjuste } from './ui';

/**
 * Notificações: os reforços do aviso de queda neste aparelho. O aviso visual
 * em si (borda e cartão até alguém dar ciência, RN12) não tem interruptor.
 */
export function SecaoNotificacoes() {
  const [prefs, salvar] = usePreferencias();
  const [permissao, setPermissao] = useState<PermissaoDeNotificacao>(permissaoDeNotificacao);
  const [somFalhou, setSomFalhou] = useState(false);

  const mudarNotificacao = async (ligar: boolean) => {
    if (!ligar) return salvar({ notificacaoDoNavegador: false });
    // A permissão é pedida no clique, nunca ao abrir a tela: pedido sem
    // contexto é o que faz as pessoas clicarem em "bloquear".
    const resposta = permissao === 'granted' ? 'granted' : await pedirPermissaoDeNotificacao();
    setPermissao(resposta);
    salvar({ notificacaoDoNavegador: resposta === 'granted' });
  };

  const testarSom = async () => {
    setSomFalhou(!(await tocarSomDeQueda()));
  };

  return (
    <div className="space-y-6">
      <CabecalhoSecao
        titulo="Notificações"
        descricao="Como uma queda nova chama a sua atenção neste aparelho. Fica salvo só neste navegador."
      />

      <Aviso>
        O aviso na tela — borda amarela e cartão com quem caiu e onde — aparece sempre e só some quando alguém dá
        ciência. Os ajustes abaixo são reforços dele e não podem desligá-lo.
      </Aviso>

      <Cartao titulo="Quando chegar uma queda">
        <LinhaAjuste rotulo="Tocar som" idControle="pref-som" descricao="Três bipes curtos. O navegador só toca depois do primeiro clique na página.">
          <div className="flex items-center gap-3">
            <button type="button" onClick={testarSom} className={`${BOTAO_SECUNDARIO} px-3 py-1.5`}>
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              Testar
            </button>
            <Interruptor id="pref-som" rotulo="Tocar som" ligado={prefs.somDeQueda} aoMudar={(v) => salvar({ somDeQueda: v })} />
          </div>
        </LinhaAjuste>

        <LinhaAjuste
          rotulo="Notificação do sistema"
          idControle="pref-notificacao"
          descricao={
            permissao === 'denied'
              ? 'Bloqueada no navegador. Libere em Configurações do site (ícone de cadeado ao lado do endereço) e volte aqui.'
              : permissao === 'indisponivel'
                ? 'Este navegador não oferece notificações.'
                : 'Aparece no canto da tela mesmo com o MedSignal minimizado ou em outra aba.'
          }
        >
          <Interruptor
            id="pref-notificacao"
            rotulo="Notificação do sistema"
            ligado={prefs.notificacaoDoNavegador && permissao === 'granted'}
            desabilitado={permissao === 'denied' || permissao === 'indisponivel'}
            aoMudar={mudarNotificacao}
          />
        </LinhaAjuste>

        <LinhaAjuste rotulo="Vibrar" idControle="pref-vibrar" descricao="No celular e no tablet. Computadores ignoram.">
          <Interruptor id="pref-vibrar" rotulo="Vibrar" ligado={prefs.vibrar} aoMudar={(v) => salvar({ vibrar: v })} />
        </LinhaAjuste>

        <LinhaAjuste
          rotulo="Abrir o monitoramento"
          idControle="pref-abrir"
          descricao="Leva você direto à tela das câmeras, saindo do que estiver fazendo. Desligue se costuma preencher formulários longos."
        >
          <Interruptor id="pref-abrir" rotulo="Abrir o monitoramento" ligado={prefs.abrirMonitoramento} aoMudar={(v) => salvar({ abrirMonitoramento: v })} />
        </LinhaAjuste>
      </Cartao>

      {somFalhou && (
        <Aviso tom="erro">
          O som não tocou. Confira se o aparelho não está no mudo e se o navegador permite som para este site.
        </Aviso>
      )}

      <p className="flex items-center gap-2 text-sm text-gray-600">
        <BellRing className="h-4 w-4 shrink-0" aria-hidden="true" />
        As outras notificações (alertas clínicos, ocorrências) ficam no sino do cabeçalho.
      </p>
    </div>
  );
}
