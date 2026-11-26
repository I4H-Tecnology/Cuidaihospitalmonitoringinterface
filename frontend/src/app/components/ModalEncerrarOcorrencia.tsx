import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, MinusCircle, X } from 'lucide-react';
import { ApiError } from '../data/api';
import type { ClassificacaoOcorrencia, OcorrenciaResumo } from '../data/api';

/**
 * Encerramento com classificacao obrigatoria (RF19, RF20, RN11, RN13).
 *
 * A classificacao nao tem valor padrao de proposito. Ela e o unico rotulo que
 * vem da operacao real, e e dela que sai a precisao aferida: sem separar queda
 * confirmada de alarme falso, nao ha como medir nada. Um padrao pre-marcado
 * viraria o clique automatico de quem esta com pressa.
 */

interface Props {
  ocorrencia: OcorrenciaResumo;
  aoFechar: () => void;
  aoConfirmar: (classificacao: ClassificacaoOcorrencia, observacao?: string) => Promise<void>;
}

const OPCOES: Array<{
  valor: ClassificacaoOcorrencia;
  titulo: string;
  ajuda: string;
  icone: typeof CheckCircle;
  cor: string;
}> = [
  {
    valor: 'queda_confirmada',
    titulo: 'Queda confirmada',
    ajuda: 'O paciente caiu de fato. Entra no histórico como incidente real.',
    icone: AlertTriangle,
    cor: 'text-red-600',
  },
  {
    valor: 'falso_positivo',
    titulo: 'Falso positivo',
    ajuda: 'A IA se enganou. Fica registrado para recalibrar a detecção (RN14).',
    icone: MinusCircle,
    cor: 'text-gray-500',
  },
  {
    valor: 'encerrada',
    titulo: 'Encerrada sem incidente',
    ajuda: 'Situação verificada e resolvida, sem queda nem erro da detecção.',
    icone: CheckCircle,
    cor: 'text-green-600',
  },
];

export function ModalEncerrarOcorrencia({ ocorrencia, aoFechar, aoConfirmar }: Props) {
  const [escolha, setEscolha] = useState<ClassificacaoOcorrencia | null>(null);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvando) aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, salvando]);

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escolha) return;
    setSalvando(true);
    setErro(null);
    try {
      await aoConfirmar(escolha, observacao.trim() || undefined);
    } catch (e) {
      // Quem chama pode deixar a falha subir. Ela fica aqui, na janela aberta,
      // com a classificação e a observação intactas, em vez de virar uma
      // rejeição sem tratamento e um botão que parece não ter feito nada.
      setErro(e instanceof ApiError ? e.message : 'Não foi possível encerrar a ocorrência. Tente de novo.');
    } finally {
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
      aria-labelledby="titulo-encerrar"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div>
            <h2 id="titulo-encerrar" className="text-gray-800">Encerrar ocorrência</h2>
            <p className="text-sm text-gray-500">
              {ocorrencia.ambienteNome}
              {ocorrencia.pacienteNome && ` · ${ocorrencia.pacienteNome}`}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <form onSubmit={confirmar} className="px-6 py-5 space-y-4">
          <fieldset>
            <legend className="text-sm text-gray-700 mb-2">
              O que aconteceu de verdade? <span className="text-red-500">*</span>
            </legend>
            <div className="space-y-2">
              {OPCOES.map(({ valor, titulo, ajuda, icone: Icone, cor }) => (
                <label
                  key={valor}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    escolha === valor
                      ? 'border-marca bg-marca-suave'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="classificacao"
                    value={valor}
                    checked={escolha === valor}
                    onChange={() => setEscolha(valor)}
                    className="mt-1"
                  />
                  <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} />
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-800">{titulo}</span>
                    <span className="block text-xs text-gray-500">{ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="observacao" className="block text-sm text-gray-700 mb-1.5">
              Observação
            </label>
            <textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="O que foi verificado no local"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
            />
          </div>

          {erro && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {erro}
            </p>
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
              disabled={!escolha || salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-marca px-5 py-2.5 text-sm
                         text-white hover:bg-marca-hover disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
              {salvando ? 'Encerrando…' : 'Encerrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
