import React, { useEffect, useState } from 'react';
import { Bell, Smartphone, Monitor } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NotificationCenter } from './components/NotificationCenter';
import { AIChatbot } from './components/AIChatbot';
import { MobileApp } from './MobileApp';
import { LoginScreen } from './components/LoginScreen';
import { ForgotPasswordScreen } from './components/ForgotPasswordScreen';
import { CompanySelectScreen } from './components/CompanySelectScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { OperationalOverviewScreen } from './components/OperationalOverviewScreen';
import { MonitoringScreen } from './components/MonitoringScreen';
import { AlertsScreen } from './components/AlertsScreen';
import { PatientsScreen } from './components/PatientsScreen';
import { BedsRoomsScreen } from './components/BedsRoomsScreen';
import { SchedulingScreen } from './components/SchedulingScreen';
import { PatientListScreen } from './components/pep/PatientListScreen';
import { PEPScreen } from './components/pep/PEPScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { UsersScreen } from './components/UsersScreen';
import { HospitalManagementScreen } from './components/HospitalManagementScreen';
import { FinancialScreen } from './components/FinancialScreen';
import { InventoryScreen } from './components/InventoryScreen';
import { HRScreen } from './components/HRScreen';
import { AIAssistant } from './components/AIAssistant';
import { getModuleForScreen, type Screen } from './data/rbac';
import { SystemToastProvider, useSystemToast } from './components/ui/SystemToast';

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

const mockPatients: Patient[] = [
  {
    id: 1,
    name: 'Maria Silva Santos',
    age: 78,
    gender: 'F',
    room: 'Quarto 301',
    bed: 'A',
    sector: 'UTI',
    status: 'critical',
    admissionDate: '18/12/2024',
    activeAlerts: 2
  },
  {
    id: 2,
    name: 'João Pereira Souza',
    age: 65,
    gender: 'M',
    room: 'Quarto 205',
    bed: 'B',
    sector: 'Cardiologia',
    status: 'attention',
    admissionDate: '19/12/2024',
    activeAlerts: 1
  },
  {
    id: 3,
    name: 'Ana Costa Lima',
    age: 82,
    gender: 'F',
    room: 'Quarto 412',
    bed: 'C',
    sector: 'Geriatria',
    status: 'stable',
    admissionDate: '20/12/2024',
    activeAlerts: 0
  },
  {
    id: 4,
    name: 'Carlos Mendes Oliveira',
    age: 70,
    gender: 'M',
    room: 'Quarto 302',
    bed: 'A',
    sector: 'UTI',
    status: 'attention',
    admissionDate: '20/12/2024',
    activeAlerts: 1
  },
  {
    id: 5,
    name: 'Lucia Martins Rocha',
    age: 75,
    gender: 'F',
    room: 'Quarto 206',
    bed: 'A',
    sector: 'Cardiologia',
    status: 'stable',
    admissionDate: '21/12/2024',
    activeAlerts: 0
  },
  {
    id: 6,
    name: 'Roberto Alves Ferreira',
    age: 80,
    gender: 'M',
    room: 'Quarto 410',
    bed: 'B',
    sector: 'Geriatria',
    status: 'stable',
    admissionDate: '21/12/2024',
    activeAlerts: 0
  }
];

