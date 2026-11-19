import { Bell, ChevronRight, Clock, MapPin } from 'lucide-react';
import type { PacienteResumo } from '../../data/api';
import { quandoFoi } from '../../data/tempo';

const SITUACAO = {
  stable: { bg: 'bg-green-50', border: 'border-l-green-500', badge: 'bg-green-100 text-green-700', label: 'Estável' },
  attention: { bg: 'bg-yellow-50', border: 'border-l-yellow-500', badge: 'bg-yellow-100 text-yellow-700', label: 'Atenção' },
  critical: { bg: 'bg-red-50', border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', label: 'Crítico' },
} as const;

export function iniciais(nome: string): string {
  return nome.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export function PatientCard({ paciente, onClick }: { paciente: PacienteResumo; onClick?: () => void }) {
  const config = SITUACAO[paciente.situacao] ?? SITUACAO.stable;
  const abertas = paciente.ocorrenciasAbertas;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`${config.bg} ${config.border} border-l-4 rounded-lg p-4 mb-3 active:scale-98 transition-transform cursor-pointer`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-marca to-marca-hover rounded-full flex items-center justify-center">
            <span className="text-white">{iniciais(paciente.nome)}</span>
          </div>
          <div>
            <h3 className="text-gray-800">{paciente.nome}</h3>
            <p className="text-sm text-gray-500">{paciente.idade != null ? `${paciente.idade} anos` : 'Idade não informada'}</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-marca-texto" />
          <span className="text-sm text-gray-600">{paciente.ambienteNome ?? 'Sem ambiente'}</span>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs ${config.badge}`}>{config.label}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-marca-texto" />
          <span className="text-sm text-gray-700">
            {abertas === 0 ? 'Sem ocorrência aberta' : `${abertas} ocorrência${abertas > 1 ? 's' : ''} aberta${abertas > 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="flex items-center gap-1 text-gray-400 text-xs">
          <Clock className="w-3 h-3" />
          <span>{paciente.ultimaOcorrencia ? quandoFoi(paciente.ultimaOcorrencia) : 'sem ocorrências'}</span>
        </div>
      </div>
    </div>
  );
}
