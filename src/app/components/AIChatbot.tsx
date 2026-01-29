import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Sparkles, User, Bot, Paperclip, Mic, Search } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface Message {
  id: number;
  type: 'user' | 'bot';
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

const initialMessages: Message[] = [
  {
    id: 1,
    type: 'bot',
    content: 'Olá! 👋 Sou o assistente inteligente do CuidAI. Como posso ajudar você hoje?',
    timestamp: new Date(),
    suggestions: [
      'Buscar paciente',
      'Ver alertas críticos',
      'Ocupação da UTI',
      'Medicações pendentes'
    ]
  }
];

const botResponses: Record<string, { response: string; suggestions?: string[] }> = {
  'buscar paciente': {
    response: '🔍 Claro! Digite o nome do paciente que você está procurando ou me informe o número do leito.',
    suggestions: ['Maria Silva Santos', 'João Pereira', 'Ver todos os pacientes']
  },
  'maria silva santos': {
    response: '👤 **Maria Silva Santos** - 78 anos\n📍 UTI - Quarto 301, Leito A\n⚠️ Status: **Crítico**\n📊 2 alertas ativos\n🩺 Última atualização: há 2h\n\nO que você gostaria de fazer?',
    suggestions: ['Ver prontuário completo', 'Ver sinais vitais', 'Histórico de alertas']
  },
  'ver alertas críticos': {
    response: '🚨 **Alertas Críticos Ativos (3)**:\n\n1. **Maria Silva Santos** - UTI 301A\n   Queda detectada + FC elevada (125 bpm)\n   \n2. **Carlos Mendes** - UTI 302A\n   SpO2 baixo (88%)\n   \n3. **Capacidade UTI**\n   95% de ocupação - apenas 1 leito livre\n\nDeseja ver detalhes de algum alerta?',
    suggestions: ['Ver detalhes Maria Silva', 'Ver todos os pacientes da UTI', 'Exportar relatório']
  },
  'ocupação da uti': {
    response: '🏥 **Status UTI em Tempo Real**:\n\n📊 Taxa de Ocupação: **95%**\n🛏️ Leitos Totais: 20\n✅ Ocupados: 19\n🟢 Disponíveis: 1\n⚠️ Pacientes Críticos: 3\n\nPrevisão de alta nas próximas 24h: 2 pacientes',
    suggestions: ['Ver mapa de leitos', 'Previsão de ocupação', 'Pacientes críticos']
  },
  'medicações pendentes': {
    response: '💊 **Medicações Pendentes**:\n\n⏰ **Atrasadas (2)**:\n- João Pereira - Enalapril 20mg (atrasado 30min)\n- Ana Costa - Insulina NPH (atrasado 15min)\n\n🕐 **Próximas 2 horas (5)**:\n- 15:00 - Maria Silva - Furosemida\n- 15:30 - Carlos Mendes - Omeprazol\n- 16:00 - Lucia Martins - Captopril\n\nDeseja ver mais detalhes?',
    suggestions: ['Confirmar administração', 'Ver prescrições completas', 'Alertar enfermagem']
  },
  'ver prontuário completo': {
    response: '📋 Abrindo prontuário completo de Maria Silva Santos...\n\nO prontuário contém:\n✅ Histórico médico completo\n✅ Evoluções clínicas (últimas 48h)\n✅ Resultados de exames\n✅ Medicações prescritas\n✅ Sinais vitais (gráficos)\n✅ Sugestões da IA\n\n🤖 A IA identificou risco de piora nas próximas 24h. Deseja ver as recomendações?',
    suggestions: ['Ver recomendações da IA', 'Evolução médica', 'Solicitar exame']
  },
  'ajuda': {
    response: '💡 **O que eu posso fazer por você:**\n\n🔍 **Buscar informações**\n- Dados de pacientes\n- Status de leitos\n- Resultados de exames\n\n⚠️ **Alertas e Monitoramento**\n- Ver alertas críticos\n- Acompanhar sinais vitais\n- Notificações em tempo real\n\n📊 **Relatórios e Análises**\n- Gerar relatórios personalizados\n- Insights da IA\n- Estatísticas do setor\n\n💊 **Gestão Clínica**\n- Medicações pendentes\n- Prescrições\n- Protocolos clínicos\n\nO que você gostaria de explorar?',
    suggestions: ['Buscar paciente', 'Ver alertas', 'Gerar relatório', 'Estatísticas']
  }
};

export function AIChatbot() {
  const { isDarkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (message?: string) => {
    const textToSend = message || inputValue.trim();
    if (!textToSend) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now(),
      type: 'user',
      content: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate bot response
    setTimeout(() => {
      const normalizedInput = textToSend.toLowerCase();
      const response = Object.keys(botResponses).find(key => 
        normalizedInput.includes(key)
      );

      const botMessage: Message = {
        id: Date.now() + 1,
        type: 'bot',
        content: response 
          ? botResponses[response].response
          : `🤔 Desculpe, não entendi "${textToSend}". Posso ajudar com:\n\n- Buscar pacientes\n- Ver alertas críticos\n- Consultar ocupação\n- Medicações pendentes\n\nTente reformular sua pergunta ou escolha uma das sugestões abaixo.`,
        timestamp: new Date(),
        suggestions: response ? botResponses[response].suggestions : ['Ajuda', 'Buscar paciente', 'Ver alertas']
      };

      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-[#0EA5E9] to-[#0284C7] rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform z-50 group"
        >
          <MessageCircle className="w-7 h-7 text-white" />
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <div className={`absolute right-20 px-4 py-2 rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity ${
            isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'
          }`}>
            Assistente IA - Pergunte qualquer coisa!
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`fixed bottom-6 right-6 w-[420px] h-[600px] rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden ${
          isDarkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'
        }`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-medium">Assistente CuidAI</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <p className="text-xs text-white/80">Online • Responde em segundos</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${
            isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
          }`}>
            {messages.map(message => (
              <div key={message.id} className={`flex gap-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.type === 'bot'
                    ? 'bg-gradient-to-br from-[#0EA5E9] to-[#0284C7]'
                    : isDarkMode
                      ? 'bg-gray-700'
                      : 'bg-gray-300'
                }`}>
                  {message.type === 'bot' ? (
                    <Bot className="w-4 h-4 text-white" />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>

                {/* Message Content */}
                <div className={`flex flex-col gap-2 max-w-[75%] ${message.type === 'user' ? 'items-end' : ''}`}>
                  <div className={`px-4 py-3 rounded-2xl ${
                    message.type === 'bot'
                      ? isDarkMode
                        ? 'bg-gray-800 text-gray-100'
                        : 'bg-white text-gray-800 shadow-sm'
                      : 'bg-gradient-to-r from-[#0EA5E9] to-[#0284C7] text-white'
                  } ${message.type === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                    <p className="text-sm whitespace-pre-line leading-relaxed">{message.content}</p>
                  </div>

                  {/* Suggestions */}
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {message.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                            isDarkMode
                              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200 shadow-sm'
                          }`}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}

                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#0284C7] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className={`px-4 py-3 rounded-2xl rounded-tl-sm ${
                  isDarkMode ? 'bg-gray-800' : 'bg-white shadow-sm'
                }`}>
                  <div className="flex gap-1">
                    <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-gray-600' : 'bg-gray-400'}`} style={{ animationDelay: '0ms' }}></div>
                    <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-gray-600' : 'bg-gray-400'}`} style={{ animationDelay: '150ms' }}></div>
                    <div className={`w-2 h-2 rounded-full animate-bounce ${isDarkMode ? 'bg-gray-600' : 'bg-gray-400'}`} style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className={`p-4 border-t ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
            <div className={`flex items-center gap-2 p-2 rounded-xl ${
              isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
            }`}>
              <button className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
              }`}>
                <Paperclip className="w-5 h-5" />
              </button>
              
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Digite sua pergunta..."
                className={`flex-1 bg-transparent outline-none text-sm ${
                  isDarkMode ? 'text-white placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'
                }`}
              />

              <button className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
              }`}>
                <Mic className="w-5 h-5" />
              </button>

              <button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim()}
                className={`p-2 rounded-lg transition-colors ${
                  inputValue.trim()
                    ? 'bg-[#0EA5E9] hover:bg-[#0284C7] text-white'
                    : isDarkMode
                      ? 'bg-gray-700 text-gray-500'
                      : 'bg-gray-200 text-gray-400'
                }`}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleSendMessage('Ajuda')}
                className={`flex-1 px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors ${
                  isDarkMode
                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Search className="w-3 h-3" />
                Ajuda
              </button>
              <button
                onClick={() => handleSendMessage('Ver alertas críticos')}
                className={`flex-1 px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors ${
                  isDarkMode
                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Alertas
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
