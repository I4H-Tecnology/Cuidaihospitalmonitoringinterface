import { AlertTriangle, Home } from 'lucide-react';

export type AbaMobile = 'home' | 'alerts';

interface MobileBottomNavProps {
  activeTab: AbaMobile;
  onTabChange: (tab: AbaMobile) => void;
  alertasPendentes?: number;
}

/**
 * Só duas abas: pacientes e alertas. Quartos, mensagens e relatórios saíram
 * porque não existe nada por trás deles no produto; menu que abre tela de
 * outro produto é o que faz um comprador desconfiar do resto.
 */
export function MobileBottomNav({ activeTab, onTabChange, alertasPendentes = 0 }: MobileBottomNavProps) {
  const tabs = [
    { id: 'home' as const, icon: Home, label: 'Pacientes' },
    { id: 'alerts' as const, icon: AlertTriangle, label: 'Alertas' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-1 py-2 flex items-center justify-around shadow-lg">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-col items-center gap-1 px-6 py-2 rounded-lg transition-colors min-w-[80px] ${isActive ? 'text-marca-texto' : 'text-gray-500'}`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'text-marca-texto' : ''}`} />
            <span className="text-xs">{tab.label}</span>
            {tab.id === 'alerts' && alertasPendentes > 0 && (
              <span className="absolute top-1 right-3 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] text-white">
                {alertasPendentes}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
