import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Bell, Smartphone, Monitor } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NotificationCenter } from './components/NotificationCenter';
import { AvisoDeQueda } from './components/AvisoDeQueda';
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
import { EvolucoesScreen } from './components/clinica/EvolucoesScreen';
import { LinhaDoTempoScreen } from './components/clinica/LinhaDoTempoScreen';
import { RiscosScreen } from './components/clinica/RiscosScreen';
import { ComprasScreen } from './components/ComprasScreen';
import { ContratosScreen } from './components/ContratosScreen';
import { PortalFamilia } from './components/familia/PortalFamilia';
import { TELAS_REGISTRADAS } from './telas';
import { grupoDaTela } from './data/navegacao';
import { areaDaTela, ehTelaFinanceira, getModuleForScreen, perfilSoDaRfc, type Screen } from './data/rbac';
import type { SecaoConfiguracao } from './components/settings/secoes';
import { descricaoDaArea } from '../modulos/financeiro/navegacao';

// O financeiro só é baixado quando alguém abre uma área dele.
const FinanceiroScreen = lazy(() => import('./components/FinanceiroScreen').then((m) => ({ default: m.FinanceiroScreen })));
import { SystemToastProvider, useSystemToast } from './components/ui/SystemToast';
import { TarjaModoTeste } from './components/TarjaModoTeste';
import type { PacienteResumo } from './data/api';
import { useResumoOperacional } from './data/useResumoOperacional';

// Os 6 pacientes ficticios que moravam aqui sairam: a lista do prontuario
// agora vem de GET /api/pacientes, com o cadastro real da clinica.

