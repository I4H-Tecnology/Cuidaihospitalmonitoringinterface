# Plano da vitrine comercial — tirar o "projeto de faculdade" da tela

> **Para quem for executar numa sessão nova.** Leia a seção 0 antes de
> qualquer outra coisa. Este plano é só de frontend: não precisa subir
> Docker, não precisa da webcam, não precisa do serviço de visão.

> **Este plano ignora a RFC de propósito.** Ele não é sobre nota de disciplina
> — é sobre o produto ficar apresentável para um comprador de verdade. Onde os
> dois objetivos batem (ex.: não inventar número), a razão dada aqui é a
> comercial, não a acadêmica.

O problema que este plano resolve não é "tem dado mockado" — isso já era
sabido. É mais específico: **o menu do sistema tem sete itens que abrem para
telas de um produto diferente**, que o MedSignal nunca foi e não faz — RH,
Financeiro, Estoque, Gestão Hospitalar, Agenda Médica, Leitos com mapa de
camas, e um "Relatórios" de BI genérico. Nenhuma delas busca dado nenhum da
API; são telas soltas com nome de gente e número inventados. Um comprador que
clica em "Financeiro" num produto vendido como "detecção de queda por câmera"
não pensa "ainda não terminaram" — pensa "isso aqui é fachada", e essa
desconfiança contamina o resto da demonstração.

E a tela que mais importa está pior que as que ninguém abre: **o Dashboard é a
página de pouso depois do login**, e hoje ele é uma UTI fictícia com
frequência cardíaca, temperatura e saturação de oxigênio — sinais vitais que
o MedSignal não mede e não tem sensor nenhum para medir. Isso não é dado de
exemplo no lugar de dado real; é uma funcionalidade que o produto não tem,
mostrada como se tivesse.

---

## 0. Contexto para executar

```
Projeto:  C:\Projetos\MedSignal
Branch:   qa        (nunca commitar em dev nem em main)
Frontend: C:\Projetos\MedSignal\frontend
```

```bash
cd C:/Projetos/MedSignal/frontend && npm run dev
```

Login de teste: qualquer tenant/usuário já cadastrado no seed
(`db/init/03_seed.sql`) — se o backend não estiver no ar, o formulário de
tenant/login não completa, mas as telas deste plano (depois de logado) só
precisam do frontend rodando contra o backend real via Docker Compose
(`docker-compose up -d`) se quiser ver dado de verdade; sem backend, dá para
revisar o código e o `tsc`/testes sem logar.

### O que já existe pronto para reusar — não reinvente

A API real do frontend já tem tudo que este plano precisa. Está em
`frontend/src/app/data/api.ts`:

| Função | Devolve |
|---|---|
| `fetchPacientes(tenantId)` | `PacienteResumo[]` — nome, idade, ambiente, `situacao` ('stable'\|'attention'\|'critical', já derivada das ocorrências abertas), `ocorrenciasAbertas`, `quedasConfirmadas`, `ultimaOcorrencia` |
| `fetchOcorrencias(tenantId, limite)` | `OcorrenciaResumo[]` — tipo, status, `dataHora`, `ambienteNome`, `pacienteNome`, `cameraIdentificador`, `alertaNivel` |
| `fetchAmbientes(tenantId)` | `AmbienteResumo[]` — nome, tipo, contagem de câmeras, paciente vinculado |
| `fetchCameras(tenantId)` | `CameraResumo[]` — `conectada` (bool real, não a coluna), ocorrências nas últimas 24h |
| `fetchOperationalOverview(tenantId)` | contadores: alertas críticos, casos abertos, incidentes 24h |

Hooks já prontos:

- `useAlertas(tenantId)` (`data/useAlertas.ts`) — ocorrências em tempo real via
  WebSocket com fallback de polling. **Use este hook para qualquer lista de
  alertas/eventos.** Não crie um novo fetch de ocorrências do zero.
- `useResumoOperacional(tenantId)` (`data/useResumoOperacional.ts`) — os três
  contadores do topo, já usado pela Sidebar e pelo Header.
- `useAuth()` (`contexts/AuthContext.tsx`) — devolve `tenantId`, `user.name`,
  `can(modulo, acao)`.

