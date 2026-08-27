import React, { useState } from 'react';
import { ArrowLeft, FileText, Download, UserCheck, AlertCircle, Plus, Activity, Clock } from 'lucide-react';
import { OverviewTab } from './tabs/OverviewTab';
import { ClinicalTimelineTab } from './tabs/ClinicalTimelineTab';
import { EvolutionsTab } from './tabs/EvolutionsTab';
import { MedicationsTab } from './tabs/MedicationsTab';
import { ExamsTab } from './tabs/ExamsTab';
import { VitalSignsTab } from './tabs/VitalSignsTab';
import { AIAlertsTab } from './tabs/AIAlertsTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { HistoryTab } from './tabs/HistoryTab';

interface Patient {
  id: number;
  name: string;
  age: number;
  gender: 'M' | 'F';
  room: string;
  bed: string;
  sector: string;
  status: 'stable' | 'attention' | 'critical';
  admissionDate: string;
  activeAlerts: number;
}

interface PEPScreenProps {
  patient: Patient;
  onBack: () => void;
}

type TabType = 'overview' | 'clinical-timeline' | 'evolutions' | 'medications' | 'exams' | 'vitals' | 'ai-alerts' | 'documents' | 'history';

export function PEPScreen({ patient, onBack }: PEPScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const statusConfig = {
    stable: { label: 'Estável', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    attention: { label: 'Atenção', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    critical: { label: 'Crítico', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  };

  const config = statusConfig[patient.status];

  const tabs = [
    { id: 'overview' as const, label: 'Visão Geral', icon: Activity },
    { id: 'clinical-timeline' as const, label: 'Linha do Tempo Clínica', icon: Clock },
    { id: 'evolutions' as const, label: 'Evoluções', icon: FileText },
    { id: 'medications' as const, label: 'Medicações', icon: Plus },
    { id: 'exams' as const, label: 'Exames', icon: FileText },
    { id: 'vitals' as const, label: 'Sinais Vitais', icon: Activity },
    { id: 'ai-alerts' as const, label: 'Alertas & IA', icon: AlertCircle },
    { id: 'documents' as const, label: 'Documentos', icon: FileText },
    { id: 'history' as const, label: 'Histórico Completo', icon: FileText }
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
                {patient.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>

              {/* Info */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl text-gray-800">{patient.name}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm ${config.color} flex items-center gap-2`}>
                    <span className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`}></span>
                    {config.label}
                  </span>
                  {patient.activeAlerts > 0 && (
                    <span className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {patient.activeAlerts} alertas ativos
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-600">
                  <span>{patient.age} anos • {patient.gender === 'M' ? 'Masculino' : 'Feminino'}</span>
                  <span className="flex items-center gap-1">
                    📍 {patient.sector} → {patient.room} → Leito {patient.bed}
                  </span>
                  <span>📅 Internado em {patient.admissionDate}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Nova Evolução
              </button>
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" />
                Exportar
              </button>
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                Alta
              </button>
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

      {/* Tab Content */}
      <div className="px-8 py-6">
        {activeTab === 'overview' && <OverviewTab patient={patient} />}
        {activeTab === 'clinical-timeline' && <ClinicalTimelineTab patient={patient} />}
        {activeTab === 'evolutions' && <EvolutionsTab patient={patient} />}
        {activeTab === 'medications' && <MedicationsTab patient={patient} />}
        {activeTab === 'exams' && <ExamsTab patient={patient} />}
        {activeTab === 'vitals' && <VitalSignsTab patient={patient} />}
        {activeTab === 'ai-alerts' && <AIAlertsTab patient={patient} />}
        {activeTab === 'documents' && <DocumentsTab patient={patient} />}
        {activeTab === 'history' && <HistoryTab patient={patient} />}
      </div>
    </main>
  );
}