import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, LogOut, ShieldOff, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, darAltaPaciente } from '../../data/api';
import type { AltaResultado, PacienteResumo } from '../../data/api';

/**
 * Alta ou transferencia do paciente.
 *
 * A alta e uma das poucas acoes do prontuario que o DER sustenta: paciente tem
 * status e data_alta, e a RN07 manda revogar o acesso dos acompanhantes junto.
 *
 * O aviso sobre a revogacao aparece ANTES de confirmar, nao depois. Quem da
 * alta precisa saber que vai cortar o acesso de um familiar enquanto ainda da
 * para desistir.
 */

interface Props {
  paciente: PacienteResumo;
  aoFechar: () => void;
  aoConcluir: (resultado: AltaResultado) => void;
}

export function ModalAlta({ paciente, aoFechar, aoConcluir }: Props) {
  const { tenantId } = useAuth();
  const [motivo, setMotivo] = useState<'alta' | 'transferido'>('alta');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const temOcorrenciaAberta = paciente.ocorrenciasAbertas > 0;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvando) aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, salvando]);

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const resultado = await darAltaPaciente(
        tenantId!,
        paciente.id,
        motivo,
        observacao.trim() || undefined
      );
      aoConcluir(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível registrar a alta.');
      setSalvando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !salvando) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-alta"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-marca-suave">
              <LogOut className="h-5 w-5 text-marca-texto" />
            </div>
            <div>
              <h2 id="titulo-alta" className="text-gray-800">Registrar saída</h2>
              <p className="text-sm text-gray-500">{paciente.nome}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={confirmar} className="px-6 py-5 space-y-4">
          {temOcorrenciaAberta && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm text-red-700">
                Este paciente tem {paciente.ocorrenciasAbertas} ocorrência(s) em aberto.
                Encerre o atendimento na Central de Alertas antes de dar saída.
              </p>
            </div>
          )}

          <fieldset>
            <legend className="mb-2 text-sm text-gray-700">Motivo da saída</legend>
            <div className="space-y-2">
              {([
                ['alta', 'Alta', 'O paciente deixou a clínica.'],
                ['transferido', 'Transferência', 'O paciente foi para outra unidade.'],
              ] as const).map(([valor, titulo, ajuda]) => (
                <label
                  key={valor}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    motivo === valor ? 'border-marca bg-marca-suave' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={valor}
                    checked={motivo === valor}
                    onChange={() => setMotivo(valor)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm text-gray-800">{titulo}</span>
                    <span className="block text-xs text-gray-500">{ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="obs-alta" className="mb-1.5 block text-sm text-gray-700">
              Observação
            </label>
            <textarea
              id="obs-alta"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Opcional"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
            />
          </div>

          {/* A consequencia aparece antes do clique, nao depois. */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-xs text-amber-900">
              O acesso de todos os acompanhantes autorizados a este paciente será revogado
              imediatamente (RN07). A câmera do ambiente continua monitorando; o histórico de
              ocorrências é preservado.
            </p>
          </div>

          {erro && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={aoFechar}
              disabled={salvando}
              className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || temOcorrenciaAberta}
              className="inline-flex items-center gap-2 rounded-lg bg-marca px-5 py-2.5 text-sm
                         text-white hover:bg-marca-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {salvando ? 'Registrando…' : 'Confirmar saída'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
