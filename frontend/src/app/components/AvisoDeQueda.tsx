import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Film, Loader2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { darCiencia } from '../data/api';
import type { OcorrenciaResumo } from '../data/api';
import { rotuloDoEvento } from '../data/ocorrencias';
import { quandoFoi } from '../data/tempo';
import { useAlertas } from '../data/useAlertas';
import { useClipeDaOcorrencia } from '../data/useClipeDaOcorrencia';
import { notificarQueda, tocarSomDeQueda } from '../data/alertaDeQueda';
import { obterPreferencias } from '../data/preferencias';

/**
 * Aviso de queda por cima de qualquer tela: borda amarela pulsando em volta da
 * tela e um cartão dizendo quem caiu e onde (RF15).
 *
 * Antes o push só recarregava as listas em silêncio, e quem estava em outra
 * tela não ficava sabendo de nada. O aviso dura enquanto houver ocorrência sem
 * ciência, e não por um tempo fixo: a RN12 manda o alerta ficar visível até
 * alguém confirmar, então não há botão de fechar. Só a ciência apaga o aviso,
 * e apaga em todos os painéis, porque o servidor empurra o evento para todos.
 *
 * `aoChegarQueda` roda uma vez por ocorrência nova; o painel usa para levar
 * quem acessa as câmeras direto ao monitoramento.
 *
 * `contido` é para o simulador de celular do painel: a borda acompanha a tela
 * do aparelho em vez da janela inteira.
 *
 * Exceção para quem não pode dar ciência (perfil de leitura, como o gestor e a
 * banca do TCC): para essas pessoas o cartão traz "Ocultar". Sem isso ele
 * ficaria para sempre por cima do cabeçalho, e no celular cobre o botão do
 * menu: a pessoa não conseguiria sair da tela. Ocultar é só local e dura até
 * recarregar: não registra ciência, e o alerta continua visível, com "sem
 * ciência", nas telas de alertas e de monitoramento (RN12).
 */

interface Props {
  contido?: boolean;
  aoChegarQueda?: () => void;
}

// Longo o bastante para ser notado no bolso. Onde não há vibração (iOS,
// desktop) a chamada não faz nada.
const VIBRACAO_MS = [400, 200, 400, 200, 400];

function aguardaCiencia(o: OcorrenciaResumo): boolean {
  return o.status === 'pendente' && o.alertaStatus !== 'ciente';
}

export function AvisoDeQueda({ contido = false, aoChegarQueda }: Props) {
  const { tenantId, can } = useAuth();
  const { ocorrencias, recarregar } = useAlertas(can('alerts', 'view') ? tenantId : null);
  const vistas = useRef<Set<string>>(new Set());
  const podeDarCiencia = can('alerts', 'edit');
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(new Set());

  // A API devolve da mais recente para a mais antiga: o cartão mostra a
  // última queda e conta as outras.
  const abertas = ocorrencias.filter(aguardaCiencia);
  const chave = abertas.map((o) => o.id).join(',');
  // Quem dá ciência não pode ocultar: o aviso só some com a ciência.
  const visiveis = podeDarCiencia ? abertas : abertas.filter((o) => !ocultas.has(o.id));

  // Uma vez por ocorrência nova, não a cada recarga da lista.
  useEffect(() => {
    const novas = abertas.filter((o) => !vistas.current.has(o.id));
    if (novas.length === 0) return;
    novas.forEach((o) => vistas.current.add(o.id));
    // Lido na hora, e não por hook: a preferência mudada em Configurações vale
    // para a próxima queda sem remontar o aviso. O cartão abaixo aparece sempre.
    const prefs = obterPreferencias();
    if (prefs.vibrar) navigator.vibrate?.(VIBRACAO_MS);
    if (prefs.somDeQueda) void tocarSomDeQueda();
    if (prefs.notificacaoDoNavegador) {
      const o = novas[0];
      notificarQueda(
        `${rotuloDoEvento(o.tipoEvento)} — ${o.pacienteNome ?? o.ambienteNome}`,
        novas.length > 1 ? `${o.ambienteNome} e mais ${novas.length - 1}. Abra o MedSignal para dar ciência.` : `${o.ambienteNome}. Abra o MedSignal para dar ciência.`,
      );
    }
    if (prefs.abrirMonitoramento) aoChegarQueda?.();
  }, [chave]);

  if (visiveis.length === 0) return null;

  const posicao = contido ? 'absolute' : 'fixed';

  return (
    <>
      <div aria-hidden="true" className={`${posicao} inset-0 z-[60] pointer-events-none cuidai-queda-borda`} />

      {/* A key zera vídeo e erro quando o cartão passa para a próxima queda. */}
      <CartaoDaQueda
        key={visiveis[0].id}
        ocorrencia={visiveis[0]}
        outras={visiveis.length - 1}
        aoOcultar={() => setOcultas((atual) => new Set(atual).add(visiveis[0].id))}
        posicao={`${posicao} ${contido ? 'top-9' : 'top-3 sm:left-1/2 sm:right-auto sm:w-[30rem] sm:-translate-x-1/2'}`}
        aoDarCiencia={async () => {
          if (!tenantId) return;
          await darCiencia(tenantId, visiveis[0].id);
          await recarregar();
        }}
      />
    </>
  );
}

