import { Info, Lock } from 'lucide-react';

/**
 * Marcacao honesta do que ainda nao existe.
 *
 * O prontuario clinico esta fora do MVP pela secao 2.6 da RFC, e fora do DER,
 * que nao tem entidade para evolucao, prescricao nem exame. As telas ficaram
 * no produto para mostrar a visao de produto -- a propria RFC diz isso na
 * legenda da Figura 6.
 *
 * O problema nao era terem ficado: era nao dizerem. Botao que nao faz nada e
 * pior que botao ausente, porque o usuario so descobre depois de clicar, e fica
 * sem saber se quebrou ou se nunca funcionou.
 */

export function AvisoForaDoMVP({ oque }: { oque: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div className="text-sm text-amber-900">
        <p>
          <strong>Demonstração da visão de produto.</strong> {oque} não faz parte da v1 de
          detecção de quedas (RFC, seção 2.6) e não existe no modelo de dados.
        </p>
        <p className="mt-1 text-amber-800">
          Os dados abaixo são ilustrativos e as ações estão desativadas.
        </p>
      </div>
    </div>
  );
}

/**
 * Botao que declara por que nao age, em vez de silenciar.
 *
 * `disabled` de verdade, e nao um onClick vazio: leitor de tela anuncia o
 * estado, e o cursor muda antes do clique.
 */
export function BotaoIndisponivel({
  children, motivo, className = '',
}: {
  children: React.ReactNode;
  motivo: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={motivo}
      aria-label={`${typeof children === 'string' ? children : 'Ação'} — ${motivo}`}
      className={`inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50
                  px-4 py-2 text-sm text-gray-400 cursor-not-allowed ${className}`}
    >
      <Lock className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
