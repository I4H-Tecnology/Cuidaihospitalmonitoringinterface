import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FileText, Download, UserCheck, AlertCircle, Activity, Clock, Users, ShieldAlert, Plus, History, Pill, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { descreverAmbiente, fetchEvolucoes, fetchOcorrenciasDoPaciente, fetchPrescricoes, fetchRiscos } from '../../data/api';
import { baixarHistoricoCsv } from '../../data/exportarCsv';
import { ModalAlta } from './ModalAlta';
import { ModalPaciente } from './ModalPaciente';
import type { EvolucaoResumo, OcorrenciaResumo, PacienteResumo, PrescricaoResumo, RiscoResumo } from '../../data/api';
import { OverviewTab } from './tabs/OverviewTab';
import { EvolutionsTab } from './tabs/EvolutionsTab';
import { ClinicalTimelineTab } from './tabs/ClinicalTimelineTab';
import { AllergiesTab } from './tabs/AllergiesTab';
import { MedicationsTab } from './tabs/MedicationsTab';
import { CompanionsTab } from './tabs/CompanionsTab';
import { HistoryTab } from './tabs/HistoryTab';
import { RoadmapTab } from './tabs/RoadmapTab';

interface PEPScreenProps {
  patient: PacienteResumo;
  onBack: () => void;
}

// Sete abas: seis com dado real e uma que diz, uma vez só, o que ainda não
// existe. Evoluções, linha do tempo e alergias entraram em 13/09/2026 por
// decisão de produto, além do MVP avaliado na RFC (seção 2.6; errata pendente).
type TabType = 'overview' | 'evolutions' | 'timeline' | 'allergies' | 'medications' | 'companions' | 'history' | 'roadmap';

export function PEPScreen({ patient, onBack }: PEPScreenProps) {
  const { tenantId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaResumo[]>([]);
  const [paciente, setPaciente] = useState(patient);
  const [modalAlta, setModalAlta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [evolucoes, setEvolucoes] = useState<EvolucaoResumo[]>([]);
  const [riscos, setRiscos] = useState<RiscoResumo[]>([]);
  const [prescricoes, setPrescricoes] = useState<PrescricaoResumo[]>([]);
  const [modalEditar, setModalEditar] = useState(false);
  const [carregandoProntuario, setCarregandoProntuario] = useState(true);
  const [focarEvolucao, setFocarEvolucao] = useState(false);

  // Evoluções e riscos: buscados aqui e repassados, porque três abas os usam
  // (evoluções, linha do tempo, alergias) e o cabeçalho mostra alergia grave.
  const carregarProntuario = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [e, r, pr] = await Promise.all([
        fetchEvolucoes(tenantId, paciente.id),
        fetchRiscos(tenantId, paciente.id, true),
        fetchPrescricoes(tenantId, paciente.id, true),
      ]);
      setEvolucoes(e);
      setRiscos(r);
      setPrescricoes(pr);
    } catch {
      // Perfil sem acesso ao prontuário clínico (ou API fora): as abas mostram
      // vazio e o cabeçalho não acusa alergia que não pôde ler.
      setEvolucoes([]);
      setRiscos([]);
      setPrescricoes([]);
    } finally {
      setCarregandoProntuario(false);
    }
  }, [tenantId, paciente.id]);

  useEffect(() => {
    carregarProntuario();
  }, [carregarProntuario]);

  const alergiasGraves = riscos.filter((r) => r.ativo && r.tipo === 'alergia' && r.gravidade === 'grave');

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
    { id: 'evolutions' as const, label: 'Evoluções', icon: FileText },
    { id: 'timeline' as const, label: 'Linha do Tempo', icon: History },
    { id: 'allergies' as const, label: 'Alergias & Riscos', icon: ShieldAlert },
    { id: 'medications' as const, label: 'Medicações', icon: Pill },
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
              <button
                type="button"
                onClick={() => setModalEditar(true)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700
                           hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Editar paciente
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('evolutions'); setFocarEvolucao(true); }}
                className="px-4 py-2 bg-[#0A7EA4] text-white rounded-lg text-sm hover:bg-[#0EA5E9]
                           transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nova Evolução
              </button>

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

      {/* Alergia grave ativa aparece onde ninguém deixa de ver, não só na aba. */}
      {alergiasGraves.length > 0 && (
        <div role="alert" className="mx-8 mt-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <p className="text-sm text-red-800">
            <strong>Alergia grave:</strong> {alergiasGraves.map((r) => r.descricao).join(', ')}.
          </p>
        </div>
      )}

      {aviso && (
        <div className="mx-8 mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-800">{aviso}</p>
        </div>
      )}

      {modalEditar && (
        <ModalPaciente
          paciente={paciente}
          aoFechar={() => setModalEditar(false)}
          aoSalvar={(atualizado, avisos) => {
            setPaciente(atualizado);
            setModalEditar(false);
            carregarProntuario();
            setAviso(avisos.length ? avisos.join(' ') : 'Cadastro atualizado.');
          }}
        />
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
        {activeTab === 'evolutions' && (
          <EvolutionsTab
            paciente={paciente}
            evolucoes={evolucoes}
            carregando={carregandoProntuario}
            aoRegistrar={carregarProntuario}
            focarFormulario={focarEvolucao}
          />
        )}
        {activeTab === 'timeline' && (
          <ClinicalTimelineTab paciente={paciente} ocorrencias={ocorrencias} evolucoes={evolucoes} carregando={carregandoProntuario} />
        )}
        {activeTab === 'allergies' && (
          <AllergiesTab paciente={paciente} riscos={riscos} carregando={carregandoProntuario} aoMudar={carregarProntuario} />
        )}
        {activeTab === 'medications' && (
          <MedicationsTab paciente={paciente} prescricoes={prescricoes} carregando={carregandoProntuario} aoMudar={carregarProntuario} />
        )}
        {activeTab === 'companions' && <CompanionsTab paciente={paciente} />}
        {activeTab === 'history' && <HistoryTab paciente={paciente} ocorrencias={ocorrencias} />}
        {activeTab === 'roadmap' && <RoadmapTab />}
      </div>
    </main>
  );
}