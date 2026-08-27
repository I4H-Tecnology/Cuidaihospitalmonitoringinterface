import React, { useState } from 'react';
import { MobileHeader } from './components/mobile/MobileHeader';
import { MobileBottomNav } from './components/mobile/MobileBottomNav';
import { HomeScreen } from './components/mobile/HomeScreen';
import { RoomsScreen } from './components/mobile/RoomsScreen';
import { MessagesScreen } from './components/mobile/MessagesScreen';
import { PatientDetailScreen } from './components/mobile/PatientDetailScreen';
import { AlertsScreen } from './components/mobile/AlertsScreen';
import { ReportsScreen } from './components/mobile/ReportsScreen';
import { AIAssistant } from './components/AIAssistant';

import type { MobilePatient as Patient } from './components/mobile/types';

const mockPatients: Patient[] = [
  {
    id: 1,
    name: 'Maria Silva Santos',
    age: 78,
    room: 'Quarto 301',
    bed: 'A',
    status: 'critical',
    heartRate: 125,
    temperature: 38.5,
    bloodPressure: '145/92',
    lastUpdate: 'há 2 min'
  },
  {
    id: 2,
    name: 'João Pereira Souza',
    age: 65,
    room: 'Quarto 205',
    bed: 'B',
    status: 'attention',
    heartRate: 95,
    temperature: 37.8,
    bloodPressure: '132/85',
    lastUpdate: 'há 5 min'
  },
  {
    id: 3,
    name: 'Ana Costa Lima',
    age: 82,
    room: 'Quarto 412',
    bed: 'C',
    status: 'normal',
    heartRate: 72,
    temperature: 36.5,
    bloodPressure: '120/80',
    lastUpdate: 'há 8 min'
  },
  {
    id: 4,
    name: 'Carlos Mendes Oliveira',
    age: 70,
    room: 'Quarto 302',
    bed: 'A',
    status: 'attention',
    heartRate: 88,
    temperature: 37.2,
    bloodPressure: '138/88',
    lastUpdate: 'há 3 min'
  },
  {
    id: 5,
    name: 'Lucia Martins Rocha',
    age: 75,
    room: 'Quarto 206',
    bed: 'A',
    status: 'normal',
    heartRate: 68,
    temperature: 36.7,
    bloodPressure: '118/75',
    lastUpdate: 'há 12 min'
  },
  {
    id: 6,
    name: 'Roberto Alves Ferreira',
    age: 80,
    room: 'Quarto 410',
    bed: 'B',
    status: 'normal',
    heartRate: 75,
    temperature: 36.4,
    bloodPressure: '125/78',
    lastUpdate: 'há 6 min'
  }
];

export function MobileApp() {
  const [activeTab, setActiveTab] = useState<'home' | 'rooms' | 'messages' | 'reports' | 'alerts'>('home');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const notificationCount = 11;

  // Patient Detail View
  if (selectedPatient) {
    return (
      <PatientDetailScreen
        patient={selectedPatient}
        onBack={() => setSelectedPatient(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FBFC]">
      <MobileHeader 
        userName="Ana Dias" 
        notificationCount={notificationCount}
      />

      {/* Content based on active tab */}
      {activeTab === 'home' && (
        <HomeScreen 
          patients={mockPatients}
          onPatientClick={setSelectedPatient}
        />
      )}

      {activeTab === 'rooms' && <RoomsScreen />}
      {activeTab === 'messages' && <MessagesScreen />}
      {activeTab === 'reports' && <ReportsScreen />}
      {activeTab === 'alerts' && <AlertsScreen />}

      <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      
      {/* AI Assistant - Mobile optimized */}
      <AIAssistant isMobile={true} />
    </div>
  );
}