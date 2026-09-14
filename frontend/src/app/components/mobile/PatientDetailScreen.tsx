import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Clock, Loader2, MapPin } from 'lucide-react';
import { fetchOcorrenciasDoPaciente } from '../../data/api';
import type { OcorrenciaResumo, PacienteResumo } from '../../data/api';
import { ROTULO_STATUS, gravidadeDe, rotuloDoEvento } from '../../data/ocorrencias';
import { quandoFoi } from '../../data/tempo';
import { iniciais } from './PatientCard';

/**
 * Detalhe do paciente no app da enfermagem: quem é, onde está e o histórico
 * de ocorrências detectadas pelas câmeras. Sinais vitais e "medicação
 * administrada" saíram: o produto não mede nem registra isso.
 */

interface Props {
  paciente: PacienteResumo;
  tenantId: string | null;
  onBack: () => void;
}

const SITUACAO = {
  stable: { bg: 'bg-green-100', text: 'text-green-700', label: 'Estável' },
  attention: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Atenção' },
  critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Crítico' },
} as const;

const PONTO = { critical: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' } as const;

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('T')[0].split('-');
  return `${dia}/${mes}/${ano}`;
}

export function PatientDetailScreen({ paciente, tenantId, onBack }: Props) {
  const config = SITUACAO[paciente.situacao] ?? SITUACAO.stable;
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let vivo = true;
    fetchOcorrenciasDoPaciente(tenantId, paciente.id)
      .then((lista) => { if (vivo) setOcorrencias(lista); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar as ocorrências.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [tenantId, paciente.id]);

  return (
    <div className="min-h-screen bg-[#F8FBFC] pb-20">
      <header className="bg-gradient-to-r from-[#7DD3FC] to-[#0EA5E9] px-4 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="w-10 h-10 flex items-center justify-center" aria-label="Voltar">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-white">Paciente</h1>
        </div>
      </header>

      <div className="px-4 py-4">
        <div className="bg-white rounded-lg p-5 mb-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-full flex items-center justify-center">
                <span className="text-white text-xl">{iniciais(paciente.nome)}</span>
              </div>
              <div>
                <h2 className="text-gray-800 mb-1">{paciente.nome}</h2>
                <p className="text-sm text-gray-500 mb-2">
                  {paciente.idade != null ? `${paciente.idade} anos` : 'Idade não informada'} · internado em {dataBR(paciente.dataAdmissao)}
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-[#0A7EA4]" />
                  <span>{paciente.ambienteNome ?? 'Sem ambiente vinculado'}</span>
                </div>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm ${config.bg} ${config.text}`}>{config.label}</span>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-l-[#0EA5E9]">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-5 h-5 text-[#0A7EA4]" />
              <span className="text-xs text-gray-500">Ocorrências abertas</span>
            </div>
            <p className="text-2xl text-gray-800">{paciente.ocorrenciasAbertas}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-l-red-500">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-red-600" />
              <span className="text-xs text-gray-500">Quedas confirmadas</span>
            </div>
            <p className="text-2xl text-gray-800">{paciente.quedasConfirmadas}</p>
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-gray-800 mb-3 px-1">Ocorrências detectadas</h3>
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {carregando ? (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </p>
            ) : erro ? (
              <p className="px-4 py-4 text-sm text-red-600">{erro}</p>
            ) : ocorrencias.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-500">Nenhuma ocorrência registrada para este paciente.</p>
            ) : (
              ocorrencias.map((o) => (
                <div key={o.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-2 ${PONTO[gravidadeDe(o)]}`}></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{rotuloDoEvento(o.tipoEvento)} · {ROTULO_STATUS[o.status] ?? o.status}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {o.ambienteNome}{o.cameraIdentificador ? ` · ${o.cameraIdentificador}` : ''} · {quandoFoi(o.dataHora)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
