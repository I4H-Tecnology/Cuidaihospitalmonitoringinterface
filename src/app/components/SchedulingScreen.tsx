import React, { useState } from 'react';
import { Calendar, Clock, User, MapPin, Plus, Search, Filter, Download, Phone, Mail, CheckCircle, XCircle, AlertCircle, Video, Stethoscope } from 'lucide-react';

interface Appointment {
  id: number;
  patientName: string;
  patientAge: number;
  type: 'consulta' | 'cirurgia' | 'exame' | 'telemedicina';
  specialty: string;
  doctor: string;
  date: string;
  time: string;
  duration: number;
  location: string;
  status: 'confirmado' | 'pendente' | 'cancelado' | 'concluido';
  priority: 'normal' | 'urgente';
  contact: string;
  notes?: string;
}

const mockAppointments: Appointment[] = [
  {
    id: 1,
    patientName: 'Maria Silva Santos',
    patientAge: 78,
    type: 'consulta',
    specialty: 'Cardiologia',
    doctor: 'Dr. Carlos Mendes',
    date: '2024-12-26',
    time: '09:00',
    duration: 30,
    location: 'Consultório 205',
    status: 'confirmado',
    priority: 'normal',
    contact: '(11) 98765-4321',
    notes: 'Retorno pós-cirúrgico'
  },
  {
    id: 2,
    patientName: 'João Pereira Souza',
    patientAge: 65,
    type: 'exame',
    specialty: 'Diagnóstico',
    doctor: 'Téc. Ana Costa',
    date: '2024-12-26',
    time: '10:30',
    duration: 45,
    location: 'Sala de Exames 3',
    status: 'confirmado',
    priority: 'urgente',
    contact: '(11) 97654-3210'
  },
  {
    id: 3,
    patientName: 'Ana Costa Lima',
    patientAge: 82,
    type: 'telemedicina',
    specialty: 'Geriatria',
    doctor: 'Dra. Lucia Martins',
    date: '2024-12-26',
    time: '14:00',
    duration: 20,
    location: 'Online',
    status: 'pendente',
    priority: 'normal',
    contact: '(11) 96543-2109'
  },
  {
    id: 4,
    patientName: 'Carlos Oliveira',
    patientAge: 70,
    type: 'cirurgia',
    specialty: 'Ortopedia',
    doctor: 'Dr. Roberto Alves',
    date: '2024-12-27',
    time: '08:00',
    duration: 120,
    location: 'Centro Cirúrgico 2',
    status: 'confirmado',
    priority: 'urgente',
    contact: '(11) 95432-1098',
    notes: 'Prótese de quadril - Jejum obrigatório'
  },
  {
    id: 5,
    patientName: 'Helena Ferreira',
    patientAge: 58,
    type: 'consulta',
    specialty: 'Endocrinologia',
    doctor: 'Dra. Patricia Lima',
    date: '2024-12-26',
    time: '11:00',
    duration: 30,
    location: 'Consultório 308',
    status: 'cancelado',
    priority: 'normal',
    contact: '(11) 94321-0987'
  },
  {
    id: 6,
    patientName: 'Pedro Santos',
    patientAge: 45,
    type: 'exame',
    specialty: 'Cardiologia',
    doctor: 'Dr. Fernando Costa',
    date: '2024-12-26',
    time: '15:30',
    duration: 60,
    location: 'Sala de Exames 1',
    status: 'confirmado',
    priority: 'normal',
    contact: '(11) 93210-9876',
    notes: 'Teste ergométrico - Trazer roupa adequada'
  }
];

const timeSlots = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00'
];

