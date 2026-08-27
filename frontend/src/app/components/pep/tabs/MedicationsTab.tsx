import React, { useState } from 'react';
import { Plus, Clock, CheckCircle, AlertTriangle, XCircle, FileText, Edit, Ban, History, User, Calendar, Eye, MessageSquare, Pause } from 'lucide-react';

interface Patient {
  id: number;
  name: string;
}

interface MedicationsTabProps {
  patient: Patient;
}

interface MedicationSchedule {
  time: string;
  status: 'administered' | 'pending' | 'delayed' | 'suspended';
  administeredBy?: string;
  administeredAt?: string;
  observation?: string;
  suspendedReason?: string;
}

interface Medication {
  id: number;
  name: string;
  dose: string;
  route: 'VO' | 'EV' | 'IM' | 'SC' | 'SL' | 'Tópico' | 'Inalatório';
  frequency: string;
  prescribedBy: string;
  prescribedDate: string;
  status: 'active' | 'suspended' | 'completed';
  schedules: MedicationSchedule[];
  aiWarning?: string;
  interactions?: string[];
}

interface MedicationHistory {
  id: number;
  medicationName: string;
  action: 'administered' | 'suspended' | 'prescribed' | 'changed';
  date: string;
  time: string;
  professional: string;
  details: string;
}

const mockMedications: Medication[] = [
  {
    id: 1,
    name: 'Omeprazol',
    dose: '40mg',
    route: 'VO',
    frequency: '1x ao dia',
    prescribedBy: 'Dr. Carlos Silva',
    prescribedDate: '20/12/2024',
    status: 'active',
    schedules: [
      { 
        time: '08:00', 
        status: 'administered', 
        administeredBy: 'Enf. Maria Santos', 
        administeredAt: '08:05',
        observation: 'Paciente aceitou bem a medicação'
      },
      { time: '20:00', status: 'pending' }
    ]
  },
  {
    id: 2,
    name: 'Losartana Potássica',
    dose: '50mg',
    route: 'VO',
    frequency: '1x ao dia',
    prescribedBy: 'Dr. Carlos Silva',
    prescribedDate: '20/12/2024',
    status: 'active',
    schedules: [
      { 
        time: '08:00', 
        status: 'administered', 
        administeredBy: 'Enf. Maria Santos', 
        administeredAt: '08:10' 
      },
      { time: '20:00', status: 'pending' }
    ],
    interactions: ['Pode causar hipotensão se associado a diuréticos']
  },
  {
    id: 3,
    name: 'Metformina',
    dose: '850mg',
    route: 'VO',
    frequency: '2x ao dia',
    prescribedBy: 'Dr. Carlos Silva',
    prescribedDate: '20/12/2024',
    status: 'active',
    schedules: [
      { 
        time: '08:00', 
        status: 'administered', 
        administeredBy: 'Enf. João Costa', 
        administeredAt: '08:15' 
      },
      { time: '20:00', status: 'pending' }
    ]
  },
  {
    id: 4,
    name: 'Dipirona Sódica',
    dose: '1g',
    route: 'VO',
    frequency: 'Se necessário (dor)',
    prescribedBy: 'Dr. Carlos Silva',
    prescribedDate: '20/12/2024',
    status: 'active',
    schedules: [
      { time: 'SN', status: 'pending' }
    ],
    aiWarning: 'Paciente sem queixa álgica nas últimas 12h'
  },
  {
    id: 5,
    name: 'AAS (Ácido Acetilsalicílico)',
    dose: '100mg',
    route: 'VO',
    frequency: '1x ao dia',
    prescribedBy: 'Dr. Carlos Silva',
    prescribedDate: '20/12/2024',
    status: 'active',
    schedules: [
      { 
        time: '08:00', 
        status: 'delayed', 
        administeredBy: 'Enf. Ana Paula', 
        administeredAt: '09:30',
        observation: 'Atraso devido a procedimento no horário programado'
      },
      { time: '20:00', status: 'pending' }
    ],
    aiWarning: 'Administração anterior com 1h30min de atraso'
  },
  {
    id: 6,
    name: 'Insulina NPH',
    dose: '12 UI',
    route: 'SC',
    frequency: '2x ao dia',
    prescribedBy: 'Dr. Carlos Silva',
    prescribedDate: '20/12/2024',
    status: 'active',
    schedules: [
      { 
        time: '07:00', 
        status: 'administered', 
        administeredBy: 'Enf. João Costa', 
        administeredAt: '07:05',
        observation: 'Aplicado em região abdominal'
      },
      { time: '19:00', status: 'pending' }
    ],
    aiWarning: 'Horário próximo à coleta de exame - verificar necessidade de ajuste'
  },
  {
    id: 7,
    name: 'Soro Fisiológico 0,9%',
    dose: '500ml',
    route: 'EV',
    frequency: 'Contínuo',
    prescribedBy: 'Dr. Carlos Silva',
    prescribedDate: '20/12/2024',
    status: 'active',
    schedules: [
      { 
        time: 'Contínuo', 
        status: 'administered', 
        administeredBy: 'Enf. Maria Santos', 
        administeredAt: '06:00',
        observation: 'Infusão em andamento - 40 gotas/min'
      }
    ]
  },
  {
    id: 8,
    name: 'Captopril',
    dose: '25mg',
    route: 'SL',
    frequency: 'Se PA > 160/100',
    prescribedBy: 'Dr. Carlos Silva',
    prescribedDate: '20/12/2024',
    status: 'suspended',
    schedules: [
      { 
        time: 'SN', 
        status: 'suspended',
        suspendedReason: 'PA controlada - medicação de uso contínuo suficiente'
      }
    ]
  }
];