Referência de como isso já foi feito direito nesta base: `PatientListScreen.tsx`
(`components/pep/PatientListScreen.tsx`) — busca com `useEffect`, estado de
carregando/erro, sem dado inventado. Copie o padrão, não a tela.

Formatação de tempo relativo ("há 5 min"): já existe em
`components/AlertsScreen.tsx`, função `quandoFoi(iso)` — extraia para
`data/` (ex.: `data/tempo.ts`) na primeira vez que for reusar em duas telas,
em vez de copiar a função.

### Restrições que não podem ser violadas

**Não invente número novo.** Trocar `heartRate: 125` por qualquer outro valor
fixo não resolve nada — o objetivo é remover o que o produto não mede, não
mudar o número mockado.

**Git.** Mensagens em português, `tipo(escopo): descrição`, sem trailer de
coautoria. Branch `qa`. Não commite sem o usuário pedir.

**Não toque em `backend/` nem em `visao/` neste plano.** Tudo aqui é
`frontend/src/app/`. Se notar que falta um endpoint (ex.: para "leitos"),
registre no critério de aceite da Parte E — não crie endpoint novo sem
combinar antes.

### Verificação obrigatória antes de encerrar qualquer parte

```bash
cd C:/Projetos/MedSignal/frontend && npx tsc --noEmit && npm test -- --run && npm run build
```

Hoje (13/09/2026) o esperado é: typecheck limpo, **95 testes passando**, build
sem erro. Se esse número de testes cair, algo quebrou — teste removido não é
teste corrigido.

---

## Prioridade 1 — Tirar do menu o que é outro produto

**Maior retorno, menor esforço. Faça isto primeiro.**

Os seguintes itens do menu abrem telas que não chamam nenhuma função de
`data/api.ts` — confirmado por busca no código, zero ocorrências de `fetch`
ou `useAuth` nos seis arquivos:

| Tela | Arquivo | Item no menu (`Sidebar.tsx`) |
|---|---|---|
| Gestão Hospitalar | `components/HospitalManagementScreen.tsx` | linha ~197 |
| Financeiro | `components/FinancialScreen.tsx` | linha ~198 |
| Estoque | `components/InventoryScreen.tsx` | linha ~199 |
| Recursos Humanos | `components/HRScreen.tsx` | linha ~200 |
| Agenda Médica | `components/SchedulingScreen.tsx` | linha ~144 |
| Relatórios (BI genérico) | `components/ReportsScreen.tsx` | linha ~183 |

`ReportsScreen.tsx` **não é** o exportador de CSV do prontuário — aquele é
`data/exportarCsv.ts`, usado só dentro do PEP, e continua existindo. Este
`ReportsScreen.tsx` é uma tela de "Dashboards Operacionais" com gráfico
solto, sem fonte de dado nenhuma.

### O que fazer

1. Em `components/Sidebar.tsx`, remover as seis entradas da tabela acima (ou
   trocar por `disabled: true` sem `screen`, no mesmo padrão já usado em
   "Sensores IoT", "Chatbot", "Análise Preditiva (IA)" — itens que já
   aparecem esmaecidos porque o produto ainda não faz aquilo).
2. Em `App.tsx`: remover os seis `import` correspondentes, as seis linhas de
   render condicional (~272–289) e as seis entradas em `screenInfo`
   (~196–203).
3. Em `data/rbac.ts`: remover os seis identificadores de `Screen` (~10–18) e
   as seis linhas de `screenModuleMap` (~29–37).
4. Apagar os seis arquivos de tela (`HospitalManagementScreen.tsx`,
   `FinancialScreen.tsx`, `InventoryScreen.tsx`, `HRScreen.tsx`,
   `SchedulingScreen.tsx`, `ReportsScreen.tsx`) e qualquer componente que só
   é usado por eles (confira com uma busca antes de apagar cada um).
5. Rode uma busca por `hospital-management`, `financial`, `inventory`, `'hr'`,
   `scheduling`, `ReportsScreen` no projeto inteiro depois — não pode sobrar
   referência.

