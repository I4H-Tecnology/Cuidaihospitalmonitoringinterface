import React, { useEffect, useState } from 'react';
import { Bell, Smartphone, Monitor } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NotificationCenter } from './components/NotificationCenter';
import { MobileApp } from './MobileApp';
import { LoginScreen } from './components/LoginScreen';
import { CompanySelectScreen } from './components/CompanySelectScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { OperationalOverviewScreen } from './components/OperationalOverviewScreen';
import { MonitoringScreen } from './components/MonitoringScreen';
import { AlertsScreen } from './components/AlertsScreen';
import { PatientsScreen } from './components/PatientsScreen';
import { BedsRoomsScreen } from './components/BedsRoomsScreen';
import { PatientListScreen } from './components/pep/PatientListScreen';
import { PEPScreen } from './components/pep/PEPScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { UsersScreen } from './components/UsersScreen';
import { SaudeScreen } from './components/SaudeScreen';
import { getModuleForScreen, type Screen } from './data/rbac';
import { SystemToastProvider, useSystemToast } from './components/ui/SystemToast';
import { TarjaModoTeste } from './components/TarjaModoTeste';
import type { PacienteResumo } from './data/api';
import { useResumoOperacional } from './data/useResumoOperacional';

// Os 6 pacientes ficticios que moravam aqui sairam: a lista do prontuario
// agora vem de GET /api/pacientes, com o cadastro real da clinica.

function AppContent() {
  const { isAuthenticated, isLoading, can, recordAccess } = useAuth();
  const { showToast } = useSystemToast();
  const [route, setRoute] = useState(() => window.location.pathname);
  const [tenant, setTenant] = useState<string | null>(() => localStorage.getItem('tenant'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [selectedPatient, setSelectedPatient] = useState<PacienteResumo | null>(null);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  // Uma consulta so alimenta sidebar e header. Os numeros vinham fixos
  // do codigo e por isso nao batiam com o que as telas mostravam.
  const resumo = useResumoOperacional(tenant);

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
      if (route !== '/empresa' && route !== '/login') {
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
      return tenant ? <LoginScreen /> : null;
    }

    return null;
  }

  const handleSelectPatient = (patient: PacienteResumo) => {
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
          subtitle: `Paciente: ${selectedPatient.nome}`
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
      'beds-rooms': { title: 'Ambientes Monitorados', subtitle: 'Quartos, câmeras e quem está em cada um' },
      settings: { title: 'Configurações', subtitle: 'Ajustes e preferências do sistema' },
      users: { title: 'Usuários', subtitle: 'Gerenciamento de usuários do sistema' },
      saude: { title: 'Saúde do Sistema', subtitle: 'Observabilidade da solução em execução' }
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
        casosAbertos={resumo.casosAbertos}
        alertasCriticos={resumo.alertasCriticos}
        nomeDaClinica={resumo.nomeDaClinica}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          unreadNotifications={resumo.alertasCriticos}
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
          {isScreenAllowed(currentScreen) && currentScreen === 'dashboard' && <DashboardScreen onNavigate={handleNavigate} />}
          {isScreenAllowed(currentScreen) && currentScreen === 'operational-overview' && <OperationalOverviewScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'monitoring' && <MonitoringScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'alerts' && <AlertsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'patients' && (
            <PatientsScreen
              aoAbrirPaciente={(paciente) => {
                // Abrir o prontuario a partir da gestao de pacientes: os dois
                // caminhos levam ao mesmo lugar, com o mesmo paciente do banco.
                setSelectedPatient(paciente);
                handleNavigate('pep');
              }}
            />
          )}
          {isScreenAllowed(currentScreen) && currentScreen === 'beds-rooms' && <BedsRoomsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'pep' && !selectedPatient && (
            <PatientListScreen onSelectPatient={handleSelectPatient} />
          )}
          {isScreenAllowed(currentScreen) && currentScreen === 'pep' && selectedPatient && (
            <PEPScreen
              patient={selectedPatient}
              onBack={handleBackToPatientList}
            />
          )}
          {isScreenAllowed(currentScreen) && currentScreen === 'settings' && <SettingsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'users' && <UsersScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'saude' && <SaudeScreen />}
        </div>
      </div>

      {/* Notification Center */}
      <NotificationCenter 
        isOpen={notificationCenterOpen}
        onClose={() => setNotificationCenterOpen(false)}
      />

    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SystemToastProvider>
          {/* Acima de tudo, inclusive da tela de login: em modo de teste a
              marcacao precisa aparecer antes mesmo de alguem entrar. */}
          <TarjaModoTeste />
          <AppContent />
        </SystemToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
