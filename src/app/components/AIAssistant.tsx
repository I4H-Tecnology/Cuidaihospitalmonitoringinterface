import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, Users, BedDouble, AlertCircle, TrendingUp, ChevronRight, Minimize2, Brain, Zap, Target } from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  insights?: {
    title: string;
    description: string;
    action?: string;
  }[];
}

interface AIInsight {
  id: string;
  title: string;
  description: string;
  action?: string;
  actionCallback?: () => void;
  priority: 'critical' | 'warning' | 'info';
  category: 'operational' | 'clinical' | 'predictive' | 'efficiency';
  icon: React.ReactNode;
  timestamp: Date;
}

// Gerador de insights dinâmicos
const generateDynamicInsights = (): AIInsight[] => {
  const now = new Date();
  const insights: AIInsight[] = [];

  // Insight 1: Análise de ocupação preditiva
  const occupancyRate = Math.floor(65 + Math.random() * 25);
  if (occupancyRate > 85) {
    insights.push({
      id: `insight-${Date.now()}-1`,
      title: `⚠️ Taxa de ocupação em ${occupancyRate}%`,
      description: `Previsão IA: Capacidade máxima será atingida em ${Math.floor(2 + Math.random() * 4)} horas. Recomendo preparar leitos adicionais e contatar unidades parceiras.`,
      action: "Ver previsão completa",
      priority: 'warning',
      category: 'predictive',
      icon: <TrendingUp className="w-4 h-4" />,
      timestamp: now
    });
  }

  // Insight 2: Pacientes sem evolução
  const patientsNoUpdate = Math.floor(3 + Math.random() * 5);
  if (patientsNoUpdate > 3) {
    insights.push({
      id: `insight-${Date.now()}-2`,
      title: `📋 ${patientsNoUpdate} pacientes sem evolução > 6h`,
      description: `IA detectou padrão: ${Math.floor(patientsNoUpdate * 0.6)} estão em setores com equipe reduzida. Sugiro redistribuição de carga de trabalho.`,
      action: "Ver pacientes",
      priority: 'warning',
      category: 'operational',
      icon: <AlertCircle className="w-4 h-4" />,
      timestamp: now
    });
  }

  // Insight 3: Análise de sinais vitais
  const abnormalVitals = Math.floor(2 + Math.random() * 4);
  insights.push({
    id: `insight-${Date.now()}-3`,
    title: `🩺 Padrão anormal detectado`,
    description: `${abnormalVitals} pacientes com tendência de deterioração clínica nas últimas 4h. FC média aumentou 12%, SpO2 caiu 3%. Risco de desfecho adverso: Médio.`,
    action: "Ver análise completa",
    priority: 'critical',
    category: 'clinical',
    icon: <Brain className="w-4 h-4" />,
    timestamp: now
  });

  // Insight 4: Eficiência operacional
  const avgResponseTime = Math.floor(15 + Math.random() * 10);
  if (avgResponseTime > 20) {
    insights.push({
      id: `insight-${Date.now()}-4`,
      title: `⏱️ Tempo de resposta acima da meta`,
      description: `Média de ${avgResponseTime}min para atender alertas críticos (meta: 15min). IA sugere: realocar 2 enfermeiros do 3º andar para UTI.`,
      action: "Ver sugestões de otimização",
      priority: 'warning',
      category: 'efficiency',
      icon: <Zap className="w-4 h-4" />,
      timestamp: now
    });
  }

  // Insight 5: Previsão de alta
  insights.push({
    id: `insight-${Date.now()}-5`,
    title: `🎯 ${Math.floor(3 + Math.random() * 3)} altas previstas para hoje`,
    description: `Análise preditiva indica alta probabilidade de alta para: Maria Silva (UTI 101), João Pereira (Cardiologia 203). Preparar documentação e agendar retorno.`,
    action: "Ver lista completa",
    priority: 'info',
    category: 'predictive',
    icon: <Target className="w-4 h-4" />,
    timestamp: now
  });

  // Insight 6: Risco de readmissão
  const readmissionRisk = Math.floor(1 + Math.random() * 3);
  if (readmissionRisk > 1) {
    insights.push({
      id: `insight-${Date.now()}-6`,
      title: `🔄 ${readmissionRisk} pacientes com risco de readmissão`,
      description: `IA identificou padrão de histórico e comorbidades. Recomendo: agendar teleconsulta em 7 dias e reforçar orientações de alta.`,
      action: "Ver pacientes em risco",
      priority: 'warning',
      category: 'predictive',
      icon: <AlertCircle className="w-4 h-4" />,
      timestamp: now
    });
  }

  // Insight 7: Otimização de recursos
  insights.push({
    id: `insight-${Date.now()}-7`,
    title: `💡 Oportunidade de otimização detectada`,
    description: `Análise de turnos mostra: UTI tem pico de demanda às ${Math.floor(8 + Math.random() * 4)}h. Sugestão: antecipar rounds médicos em 1h para reduzir gargalos.`,
    action: "Ver análise de turnos",
    priority: 'info',
    category: 'efficiency',
    icon: <Sparkles className="w-4 h-4" />,
    timestamp: now
  });

  // Retorna 4-6 insights aleatórios
  return insights.sort(() => Math.random() - 0.5).slice(0, Math.floor(4 + Math.random() * 3));
};

