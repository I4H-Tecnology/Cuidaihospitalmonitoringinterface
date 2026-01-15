import React, { useState } from 'react';
import { Smartphone, Monitor } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NotificationCenter } from './components/NotificationCenter';
import { AIChatbot } from './components/AIChatbot';
import { MobileApp } from './MobileApp';
import { LoginScreen } from './components/LoginScreen';
import { DashboardScreen } from './components/DashboardScreen';
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

// Mock data e Tipagem (mantidos conforme seu original)
type Screen = 'dashboard' | 'monitoring' | 'alerts' | 'pep' | 'patients' | 'beds-rooms' | 'scheduling' | 'reports' | 'settings' | 'users' | 'hospital-management' | 'financial' | 'inventory' | 'hr';

interface Patient {
  id: number; name: string; age: number; gender: 'M' | 'F'; room: string; bed: string; sector: string; status: 'stable' | 'attention' | 'critical'; admissionDate: string; activeAlerts: number;
}

const mockPatients: Patient[] = [
  { id: 1, name: 'Maria Silva Santos', age: 78, gender: 'F', room: 'Quarto 301', bed: 'A', sector: 'UTI', status: 'critical', admissionDate: '18/12/2024', activeAlerts: 2 }
];

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('web');
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FBFC]">
        <div className="w-16 h-16 border-4 border-[#0EA5E9] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const handleSelectPatient = (patient: Patient) => setSelectedPatient(patient);
  const handleBackToPatientList = () => setSelectedPatient(null);

  if (viewMode === 'mobile') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
        <div className="w-[375px] h-[812px] bg-black rounded-[3rem] p-3 shadow-2xl relative">
          <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden">
            <MobileApp />
          </div>
          <button onClick={() => setViewMode('web')} className="absolute -bottom-16 left-1/2 -translate-x-1/2 bg-white px-6 py-2 rounded-lg flex items-center gap-2">
            <Monitor className="w-5 h-5" /> Web
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FBFC] dark:bg-gray-900 flex">
      <Sidebar isCollapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} currentScreen={currentScreen} onNavigate={setCurrentScreen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Hospital" subtitle="Monitoramento" unreadNotifications={7} onNotificationClick={() => setNotificationCenterOpen(true)} />
        <div className="flex-1 overflow-auto">
          {currentScreen === 'dashboard' && <DashboardScreen />}
          {currentScreen === 'monitoring' && <MonitoringScreen />}
          {currentScreen === 'alerts' && <AlertsScreen />}
          {currentScreen === 'patients' && <PatientsScreen />}
          {currentScreen === 'pep' && !selectedPatient && <PatientListScreen patients={mockPatients} onSelectPatient={handleSelectPatient} />}
          {currentScreen === 'pep' && selectedPatient && <PEPScreen patient={selectedPatient} onBack={handleBackToPatientList} />}
          {/* Adicione os outros filtros conforme necessário */}
        </div>
      </div>
      <NotificationCenter isOpen={notificationCenterOpen} onClose={() => setNotificationCenterOpen(false)} />
      <AIChatbot />
      <AIAssistant onNavigate={setCurrentScreen} patients={mockPatients} onOpenPatient={handleSelectPatient} />
    </div>
  );
}

// O componente App deve ser o ÚNICO export default e ficar no fim do arquivo
export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}
