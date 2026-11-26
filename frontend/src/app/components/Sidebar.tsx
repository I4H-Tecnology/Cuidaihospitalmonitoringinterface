import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Search,
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
import type { Screen } from '../data/rbac';
import { AREAS_FINANCEIRO } from '../../modulos/financeiro/navegacao';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  currentScreen?: Screen;
  onNavigate?: (screen: Screen) => void;
  /** Ocorrencias abertas; alimenta o contador de monitoramento. */
  casosAbertos?: number;
  /** Alertas criticos sem ciencia (RN12). */
  alertasCriticos?: number;
  nomeDaClinica?: string | null;
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
        className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva ${
          isOpen
            ? 'bg-marca-suave text-marca-texto dark:bg-marca/20 dark:text-marca-clara hover:bg-marca-suave-hover dark:hover:bg-marca/30'
            : 'text-gray-500 dark:text-gray-400 hover:bg-marca-suave/70 dark:hover:bg-marca/15 hover:text-marca-texto dark:hover:text-marca-clara'
        }`}
      >
        <span className={`transition-transform duration-200 group-hover:scale-110 ${isOpen ? 'text-marca-texto dark:text-marca-clara' : 'text-gray-400 dark:text-gray-500 group-hover:text-marca-texto dark:group-hover:text-marca-clara'}`}>
          {icon}
        </span>
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left text-xs font-semibold uppercase tracking-wider">{title}</span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform group-hover:text-marca-texto dark:group-hover:text-marca-clara ${isOpen ? 'rotate-0' : '-rotate-90'}`}
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

