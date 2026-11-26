import { useEffect } from 'react';
import { FlaskConical } from 'lucide-react';
import { useModoDeTeste } from '../data/useModoDeTeste';

/** O CSS reage a `html[data-faixa-de-teste]` (ver theme.css). */
const ATRIBUTO_NO_HTML = 'data-faixa-de-teste';

/**
 * Faixa fixa no topo, presente em toda a aplicação (inclusive no login) quando o backend informa
 * que o sistema está em MODO DE TESTE (MEDSIGNAL_MODO_TESTE).
 *
 * Existe por uma razão de integridade, não de estética: em modo de teste os dados são de
 * ensaio/demonstração. Sem marcação visível, um print de tela vira evidência de uma operação que
 * nunca aconteceu — e numa apresentação isso é a diferença entre demonstrar e enganar.
 *
 * Não confundir com o selo "ENSAIO CONTROLADO" (SeloEnsaio): o selo marca UM registro; a faixa
 * marca o AMBIENTE inteiro.
 *
 * O modo vem do backend em tempo de execução (useModoDeTeste), e não de uma variável gravada no
 * build do painel: assim a faixa acompanha o que o sistema realmente está fazendo, na VPS também.
 */
export function TarjaModoTeste() {
  const modoTeste = useModoDeTeste();

  // Avisa o CSS (theme.css) de que a faixa ocupa 2rem no topo, para o app descontá-los e a página
  // não passar de 100% da janela (o que a faria rolar e esconderia a própria faixa).
  useEffect(() => {
    if (!modoTeste) return undefined;
    document.documentElement.setAttribute(ATRIBUTO_NO_HTML, '');
    return () => document.documentElement.removeAttribute(ATRIBUTO_NO_HTML);
  }, [modoTeste]);

  if (!modoTeste) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] flex h-8 w-full items-center justify-center gap-2 overflow-hidden bg-amber-500 px-4 text-center text-amber-950"
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-sm font-semibold tracking-wide">MODO DE TESTE</span>
      <span className="hidden text-sm sm:inline">
        — ambiente de demonstração: o vídeo vem de uma gravação ou da webcam de teste e os dados são de
        ensaio. Não representa operação real.
      </span>
    </div>
  );
}
