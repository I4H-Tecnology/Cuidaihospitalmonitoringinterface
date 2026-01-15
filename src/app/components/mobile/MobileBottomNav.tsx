import React from 'react';
import { Home, DoorOpen, MessageSquare, FileText, AlertTriangle } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: 'home' | 'rooms' | 'messages' | 'reports' | 'alerts';
  onTabChange: (tab: 'home' | 'rooms' | 'messages' | 'reports' | 'alerts') => void;
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const tabs = [
    { id: 'home' as const, icon: Home, label: 'Início' },
    { id: 'rooms' as const, icon: DoorOpen, label: 'Quartos' },
    { id: 'messages' as const, icon: MessageSquare, label: 'Mensagens' },
    { id: 'reports' as const, icon: FileText, label: 'Relatórios' },
    { id: 'alerts' as const, icon: AlertTriangle, label: 'Alertas' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-1 py-2 flex items-center justify-around shadow-lg">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px] ${
              isActive ? 'text-[#0A7EA4]' : 'text-gray-500'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'text-[#0EA5E9]' : ''}`} />
            <span className="text-xs">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}