**Não precisa disabled com aviso aqui.** Esse padrão (`AvisoForaDoMVP`) faz
sentido quando a tela mostra a visão de produto de algo que *vai* existir e
tem lugar no modelo de dados. RH e Financeiro não são o futuro do MedSignal —
são sobra de um template genérico de admin. É para sumir do menu, não para
ficar avisando que está desativado.

### Critério de aceite

- Nenhum dos seis nomes de arquivo aparece mais em `grep -r` no projeto
- O menu lateral não tem mais "Gestão Hospitalar", "Financeiro", "Estoque",
  "Recursos Humanos", "Agenda Médica" nem "Relatórios"
- `tsc --noEmit` limpo (sobra de import quebra o build, não só o lint)

---

## Prioridade 2 — Dashboard real (a tela de pouso)

`components/DashboardScreen.tsx`, 1096 linhas, é a tela que abre depois do
login (`App.tsx`, `useState<Screen>('dashboard')`). Tem cinco abas internas
(`overview`, `realtime`, `alerts`, `beds`, `clinical`), todas em cima de três
listas fixas no topo do arquivo: `mockPatients` (8 pacientes inventados, com
`heartRate`/`temperature`/`saturation`), `mockEvents` e `mockAlerts`.

### Duas abas somem, três ficam

**Removidas — mostram capacidade que o produto não tem:**

- **`realtime`** (linha 690): tabela de "sinais vitais" ao vivo — frequência
  cardíaca, temperatura, saturação. Não existe sensor nem coluna no banco
  para isso.
- **`clinical`** (linha 991): gráfico de tendência de sinais vitais
  (`vitalSignsTrendData`) — mesma razão.
- **`beds`** (linha 899): ocupação de leito por andar (`bedOccupancyByFloorData`)
  — duplica a tela dedicada de leitos (Parte E) com dado igualmente
  inventado. Corrija uma vez, não duas.

**Fica, mas reescrita com dado real:**

- **`overview`**: cartões de contagem, lista de pacientes, feed de eventos
  recentes.
- **`alerts`** (linha 788): considere se ainda faz sentido depois da
  `overview` reescrita — `components/AlertsScreen.tsx` já é a tela real e
  completa de alertas, com todo o ciclo de atendimento (RF17-RF20). Se esta
  aba do Dashboard só repetir o mesmo feed em miniatura, prefira removê-la e
  deixar um link/atalho para a tela de Alertas de verdade, em vez de manter
  duas implementações do mesmo feed.

Depois de remover as três abas, `viewTabs` (linha ~327) e o `DashboardView`
type (linha 59) perdem as entradas correspondentes.

### `overview` com dado real

Trocar as três listas fixas por estado + `useEffect`, no padrão do
`PatientListScreen.tsx`:

```tsx
const { tenantId } = useAuth();
const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
const { ocorrencias, carregando: carregandoOcorrencias } = useAlertas(tenantId);
// fetchPacientes(tenantId) num useEffect, igual ao PatientListScreen
```

- Cartões de contagem (`criticalCount`/`attentionCount`/`normalCount`, linha
  ~320): contam por `paciente.situacao` em vez de `paciente.status`.
- `activeAlerts`: `ocorrencias.filter(o => o.status !== 'encerrada').length`.
- Lista de pacientes (`PatientRow`, ver abaixo): vem de `pacientes`, não de
  `mockPatients`.
- Feed de eventos recentes (`EventCard`): vem de `ocorrencias.slice(0, N)`,
  mapeando `tipoEvento → title`, `ambienteNome → location`,
  `pacienteNome → patient`, `quandoFoi(dataHora) → time`.

### Gráficos: só os que dá para calcular com dado real

| Gráfico atual | O que fazer |
|---|---|
| `patientStatusDistribution` (linha 262) | Mantém — já é derivado de `mockPatients`; troque a fonte para `pacientes` reais e o cálculo continua igual |
| `occupationBySectorData`, `occupation24hData`, `bedOccupancyByFloorData` | Remove — não há "setor" nem "andar" no modelo de dados |
| `alerts24hData`, `alertsByHourData` | Recalcule a partir de `ocorrencias` reais (agrupar por hora do `dataHora`) em vez de array fixo. Se a base de ocorrências ainda for pequena demais para o gráfico dizer algo, é melhor remover o gráfico do que preencher com número fixo |
| `alertsByTypeData` | Recalcule agrupando `ocorrencias` por `tipoEvento` |
| `vitalSignsTrendData` | Remove — não existe |

