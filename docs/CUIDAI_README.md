# CuidAI - Sistema Hospitalar Inteligente

## 🏥 Sobre o Projeto

**CuidAI** é uma plataforma hospitalar completa para monitoramento de pacientes e idosos em tempo real, utilizando inteligência artificial, câmeras e sensores.

O sistema oferece:
- **Sistema Web (ERP Hospitalar)** - Central de monitoramento completa para gestão hospitalar
- **App Mobile** - Aplicativo para cuidadores, enfermeiros e familiares autorizados

---

## 🎨 Identidade Visual

### Paleta de Cores
- **Principal**: Azul bebê (#7DD3FC, #0EA5E9, #0A7EA4)
- **Base**: Branco (#FFFFFF) e Cinza claro (#F8FBFC)
- **Status**:
  - Verde suave: Normal
  - Amarelo suave: Atenção
  - Vermelho discreto: Crítico (usado apenas para alertas importantes)

### Design
- Visual hospitalar profissional
- Limpo e minimalista
- Tipografia clara e altamente legível
- Ícones clínicos e funcionais
- Aparência de ERP clínico real

---

## 🖥️ SISTEMA WEB

### Menu Lateral
**Principal**
- Dashboard
- Monitoramento IA (com badge de alertas)
- Alertas Clínicos

**Gestão Clínica**
- Prontuário (PEP)
- Pacientes
- Leitos e Quartos
- Agendamentos

**Administrativo**
- Gestão Hospitalar
- Financeiro
- Estoque
- Recursos Humanos

**Sistema**
- Configuração IA
- App Paciente
- Segurança

### Central de Monitoramento

**Cards de Indicadores**
- Pacientes Monitorados
- Alertas Ativos
- Leitos Ocupados
- Status Geral

**Lista de Pacientes**
- Organização hierárquica: Hospital → Setor → Quarto → Leito
- Status visual por paciente (Normal, Atenção, Crítico)
- Sinais vitais em tempo real (frequência cardíaca, temperatura)
- Filtros por status
- Indicadores pulsantes de status

**Eventos Recentes**
- Timeline de eventos em tempo real
- Classificação visual por severidade
- Detalhes de localização completos
- Timestamps precisos

---

## 📱 APP MOBILE

### Público-Alvo
- Cuidadores
- Enfermeiros
- Familiares autorizados

### Telas Principais

#### 🏠 Tela Inicial - Lista de Pacientes
- Header azul bebê com logo CuidAI
- Saudação personalizada
- Busca e notificações
- Cards de pacientes com:
  - Avatar/iniciais
  - Nome e idade
  - Localização (quarto/leito)
  - Status colorido
  - Sinais vitais básicos
  - Última atualização

#### 👤 Tela de Detalhes do Paciente
- Informações completas do paciente
- Sinais vitais em destaque:
  - Frequência cardíaca
  - Temperatura
  - Pressão arterial
  - Última verificação
- Eventos recentes
- Botões de ação:
  - Acionar ajuda
  - Contatar
  - Ver histórico completo

#### 🚨 Tela de Alertas
- Lista de alertas em tempo real
- Filtros por severidade (Crítico, Atenção, Normal)
- Cada alerta mostra:
  - Tipo e descrição
  - Paciente afetado
  - Localização completa
  - Horário
- Botão de ação rápida para alertas críticos

#### 📊 Tela de Relatórios
- Indicadores do dia:
  - Alertas hoje
  - Pacientes críticos
  - Total monitorados
  - Leitos ocupados
- Gráfico de alertas por hora
- Atividade recente
- Geração de relatórios

#### ⚙️ Configurações
- Perfil do usuário
- Preferências de notificação
- Informações do app
- Logout

### Navegação
- Bottom navigation bar com 4 seções principais
- Navegação intuitiva e rápida
- Transições suaves

---

## 🔄 Integração Web ↔ Mobile

### Experiência Contínua
- **Mesma identidade visual** em todas as plataformas
- **Mesmos dados** sincronizados em tempo real
- **Mesma linguagem** e nomenclaturas
- **Status unificados** entre web e mobile
- **Alertas sincronizados** instantaneamente

### Funcionalidades Compartilhadas
- Sistema de notificações
- Dados de pacientes
- Eventos e alertas
- Sinais vitais
- Localização hierárquica

---

## 🚀 Como Usar

### Visualização Web
Ao abrir o sistema, você verá a **Central de Monitoramento** com:
- Menu lateral completo
- Dashboard com indicadores
- Lista de pacientes
- Eventos recentes

### Visualização Mobile
Clique no botão **"Ver App Mobile"** no header para:
- Ver o aplicativo mobile em um simulador de smartphone
- Navegar entre as 4 telas principais
- Testar a experiência mobile completa
- Retornar à versão web clicando em **"Ver Versão Web"**

---

## 💡 Casos de Uso

### Para Hospitais
- Monitoramento centralizado de todos os pacientes
- Gestão de leitos e recursos
- Alertas em tempo real para equipe médica
- Relatórios e analytics

### Para Cuidadores e Enfermeiros
- Acesso rápido aos pacientes sob sua responsabilidade
- Notificações instantâneas de alertas
- Visualização de sinais vitais
- Registro de eventos

### Para Gestores
- Visão geral de ocupação
- Métricas de atendimento
- Controle de alertas críticos
- Tomada de decisão baseada em dados

---

## 🎯 Diferenciais

✅ **Visual Profissional Hospitalar** - Não parece startup, parece ERP real  
✅ **Paleta Calma e Segura** - Azul bebê transmite confiança e cuidado  
✅ **Responsivo e Mobile-First** - Experiência otimizada para todos os dispositivos  
✅ **Tempo Real** - Sincronização instantânea de dados e alertas  
✅ **Hierarquia Clara** - Organização Hospital → Setor → Quarto → Leito  
✅ **Pronto para MVP** - Sistema funcional para pilotos e demonstrações  

---

## 📦 Tecnologias Utilizadas

- **React** - Framework principal
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização
- **Lucide React** - Ícones clínicos
- **Componentes modulares** - Arquitetura escalável

---

## 🏗️ Estrutura do Projeto

```
/src/app/
├── App.tsx                          # Sistema Web principal
├── MobileApp.tsx                    # App Mobile principal
├── components/
│   ├── Sidebar.tsx                  # Menu lateral do sistema web
│   ├── StatCard.tsx                 # Cards de indicadores
│   ├── EventCard.tsx                # Cards de eventos
│   ├── PatientRow.tsx               # Linha de paciente na tabela
│   └── mobile/
│       ├── MobileHeader.tsx         # Header do app mobile
│       ├── MobileBottomNav.tsx      # Navegação inferior
│       ├── PatientCard.tsx          # Card de paciente (mobile)
│       ├── PatientDetailScreen.tsx  # Tela de detalhes
│       ├── AlertsScreen.tsx         # Tela de alertas
│       ├── ReportsScreen.tsx        # Tela de relatórios
│       └── SettingsScreen.tsx       # Tela de configurações
```

---

## 🎬 Próximos Passos Sugeridos

- Integração com backend real (Supabase, Firebase, etc.)
- Autenticação e controle de acesso
- Notificações push no mobile
- Gráficos avançados de sinais vitais
- Exportação de relatórios em PDF
- Integração com sistemas hospitalares existentes (HL7, FHIR)
- Modo escuro opcional
- Multilíngue

---

## 📄 Licença

Este é um projeto de demonstração do CuidAI - Sistema Hospitalar Inteligente.

---

**CuidAI** - Cuidado Inteligente, Sempre Atento 💙