export function Sidebar({
  isCollapsed = false, onToggleCollapse, currentScreen = 'dashboard', onNavigate,
  casosAbertos = 0, alertasCriticos = 0, nomeDaClinica = null,
}: SidebarProps) {
  const { can, podeAbrirTela } = useAuth();
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
        { icon: <Activity className="w-5 h-5" />, label: 'Indicadores-chave', screen: 'indicadores-chave' },
        { icon: <Bell className="w-5 h-5" />, label: 'Alertas prioritários', screen: 'alertas-prioritarios' },
      ],
    },
    {
      title: 'ASSISTENCIAL (CORE CLÍNICO)',
      icon: <HeartPulse className="w-4 h-4" />,
      items: [
        { icon: <ClipboardList className="w-5 h-5" />, label: 'Prontuário Eletrônico (PEP)', screen: 'pep' },
        { icon: <Users className="w-5 h-5" />, label: 'Pacientes', screen: 'patients' },
        // Visões da clínica inteira (todos os pacientes). O prontuário de cada
        // paciente tem as mesmas três como abas.
        { icon: <FileText className="w-5 h-5" />, label: 'Evoluções Clínicas', screen: 'evolucoes' },
        { icon: <Activity className="w-5 h-5" />, label: 'Linha do Tempo Clínica', screen: 'linha-do-tempo' },
        { icon: <Shield className="w-5 h-5" />, label: 'Alergias & Riscos', screen: 'riscos' },
      ],
    },
    {
      title: 'OPERACIONAL ASSISTENCIAL',
      icon: <BedDouble className="w-4 h-4" />,
      items: [
        { icon: <BedDouble className="w-5 h-5" />, label: 'Ambientes Monitorados', screen: 'beds-rooms' },
        { icon: <Building2 className="w-5 h-5" />, label: 'Internações', screen: 'internacoes' },
        { icon: <Activity className="w-5 h-5" />, label: 'Alta e Transferência', screen: 'alta-transferencia' },
        { icon: <Users className="w-5 h-5" />, label: 'Fluxo do Paciente', screen: 'fluxo-paciente' },
        { icon: <Users2 className="w-5 h-5" />, label: 'Escalas Assistenciais', screen: 'escalas' },
        { icon: <ClipboardList className="w-5 h-5" />, label: 'Checklists Operacionais', screen: 'checklists' },
      ],
    },
    {
      title: 'MONITORAMENTO INTELIGENTE',
      icon: <Activity className="w-4 h-4" />,
      items: [
        { icon: <Activity className="w-5 h-5" />, label: 'Monitoramento em Tempo Real', badge: casosAbertos > 0 ? { value: casosAbertos, variant: 'critical' } : undefined, screen: 'monitoring' },
        { icon: <Bell className="w-5 h-5" />, label: 'Alertas Clínicos', badge: alertasCriticos > 0 ? { value: alertasCriticos, variant: 'warning' } : undefined, screen: 'alerts' },
        { icon: <BedDouble className="w-5 h-5" />, label: 'Ausência no Quarto', screen: 'ausencia-quarto' },
        { icon: <Activity className="w-5 h-5" />, label: 'Agitação Noturna', screen: 'agitacao-noturna' },
        { icon: <Package className="w-5 h-5" />, label: 'Sensores IoT', screen: 'sensores' },
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Score de Risco', screen: 'score-risco' },
        { icon: <FileText className="w-5 h-5" />, label: 'Histórico de Incidentes', screen: 'incidentes' },
        { icon: <Activity className="w-5 h-5" />, label: 'Linha do Tempo de Eventos', screen: 'linha-eventos' },
      ],
    },
    {
      title: 'RELACIONAMENTO COM PACIENTE (CRM SAÚDE)',
      icon: <Users className="w-4 h-4" />,
      items: [
        { icon: <Calendar className="w-5 h-5" />, label: 'Agenda do Paciente', screen: 'agenda' },
        { icon: <Bell className="w-5 h-5" />, label: 'Lembretes', screen: 'lembretes' },
        { icon: <Users className="w-5 h-5" />, label: 'Mensagens', screen: 'mensagens' },
        { icon: <Smartphone className="w-5 h-5" />, label: 'Respostas Automáticas', screen: 'chatbot' },
        { icon: <FileText className="w-5 h-5" />, label: 'Comunicação de Exames', screen: 'exames' },
        { icon: <ClipboardList className="w-5 h-5" />, label: 'Histórico de Atendimento', screen: 'historico-atendimento' },
        { icon: <Activity className="w-5 h-5" />, label: 'NPS / Satisfação', screen: 'nps' },
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Campanhas de Saúde', screen: 'campanhas' },
      ],
    },
    {
      title: 'INTELIGÊNCIA & ANALYTICS',
      icon: <BarChart3 className="w-4 h-4" />,
      items: [
        { icon: <Activity className="w-5 h-5" />, label: 'Indicadores Clínicos', screen: 'indicadores-clinicos' },
        { icon: <ClipboardList className="w-5 h-5" />, label: 'KPIs Assistenciais', screen: 'kpis' },
        { icon: <FileText className="w-5 h-5" />, label: 'Relatórios Regulatórios', screen: 'relatorios' },
        { icon: <Activity className="w-5 h-5" />, label: 'Análise Preditiva', screen: 'previsao' },
        { icon: <BarChart3 className="w-5 h-5" />, label: 'Mapa de Calor de Risco', screen: 'heatmaps' },
        { icon: <Calendar className="w-5 h-5" />, label: 'Comparativos por Período', screen: 'comparativos' },
        { icon: <FileText className="w-5 h-5" />, label: 'Insights Automatizados', screen: 'insights' },
      ],
    },
    {
      title: 'ADMINISTRAÇÃO',
      icon: <Building2 className="w-4 h-4" />,
      items: [
        {
          // Módulo financeiro (src/modulos/financeiro): uma entrada por área,
          // na ordem que o próprio módulo define. Cada área tem o seu módulo
          // de permissão (finance, payroll ou finance_admin), então o submenu
          // mostra a cada perfil só o que ele pode abrir, e some para quem
          // não pode abrir nada.
          icon: <DollarSign className="w-5 h-5" />,
          label: 'Financeiro',
          children: AREAS_FINANCEIRO.map((area) => {
            const Icone = area.icone;
            return { icon: <Icone className="w-4 h-4" />, label: area.rotulo, screen: `financeiro:${area.chave}` as Screen };
          }),
        },
        { icon: <ClipboardList className="w-5 h-5" />, label: 'Compras', screen: 'compras' },
        { icon: <FileText className="w-5 h-5" />, label: 'Contratos', screen: 'contratos' },
        // Centros de custo saíram daqui: agora existem de verdade, em
        // Financeiro > Cadastros.
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
            { icon: <Users className="w-4 h-4" />, label: 'Usuários', module: 'users', screen: 'users' },
          ],
        },
        { icon: <Settings className="w-5 h-5" />, label: 'Configurações', module: 'settings', screen: 'settings' },
        { icon: <Activity className="w-5 h-5" />, label: 'Saúde do Sistema', module: 'monitoring', screen: 'saude' },
        // "Segurança" saiu: a política de senha já mora em Usuários, e um item
        // de menu que não navega para lugar nenhum é botão morto. "App Paciente"
        // (lista dos acessos da família) saiu do projeto em 26/11/2026.
      ],
    },
  ];

  const badgeStyles = {
    critical: 'bg-red-500 text-white',
    // Branco sobre amarelo não passa de 2:1; amarelo pede texto escuro.
    warning: 'bg-yellow-400 text-yellow-950',
    info: 'bg-marca text-white',
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

  // Abre a seção da tela atual, inclusive ao carregar: recarregar a página e
  // achar o menu todo fechado fazia perder de vista onde se estava.
  useEffect(() => {
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
      return podeAbrirTela(item.screen);
    }
    if (item.module) {
      return can(item.module, 'view');
    }
    if (item.children) {
      return item.children.some(isItemAllowed);
    }
    return true;
  };

  const [busca, setBusca] = useState('');

  // Com uns 60 itens, achar "Escalas" abrindo seção por seção é lento. A busca
  // achata o menu: qualquer item (ou subitem) cujo nome ou seção contenha o
  // texto, sem acento e sem caixa. Enter abre o primeiro.
  const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const resultados = (() => {
    const termo = normalizar(busca.trim());
    if (!termo) return [];
    const achados: { item: MenuItem; secao: string }[] = [];
    for (const section of menuSections) {
      for (const item of section.items.filter(isItemAllowed)) {
        const filhos = item.children?.filter(isItemAllowed) ?? [];
        if (filhos.length) {
          for (const filho of filhos) {
            if (normalizar(`${filho.label} ${item.label} ${section.title}`).includes(termo)) achados.push({ item: filho, secao: item.label });
          }
        } else if (normalizar(`${item.label} ${section.title}`).includes(termo)) {
          achados.push({ item, secao: section.title });
        }
      }
    }
    return achados;
  })();

  return (
    <aside className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-screen sticky top-0 flex flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      {/* Header */}
      <div className="px-5 py-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-marca to-marca-hover rounded-lg flex items-center justify-center">
                <HeartPulse className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-marca-texto dark:text-marca-clara">MedSignal</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500">ERP HOSPITALAR</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-full flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-marca to-marca-hover rounded-lg flex items-center justify-center">
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

      {!isCollapsed && (
        <div className="px-3 pt-3">
          <label className="relative block">
            <span className="sr-only">Buscar no menu</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && resultados[0]) { handleItemClick(resultados[0].item); setBusca(''); }
                if (e.key === 'Escape') setBusca('');
              }}
              placeholder="Buscar no menu"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva"
            />
          </label>
        </div>
      )}

      {/* Menu */}
      <nav aria-label="Menu principal" className="sidebar-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {busca.trim() && (
          resultados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-600">Nada no menu com “{busca}”.</p>
          ) : (
            <ul className="space-y-0.5">
              {resultados.map(({ item, secao }) => (
                <li key={`${secao}-${item.label}`}>
                  <button
                    type="button"
                    onClick={() => { handleItemClick(item); setBusca(''); }}
                    aria-current={item.screen === currentScreen ? 'page' : undefined}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva ${item.screen === currentScreen ? 'bg-marca-suave text-marca-texto hover:bg-marca-suave-hover' : 'text-gray-700 hover:bg-marca-suave dark:hover:bg-marca/20 hover:text-marca-texto'}`}
                  >
                    <span className="shrink-0 text-gray-500 group-hover:text-marca-texto">{item.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      <span className="block truncate text-xs text-gray-600">{secao}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
        {!busca.trim() && menuSections.map((section, sectionIndex) => {
          const visibleItems = section.items.filter(isItemAllowed);
          // Seção sem nenhum item liberado não aparece: um título que abre
          // para o vazio parece defeito.
          if (visibleItems.length === 0) return null;
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
                  const hasActiveChild = !!visibleChildren?.some((child) => child.screen === currentScreen);
                  // Com o submenu à vista, o destaque forte fica no item filho e
                  // o pai só indica o caminho; recolhido, o pai é tudo o que se vê.
                  const isActive = item.screen === currentScreen || (isCollapsed && hasActiveChild);
                  const isOnPath = !isActive && hasActiveChild;
                  const isExpanded = !!expandedMenus[item.label];
                  const isDisabled = item.disabled;

                  return (
                    <div key={itemIndex} className="space-y-1">
                      <button
                        onClick={() => {
                          if (isDisabled) {
                            return;
                          }
                          if (visibleChildren) {
                            // Recolhido não há onde abrir o submenu: vai direto
                            // para o primeiro item liberado dele.
                            if (isCollapsed) {
                              if (visibleChildren[0]) handleItemClick(visibleChildren[0]);
                            } else {
                              toggleMenu(item.label);
                            }
                          } else {
                            handleItemClick(item);
                          }
                        }}
                        disabled={isDisabled}
                        aria-disabled={isDisabled ? true : undefined}
                        aria-expanded={visibleChildren && !isCollapsed ? isExpanded : undefined}
                        title={isCollapsed ? item.label : undefined}
                        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva focus-visible:ring-offset-1 ${
                          isActive
                            ? 'bg-gradient-to-r from-marca to-marca-hover text-white shadow-sm hover:shadow-md hover:brightness-110'
                            : isOnPath
                              ? 'bg-marca-suave dark:bg-marca/10 text-marca-texto dark:text-marca-clara font-medium hover:bg-marca-suave-hover dark:hover:bg-marca/20'
                              : isDisabled
                                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed pointer-events-none'
                                : 'text-gray-600 dark:text-gray-300 hover:bg-marca-suave dark:hover:bg-marca/20 hover:text-marca-texto dark:hover:text-marca-clara hover:shadow-sm'
                        }`}
                      >
                        {/* Barra de marca que entra no hover: diz qual item o clique vai abrir. */}
                        {!isActive && !isDisabled && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 scale-y-50 rounded-r-full bg-marca-viva opacity-0 transition-all duration-200 group-hover:scale-y-100 group-hover:opacity-100"
                          />
                        )}
                        <span className={`transition-transform duration-200 group-hover:scale-110 ${
                          isActive
                            ? 'text-white'
                            : isOnPath
                              ? 'text-marca-texto dark:text-marca-clara'
                              : 'text-gray-500 dark:text-gray-400 group-hover:text-marca-texto dark:group-hover:text-marca-clara'
                        }`}>
                          {item.icon}
                        </span>
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-left text-sm transition-transform duration-200 group-hover:translate-x-0.5">{item.label}</span>
                            {visibleChildren && (
                              <ChevronDown
                                className={`w-4 h-4 transition-transform duration-200 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-marca-texto dark:group-hover:text-marca-clara'} ${isExpanded ? 'rotate-180' : ''}`}
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
                      {!isCollapsed && visibleChildren && isExpanded && (
                        // A linha-guia desce do centro do ícone do pai (px-3 + metade
                        // de w-5 = 22px) e amarra o submenu a ele.
                        <div className="ml-[22px] pl-3 border-l border-gray-200 dark:border-gray-700 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
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
                                aria-current={isChildActive ? 'page' : undefined}
                                className={`group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva ${
                                  isChildActive
                                    ? 'bg-marca-suave dark:bg-marca/25 text-marca-texto dark:text-marca-clara font-medium hover:bg-marca-suave-hover'
                                    : isChildDisabled
                                      ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed pointer-events-none'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-marca-suave/70 dark:hover:bg-marca/15 hover:text-marca-texto dark:hover:text-marca-clara'
                                }`}
                              >
                                {/* Marca sobre a linha-guia: cheia onde se está, clara sob o mouse. */}
                                {isChildActive ? (
                                  <span aria-hidden="true" className="absolute -left-[14px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-marca" />
                                ) : !isChildDisabled && (
                                  <span aria-hidden="true" className="absolute -left-[14px] top-1/2 h-5 w-[3px] -translate-y-1/2 scale-y-50 rounded-full bg-marca-viva opacity-0 transition-all duration-200 group-hover:scale-y-100 group-hover:opacity-100" />
                                )}
                                <span className={`transition-transform duration-200 group-hover:scale-110 ${isChildActive ? 'text-marca-texto dark:text-marca-clara' : 'text-gray-400 dark:text-gray-500 group-hover:text-marca-texto dark:group-hover:text-marca-clara'}`}>
                                  {child.icon}
                                </span>
                                <span className="flex-1 text-left transition-transform duration-200 group-hover:translate-x-0.5">{child.label}</span>
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
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-fundo-app dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-marca to-marca-hover rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{nomeDaClinica ?? 'Carregando…'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Clínica monitorada</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