export function SchedulingScreen() {
  const [selectedDate, setSelectedDate] = useState('2024-12-26');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [filterType, setFilterType] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAppointments = mockAppointments.filter(apt => {
    const matchesSearch = apt.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         apt.doctor.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'todos' || apt.type === filterType;
    const matchesStatus = filterStatus === 'todos' || apt.status === filterStatus;
    const matchesDate = viewMode === 'list' || apt.date === selectedDate;
    
    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  const todayAppointments = mockAppointments.filter(apt => apt.date === selectedDate);
  const confirmedCount = todayAppointments.filter(a => a.status === 'confirmado').length;
  const pendingCount = todayAppointments.filter(a => a.status === 'pendente').length;
  const urgentCount = todayAppointments.filter(a => a.priority === 'urgente').length;

  const typeConfig = {
    consulta: { icon: Stethoscope, color: 'bg-blue-100 text-blue-700', label: 'Consulta' },
    cirurgia: { icon: AlertCircle, color: 'bg-red-100 text-red-700', label: 'Cirurgia' },
    exame: { icon: Clock, color: 'bg-purple-100 text-purple-700', label: 'Exame' },
    telemedicina: { icon: Video, color: 'bg-green-100 text-green-700', label: 'Telemedicina' }
  };

  const statusConfig = {
    confirmado: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Confirmado' },
    pendente: { icon: Clock, color: 'bg-yellow-100 text-yellow-700', label: 'Pendente' },
    cancelado: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Cancelado' },
    concluido: { icon: CheckCircle, color: 'bg-gray-100 text-gray-700', label: 'Concluído' }
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-gray-800 mb-1">Agendamentos</h1>
            <p className="text-sm text-gray-500">Gerenciamento de consultas, cirurgias e exames</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4 text-gray-600" />
              Exportar
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Plus className="w-4 h-4" />
              Novo Agendamento
            </button>
          </div>
        </div>

        {/* View Toggle & Filters */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-md text-sm transition-colors ${
                  viewMode === 'calendar' ? 'bg-[#0EA5E9] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Calendar className="w-4 h-4 inline mr-2" />
                Calendário
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-md text-sm transition-colors ${
                  viewMode === 'list' ? 'bg-[#0EA5E9] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Lista
              </button>
            </div>

            {viewMode === 'calendar' && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700"
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar paciente ou médico..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-64"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700"
            >
              <option value="todos">Todos os Tipos</option>
              <option value="consulta">Consultas</option>
              <option value="cirurgia">Cirurgias</option>
              <option value="exame">Exames</option>
              <option value="telemedicina">Telemedicina</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700"
            >
              <option value="todos">Todos os Status</option>
              <option value="confirmado">Confirmados</option>
              <option value="pendente">Pendentes</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-8 h-8 text-blue-600" />
          </div>
          <p className="text-2xl text-gray-800">{todayAppointments.length}</p>
          <p className="text-xs text-gray-600">Agendamentos Hoje</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-2xl text-gray-800">{confirmedCount}</p>
          <p className="text-xs text-gray-600">Confirmados</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg border border-yellow-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
          <p className="text-2xl text-gray-800">{pendingCount}</p>
          <p className="text-xs text-gray-600">Aguardando Confirmação</p>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-pink-50 rounded-lg border border-red-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <span className="text-xs text-red-700">Urgente</span>
          </div>
          <p className="text-2xl text-gray-800">{urgentCount}</p>
          <p className="text-xs text-gray-600">Prioritários</p>
        </div>
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-gray-800 mb-4">
            Agenda do Dia - {new Date(selectedDate).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          
          <div className="space-y-2">
            {timeSlots.map(time => {
              const appointment = filteredAppointments.find(apt => apt.time === time);
              
              return (
                <div key={time} className="flex items-center gap-4">
                  <div className="w-16 text-sm text-gray-500 font-medium">{time}</div>
                  <div className="flex-1">
                    {appointment ? (
                      <div className={`p-4 rounded-lg border-l-4 ${
                        appointment.priority === 'urgente' ? 'border-red-500 bg-red-50' : 'border-blue-500 bg-blue-50'
                      } hover:shadow-md transition-shadow cursor-pointer`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-gray-800 font-medium">{appointment.patientName}</h3>
                              <span className={`px-2 py-1 rounded-full text-xs ${typeConfig[appointment.type].color}`}>
                                {typeConfig[appointment.type].label}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs ${statusConfig[appointment.status].color}`}>
                                {statusConfig[appointment.status].label}
                              </span>
                              {appointment.priority === 'urgente' && (
                                <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">Urgente</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {appointment.doctor}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {appointment.location}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {appointment.duration} min
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-4 h-4" />
                                {appointment.contact}
                              </span>
                            </div>
                            {appointment.notes && (
                              <p className="mt-2 text-xs text-gray-500 italic">{appointment.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {appointment.type === 'telemedicina' && (
                              <button className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 transition-colors">
                                Iniciar Chamada
                              </button>
                            )}
                            <button className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition-colors">
                              Ver Detalhes
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 border border-dashed border-gray-300 rounded-lg text-center text-sm text-gray-400 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer">
                        Horário disponível
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-gray-800">Todos os Agendamentos ({filteredAppointments.length})</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Paciente</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Especialidade</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Profissional</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Data/Hora</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Local</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAppointments.map(apt => {
                const TypeIcon = typeConfig[apt.type].icon;
                const StatusIcon = statusConfig[apt.status].icon;
                
                return (
                  <tr key={apt.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-800 font-medium">{apt.patientName}</p>
                      <p className="text-xs text-gray-500">{apt.patientAge} anos</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${typeConfig[apt.type].color}`}>
                        <TypeIcon className="w-3 h-3" />
                        {typeConfig[apt.type].label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{apt.specialty}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{apt.doctor}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-800">{new Date(apt.date).toLocaleDateString('pt-BR')}</p>
                      <p className="text-xs text-gray-500">{apt.time} ({apt.duration} min)</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{apt.location}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${statusConfig[apt.status].color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig[apt.status].label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {apt.type === 'telemedicina' && apt.status === 'confirmado' && (
                          <button className="p-1 bg-green-100 rounded hover:bg-green-200 transition-colors" title="Iniciar videochamada">
                            <Video className="w-4 h-4 text-green-700" />
                          </button>
                        )}
                        <button className="p-1 bg-blue-100 rounded hover:bg-blue-200 transition-colors" title="Ligar">
                          <Phone className="w-4 h-4 text-blue-700" />
                        </button>
                        <button className="p-1 bg-purple-100 rounded hover:bg-purple-200 transition-colors" title="Email">
                          <Mail className="w-4 h-4 text-purple-700" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
