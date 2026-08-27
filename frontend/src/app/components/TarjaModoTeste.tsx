import { FlaskConical } from 'lucide-react';

/**
 * Faixa fixa no topo, presente em toda a aplicação quando MEDSIGNAL_MODO_TESTE
 * está ligado.
 *
 * Existe por uma razão de integridade, não de estética: em modo de teste a
 * fonte de vídeo é a webcam e os dados são de ensaio. Sem marcação visível,
 * um print de tela vira evidência de uma operação que nunca aconteceu — e
 * numa apresentação isso é a diferença entre demonstrar e enganar.
 *
 * A flag vive no `.env` como MEDSIGNAL_MODO_TESTE; o docker-compose deriva
 * dela a VITE_MODO_TESTE, porque o Vite só expõe variáveis com esse prefixo.
 */
export function modoTesteAtivo(): boolean {
  const bruto = import.meta.env.VITE_MODO_TESTE;
  if (bruto === undefined || bruto === null) return false;
  return ['1', 'true', 't', 'sim', 'yes', 'on'].includes(String(bruto).trim().toLowerCase());
}

export function TarjaModoTeste() {
  if (!modoTesteAtivo()) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-amber-950"
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-sm font-semibold tracking-wide">MODO DE TESTE</span>
      <span className="hidden text-sm sm:inline">
        — vídeo vindo da webcam local e dados de ensaio. Não representa operação real.
      </span>
    </div>
  );
}