### `PatientRow.tsx` e `EventCard.tsx`

`components/PatientRow.tsx` tem `heartRate`/`temperature` como colunas fixas
(linhas 19-20, 52-63) — remova as duas colunas e a prop correspondente; troque
`location: { hospital, sector, room, bed }` pelo par real
`ambienteNome`/`ambienteTipo` de `PacienteResumo`.

`components/EventCard.tsx` já é genérico o bastante (`title`, `location`,
`time`, `patient`, `type`) — não precisa mudar, só passar `OcorrenciaResumo`
mapeado para essa forma.

`components/StatCard.tsx`: confira as props antes de reusar; se for só
`{label, value, icon}` deve servir sem alteração.

### Critério de aceite

- `mockPatients`, `mockEvents`, `mockAlerts` não existem mais no arquivo
- As abas `realtime`, `clinical` e `beds` (ou `alerts`, se decidido remover)
  não existem mais
- Login e olhar o Dashboard com o backend no ar mostra os pacientes e
  ocorrências reais do banco, não os oito nomes fixos
- Nenhum "bpm", "°C" ou "%SpO2" em lugar nenhum do arquivo

---

## Prioridade 3 — Central de notificações real

`components/NotificationCenter.tsx` é aberta pelo sino do cabeçalho — está em
**todas as telas**, sempre um clique de distância, montada direto em
`App.tsx` (linha ~295).

`mockNotifications` (linha 24) tem sete itens, e cinco das sete fontes citadas
não existem no produto: "Sistema de Medicação", "Laboratório", "Gestão de
Leitos", "IA Preditiva", "Sistema de Mensagens", "Gestão de Estoque".

### O que fazer

Trocar por `useAlertas(tenantId)` e mapear `OcorrenciaResumo` para o formato
de notificação:

- `type`: derive de `alertaNivel` ou `tipoEvento` (queda confirmada → `critical`)
- `title`/`message`: monte a partir de `tipoEvento` + `pacienteNome` +
  `ambienteNome` — sem inventar frase de "medicação atrasada" ou "resultado de
  exame"
- `timestamp`: `dataHora`
- `source`: um valor fixo tipo `"Detecção por câmera"` é honesto; "Sistema de
  Mensagens" não é
- `read`: se não houver campo de lido/não lido no back, pode ficar todo
  `false` até existir — não invente um `Math.random()` para variar

Isso também reduz duplicação: o mesmo `useAlertas` já alimenta
`AlertsScreen.tsx` e vai alimentar o Dashboard (Prioridade 2). Uma fonte,
três lugares mostrando.

### Critério de aceite

- `mockNotifications` não existe mais
- Abrir o sino com o backend no ar mostra ocorrências reais, não os sete
  itens fixos
- Nenhuma fonte de notificação cita um módulo que não existe (farmácia,
  laboratório, RH, mensagens)

---

## Prioridade 4 — App mobile: home e alertas reais, o resto some

`MobileApp.tsx` é alcançável de verdade dentro do próprio sistema: o botão
"Ver Versão Mobile" (`App.tsx`, `viewMode === 'mobile'`, linha ~143) abre um
simulador de celular com esse app dentro. Não é código morto — é algo que um
comprador clica durante a demonstração.

Todos os 8 arquivos em `components/mobile/` são autocontidos: nenhum chama
`fetch` ou `useAuth`. `MobileApp.tsx` tem seu próprio `mockPatients` com
`heartRate`/`temperature`/`bloodPressure`, nome de usuário fixo
(`userName="Ana Dias"`) e contador de notificação fixo (`notificationCount = 11`).

### Ficam, reescritas com dado real

- **`HomeScreen`** (lista de pacientes): `MobileApp.tsx` passa `pacientes`
  como prop — troque `mockPatients` por `fetchPacientes(tenantId)`, no mesmo
  padrão da Prioridade 2. O tipo `MobilePatient` (`components/mobile/types.ts`)
  tem `heartRate`/`temperature`/`bloodPressure` — remova os três campos e o
  que os renderiza em `PatientCard.tsx` e `PatientDetailScreen.tsx`.
