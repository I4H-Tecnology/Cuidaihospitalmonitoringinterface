import React, { useEffect, useRef, useState } from 'react';
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
  ChevronDown,
  HeartPulse,
  ClipboardList,
  BarChart3
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getModuleForScreen, type Screen } from '../data/rbac';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  currentScreen?: Screen;
  onNavigate?: (screen: Screen) => void;
}

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  badge?: {
    value: number;
    variant: 'critical' | 'warning' | 'info';
  };
  screen?: Screen;
  module?: string;
  onClick?: () => void;
  disabled?: boolean;
  children?: MenuItem[];
}

interface MenuSection {
  title: string;
  icon: React.ReactNode;
  items: MenuItem[];
}

interface SidebarModuleProps {
  title: string;
  icon: React.ReactNode;
  isCollapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function SidebarModule({ title, icon, isCollapsed, isOpen, onToggle, children }: SidebarModuleProps) {
  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
          isOpen
            ? 'bg-[#E8F4F8] text-[#0A7EA4] dark:bg-[#0A7EA4]/20 dark:text-[#7DD3FC]'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-[#0A7EA4] dark:hover:text-[#7DD3FC]'
        }`}
      >
        <span className={isOpen ? 'text-[#0A7EA4] dark:text-[#7DD3FC]' : 'text-gray-400 dark:text-gray-500'}>
          {icon}
        </span>
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left text-xs font-semibold uppercase tracking-wider">{title}</span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
            />
          </>
        )}
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-linear ${
          isOpen ? 'max-h-[1000px] opacity-100 mt-2' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function Sidebar({ isCollapsed = false, onToggleCollapse, currentScreen = 'dashboard', onNavigate }: SidebarProps) {
  const { can } = useAuth();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // TODO: Integrar enabledModules vindo do backend para multi-tenant.
  const menuSections: MenuSection[] = [
    {
      title: 'DASHBOARD',
      icon: <LayoutDashboard className="w-4 h-4" />,
      items: [
        { icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard', screen: 'dashboard' },
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Visão Geral Operacional', screen: 'operational-overview' },
        { icon: <Activity className="w-5 h-5" />, label: 'Indicadores-chave', disabled: true },
        { icon: <Bell className="w-5 h-5" />, label: 'Alertas prioritários', disabled: true },
        { icon: <FileText className="w-5 h-5" />, label: 'Insights de IA', disabled: true },
      ],
    },
    {
      title: 'ASSISTENCIAL (CORE CLÍNICO)',
      icon: <HeartPulse className="w-4 h-4" />,
      items: [
        { icon: <ClipboardList className="w-5 h-5" />, label: 'Prontuário Eletrônico (PEP)', screen: 'pep' },
        { icon: <Users className="w-5 h-5" />, label: 'Pacientes', screen: 'patients' },
        { icon: <FileText className="w-5 h-5" />, label: 'Evoluções Clínicas', disabled: true },
        { icon: <Activity className="w-5 h-5" />, label: 'Linha do Tempo Clínica', disabled: true },
        { icon: <Shield className="w-5 h-5" />, label: 'Alergias & Riscos', disabled: true },
      ],
    },
    {
      title: 'OPERACIONAL ASSISTENCIAL',
      icon: <BedDouble className="w-4 h-4" />,
      items: [
        { icon: <BedDouble className="w-5 h-5" />, label: 'Leitos & Ocupação', screen: 'beds-rooms' },
        { icon: <Building2 className="w-5 h-5" />, label: 'Internações', disabled: true },
        { icon: <Activity className="w-5 h-5" />, label: 'Alta e Transferência', disabled: true },
        { icon: <Calendar className="w-5 h-5" />, label: 'Agenda Médica', screen: 'scheduling' },
        { icon: <Users className="w-5 h-5" />, label: 'Fluxo do Paciente', disabled: true },
        { icon: <Users2 className="w-5 h-5" />, label: 'Escalas Assistenciais', disabled: true },
        { icon: <ClipboardList className="w-5 h-5" />, label: 'Checklists Operacionais', disabled: true },
      ],
    },
    {
      title: 'MONITORAMENTO INTELIGENTE',
      icon: <Activity className="w-4 h-4" />,
      items: [
        { icon: <Activity className="w-5 h-5" />, label: 'Monitoramento em Tempo Real', badge: { value: 3, variant: 'critical' }, screen: 'monitoring' },
        { icon: <Bell className="w-5 h-5" />, label: 'Alertas Clínicos', badge: { value: 7, variant: 'warning' }, screen: 'alerts' },
        { icon: <Shield className="w-5 h-5" />, label: 'Detecção de Quedas', disabled: true },
        { icon: <BedDouble className="w-5 h-5" />, label: 'Ausência no Quarto', disabled: true },
        { icon: <Activity className="w-5 h-5" />, label: 'Agitação Noturna', disabled: true },
        { icon: <Package className="w-5 h-5" />, label: 'Sensores IoT', disabled: true },
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Score de Risco', disabled: true },
        { icon: <FileText className="w-5 h-5" />, label: 'Histórico de Incidentes', disabled: true },
        { icon: <Activity className="w-5 h-5" />, label: 'Linha do Tempo de Eventos', disabled: true },
      ],
    },
    {
      title: 'RELACIONAMENTO COM PACIENTE (CRM SAÚDE)',
      icon: <Users className="w-4 h-4" />,
      items: [
        { icon: <Calendar className="w-5 h-5" />, label: 'Agenda do Paciente', disabled: true },
        { icon: <Bell className="w-5 h-5" />, label: 'Lembretes Automáticos', disabled: true },
        { icon: <Users className="w-5 h-5" />, label: 'Mensagens', disabled: true },
        { icon: <Smartphone className="w-5 h-5" />, label: 'Chatbot', disabled: true },
        { icon: <FileText className="w-5 h-5" />, label: 'Comunicação de Exames', disabled: true },
        { icon: <ClipboardList className="w-5 h-5" />, label: 'Histórico de Atendimento', disabled: true },
        { icon: <Activity className="w-5 h-5" />, label: 'NPS / Satisfação', disabled: true },
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Campanhas de Saúde', disabled: true },
      ],
    },
    {
      title: 'INTELIGÊNCIA & ANALYTICS',
      icon: <BarChart3 className="w-4 h-4" />,
      items: [
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Dashboards Operacionais', screen: 'reports' },
        { icon: <Activity className="w-5 h-5" />, label: 'Indicadores Clínicos', disabled: true },
        { icon: <ClipboardList className="w-5 h-5" />, label: 'KPIs Assistenciais', disabled: true },
        { icon: <FileText className="w-5 h-5" />, label: 'Relatórios Regulatórios', disabled: true },
        { icon: <Activity className="w-5 h-5" />, label: 'Análise Preditiva (IA)', disabled: true },
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Heatmaps de Risco', disabled: true },
        { icon: <Calendar className="w-5 h-5" />, label: 'Comparativos por Período', disabled: true },
        { icon: <FileText className="w-5 h-5" />, label: 'Insights Automatizados', disabled: true },
      ],
    },
    {
      title: 'ADMINISTRAÇÃO',
      icon: <Building2 className="w-4 h-4" />,
      items: [
        { icon: <Building2 className="w-5 h-5" />, label: 'Gestão Hospitalar', screen: 'hospital-management' },
        { icon: <DollarSign className="w-5 h-5" />, label: 'Financeiro', screen: 'financial' },
        { icon: <Package className="w-5 h-5" />, label: 'Estoque', screen: 'inventory' },
        { icon: <Users2 className="w-5 h-5" />, label: 'Recursos Humanos', screen: 'hr' },
        { icon: <ClipboardList className="w-5 h-5" />, label: 'Compras', disabled: true },
        { icon: <FileText className="w-5 h-5" />, label: 'Contratos', disabled: true },
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Centros de Custo', disabled: true },
      ],
    },
    {
      title: 'SISTEMA',
      icon: <Settings className="w-4 h-4" />,
      items: [
        { 
          icon: <Users2 className="w-5 h-5" />, 
          label: 'Cadastros',
          children: [
            { icon: <Users className="w-5 h-5" />, label: 'Usuários', module: 'users', screen: 'users' },
          ],
        },
        { icon: <Settings className="w-5 h-5" />, label: 'Configurações', module: 'settings', screen: 'settings' },
        { icon: <Smartphone className="w-5 h-5" />, label: 'App Paciente' },
        { icon: <Shield className="w-5 h-5" />, label: 'Segurança', module: 'security' },
      ],
    },
  ];

  const badgeStyles = {
    critical: 'bg-red-500 text-white',
    warning: 'bg-yellow-500 text-white',
    info: 'bg-[#0EA5E9] text-white',
  };

  const getActiveSectionInfo = () => {
    for (const section of menuSections) {
      for (const item of section.items) {
        if (item.screen === currentScreen) {
          return { sectionTitle: section.title, menuLabel: null };
        }
        if (item.children?.some((child) => child.screen === currentScreen)) {
          return { sectionTitle: section.title, menuLabel: item.label };
        }
      }
    }
    return { sectionTitle: null, menuLabel: null };
  };

  const { sectionTitle: activeSectionTitle, menuLabel: activeMenuLabel } = getActiveSectionInfo();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }

    setOpenSection(activeSectionTitle);
    if (activeMenuLabel) {
      setExpandedMenus((prev) => ({ ...prev, [activeMenuLabel]: true }));
    }
  }, [activeSectionTitle, activeMenuLabel]);

  const handleItemClick = (item: MenuItem) => {
    if (item.screen && onNavigate) {
      onNavigate(item.screen);
    } else if (item.onClick) {
      item.onClick();
    }
  };

  const isItemAllowed = (item: MenuItem): boolean => {
    if (item.screen) {
      const module = getModuleForScreen(item.screen);
      return can(module, 'view');
    }
    if (item.module) {
      return can(item.module, 'view');
    }
    if (item.children) {
      return item.children.some(isItemAllowed);
    }
    return true;
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
                <h2 className="text-[#0A7EA4] dark:text-[#7DD3FC]">MedSignal</h2>
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
      <nav className="sidebar-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {menuSections.map((section, sectionIndex) => {
          const visibleItems = section.items.filter(isItemAllowed);
          const isOpen = openSection === section.title;

          return (
            <SidebarModule
              key={sectionIndex}
              title={section.title}
              icon={section.icon}
              isCollapsed={isCollapsed}
              isOpen={isOpen}
              onToggle={() => setOpenSection((prev) => (prev === section.title ? null : section.title))}
            >
              <div className="space-y-1">
                {visibleItems.map((item, itemIndex) => {
                  const visibleChildren = item.children?.filter(isItemAllowed);
                  const isActive = item.screen === currentScreen || !!visibleChildren?.some((child) => child.screen === currentScreen);
                  const isDisabled = item.disabled;

                  return (
                    <div key={itemIndex} className="space-y-1">
                      <button
                        onClick={() => {
                          if (isDisabled) {
                            return;
                          }
                          if (item.children) {
                            toggleMenu(item.label);
                          } else {
                            handleItemClick(item);
                          }
                        }}
                        disabled={isDisabled}
                        aria-disabled={isDisabled ? true : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
                          isActive
                            ? 'bg-gradient-to-r from-[#BAE6FD] to-[#7DD3FC] dark:from-[#0A7EA4] dark:to-[#0EA5E9] text-[#0A7EA4] dark:text-white shadow-sm'
                            : isDisabled
                              ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-60 pointer-events-none'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-[#0A7EA4] dark:hover:text-[#7DD3FC]'
                        }`}
                      >
                        <span className={isActive ? 'text-[#0A7EA4] dark:text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-[#0A7EA4] dark:group-hover:text-[#7DD3FC]'}>
                          {item.icon}
                        </span>
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-left text-sm">{item.label}</span>
                            {item.children && (
                              <ChevronDown
                                className={`w-4 h-4 text-gray-400 transition-transform ${
                                  expandedMenus[item.label] ? 'rotate-180' : ''
                                }`}
                              />
                            )}
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
                      {!isCollapsed && visibleChildren && expandedMenus[item.label] && (
                        <div className="pl-6 space-y-1">
                          {visibleChildren.map((child, childIndex) => {
                            const isChildActive = child.screen === currentScreen;
                            const isChildDisabled = child.disabled;
                            return (
                              <button
                                key={childIndex}
                                onClick={() => {
                                  if (isChildDisabled) {
                                    return;
                                  }
                                  handleItemClick(child);
                                }}
                                disabled={isChildDisabled}
                                aria-disabled={isChildDisabled ? true : undefined}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                                  isChildActive
                                    ? 'bg-[#E8F4F8] text-[#0A7EA4]'
                                    : isChildDisabled
                                      ? 'text-gray-400 cursor-not-allowed opacity-60 pointer-events-none'
                                      : 'text-gray-600 hover:bg-gray-50 hover:text-[#0A7EA4]'
                                }`}
                              >
                                <span className={isChildActive ? 'text-[#0A7EA4]' : 'text-gray-400'}>
                                  {child.icon}
                                </span>
                                <span className="flex-1 text-left">{child.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SidebarModule>
          );
        })}
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