const mockHistory: MedicationHistory[] = [
  {
    id: 1,
    medicationName: 'Omeprazol 40mg',
    action: 'administered',
    date: '21/12/2024',
    time: '08:05',
    professional: 'Enf. Maria Santos',
    details: 'Administrado conforme prescrição - Via Oral'
  },
  {
    id: 2,
    medicationName: 'Losartana Potássica 50mg',
    action: 'administered',
    date: '21/12/2024',
    time: '08:10',
    professional: 'Enf. Maria Santos',
    details: 'Administrado conforme prescrição - Via Oral'
  },
  {
    id: 3,
    medicationName: 'Captopril 25mg',
    action: 'suspended',
    date: '21/12/2024',
    time: '07:00',
    professional: 'Dr. Carlos Silva',
    details: 'Suspensão: PA controlada com medicação de uso contínuo'
  },
  {
    id: 4,
    medicationName: 'Insulina NPH 12 UI',
    action: 'administered',
    date: '21/12/2024',
    time: '07:05',
    professional: 'Enf. João Costa',
    details: 'Administrado SC em região abdominal'
  },
  {
    id: 5,
    medicationName: 'Omeprazol 40mg',
    action: 'prescribed',
    date: '20/12/2024',
    time: '16:00',
    professional: 'Dr. Carlos Silva',
    details: 'Prescrição inicial - 1x ao dia'
  }
];

