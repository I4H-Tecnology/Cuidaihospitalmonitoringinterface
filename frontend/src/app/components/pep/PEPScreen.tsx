import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Download, UserCheck, AlertCircle, Activity, Clock, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { descreverAmbiente, fetchOcorrenciasDoPaciente } from '../../data/api';
import { baixarHistoricoCsv } from '../../data/exportarCsv';
import { ModalAlta } from './ModalAlta';
import { BotaoIndisponivel } from './ForaDoMVP';
import type { OcorrenciaResumo, PacienteResumo } from '../../data/api';
import { OverviewTab } from './tabs/OverviewTab';
import { CompanionsTab } from './tabs/CompanionsTab';
import { HistoryTab } from './tabs/HistoryTab';
import { RoadmapTab } from './tabs/RoadmapTab';

interface PEPScreenProps {
  patient: PacienteResumo;
  onBack: () => void;
}

// Quatro abas: três com dado real e uma que diz, uma vez só, o que ainda
// não existe. Eram nove, seis delas repetindo o mesmo aviso de visão de produto.
type TabType = 'overview' | 'companions' | 'history' | 'roadmap';

export function PEPScreen({ patient, onBack }: PEPScreenProps) {
  const { tenantId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaResumo[]>([]);
  const [paciente, setPaciente] = useState(patient);
  const [modalAlta, setModalAlta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Buscadas uma vez, aqui, e repassadas as abas. Cada aba buscando por conta
  // faria a mesma consulta duas vezes ao alternar entre elas.
  useEffect(() => {
    if (!tenantId) return;
    let vivo = true;
    fetchOcorrenciasDoPaciente(tenantId, paciente.id)
      .then((dados) => vivo && setOcorrencias(dados))
      .catch(() => vivo && setOcorrencias([]));
    return () => { vivo = false; };
  }, [tenantId, paciente.id]);

  const statusConfig = {
    stable: { label: 'Estável', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    attention: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  };

  const config = statusConfig[paciente.situacao];

  const tabs = [
    { id: 'overview' as const, label: 'Visão Geral', icon: Activity },
    { id: 'companions' as const, label: 'Acompanhantes', icon: Users },
    { id: 'history' as const, label: 'Histórico Completo', icon: FileText },
    { id: 'roadmap' as const, label: 'Em breve', icon: Clock }
  ];

  return (
    <main className="flex-1 overflow-auto">
      {/* Fixed Patient Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        {/* Back button row */}
        <div className="px-8 py-3 border-b border-gray-100">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-[#0A7EA4] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Voltar para lista de pacientes</span>
          </button>
        </div>

        {/* Patient Info */}
        <div className="px-8 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-full flex items-center justify-center text-white text-xl">
                {paciente.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>

              {/* Info */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl text-gray-800">{paciente.nome}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm ${config.color} flex items-center gap-2`}>
                    <span className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`}></span>
                    {config.label}
                  </span>
                  {paciente.ocorrenciasAbertas > 0 && (
                    <span className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {paciente.ocorrenciasAbertas} ocorrência(s) em aberto
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600">
                  {paciente.idade != null && <span>{paciente.idade} anos</span>}
                  {paciente.ambienteNome && (
                    <span className="flex items-center gap-1">
                      📍 {descreverAmbiente(paciente.ambienteNome, paciente.ambienteTipo)}
                    </span>
                  )}
                  <span>
                    📅 Internado em {paciente.dataAdmissao.split('-').reverse().join('/')}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Evolução clínica não existe no DER; o botão diz isso em vez
                  de fingir que salva. */}
              <BotaoIndisponivel motivo="Evoluções clínicas estão fora desta versão">
                Nova Evolução
              </BotaoIndisponivel>

              <button
                type="button"
                onClick={() => baixarHistoricoCsv(paciente, ocorrencias)}
                disabled={ocorrencias.length === 0}
                title={
                  ocorrencias.length === 0
                    ? 'Sem ocorrências para exportar'
                    : `Exporta ${ocorrencias.length} ocorrência(s) em CSV`
                }
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700
                           hover:bg-gray-50 transition-colors flex items-center gap-2
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Exportar histórico
              </button>

              {paciente.status === 'internado' ? (
                <button
                  type="button"
                  onClick={() => setModalAlta(true)}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700
                             hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  Registrar saída
                </button>
              ) : (
                <span className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-500">
                  {paciente.status === 'alta' ? 'Alta registrada' : 'Transferido'}
                  {paciente.dataAlta && ` em ${paciente.dataAlta.split('-').reverse().join('/')}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="px-8 overflow-x-auto">
          <div className="flex gap-1 border-b border-gray-200">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm whitespace-nowrap flex items-center gap-2 border-b-2 transition-colors ${
                    isActive
                      ? 'border-[#0EA5E9] text-[#0A7EA4] bg-[#F0F9FF]'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {aviso && (
        <div className="mx-8 mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-800">{aviso}</p>
        </div>
      )}

      {modalAlta && (
        <ModalAlta
          paciente={paciente}
          aoFechar={() => setModalAlta(false)}
          aoConcluir={(resultado) => {
            setPaciente(resultado.paciente);
            setModalAlta(false);
            setAviso(
              `Saída registrada. ${resultado.acessosRevogados} acesso(s) de acompanhante revogado(s).`
            );
          }}
        />
      )}

      {/* Tab Content */}
      <div className="px-8 py-6">
        {activeTab === 'overview' && <OverviewTab paciente={paciente} ocorrencias={ocorrencias} />}
        {activeTab === 'companions' && <CompanionsTab paciente={paciente} />}
        {activeTab === 'history' && <HistoryTab paciente={paciente} ocorrencias={ocorrencias} />}
        {activeTab === 'roadmap' && <RoadmapTab />}
      </div>
    </main>
  );
}