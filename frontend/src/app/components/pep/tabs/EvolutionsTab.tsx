import { useState } from 'react';
import { AlertCircle, FileText, Loader2, Send, User } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { ApiError, criarEvolucao } from '../../../data/api';
import type { EvolucaoResumo, PacienteResumo } from '../../../data/api';
import { quandoFoi } from '../../../data/tempo';

/**
 * Evoluções clínicas do paciente, com dado real desde 13/09/2026.
 *
 * O arquivo antigo com este nome era um mock e foi apagado; este é novo. A
 * lista não oferece editar nem apagar de propósito: evolução é registro, e
 * o backend também não tem rota para isso. Nota errada leva nota nova.
 */

interface Props {
  paciente: PacienteResumo;
  evolucoes: EvolucaoResumo[];
  carregando: boolean;
  aoRegistrar: () => Promise<void>;
  focarFormulario?: boolean;
}

function dataHoraBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function EvolutionsTab({ paciente, evolucoes, carregando, aoRegistrar, focarFormulario }: Props) {
  const { tenantId, can } = useAuth();
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const podeRegistrar = can('clinical_logs', 'create');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (texto.trim().length < 3) return setErro('Escreva a evolução antes de registrar.');
    setSalvando(true);
    setErro(null);
    try {
      await criarEvolucao({ tenantId, pacienteId: paciente.id, texto: texto.trim() });
      setTexto('');
      await aoRegistrar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível registrar a evolução.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-gray-800">Evoluções clínicas</h2>
        <p className="text-sm text-gray-500">
          Registro da equipe sobre {paciente.nome}. Uma vez registrada, a evolução não é editada nem apagada;
          correção é uma evolução nova.
        </p>
      </div>

      {podeRegistrar ? (
        <form onSubmit={enviar} className="rounded-lg border border-gray-200 bg-white p-4">
          <label htmlFor="nova-evolucao" className="mb-2 block text-sm text-gray-700">Nova evolução</label>
          <textarea
            id="nova-evolucao"
            autoFocus={focarFormulario}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="O que foi observado, feito ou orientado."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">{texto.length}/4000</span>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover disabled:opacity-60"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Adicionar evolução
            </button>
          </div>
          {erro && (
            <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" /> {erro}</p>
          )}
        </form>
      ) : (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
          Seu perfil pode ler as evoluções, mas não registrar. Quem registra é a equipe assistencial.
        </p>
      )}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : evolucoes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          Nenhuma evolução registrada.
        </div>
      ) : (
        <ol className="space-y-3">
          {evolucoes.map((e) => (
            <li key={e.id} className="rounded-lg border border-gray-200 border-l-4 border-l-marca-viva bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-marca-texto" />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{e.texto}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {e.autorNome}</span>
                    <span title={dataHoraBR(e.dataHora)}>{quandoFoi(e.dataHora)}</span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