export function MedicationsTab({ patient }: MedicationsTabProps) {
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<MedicationSchedule | null>(null);
  const [observation, setObservation] = useState('');
  const [suspendReason, setSuspendReason] = useState('');

  const statusConfig = {
    administered: { 
      label: 'Administrada', 
      color: 'bg-green-100 text-green-700 border-green-200',
      icon: <CheckCircle className="w-4 h-4" />
    },
    pending: { 
      label: 'Pendente', 
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <Clock className="w-4 h-4" />
    },
    delayed: { 
      label: 'Atrasada', 
      color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      icon: <AlertTriangle className="w-4 h-4" />
    },
    suspended: { 
      label: 'Suspensa', 
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: <Ban className="w-4 h-4" />
    }
  };

  const routeIcons = {
    'VO': '💊',
    'EV': '💉',
    'IM': '💉',
    'SC': '💉',
    'SL': '💊',
    'Tópico': '🧴',
    'Inalatório': '🌬️'
  };

  const activeMedications = mockMedications.filter(m => m.status === 'active');
  const suspendedMedications = mockMedications.filter(m => m.status === 'suspended');
  
  const totalMedications = activeMedications.length;
  const administered = activeMedications.reduce((acc, med) => 
    acc + med.schedules.filter(s => s.status === 'administered').length, 0
  );
  const pending = activeMedications.reduce((acc, med) => 
    acc + med.schedules.filter(s => s.status === 'pending').length, 0
  );
  const delayed = activeMedications.reduce((acc, med) => 
    acc + med.schedules.filter(s => s.status === 'delayed').length, 0
  );

  const handleRegisterAdministration = (med: Medication, schedule: MedicationSchedule) => {
    setSelectedMedication(med);
    setSelectedSchedule(schedule);
    setShowAdminModal(true);
  };

  const handleSuspendMedication = (med: Medication) => {
    setSelectedMedication(med);
    setShowSuspendModal(true);
  };

  const confirmAdministration = () => {
    console.log('Administração registrada:', {
      medication: selectedMedication?.name,
      time: selectedSchedule?.time,
      observation,
      professional: 'Enf. Atual',
      timestamp: new Date().toISOString()
    });
    setShowAdminModal(false);
    setObservation('');
  };

  const confirmSuspension = () => {
    console.log('Suspensão registrada:', {
      medication: selectedMedication?.name,
      reason: suspendReason,
      professional: 'Profissional Atual',
      timestamp: new Date().toISOString()
    });
    setShowSuspendModal(false);
    setSuspendReason('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800 mb-1">eMAR - Registro de Medicações</h2>
          <p className="text-sm text-gray-500">Data: 21/12/2024 | Prescrição ativa</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            {showHistory ? 'Ocultar Histórico' : 'Ver Histórico'}
          </button>
          <button className="px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nova Prescrição
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Medicações Ativas</p>
          <p className="text-3xl text-gray-800">{totalMedications}</p>
          <p className="text-xs text-gray-400 mt-1">Prescrição atual</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-green-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Administradas Hoje</p>
          <p className="text-3xl text-gray-800">{administered}</p>
          <p className="text-xs text-gray-400 mt-1">Últimas 24h</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-gray-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Pendentes</p>
          <p className="text-3xl text-gray-800">{pending}</p>
          <p className="text-xs text-gray-400 mt-1">Aguardando administração</p>
        </div>
        <div className="bg-white rounded-lg border-l-4 border-l-yellow-500 p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Atrasadas</p>
          <p className="text-3xl text-gray-800">{delayed}</p>
          <p className="text-xs text-gray-400 mt-1">Requer atenção</p>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <h3 className="text-gray-800 flex items-center gap-2">
              <History className="w-5 h-5 text-[#0A7EA4]" />
              Histórico de Medicações
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {mockHistory.map(item => (
              <div key={item.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        item.action === 'administered' ? 'bg-green-100 text-green-700' :
                        item.action === 'suspended' ? 'bg-red-100 text-red-700' :
                        item.action === 'prescribed' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {item.action === 'administered' ? '✓ Administrado' :
                         item.action === 'suspended' ? '⏸ Suspenso' :
                         item.action === 'prescribed' ? '📋 Prescrito' : '✏️ Alterado'}
                      </span>
                      <span className="text-xs text-gray-500">{item.date} às {item.time}</span>
                    </div>
                    <p className="text-sm text-gray-800 mb-1">{item.medicationName}</p>
                    <p className="text-xs text-gray-600">{item.details}</p>
                    <p className="text-xs text-gray-500 mt-1">👤 {item.professional}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Medications List */}
      <div>
        <h3 className="text-gray-700 mb-3 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500" />
          Medicações Ativas ({activeMedications.length})
        </h3>
        <div className="space-y-3">
          {activeMedications.map(medication => (
            <div key={medication.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              {/* Medication Header */}
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-gray-800">{medication.name}</h3>
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                        ✓ Ativa
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        {routeIcons[medication.route]} <strong>Dose:</strong> {medication.dose}
                      </span>
                      <span className="flex items-center gap-1">
                        📍 <strong>Via:</strong> {medication.route}
                      </span>
                      <span className="flex items-center gap-1">
                        ⏱️ <strong>Frequência:</strong> {medication.frequency}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Prescrito por: {medication.prescribedBy} em {medication.prescribedDate}
                    </p>

                    {/* Interactions Warning */}
                    {medication.interactions && medication.interactions.length > 0 && (
                      <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                        <p className="text-xs text-orange-800">
                          <strong>⚠️ Interação:</strong> {medication.interactions[0]}
                        </p>
                      </div>
                    )}

                    {/* AI Warning */}
                    {medication.aiWarning && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-800">
                          <strong>🤖 Assistente IA:</strong> {medication.aiWarning}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleSuspendMedication(medication)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Suspender medicação"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-gray-400 hover:text-[#0A7EA4] hover:bg-blue-50 rounded-lg transition-colors" title="Ver detalhes">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Schedules */}
              <div className="px-5 py-4">
                <p className="text-xs text-gray-500 mb-3">Horários de Administração:</p>
                <div className="grid grid-cols-4 gap-3">
                  {medication.schedules.map((schedule, index) => {
                    const config = statusConfig[schedule.status];
                    
                    return (
                      <div 
                        key={index}
                        className={`rounded-lg border-2 ${config.color} p-3`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {config.icon}
                          <span className="text-sm font-medium">{schedule.time}</span>
                        </div>
                        <p className="text-xs mb-2">{config.label}</p>
                        
                        {schedule.administeredBy && (
                          <div className="text-xs text-gray-600 space-y-1 mb-2">
                            <p className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {schedule.administeredBy}
                            </p>
                            <p className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {schedule.administeredAt}
                            </p>
                            {schedule.observation && (
                              <p className="flex items-start gap-1 mt-2 pt-2 border-t border-gray-200">
                                <MessageSquare className="w-3 h-3 mt-0.5" />
                                <span className="text-xs">{schedule.observation}</span>
                              </p>
                            )}
                          </div>
                        )}
                        
                        {schedule.status === 'pending' && (
                          <div className="space-y-2">
                            <button 
                              onClick={() => handleRegisterAdministration(medication, schedule)}
                              className="w-full px-3 py-2 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition-colors flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" />
                              Registrar Administração
                            </button>
                          </div>
                        )}

                        {schedule.status === 'delayed' && schedule.observation && (
                          <div className="mt-2 pt-2 border-t border-yellow-200">
                            <p className="text-xs text-yellow-700">
                              💡 {schedule.observation}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suspended Medications */}
      {suspendedMedications.length > 0 && (
        <div>
          <h3 className="text-gray-700 mb-3 flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-500" />
            Medicações Suspensas ({suspendedMedications.length})
          </h3>
          <div className="space-y-2">
            {suspendedMedications.map(medication => (
              <div key={medication.id} className="bg-red-50 rounded-lg border border-red-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-gray-800">{medication.name} {medication.dose}</h4>
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                        ⏸ Suspensa
                      </span>
                    </div>
                    {medication.schedules[0].suspendedReason && (
                      <p className="text-sm text-red-700 mt-2">
                        <strong>Motivo:</strong> {medication.schedules[0].suspendedReason}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Prescrito por: {medication.prescribedBy}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Administration Modal */}
      {showAdminModal && selectedMedication && selectedSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-white">Registrar Administração</h3>
              <button onClick={() => setShowAdminModal(false)} className="text-white hover:bg-white/20 rounded-lg p-1">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Medicamento:</p>
                <p className="text-gray-800"><strong>{selectedMedication.name}</strong> {selectedMedication.dose}</p>
                <p className="text-sm text-gray-600 mt-2">
                  Via: {selectedMedication.route} | Horário: {selectedSchedule.time}
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Profissional:</label>
                <input
                  type="text"
                  value="Enf. [Nome do profissional atual]"
                  disabled
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Data e Hora da Administração:</label>
                <input
                  type="text"
                  value={new Date().toLocaleString('pt-BR')}
                  disabled
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Observações (opcional):
                </label>
                <textarea
                  rows={3}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Ex: Paciente aceitou bem a medicação, sem queixas..."
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  ℹ️ Este registro será automaticamente adicionado à Timeline Clínica e ficará disponível para auditoria.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAdminModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAdministration}
                className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Confirmar Administração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {showSuspendModal && selectedMedication && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-white">Suspender Medicação</h3>
              <button onClick={() => setShowSuspendModal(false)} className="text-white hover:bg-white/20 rounded-lg p-1">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Medicamento:</p>
                <p className="text-gray-800"><strong>{selectedMedication.name}</strong> {selectedMedication.dose}</p>
                <p className="text-sm text-gray-600 mt-2">
                  Via: {selectedMedication.route} | Frequência: {selectedMedication.frequency}
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Motivo da Suspensão: <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Descreva o motivo da suspensão da medicação..."
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800">
                  ⚠️ A suspensão de medicação é uma ação crítica e será registrada na Timeline Clínica para auditoria.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSuspendModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmSuspension}
                disabled={!suspendReason.trim()}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Ban className="w-4 h-4" />
                Confirmar Suspensão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