- **`AlertsScreen`** (mobile, `components/mobile/AlertsScreen.tsx`): tem seu
  próprio `mockAlerts` (linha 13) — troque por `ocorrencias` vindas de
  `useAlertas(tenantId)`, passada como prop de `MobileApp.tsx` (que passa a
  chamar o hook).
- **Nome do usuário e contador de notificação**: `useAuth().user.name` no
  lugar de `"Ana Dias"`; contagem real de ocorrências não lidas no lugar de
  `11`.

### Somem do menu inferior (`MobileBottomNav.tsx`)

`MessagesScreen` (mensagens entre equipe — não existe tabela de mensagem no
banco), `RoomsScreen` (salas genéricas, sem câmera nem ocorrência) e
`ReportsScreen` (mobile, BI genérico) são tão desconectadas do produto quanto
os itens da Prioridade 1. Mesmo tratamento: tirar do menu inferior, apagar os
três arquivos, e ajustar o `activeTab` type em `MobileApp.tsx` para só
`'home' | 'alerts'`.

### Critério de aceite

- Nenhum `heartRate`, `temperature` ou `bloodPressure` em `components/mobile/`
- `"Ana Dias"` não aparece mais no código
- O menu inferior do simulador mobile só tem Home e Alertas
- Abrir "Ver Versão Mobile" com backend no ar mostra os mesmos pacientes e
  ocorrências que a versão web

---

## Prioridade 5 (opcional, se sobrar tempo) — Leitos & Quartos com dado real

`components/BedsRoomsScreen.tsx`, alcançável pelo menu ("Leitos & Ocupação"),
modela andar → quarto → leito individual (`mockData`, linha 32) com nome de
paciente, status e "última ocorrência" tudo inventado. **O banco não tem
conceito de andar nem de leito individual** — só `ambiente` (quarto/sala,
associado a câmeras).

Duas saídas, escolha uma:

**A. Simplificar para o que existe** (menor esforço): trocar a grade de
andar/quarto/leito por uma lista de `AmbienteResumo` (`fetchAmbientes`) — nome
do ambiente, tipo, quantas câmeras, paciente vinculado, e status de conexão
das câmeras (`fetchCameras`, campo `conectada`). Perde a visual de "mapa de
leito", ganha ser 100% real.

**B. Tirar do menu**, como a Prioridade 1, se não houver tempo para nem a
opção A. Pior para o produto (a tela some), melhor que deixar leito e andar
fictício no ar.

Não crie tabela nova no banco para isto agora — isso é mudança de schema,
fora do escopo deste plano (frontend only). Se decidir que "leito
individual" é uma funcionalidade real que vale a pena, registre como
melhoria futura e trate como projeto à parte.

### Critério de aceite

- Ou a tela mostra só ambientes/câmeras reais, ou ela não está mais no menu
- Nenhum `mockData` com andar/leito fictício sobrando no arquivo

---

## Prioridade 6 (5 minutos) — Avisos de "fora do MVP" sem citar RFC

O prontuário (`components/pep/tabs/*`) já tem um padrão honesto para telas
que mostram a visão de produto sem fingir que funcionam: `AvisoForaDoMVP`, em
`components/pep/ForaDoMVP.tsx`. O texto hoje diz:

> "**Demonstração da visão de produto.** {oque} não faz parte da v1 de
> detecção de quedas (RFC, seção 2.6) e não existe no modelo de dados."

Citar "RFC, seção 2.6" para um comprador não passa credibilidade — passa
trabalho acadêmico. Como o componente é usado em um lugar só, é uma troca de
uma linha:

```tsx
// de:
{oque} não faz parte da v1 de detecção de quedas (RFC, seção 2.6) e não existe no modelo de dados.
// para:
{oque} é a visão de produto para uma versão futura e ainda não existe no modelo de dados.
```

Mantém a honestidade ("dados ilustrativos", "ações desativadas" continuam
como estão) sem o jargão de disciplina.

### Critério de aceite