function AppContent() {
  const { isAuthenticated, isLoading, can, recordAccess } = useAuth();
  const { showToast } = useSystemToast();
  const [route, setRoute] = useState(() => window.location.pathname);
  const [tenant, setTenant] = useState<string | null>(() => localStorage.getItem('tenant'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string, replace = false) => {
    if (replace) {
      window.history.replaceState({}, '', to);
    } else {
      window.history.pushState({}, '', to);
    }
    setRoute(to);
  };

  useEffect(() => {
    if (route === '/') {
      navigate('/empresa', true);
    }
  }, [route]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (route === '/login' && !tenant) {
        navigate('/empresa', true);
        return;
      }
      if (route !== '/empresa' && route !== '/login' && route !== '/forgot-password') {
        navigate('/empresa', true);
      }
    }
  }, [isAuthenticated, route, tenant]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FBFC]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#0EA5E9] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (route === '/empresa') {
      return (
        <CompanySelectScreen
          onContinue={(selectedTenant) => {
            // Store in localStorage so it survives reloads and can be reused in API headers later.
            localStorage.setItem('tenant', selectedTenant);
            setTenant(selectedTenant);
            navigate('/login');
          }}
        />
      );
    }

    if (route === '/login') {
      return tenant ? <LoginScreen onForgotPassword={() => navigate('/forgot-password')} /> : null;
    }

    if (route === '/forgot-password') {
      return tenant ? <ForgotPasswordScreen onBack={() => navigate('/login')} /> : null;
    }

    return null;
  }

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
  };

  const handleBackToPatientList = () => {
    setSelectedPatient(null);
  };

  const handleNavigate = (screen: Screen) => {
    const module = getModuleForScreen(screen);
    if (!can(module, 'view')) {
      recordAccess({
        action: 'Tentativa de acesso sem permissao',
        module,
        platform: 'web',
        status: 'BLOQUEADO'
      });
      showToast({ variant: 'warning', message: 'Permissão insuficiente para acessar este módulo.' });
      return;
    }
    setCurrentScreen(screen);
  };

  const isScreenAllowed = (screen: Screen) => can(getModuleForScreen(screen), 'view');

  // Mobile view
  if (viewMode === 'mobile') {
    return (
      <div className="relative">
        {/* Mobile simulator frame */}
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
          <div className="relative">
            {/* Phone frame */}
            <div className="w-[375px] h-[812px] bg-black rounded-[3rem] p-3 shadow-2xl">
              <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-50"></div>
                
                {/* Mobile App Content */}
                <div className="w-full h-full overflow-y-auto">
                  <MobileApp />
                </div>
              </div>
            </div>
            
            {/* Toggle button */}
            <button
              onClick={() => setViewMode('web')}
              className="absolute -bottom-16 left-1/2 -translate-x-1/2 bg-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <Monitor className="w-5 h-5" />
              <span>Ver Versão Web</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getHeaderInfo = () => {
    if (currentScreen === 'pep') {
      if (selectedPatient) {
        return {
          title: 'Prontuário Eletrônico',
          subtitle: `Paciente: ${selectedPatient.name}`
        };
      }
      return {
        title: 'Prontuário Eletrônico (PEP)',
        subtitle: 'Selecione um paciente para visualizar o prontuário'
      };
    }
    
    const screenInfo = {
      dashboard: { title: 'Central de Monitoramento', subtitle: 'Acompanhamento em tempo real' },
      'operational-overview': { title: 'Visão Geral Operacional', subtitle: 'Indicadores consolidados da operação' },
      monitoring: { title: 'Monitoramento Inteligente', subtitle: 'Câmeras e Sensores IA' },
      alerts: { title: 'Central de Alertas', subtitle: 'Gestão de Alertas Clínicos' },
      patients: { title: 'Gestão de Pacientes', subtitle: 'Estrutura física e lista de internações' },
      'beds-rooms': { title: 'Leitos e Quartos', subtitle: 'Mapa de ocupação e infraestrutura' },
      scheduling: { title: 'Agendamento', subtitle: 'Gerenciamento de consultas e procedimentos' },
      reports: { title: 'Relatórios', subtitle: 'Análise de dados e relatórios clínicos' },
      settings: { title: 'Configurações', subtitle: 'Ajustes e preferências do sistema' },
      users: { title: 'Usuários', subtitle: 'Gerenciamento de usuários do sistema' },
      'hospital-management': { title: 'Gestão Hospitalar', subtitle: 'Administração e operações do hospital' },
      financial: { title: 'Finanças', subtitle: 'Controle financeiro e orçamentos' },
      inventory: { title: 'Inventário', subtitle: 'Gestão de estoque e equipamentos' },
      hr: { title: 'Recursos Humanos', subtitle: 'Administração de pessoal e contratações' }
    };
    
    return screenInfo[currentScreen as keyof typeof screenInfo];
  };

  const headerInfo = getHeaderInfo();

  return (
    <div className="min-h-screen bg-[#F8FBFC] dark:bg-gray-900 flex transition-colors">
      {/* Sidebar */}
      <Sidebar 
        isCollapsed={sidebarCollapsed} 
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentScreen={currentScreen}
        onNavigate={handleNavigate}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          unreadNotifications={7}
          onNotificationClick={() => setNotificationCenterOpen(true)}
        />

        <div className="flex items-center gap-3 px-8 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setViewMode('mobile')}
            className="px-4 py-2 bg-[#E8F4F8] dark:bg-gray-700 text-[#0A7EA4] dark:text-cyan-400 rounded-lg flex items-center gap-2 hover:bg-[#D6EEF5] dark:hover:bg-gray-600 transition-colors text-sm"
          >
            <Smartphone className="w-4 h-4" />
            <span>Ver App Mobile</span>
          </button>
        </div>

        {/* Screen Content */}
        <div className="flex-1 overflow-auto bg-[#F8FBFC] dark:bg-gray-900 transition-colors">
          {!isScreenAllowed(currentScreen) && (
            <div className="p-8">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="text-gray-800 mb-2">Acesso bloqueado</h2>
                <p className="text-sm text-gray-600">
                  Seu perfil nao possui permissao para acessar este modulo.
                </p>
              </div>
            </div>
          )}
          {isScreenAllowed(currentScreen) && currentScreen === 'dashboard' && <DashboardScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'operational-overview' && <OperationalOverviewScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'monitoring' && <MonitoringScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'alerts' && <AlertsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'patients' && <PatientsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'beds-rooms' && <BedsRoomsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'scheduling' && <SchedulingScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'pep' && !selectedPatient && (
            <PatientListScreen
              patients={mockPatients}
              onSelectPatient={handleSelectPatient}
            />
          )}
          {isScreenAllowed(currentScreen) && currentScreen === 'pep' && selectedPatient && (
            <PEPScreen
              patient={selectedPatient}
              onBack={handleBackToPatientList}
            />
          )}
          {isScreenAllowed(currentScreen) && currentScreen === 'reports' && <ReportsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'settings' && <SettingsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'users' && <UsersScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'hospital-management' && <HospitalManagementScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'financial' && <FinancialScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'inventory' && <InventoryScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'hr' && <HRScreen />}
        </div>
      </div>

      {/* Notification Center */}
      <NotificationCenter 
        isOpen={notificationCenterOpen}
        onClose={() => setNotificationCenterOpen(false)}
      />

      {/* AI Chatbot */}
      <AIChatbot />

      {/* Legacy AI Assistant (can be removed if not needed) */}
      <AIAssistant 
        onNavigate={handleNavigate}
        patients={mockPatients}
        onOpenPatient={handleSelectPatient}
      />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SystemToastProvider>
          <AppContent />
        </SystemToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
