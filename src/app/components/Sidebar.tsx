import React from 'react';
import {
  LayoutDashboard,
  Activity,
  Bell,
  FileText,
  Users,
  BedDouble,
  Calendar,
  Building2,
  DollarSign,
  Package,
  Users2,
  Settings,
  Smartphone,
  Shield,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  ClipboardList,
  BarChart3
} from 'lucide-react';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  currentScreen?: 'dashboard' | 'monitoring' | 'alerts' | 'pep' | 'patients' | 'beds-rooms' | 'scheduling' | 'reports' | 'settings' | 'users' | 'hospital-management' | 'financial' | 'inventory' | 'hr';
  onNavigate?: (screen: 'dashboard' | 'monitoring' | 'alerts' | 'pep' | 'patients' | 'beds-rooms' | 'scheduling' | 'reports' | 'settings' | 'users' | 'hospital-management' | 'financial' | 'inventory' | 'hr') => void;
}

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  badge?: {
    value: number;
    variant: 'critical' | 'warning' | 'info';
  };
  screen?: 'dashboard' | 'monitoring' | 'alerts' | 'pep' | 'patients' | 'beds-rooms' | 'scheduling' | 'reports' | 'settings' | 'users' | 'hospital-management' | 'financial' | 'inventory' | 'hr';
  onClick?: () => void;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export function Sidebar({ isCollapsed = false, onToggleCollapse, currentScreen = 'dashboard', onNavigate }: SidebarProps) {
  const menuSections: MenuSection[] = [
    {
      title: 'PRINCIPAL',
      items: [
        { 
          icon: <LayoutDashboard className="w-5 h-5" />, 
          label: 'Dashboard',
          screen: 'dashboard'
        },
        { 
          icon: <Activity className="w-5 h-5" />, 
          label: 'Monitoramento IA',
          badge: { value: 3, variant: 'critical' },
          screen: 'monitoring'
        },
        { 
          icon: <Bell className="w-5 h-5" />, 
          label: 'Alertas Clínicos',
          badge: { value: 7, variant: 'warning' },
          screen: 'alerts'
        },
      ],
    },
    {
      title: 'GESTÃO CLÍNICA',
      items: [
        { 
          icon: <ClipboardList className="w-5 h-5" />, 
          label: 'Prontuário (PEP)',
          screen: 'pep'
        },
        { 
          icon: <Users className="w-5 h-5" />, 
          label: 'Pacientes',
          screen: 'patients'
        },
        { 
          icon: <BedDouble className="w-5 h-5" />, 
          label: 'Leitos e Quartos',
          screen: 'beds-rooms'
        },
        { icon: <Calendar className="w-5 h-5" />, label: 'Agendamentos', screen: 'scheduling' },
      ],
    },
    {
      title: 'ADMINISTRATIVO',
      items: [
        { icon: <Building2 className="w-5 h-5" />, label: 'Gestão Hospitalar', screen: 'hospital-management' },
        { icon: <DollarSign className="w-5 h-5" />, label: 'Financeiro', screen: 'financial' },
        { icon: <Package className="w-5 h-5" />, label: 'Estoque', screen: 'inventory' },
        { icon: <Users2 className="w-5 h-5" />, label: 'Recursos Humanos', screen: 'hr' },
      ],
    },
    {
      title: 'SISTEMA',
      items: [
        { icon: <Users2 className="w-5 h-5" />, label: 'Usuários', screen: 'users' },
        { icon: <Settings className="w-5 h-5" />, label: 'Configurações', screen: 'settings' },
        { icon: <Smartphone className="w-5 h-5" />, label: 'App Paciente' },
        { icon: <Shield className="w-5 h-5" />, label: 'Segurança' },
      ],
    },
    {
      title: 'RELATÓRIOS',
      items: [
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Relatórios', screen: 'reports' },
      ],
    },
  ];

  const badgeStyles = {
    critical: 'bg-red-500 text-white',
    warning: 'bg-yellow-500 text-white',
    info: 'bg-[#0EA5E9] text-white',
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.screen && onNavigate) {
      onNavigate(item.screen);
    } else if (item.onClick) {
      item.onClick();
    }
  };

  return (
    <aside className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-screen sticky top-0 flex flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      {/* Header */}
      <div className="px-5 py-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-lg flex items-center justify-center">
                <HeartPulse className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-[#0A7EA4] dark:text-[#7DD3FC]">CuidAI</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500">ERP HOSPITALAR</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-full flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-lg flex items-center justify-center">
                <HeartPulse className="w-6 h-6 text-white" />
              </div>
              <button
                onClick={onToggleCollapse}
                className="w-10 h-10 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                title="Expandir menu"
              >
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={onToggleCollapse}
              className="w-7 h-7 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
              title="Recolher menu"
            >
              <ChevronLeft className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {menuSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            {!isCollapsed && (
              <h3 className="px-3 mb-2 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map((item, itemIndex) => {
                const isActive = item.screen === currentScreen;
                
                return (
                  <button
                    key={itemIndex}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
                      isActive
                        ? 'bg-gradient-to-r from-[#BAE6FD] to-[#7DD3FC] dark:from-[#0A7EA4] dark:to-[#0EA5E9] text-[#0A7EA4] dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-[#0A7EA4] dark:hover:text-[#7DD3FC]'
                    }`}
                  >
                    <span className={isActive ? 'text-[#0A7EA4] dark:text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-[#0A7EA4] dark:group-hover:text-[#7DD3FC]'}>
                      {item.icon}
                    </span>
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 text-left text-sm">{item.label}</span>
                        {item.badge && (
                          <span className={`px-2 py-0.5 rounded-full text-xs ${badgeStyles[item.badge.variant]}`}>
                            {item.badge.value}
                          </span>
                        )}
                      </>
                    )}
                    {isCollapsed && item.badge && (
                      <span className="absolute right-1 top-1 w-2 h-2 bg-red-500 rounded-full"></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!isCollapsed && (
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-[#F8FBFC] dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 dark:text-gray-200 truncate">Hospital Central</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Unidade Principal</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}