- Nenhuma tela do produto cita "RFC" no texto visível ao usuário

---

## Ordem de execução

```
[sessão]  1. Tirar do menu as seis telas sem dado real (maior retorno)
[sessão]  2. Dashboard: remover 3 abas fictícias, reescrever "overview" com dado real
[sessão]  3. Central de notificações com useAlertas
[sessão]  4. App mobile: home e alertas reais, tirar mensagens/salas/relatórios
[sessão]  5. (opcional) Leitos & Quartos
[sessão]  6. Reescrever o texto do aviso "fora do MVP"
```

Cada prioridade é independente das outras — pode parar depois de qualquer
uma e já ter deixado o produto mais honesto do que estava.

## O que fica de fora deste plano, de propósito

- **`DashboardBuilder.tsx`**: é uma ferramenta de configuração (montar um
  dashboard customizado), não uma tela que mostra dado do paciente como se
  fosse real — os gráficos de exemplo (`mockLineData` etc.) são preview de
  como um widget ficaria, papel parecido com um template de apresentação.
  Menor prioridade; se mexer, troque só a tabela de exemplo
  (`mockPatients`/`mockAlerts`, linha ~321) por 2-3 linhas claramente
  fictícias (ex.: "Paciente Exemplo 1"), em vez de nomes realistas.
- **Validação do modelo de IA** — não é deste plano; ver `docs/PLANO_IA.md`.
- **Leito individual como entidade real no banco** — mudança de schema,
  decisão de produto, não uma limpeza de tela.

---

## Estado em 13/09/2026 — as seis prioridades foram feitas

| Prioridade | O que ficou |
|---|---|
| 1. Menu | Gestão Hospitalar, Financeiro, Estoque, RH, Agenda Médica e Relatórios saíram do menu, do `App.tsx`, do `rbac.ts`, do teste e do disco. Nenhuma referência sobrou. |
| 2. Dashboard | `DashboardScreen.tsx` reescrito (1096 → ~330 linhas), sem abas: contadores, três gráficos calculados das ocorrências e pacientes reais (com "sem dados" quando a base é pequena), últimas ocorrências, câmeras e a tabela de pacientes com filtro por situação. `PatientRow` e `EventCard` refeitos sobre `PacienteResumo` e `OcorrenciaResumo`. O seletor de "dashboards customizados" fictícios saiu; o botão "Novo dashboard" continua abrindo o `DashboardBuilder`. |
| 3. Notificações | `NotificationCenter.tsx` lê do `useAlertas`; fonte única "Detecção por câmera"; lida/dispensada ficam na sessão; ocorrência com ciência dada conta como lida. |
| 4. Mobile | Só Pacientes e Alertas. Pacientes de `fetchPacientes`, alertas do `useAlertas`, nome de `useAuth().user.name`, contador = pendentes. Detalhe do paciente mostra as ocorrências reais dele (`fetchOcorrenciasDoPaciente`). "Iniciar atendimento" chama `iniciarAtendimento` quando o perfil permite. Quartos, mensagens, relatórios e `types.ts` apagados. |
| 5. Ambientes | Opção A: `BedsRoomsScreen.tsx` virou "Ambientes monitorados" (`fetchAmbientes` + `fetchCameras`): tipo, paciente, câmeras com conexão real, ocorrências 24 h. `InteractiveBedMap` apagado. Item do menu renomeado. |
| 6. Aviso | `AvisoForaDoMVP` e as sete outras menções visíveis a "RFC, seção 2.6" nas abas do prontuário reescritas ("fora desta versão"). A referência à RFC ficou só em comentário de código. |

Também: `quandoFoi` extraída para `data/tempo.ts`; leituras derivadas das ocorrências (rótulos, gravidade, agrupamento por hora e por tipo) em `data/ocorrencias.ts`, com testes; tabelas de exemplo do `DashboardBuilder` renomeadas para "Paciente Exemplo".

Verificado: `tsc` limpo, **96 testes** (95 antes; saíram 6 casos das telas removidas, entraram 7 dos novos helpers), `npm run build` sem erro. **Não** verificado no navegador com dado real: as telas exigem login, e a sessão não digita senha.