function AppContent() {
  const { isAuthenticated, isLoading, podeAbrirTela, recordAccess, user } = useAuth();
  const { showToast } = useSystemToast();
  const [route, setRoute] = useState(() => window.location.pathname);
  const [tenant, setTenant] = useState<string | null>(() => localStorage.getItem('tenant'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [menuMovelAberto, setMenuMovelAberto] = useState(false);
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [selectedPatient, setSelectedPatient] = useState<PacienteResumo | null>(null);
  const [secaoConfiguracoes, setSecaoConfiguracoes] = useState<SecaoConfiguracao>('conta');
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

  // Logado, a barra de endereço não fica parada em /login ou /empresa: recarregar
  // a página parecia mandar de volta para a entrada.
  useEffect(() => {
    if (isAuthenticated && (route === '/login' || route === '/empresa')) navigate('/painel', true);
  }, [isAuthenticated, route]);

  // A gaveta do menu (celular e tablet) fecha com Esc, como qualquer janela por cima.
  useEffect(() => {
    if (!menuMovelAberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuMovelAberto(false); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [menuMovelAberto]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fundo-app">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-marca-viva border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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

  // Das telas da clínica direto para o prontuário do paciente clicado.
  const abrirProntuario = (paciente: PacienteResumo) => {
    setSelectedPatient(paciente);
    handleNavigate('pep');
  };

  const handleBackToPatientList = () => {
    setSelectedPatient(null);
  };

  const handleNavigate = (screen: Screen) => {
    if (!podeAbrirTela(screen)) {
      recordAccess({
        action: 'Tentativa de acesso sem permissao',
        module: getModuleForScreen(screen),
        platform: 'web',
        status: 'BLOQUEADO'
      });
      showToast({ variant: 'warning', message: 'Permissão insuficiente para acessar este módulo.' });
      return;
    }
    setCurrentScreen(screen);
  };

  const isScreenAllowed = podeAbrirTela;

  // "Meu perfil" e "Preferências" do menu do avatar abrem Configurações já na
  // seção certa.
  const abrirConfiguracoes = (secao: SecaoConfiguracao) => {
    setSecaoConfiguracoes(secao);
    handleNavigate('settings');
  };

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

                {/* Fora da área que rola: a borda fica presa à tela do aparelho. */}
                <AvisoDeQueda contido />
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
    if (ehTelaFinanceira(currentScreen)) {
      const area = descricaoDaArea(areaDaTela(currentScreen));
      return { title: `Financeiro · ${area.rotulo}`, subtitle: area.descricao };
    }
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
      saude: { title: 'Saúde do Sistema', subtitle: 'Observabilidade da solução em execução' },
      evolucoes: { title: 'Evoluções Clínicas', subtitle: 'Registros da equipe, de todos os pacientes da clínica' },
      'linha-do-tempo': { title: 'Linha do Tempo Clínica', subtitle: 'Ocorrências, evoluções, admissões e altas de toda a clínica' },
      riscos: { title: 'Alergias e Riscos', subtitle: 'O que a equipe precisa saber, por paciente' },
      compras: { title: 'Compras', subtitle: 'Pedidos de compra, da solicitação ao recebimento' },
      contratos: { title: 'Contratos', subtitle: 'Fornecedores, prazos e renovações' }
    };
    
    const registrada = TELAS_REGISTRADAS[currentScreen];
    if (registrada) return { title: registrada.titulo, subtitle: registrada.subtitulo };
    return screenInfo[currentScreen as keyof typeof screenInfo];
  };

  const headerInfo = getHeaderInfo();

  const navegarDoMenu = (tela: Screen) => {
    setMenuMovelAberto(false);
    handleNavigate(tela);
  };

  const menuLateral = (
    <Sidebar
      isCollapsed={sidebarCollapsed}
      onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      currentScreen={currentScreen}
      onNavigate={navegarDoMenu}
      casosAbertos={resumo.casosAbertos}
      alertasCriticos={resumo.alertasCriticos}
      nomeDaClinica={resumo.nomeDaClinica}
    />
  );

  return (
    <div className="min-h-screen bg-fundo-app dark:bg-gray-900 flex transition-colors">
      <TituloDaAba titulo={headerInfo?.title} />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-marca focus:px-4 focus:py-2 focus:text-white">
        Pular para o conteúdo
      </a>

      {/* Menu: fixo ao lado em tela grande; gaveta por cima no celular e no tablet. */}
      <div className="hidden lg:block">{menuLateral}</div>
      {menuMovelAberto && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuMovelAberto(false)} aria-hidden="true" />
          {/* Na gaveta o menu vem sempre aberto, e a seta "‹" fecha a gaveta em vez de encolher. */}
          <div className="relative">
            <Sidebar
              isCollapsed={false}
              onToggleCollapse={() => setMenuMovelAberto(false)}
              currentScreen={currentScreen}
              onNavigate={navegarDoMenu}
              casosAbertos={resumo.casosAbertos}
              alertasCriticos={resumo.alertasCriticos}
              nomeDaClinica={resumo.nomeDaClinica}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header
          title={headerInfo.title}
          grupo={grupoDaTela(currentScreen)}
          unreadNotifications={resumo.alertasCriticos}
          onNotificationClick={() => setNotificationCenterOpen(true)}
          onAbrirConfiguracoes={abrirConfiguracoes}
          onAbrirMenu={() => setMenuMovelAberto(true)}
          // O simulador do app da enfermagem fica de fora para quem só consulta
          // (a banca do TCC): o Header só mostra o botão quando recebe isto.
          onAbrirAppMobile={perfilSoDaRfc(user?.role) ? undefined : () => setViewMode('mobile')}
        />

        {/* Screen Content */}
        <div id="conteudo" tabIndex={-1} className="flex-1 overflow-auto bg-fundo-app dark:bg-gray-900 transition-colors focus:outline-none">
          {!isScreenAllowed(currentScreen) && (
            <div className="p-8">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="text-gray-800 mb-2">Acesso bloqueado</h2>
                <p className="text-sm text-gray-600">
                  Seu perfil não tem permissão para abrir esta tela. Se precisar dela, peça ao administrador da clínica.
                </p>
              </div>
            </div>
          )}
          {isScreenAllowed(currentScreen) && currentScreen === 'dashboard' && <DashboardScreen onNavigate={handleNavigate} />}
          {isScreenAllowed(currentScreen) && currentScreen === 'operational-overview' && <OperationalOverviewScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'monitoring' && <MonitoringScreen aoAbrirPaciente={abrirProntuario} />}
          {isScreenAllowed(currentScreen) && currentScreen === 'alerts' && <AlertsScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'patients' && (
            <PatientsScreen
              // Sem acesso ao prontuário, o cartão do paciente fica sem ação: em
              // vez de um clique que só avisa "permissão insuficiente" e grava
              // uma tentativa de acesso que a pessoa nem fez de propósito.
              aoAbrirPaciente={isScreenAllowed('pep') ? (paciente) => {
                // Abrir o prontuario a partir da gestao de pacientes: os dois
                // caminhos levam ao mesmo lugar, com o mesmo paciente do banco.
                setSelectedPatient(paciente);
                handleNavigate('pep');
              } : undefined}
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
          {isScreenAllowed(currentScreen) && TELAS_REGISTRADAS[currentScreen] && (() => {
            const Tela = TELAS_REGISTRADAS[currentScreen]!.componente;
            return (
              <Suspense fallback={<p className="px-8 py-6 text-sm text-gray-600">Carregando…</p>}>
                <Tela onNavigate={handleNavigate} />
              </Suspense>
            );
          })()}
          {isScreenAllowed(currentScreen) && currentScreen === 'compras' && <ComprasScreen onNavigate={handleNavigate} />}
          {isScreenAllowed(currentScreen) && currentScreen === 'contratos' && <ContratosScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'settings' && (
            <SettingsScreen secao={secaoConfiguracoes} aoTrocarSecao={setSecaoConfiguracoes} onNavigate={handleNavigate} />
          )}
          {isScreenAllowed(currentScreen) && currentScreen === 'users' && <UsersScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'saude' && <SaudeScreen />}
          {isScreenAllowed(currentScreen) && currentScreen === 'evolucoes' && <EvolucoesScreen aoAbrirPaciente={abrirProntuario} />}
          {isScreenAllowed(currentScreen) && currentScreen === 'linha-do-tempo' && <LinhaDoTempoScreen aoAbrirPaciente={abrirProntuario} />}
          {isScreenAllowed(currentScreen) && currentScreen === 'riscos' && <RiscosScreen aoAbrirPaciente={abrirProntuario} />}
          {isScreenAllowed(currentScreen) && ehTelaFinanceira(currentScreen) && (
            <Suspense fallback={<p className="px-8 py-6 text-sm text-gray-500">Carregando o financeiro…</p>}>
              <FinanceiroScreen area={areaDaTela(currentScreen)} aoNavegar={(area) => handleNavigate(`financeiro:${area}`)} />
            </Suspense>
          )}
        </div>
      </div>

      {/* Notification Center */}
      <NotificationCenter 
        isOpen={notificationCenterOpen}
        onClose={() => setNotificationCenterOpen(false)}
      />

      {/* Queda nova leva direto ao monitoramento, onde está a câmera. Só para
          quem pode abrir a tela: para os outros o handleNavigate bloquearia e
          registraria uma tentativa de acesso que a pessoa nem fez. */}
      <AvisoDeQueda
        aoChegarQueda={isScreenAllowed('monitoring') ? () => setCurrentScreen('monitoring') : undefined}
      />

    </div>
  );
}

/**
 * Cada tela com o próprio título na aba do navegador: com várias abas abertas
 * no posto, "MedSignal" em todas não diz qual é qual. É componente, e não hook
 * no AppContent, porque lá o hook ficaria depois dos returns antecipados.
 */
function TituloDaAba({ titulo }: { titulo?: string }) {
  useEffect(() => {
    if (titulo) document.title = `${titulo} · MedSignal`;
  }, [titulo]);
  return null;
}

function App() {
  // Portal da família: público, sem login da equipe. Fica fora do AuthProvider
  // para nenhuma regra de sessão do profissional (redirecionar para /empresa,
  // derrubar no 401) encostar no acesso do acompanhante.
  if (window.location.pathname.startsWith('/familia')) {
    return (
      <ThemeProvider>
        <PortalFamilia />
      </ThemeProvider>
    );
  }

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