const quickSuggestions = [
  "Quais pacientes estão sem atualização?",
  "Leitos livres agora",
  "Resumo de alertas críticos",
  "Taxa de ocupação por andar",
  "Pacientes em estado crítico"
];

interface AIAssistantProps {
  onNavigate?: (screen: 'dashboard' | 'operational-overview' | 'monitoring' | 'alerts' | 'pep' | 'patients' | 'beds-rooms' | 'scheduling' | 'reports' | 'settings' | 'users' | 'hospital-management' | 'financial' | 'inventory' | 'hr') => void;
  patients?: Array<{
    id: number;
    name: string;
    age: number;
    gender: 'M' | 'F';
    room: string;
    bed: string;
    sector: string;
    status: string;
    activeAlerts?: number;
    admissionDate?: string;
  }>;
  onOpenPatient?: (patient: any) => void;
  isMobile?: boolean;
}

export function AIAssistant({ onNavigate, patients = [], onOpenPatient, isMobile = false }: AIAssistantProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [dynamicInsights, setDynamicInsights] = useState<AIInsight[]>(generateDynamicInsights());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Atualiza insights dinamicamente a cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setDynamicInsights(generateDynamicInsights());
    }, 30000); // 30 segundos

    return () => clearInterval(interval);
  }, []);

  // Reset do chat a cada 1 hora
  useEffect(() => {
    const interval = setInterval(() => {
      setMessages([]);
      console.log('🔄 Chat resetado automaticamente após 1 hora');
    }, 3600000); // 1 hora (3600000ms)

    return () => clearInterval(interval);
  }, []);

  const insightsCount = dynamicInsights.length;

  // Scroll automático para a última mensagem sempre que abrir ou enviar mensagem
  useEffect(() => {
    if (isOpen) {
      // Pequeno delay para garantir que o DOM foi renderizado
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, messages, isTyping]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse = generateAIResponse(text);
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const generateAIResponse = (userMessage: string): Message => {
    const lowerMessage = userMessage.toLowerCase();

    let content = '';
    let suggestions: string[] = [];
    let insights = undefined;

    // Detectar se está perguntando sobre um paciente específico por nome
    const patientMatch = patients.find(p => 
      lowerMessage.includes(p.name.toLowerCase()) || 
      p.name.toLowerCase().split(' ').some(namePart => 
        namePart.length > 3 && lowerMessage.includes(namePart)
      )
    );

    if (patientMatch) {
      // Detectar intenção: abrir/ver prontuário
      if (lowerMessage.includes('abrir') || lowerMessage.includes('prontuário') || lowerMessage.includes('prontuario') || lowerMessage.includes('ver')) {
        content = `✅ Abrindo prontuário de ${patientMatch.name}...\n\n👤 Informações:\n• Idade: ${patientMatch.age} anos\n• Gênero: ${patientMatch.gender === 'M' ? 'Masculino' : 'Feminino'}\n• Localização: ${patientMatch.sector} - ${patientMatch.room}, Leito ${patientMatch.bed}\n• Status: ${patientMatch.status === 'critical' ? '🔴 Crítico' : patientMatch.status === 'attention' ? '🟡 Atenção' : '🟢 Estável'}\n\n📋 Redirecionando para o Prontuário Eletrônico...`;
        
        // Navegar para PEP e abrir o paciente
        if (onOpenPatient && onNavigate) {
          setTimeout(() => {
            onNavigate('pep');
            setTimeout(() => {
              onOpenPatient(patientMatch);
              setIsOpen(false);
            }, 300);
          }, 1500);
        }
        
        suggestions = [`Ver sinais vitais`, `Ver medicações`, `Histórico completo`];
      } else {
        // Apenas informações sobre o paciente
        content = `📋 Informações sobre ${patientMatch.name}:\n\n• Idade: ${patientMatch.age} anos\n• Gênero: ${patientMatch.gender === 'M' ? 'Masculino' : 'Feminino'}\n• Localização: ${patientMatch.sector} - ${patientMatch.room}, Leito ${patientMatch.bed}\n• Status: ${patientMatch.status === 'critical' ? '🔴 Crítico' : patientMatch.status === 'attention' ? '🟡 Atenção' : '🟢 Estável'}\n• Alertas ativos: ${patientMatch.activeAlerts || 0}\n• Data de internação: ${patientMatch.admissionDate}\n\nO que você gostaria de fazer?`;
        suggestions = [`Abrir prontuário de ${patientMatch.name}`, `Ver localização no mapa`, `Ver alertas do paciente`];
      }
    }
    // Detectar menção a leito/quarto específico
    else if (lowerMessage.match(/leito\s*\d+|quarto\s*\d+/)) {
      const roomMatch = lowerMessage.match(/quarto\s*(\d+)/);
      const bedMatch = lowerMessage.match(/leito\s*([a-z0-9]+)/i);
      
      if (roomMatch || bedMatch) {
        const roomNumber = roomMatch ? roomMatch[1] : '';
        const bedLetter = bedMatch ? bedMatch[1] : '';
        
        // Buscar paciente neste leito
        const patientInBed = patients.find(p => 
          p.room.includes(roomNumber) || p.bed.toLowerCase() === bedLetter.toLowerCase()
        );
        
        if (patientInBed) {
          content = `🛏️ Informações do Leito:\n\n📍 Localização: ${patientInBed.sector} - ${patientInBed.room}, Leito ${patientInBed.bed}\n\n👤 Paciente: ${patientInBed.name}\n• Status: ${patientInBed.status === 'critical' ? '🔴 Crítico' : patientInBed.status === 'attention' ? '🟡 Atenção' : '🟢 Estável'}\n• Idade: ${patientInBed.age} anos\n• Alertas ativos: ${patientInBed.activeAlerts || 0}\n\nDeseja ver mais informações?`;
          suggestions = [`Abrir prontuário de ${patientInBed.name}`, `Ver mapa de leitos`, `Ver sinais vitais`];
        } else {
          content = `🛏️ Leito não encontrado ou disponível.\n\nVerifique o número do quarto e leito. Ou consulte o mapa de leitos para ver a ocupação atualizada.`;
          suggestions = ['Ver mapa de leitos', 'Ver leitos disponíveis'];
        }
      }
    }
    // Buscar todos os pacientes
    else if (lowerMessage.includes('lista') && (lowerMessage.includes('paciente') || lowerMessage.includes('internado'))) {
      const patientList = patients.map(p => 
        `• ${p.name} - ${p.sector} (${p.room} ${p.bed}) - ${p.status === 'critical' ? '🔴' : p.status === 'attention' ? '🟡' : '🟢'}`
      ).join('\n');
      
      content = `📋 Lista de Pacientes Internados (${patients.length}):\n\n${patientList}\n\n💡 Digite o nome de um paciente para ver mais detalhes ou abrir o prontuário.`;
      suggestions = ['Ver gestão de pacientes', 'Ver mapa de leitos', 'Filtrar por status'];
    }
    // Agendamentos
    else if (lowerMessage.includes('agendamento') || lowerMessage.includes('consulta') || lowerMessage.includes('agenda')) {
      content = `📅 Central de Agendamentos\n\nAgendamentos de hoje:\n\n🕐 09:00 - Consulta Cardiologia - Dr. Silva\n• Paciente: João Pereira\n• Status: Confirmado\n\n🕐 10:30 - Exame de Sangue - Lab\n• Paciente: Maria Silva\n• Status: Pendente\n\n🕐 14:00 - Cirurgia Menor - Centro Cirúrgico\n• Paciente: Carlos Mendes\n• Status: Confirmado\n\n🕐 15:30 - Teleconsulta - Dr. Santos\n• Paciente: Ana Costa\n• Status: Pendente\n\nDeseja ver mais detalhes?`;
      suggestions = ['Ver agenda completa', 'Adicionar agendamento', 'Confirmar consultas pendentes'];
      
      // Se mencionar um paciente específico e agendamento
      const agendPatient = patients.find(p => lowerMessage.includes(p.name.toLowerCase()));
      if (agendPatient) {
        content = `📅 Agendamentos de ${agendPatient.name}:\n\n✅ Próxima consulta: 28/12/2024 às 10:00\n• Tipo: Consulta de retorno\n• Médico: Dr. Silva\n• Local: Ambulatório 2\n\n📋 Histórico:\n• 18/12/2024 - Internação (UTI)\n• 20/12/2024 - Avaliação cardiológica\n\nDeseja agendar nova consulta?`;
        suggestions = [`Ver prontuário de ${agendPatient.name}`, 'Ver agenda completa', 'Agendar retorno'];
      }
    }
    else if (lowerMessage.includes('leitos') && (lowerMessage.includes('livre') || lowerMessage.includes('disponível'))) {
      content = `📊 Status de Leitos Disponíveis\n\nNo momento temos 6 leitos livres:\n\n🏥 1º Andar - UTI\n• Quarto 103: Leito A e B (2 leitos)\n\n🏥 2º Andar - Cardiologia\n• Quarto 203: Leito B (1 leito)\n\n🏥 3º Andar - Geriatria\n• Quarto 303: Leito A e B (2 leitos)\n\n⚠️ Bloqueados: Quarto 102-B (manutenção), Quarto 203-A (limpeza)\n\n📈 Taxa de ocupação atual: 67%`;
      suggestions = ['Ver mapa de leitos', 'Pacientes aguardando internação', 'Histórico de ocupação'];
    } else if (lowerMessage.includes('paciente') && lowerMessage.includes('atualização')) {
      content = `⚠️ Pacientes sem Atualização Recente\n\nIdentifiquei 5 pacientes sem registro de evolução nas últimas 6 horas:\n\n🔴 Crítico\n• Maria Silva Santos (UTI 101-A) - última atualização há 8h\n• Carlos Mendes Oliveira (UTI 102-A) - última atualização há 7h\n\n🟡 Atenção\n• João Pereira Souza (UTI 101-B) - última atualização há 6h\n• Pedro Santos Oliveira (Enfermaria 202-B) - última atualização há 6h\n\n🟢 Estável\n• Ana Costa Lima (Enfermaria 201-A) - última atualização há 6h\n\n💡 Sugiro revisar estes prontuários e atualizar evoluções médicas.`;
      suggestions = ['Abrir prontuários', 'Notificar equipe', 'Ver evolução completa'];
    } else if (lowerMessage.includes('alerta') || lowerMessage.includes('crítico')) {
      content = `🚨 Resumo de Alertas Ativos\n\nTotal: 7 alertas (3 críticos, 4 atenção)\n\n🔴 CRÍTICOS (3)\n• Queda detectada - Maria Silva (UTI 101-A) - há 2h\n• Queda detectada - Ana Costa (Enfermaria 201) - há 4h\n• FC elevada persistente - João Pereira (UTI 101-B) - há 5h\n\n🟡 ATENÇÃO (4)\n• Temperatura elevada - Carlos Mendes (UTI 102-A) - há 3h\n• Saída do leito - Pedro Santos (Enfermaria 202-B) - há 1h\n• Medicação atrasada - Lucia Martins (Enfermaria 202-A) - há 30min\n• SpO2 baixa - Francisco Lima (Isolamento 302-A) - há 45min\n\n⏰ Tempo médio de resposta: 18 minutos`;
      suggestions = ['Ver central de alertas', 'Exportar relatório', 'Configurar alertas'];
      insights = [
        {
          title: "🎯 Padrão Identificado",
          description: "Maior incidência de quedas no turno da manhã (6h-12h). Considere reforçar equipe neste período.",
          action: "Ver análise completa"
        }
      ];
    } else if (lowerMessage.includes('ocupação') || lowerMessage.includes('andar')) {
      content = `📊 Taxa de Ocupação por Andar\n\n🏢 1º Andar - UTI\n• 4/6 leitos ocupados (67%)\n• 2 leitos livres\n• 0 bloqueados\n\n🏢 2º Andar - Cardiologia\n• 3/5 leitos ocupados (60%)\n• 1 leito livre\n• 1 bloqueado (limpeza)\n\n🏢 3º Andar - Geriatria\n• 3/6 leitos ocupados (50%)\n• 2 leitos livres\n• 1 bloqueado (manutenção)\n\n📈 Média Geral: 67% de ocupação\n🎯 Meta institucional: 70-85%\n\n✅ Capacidade dentro do ideal para atendimento seguro.`;
      suggestions = ['Ver leitos detalhados', 'Histórico mensal', 'Comparar com período anterior'];
    } else if (lowerMessage.includes('crítico') || lowerMessage.includes('grave')) {
      content = `🔴 Pacientes em Estado Crítico\n\nAtualmente temos 1 paciente classificado como crítico:\n\n👤 Maria Silva Santos\n• Localização: UTI 101 - Leito A\n• Status: Crítico\n• Último evento: Queda detectada há 2h\n• Alertas ativos: 2\n• 🤖 Risco IA: Alto\n• Tempo de internação: 5 dias\n\n⚠️ Atenção Especial (2 pacientes)\n• João Pereira Souza (UTI 101-B)\n• Carlos Mendes Oliveira (UTI 102-A)\n\n💡 Recomendo monitoramento contínuo e revisão de protocolos de prevenção de quedas.`;
      suggestions = ['Ver prontuário completo', 'Histórico de eventos', 'Acionar equipe médica'];
    } else {
      content = `👋 Olá! Sou a IA Assistiva do MedSignal.\n\nEstou aqui para ajudar você com:\n\n💡 Insights Operacionais\n• Análise de ocupação de leitos\n• Identificação de pacientes sem atualização\n• Resumos de alertas e eventos\n\n🔍 Navegação Rápida\n• Encontrar informações específicas\n• Atalhos para prontuários e telas\n• Filtros inteligentes\n\n📊 Relatórios Instantâneos\n• Status de leitos e quartos\n• Indicadores por andar\n• Estatísticas em tempo real\n\n🎯 Como posso te ajudar hoje?\n\n💡 Exemplos:\n• "Abrir prontuário de Maria Silva"\n• "Ver leito 301"\n• "Agendamentos de hoje"`;
      suggestions = quickSuggestions;
    }

    return {
      id: (Date.now() + 1).toString(),
      type: 'ai',
      content,
      timestamp: new Date(),
      suggestions,
      insights
    };
  };

  const handleQuickSuggestion = (suggestion: string) => {
    // Detectar se é uma sugestão de "Abrir prontuário de [NOME]"
    const openPatientMatch = suggestion.match(/Abrir prontuário de (.+)/i);
    if (openPatientMatch && patients.length > 0) {
      const patientName = openPatientMatch[1];
      const patient = patients.find(p => p.name.toLowerCase().includes(patientName.toLowerCase()));
      
      if (patient && onOpenPatient && onNavigate) {
        onNavigate('pep');
        setTimeout(() => {
          onOpenPatient(patient);
          setIsOpen(false);
        }, 300);
        return;
      }
    }

    // Detectar se é uma sugestão de "Ver prontuário de [NOME]"
    const viewPatientMatch = suggestion.match(/Ver prontuário de (.+)/i);
    if (viewPatientMatch && patients.length > 0) {
      const patientName = viewPatientMatch[1];
      const patient = patients.find(p => p.name.toLowerCase().includes(patientName.toLowerCase()));
      
      if (patient && onOpenPatient && onNavigate) {
        onNavigate('pep');
        setTimeout(() => {
          onOpenPatient(patient);
          setIsOpen(false);
        }, 300);
        return;
      }
    }
    
    // Mapear sugestões para navegação
    const navigationMap: Record<string, any> = {
      'Ver mapa de leitos': () => onNavigate?.('beds-rooms'),
      'Ver leitos detalhados': () => onNavigate?.('beds-rooms'),
      'Ver localização no mapa': () => onNavigate?.('beds-rooms'),
      'Histórico de ocupação': () => onNavigate?.('reports'),
      'Histórico mensal': () => onNavigate?.('reports'),
      'Abrir prontuários': () => onNavigate?.('pep'),
      'Ver prontuário completo': () => onNavigate?.('pep'),
      'Ver central de alertas': () => onNavigate?.('alerts'),
      'Ver alertas do paciente': () => onNavigate?.('alerts'),
      'Exportar relatório': () => onNavigate?.('reports'),
      'Configurar alertas': () => onNavigate?.('settings'),
      'Ver pacientes': () => onNavigate?.('patients'),
      'Ver gestão de pacientes': () => onNavigate?.('patients'),
      'Pacientes aguardando internação': () => onNavigate?.('scheduling'),
      'Comparar com período anterior': () => onNavigate?.('reports'),
      'Ver agenda completa': () => onNavigate?.('scheduling'),
      'Adicionar agendamento': () => onNavigate?.('scheduling'),
      'Confirmar consultas pendentes': () => onNavigate?.('scheduling'),
      'Agendar retorno': () => onNavigate?.('scheduling'),
    };

    // Se existe uma ação de navegação para esta sugestão, executa
    const navAction = navigationMap[suggestion];
    if (navAction) {
      navAction();
      // Fecha o chat após navegar
      setTimeout(() => setIsOpen(false), 300);
    } else {
      // Senão, envia como mensagem normal
      handleSendMessage(suggestion);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed z-50 group transition-all duration-300 hover:scale-105 ${
          isMobile 
            ? 'bottom-20 right-4 bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white rounded-full shadow-xl hover:shadow-2xl p-3'
            : 'bottom-6 right-6 bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white rounded-2xl shadow-2xl hover:shadow-xl'
        }`}
      >
        {isMobile ? (
          // Versão compacta para mobile
          <div className="relative">
            <Bot className="w-6 h-6" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse"></span>
            {insightsCount > 0 && (
              <span className="absolute -top-2 -left-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {insightsCount}
              </span>
            )}
          </div>
        ) : (
          // Versão expandida para web
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="relative">
              <Bot className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse"></span>
            </div>
            <div className="flex flex-col items-start">
              <span className="font-medium flex items-center gap-1.5">
                🤖 IA Ativa
              </span>
              <span className="text-xs text-blue-100">
                {insightsCount} insights disponíveis
              </span>
            </div>
            <Sparkles className="w-4 h-4 text-blue-200 group-hover:text-yellow-300 transition-colors" />
          </div>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className={`fixed z-50 bg-white shadow-2xl border border-gray-200 flex flex-col overflow-hidden ${
          isMobile
            ? 'inset-0 rounded-none'
            : 'bottom-6 right-6 w-[480px] h-[700px] rounded-2xl'
        }`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white"></span>
              </div>
              <div>
                <h3 className="text-white font-medium">Assistente IA MedSignal</h3>
                <p className="text-xs text-blue-100">Insights e suporte inteligente</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <Minimize2 className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Insights Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0EA5E9]" />
                <span className="text-sm text-gray-700">
                  <strong>{insightsCount} insights</strong> detectados agora
                </span>
              </div>
              <button className="text-xs text-[#0EA5E9] hover:text-[#0284C7] font-medium flex items-center gap-1">
                Ver todos
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-gray-800 mb-2">Como posso ajudar?</h4>
                <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                  Pergunte sobre pacientes, leitos, alertas ou peça insights operacionais
                </p>
                
                {/* Quick Insights */}
                <div className="space-y-3 mb-6">
                  {dynamicInsights.map((insight) => {
                    const priorityColors = {
                      critical: 'border-red-300 bg-red-50',
                      warning: 'border-yellow-300 bg-yellow-50',
                      info: 'border-blue-300 bg-blue-50'
                    };
                    
                    const priorityIcons = {
                      critical: '🔴',
                      warning: '🟡',
                      info: '🔵'
                    };
                    
                    return (
                      <div 
                        key={insight.id} 
                        className={`rounded-xl border-2 p-4 text-left hover:shadow-md transition-shadow ${priorityColors[insight.priority]}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span>{priorityIcons[insight.priority]}</span>
                            <h5 className="text-sm text-gray-800 font-medium">{insight.title}</h5>
                          </div>
                          {insight.icon}
                        </div>
                        <p className="text-xs text-gray-600 mb-3">{insight.description}</p>
                        {insight.action && (
                          <button className="text-xs text-[#0EA5E9] hover:text-[#0284C7] font-medium flex items-center gap-1">
                            {insight.action}
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 bg-white/60 rounded-full text-gray-600">
                            {insight.category === 'operational' && '⚙️ Operacional'}
                            {insight.category === 'clinical' && '🩺 Clínico'}
                            {insight.category === 'predictive' && '🔮 Preditivo'}
                            {insight.category === 'efficiency' && '⚡ Eficiência'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {insight.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Suggestions */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {quickSuggestions.slice(0, 3).map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickSuggestion(suggestion)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-[#E8F4F8] hover:border-[#0EA5E9] hover:text-[#0A7EA4] transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                  <div className={`rounded-2xl px-4 py-3 ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  
                  {/* AI Insights */}
                  {message.insights && (
                    <div className="mt-3 space-y-2">
                      {message.insights.map((insight, idx) => (
                        <div key={idx} className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl p-3">
                          <h6 className="text-xs font-medium text-gray-800 mb-1">{insight.title}</h6>
                          <p className="text-xs text-gray-600 mb-2">{insight.description}</p>
                          {insight.action && (
                            <button className="text-xs text-[#0EA5E9] hover:text-[#0284C7] font-medium flex items-center gap-1">
                              {insight.action}
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Suggestions */}
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleQuickSuggestion(suggestion)}
                          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-[#E8F4F8] hover:border-[#0EA5E9] hover:text-[#0A7EA4] transition-all"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-400 mt-2">
                    {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 px-6 py-4 bg-white">
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
                placeholder="Faça uma pergunta ou peça um insight..."
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent text-sm"
              />
              <button
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim()}
                className="w-11 h-11 bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              💡 Assistência apenas informativa • Decisões clínicas devem ser validadas por profissionais
            </p>
          </div>
        </div>
      )}
    </>
  );
}