function CartaoDaQueda({
  ocorrencia: o, outras, posicao, aoDarCiencia, aoOcultar,
}: {
  ocorrencia: OcorrenciaResumo;
  outras: number;
  posicao: string;
  aoDarCiencia: () => Promise<void>;
  aoOcultar: () => void;
}) {
  const { can } = useAuth();
  const podeDarCiencia = can('alerts', 'edit');
  // Mesma permissão que o backend exige para servir o clipe.
  const podeVerCamera = can('monitoring', 'view');
  const clipe = useClipeDaOcorrencia(o);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      await aoDarCiencia();
    } catch {
      setErro('Não foi possível registrar a ciência. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  // Sem clipe e fora da janela de gravação não há o que mostrar: o botão
  // some, em vez de ocupar o cartão com "sem vídeo".
  const mostraBotaoDoClipe =
    podeVerCamera && (clipe.situacao === 'disponivel' || clipe.situacao === 'gravando');
  const titulo = o.tipoEvento === 'queda' ? 'Paciente caiu' : rotuloDoEvento(o.tipoEvento);
  const secundario =
    'flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-amber-950 ' +
    'bg-amber-950/10 ring-1 ring-inset ring-amber-950/20 transition-colors hover:bg-amber-950/15 disabled:opacity-60';

  return (
    <div
      role="alert"
      className={`${posicao} z-[61] left-3 right-3 rounded-xl bg-amber-400 p-4 text-amber-950 shadow-2xl ring-1 ring-amber-500/60`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{titulo}</p>
          <p className="text-sm">
            {o.pacienteNome ?? 'Paciente não identificado'} · {o.ambienteNome}
          </p>
          <p className="text-xs text-amber-900">
            {quandoFoi(o.dataHora)}
            {outras > 0 && ` · mais ${outras} aguardando ciência`}
          </p>
        </div>
      </div>

      {clipe.url && (
        <video
          controls
          autoPlay
          muted
          src={clipe.url}
          className="mt-3 aspect-video w-full rounded-lg bg-black"
          aria-label="Clipe da queda"
        />
      )}

      {(erro || clipe.aviso) && (
        <p className="mt-2 text-xs font-medium text-red-800">{erro ?? clipe.aviso}</p>
      )}

      <div className={`mt-3 grid gap-2 ${mostraBotaoDoClipe && podeDarCiencia ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {mostraBotaoDoClipe && (
          clipe.url ? (
            <button type="button" onClick={clipe.fechar} className={secundario}>
              <X className="h-4 w-4" />
              Fechar vídeo
            </button>
          ) : (
            <button
              type="button"
              onClick={clipe.abrir}
              disabled={clipe.carregando || clipe.situacao === 'gravando'}
              className={secundario}
            >
              {clipe.carregando || clipe.situacao === 'gravando'
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Film className="h-4 w-4" />}
              {clipe.situacao === 'gravando' ? 'Gravando o clipe…' : 'Ver a queda'}
            </button>
          )
        )}

        {podeDarCiencia ? (
          <button
            type="button"
            onClick={confirmar}
            disabled={enviando}
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-950 py-2 text-sm font-medium text-amber-50 transition-colors hover:bg-amber-900 disabled:opacity-60"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {enviando ? 'Registrando…' : 'Dar ciência'}
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs">Aguardando ciência de alguém da equipe.</p>
            <button type="button" onClick={aoOcultar} className={`${secundario} shrink-0 px-3`}>
              Ocultar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
