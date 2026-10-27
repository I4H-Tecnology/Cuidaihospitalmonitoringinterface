import { AlertTriangle, BedDouble, Camera, User, UserPlus } from 'lucide-react';
import { descreverAmbiente } from '../../data/api';
import type { AmbienteResumo, PacienteResumo } from '../../data/api';

/**
 * Estrutura fisica da clinica.
 *
 * Agrupava por andar -> quarto -> leito, campos que nao existem no DER. O que o
 * modelo tem e AMBIENTE (quarto, corredor, sala de convivencia), e e por ele
 * que a estrutura e montada agora -- que tambem e a unidade que a camera
 * observa e a que a ocorrencia se vincula.
 */

interface Props {
  pacientes: PacienteResumo[];
  ambientes: AmbienteResumo[];
  aoAbrir?: (paciente: PacienteResumo) => void;
}

const SITUACAO = {
  stable: { rotulo: 'Estável', chip: 'bg-green-100 text-green-700' },
  attention: { rotulo: 'Atenção', chip: 'bg-yellow-100 text-yellow-700' },
  critical: { rotulo: 'Crítico', chip: 'bg-red-100 text-red-700' },
} as const;

function quando(iso?: string | null): string {
  if (!iso) return 'sem ocorrência';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
}

export function StructureView({ pacientes, ambientes, aoAbrir }: Props) {
  const semAmbiente = pacientes.filter((p) => !p.ambienteId);

  return (
    <div className="space-y-4">
      {ambientes.map((amb) => {
        const dentro = pacientes.filter((p) => p.ambienteId === amb.id);
        return (
          <section key={amb.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-gray-400" />
                <h3 className="text-gray-800">{descreverAmbiente(amb.nome, amb.tipo)}</h3>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Camera className="h-3.5 w-3.5" />
                  {amb.cameras > 0
                    ? `${amb.cameras} câmera${amb.cameras > 1 ? 's' : ''}`
                    : 'sem câmera'}
                </span>
                <span>{dentro.length} paciente(s)</span>
              </div>
            </header>

            {dentro.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-gray-500">
                Ambiente vago.
                {amb.cameras === 0 && ' Nenhuma câmera cadastrada aqui.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {dentro.map((p) => (
                  <CartaoPaciente key={p.id} paciente={p} aoAbrir={aoAbrir} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* Paciente sem vinculo nao e detalhe: e queda que a camera nao vai
          conseguir atribuir a ninguem. */}
      {semAmbiente.length > 0 && (
        <section className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
          <header className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <h3 className="text-amber-900">Sem ambiente vinculado</h3>
            <span className="text-sm text-amber-800">
              — as ocorrências detectadas não terão a quem ser atribuídas
            </span>
          </header>
          <ul className="divide-y divide-gray-100">
            {semAmbiente.map((p) => (
              <CartaoPaciente key={p.id} paciente={p} aoAbrir={aoAbrir} />
            ))}
          </ul>
        </section>
      )}

      {ambientes.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <UserPlus className="mx-auto mb-3 h-8 w-8 text-gray-400" />
          <p className="text-gray-700">Nenhum ambiente cadastrado.</p>
        </div>
      )}
    </div>
  );
}

function CartaoPaciente({
  paciente: p, aoAbrir,
}: { paciente: PacienteResumo; aoAbrir?: (p: PacienteResumo) => void }) {
  const s = SITUACAO[p.situacao];
  return (
    <li>
      <button
        type="button"
        onClick={() => aoAbrir?.(p)}
        disabled={!aoAbrir}
        className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors
                   hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marca to-marca-hover text-white">
          <User className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-800">{p.nome}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${s.chip}`}>{s.rotulo}</span>
            {p.ocorrenciasAbertas > 0 && (
              <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">
                {p.ocorrenciasAbertas} em aberto
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-sm text-gray-500">
            {p.idade != null && <span>{p.idade} anos</span>}
            <span>última ocorrência: {quando(p.ultimaOcorrencia)}</span>
            {p.quedasConfirmadas > 0 && (
              <span>{p.quedasConfirmadas} queda(s) confirmada(s)</span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
