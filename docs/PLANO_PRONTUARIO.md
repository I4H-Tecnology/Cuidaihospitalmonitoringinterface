# Plano do prontuário e limpeza do menu

> **Para quem for executar numa sessão nova.** Leia a seção 0 antes de
> qualquer outra coisa. Diferente do `docs/PLANO_VITRINE_COMERCIAL.md`
> (só frontend), **este plano mexe em backend e banco também** — a Parte B
> precisa disso, e é o próprio pedido: toda informação nova tem que vir do
> banco, igual às outras telas, não pode ser mais uma tela com dado solto.

> Contexto de negócio, não da RFC: o objetivo é o prontuário eletrônico (PEP)
> ficar mais completo e o menu parar de ter item morto. Onde a RFC e o DER já
> resolvem a questão (o que pode e o que não pode existir), a razão citada é
> essa; onde não, a razão é só "isso não devia estar assim".

Duas frentes, independentes entre si:

- **Parte A** — itens do menu que não fazem nada, ou que já não fazem sentido
  depois da limpeza anterior (`docs/PLANO_VITRINE_COMERCIAL.md`). São achados
  concretos, não suspeita — cada um foi lido no código antes de entrar aqui.
- **Parte B e C** — o prontuário. B é a única coisa nova e real que dá para
  adicionar sem inventar dado; C é reduzir as seis abas ilustrativas do PEP
  para uma só, porque seis telas repetindo o mesmo aviso é pior que uma.

---

## 0. Contexto para executar

```
Projeto:   C:\Projetos\MedSignal
Branch:    qa        (nunca commitar em dev nem em main)
Frontend:  C:\Projetos\MedSignal\frontend
Backend:   C:\Projetos\MedSignal\backend
```

```bash
cd C:/Projetos/MedSignal && docker compose run --rm dev
```

Sobe banco, API e frontend. Login de teste: tenant/usuário do seed
(`db/scripts/criar-admin.sql` se ainda não existir um).

### Restrições que não podem ser violadas

**Toda informação nova vem do banco, ponto.** Nada de lista fixa no código,
nem "por enquanto" — se o dado não existe numa tabela, a funcionalidade não
entra nesta versão (vai para "o que fica de fora", no final). Isso vale tanto
para o que a Parte B cria quanto para qualquer ajuste na Parte A.

**Backend em Docker é imagem, não bind mount.** Depois de mudar
`backend/app`, rebuilda:

```bash
docker compose up -d --build backend
```

**Migração de schema.** Se algo aqui precisar de coluna ou tabela nova,
o arquivo é `db/init/01_schema.sql` (schema) ou `db/init/03_seed.sql` (dado
de exemplo) — mas recriar o volume apaga o banco local:

```bash
docker compose down -v && docker compose run --rm dev
```

Avise antes de fazer isso; se o usuário já tiver dado real no banco local,
prefira uma migração incremental (`db/scripts/`) a recriar o volume.

**Git.** Mensagens em português, `tipo(escopo): descrição`, sem trailer de
coautoria. Não commite sem o usuário pedir.

**Não invente número.** Vale para tudo: se uma métrica não existe, mostra
"—" ou omite, nunca um valor fixo.

### Verificação obrigatória antes de encerrar qualquer parte

```bash
cd C:/Projetos/MedSignal/frontend && npx tsc --noEmit && npm test -- --run && npm run build
cd C:/Projetos/MedSignal && python -m py_compile backend/app/*.py backend/app/rotas/*.py
```

Hoje (13/09/2026): typecheck limpo, **96 testes** no frontend, build sem
erro, backend compilando. Se o número de testes cair, algo quebrou.

---

## 1. O que já foi verificado no código

Referência rápida — cada linha abaixo foi lida, não suposta:

| Achado | Onde |
|---|---|
| "App Paciente" no menu não navega para lugar nenhum e não está `disabled` | `components/Sidebar.tsx`, seção SISTEMA |
| "Segurança" no menu não navega para lugar nenhum; a função real (política de senha) já mora em Usuários | `components/Sidebar.tsx`, seção SISTEMA; `components/UsersScreen.tsx` usa `fetchSecurityPolicy`/`saveSecurityPolicy` |
| "Detecção de Quedas" aparece **desativada**, do lado de "Monitoramento em Tempo Real", que já é detecção de queda funcionando | `components/Sidebar.tsx`, seção MONITORAMENTO INTELIGENTE |
| `MODULOS` do backend ainda lista `appointments`, `hospital_management`, `financial`, `inventory`, `hr` — módulos de telas que não existem mais desde a limpeza anterior | `backend/app/comum.py:59-63` |
| `/health` (o que o Docker usa para saber se a API está de pé) responde `"aviso": "andaime, nao usar em producao"` — mas é exatamente o endpoint usado em produção pelo healthcheck | `backend/app/rotas/painel.py:26-29`, `docker-compose.yml` (healthcheck do serviço `backend`) |
| A tabela `acompanhante` (RN03-RN07) existe, tem regra de negócio real cumprida no backend (revogação automática na alta), mas **não tem nenhuma rota de criação, listagem ou revogação manual** — só é tocada de dentro da rota de alta | `db/init/01_schema.sql` (tabela 10); `backend/app/rotas/pacientes.py:172-180` |
| O PEP tem 9 abas; 2 são reais (Visão Geral, Histórico), 1 duplica o Histórico com sugestão de IA fabricada, e 6 repetem o mesmo aviso de "fora do MVP" cada uma com seu próprio mock | `components/pep/PEPScreen.tsx`; `components/pep/tabs/*.tsx` |

---

## Parte A — Limpar o que não faz nada

### A1. "App Paciente" e "Segurança": botão morto no menu

`Sidebar.tsx`, seção `SISTEMA`:

```tsx
{ icon: <Smartphone className="w-5 h-5" />, label: 'App Paciente' },
{ icon: <Shield className="w-5 h-5" />, label: 'Segurança', module: 'security' },
```

Nenhum dos dois tem `screen` nem `onClick`. `handleItemClick` (linha ~254) não
faz nada quando isso acontece — o item aparece clicável, sem indicação
visual de que não leva a lugar nenhum. É exatamente o problema que o próprio
projeto já resolveu em outro lugar (`components/pep/ForaDoMVP.tsx`): botão
que não faz nada é pior que botão ausente.

**"Segurança" some.** A função (política de senha, bloqueio, 2FA) já existe
e funciona dentro de Usuários (`UsersScreen.tsx`, `fetchSecurityPolicy`).
Ter uma segunda entrada de menu não navegável para a mesma coisa não ajuda
ninguém.

**"App Paciente" fica, mas marcado como o resto dos itens futuros:**

```tsx
{ icon: <Smartphone className="w-5 h-5" />, label: 'App Paciente', disabled: true },
```

É um app diferente do que já existe (o `MobileApp.tsx` é para a equipe, não
para o paciente/família) — não tem endpoint, não tem tela, não tem token de
acesso pensado. `disabled: true` é a forma honesta de dizer "existe no plano,
não existe ainda", igual aos outros 30+ itens que já usam esse padrão.

### A2. "Detecção de Quedas" desativada do lado da detecção de quedas ligada

`Sidebar.tsx`, seção `MONITORAMENTO INTELIGENTE`:

```tsx
{ icon: <Activity className="w-5 h-5" />, label: 'Monitoramento em Tempo Real', ..., screen: 'monitoring' },
{ icon: <Bell className="w-5 h-5" />, label: 'Alertas Clínicos', ..., screen: 'alerts' },
{ icon: <Shield className="w-5 h-5" />, label: 'Detecção de Quedas', disabled: true },
```

Detecção de queda é a única coisa que o serviço de visão faz — não é um item
futuro, é o produto rodando agora em "Monitoramento em Tempo Real". Ter uma
versão "em breve" da mesma coisa uma linha abaixo passa a impressão errada
para quem está avaliando o produto: parece que a funcionalidade central
ainda não existe. Remove a linha.

### A3. Módulos de permissão que sobraram

`backend/app/comum.py`:

```python
MODULOS = [
    "dashboard", "monitoring", "alerts", "clinical_logs", "patients",
    "beds", "appointments", "reports", "settings", "users",
    "hospital_management", "financial", "inventory", "hr",
]
```

`appointments`, `hospital_management`, `financial`, `inventory` e `hr` eram
os módulos das telas apagadas na limpeza anterior (Financeiro, RH, Estoque,
Gestão Hospitalar, Agenda). Ninguém voltou para tirar daqui, e por isso a
tela de permissões (Usuários → editar perfil) ainda lista cinco módulos para
ligar/desligar acesso a telas que não existem mais. Remove os cinco. Se a
Parte B for feita, adiciona `companions` no lugar (ver critério de aceite
de B).

### A4. `/health` que se descreve como descartável

`backend/app/rotas/painel.py`:

```python
@router.get("/health")
def health():
    db.buscar_um("SELECT 1 AS ok")
    return {"status": "ok", "banco": "conectado", "aviso": "andaime, nao usar em producao"}
```

Esse texto é de quando o `backend/` era mesmo um andaime provisório. Hoje é
o endpoint que o `docker-compose.yml` usa para decidir se a API está de pé
(`healthcheck` do serviço `backend`, e agora também do atalho
`docker compose run --rm dev`). Infraestrutura de produção não deveria se
autodescrever como "não usar em produção". Tira o campo `aviso` — o retorno
vira só `{"status": "ok", "banco": "conectado"}`.

### Critério de aceite da Parte A

- Nenhum item do menu é clicável sem navegar a lugar nenhum e sem estar
  `disabled`
- "Segurança" não existe mais como entrada separada de menu
- "Detecção de Quedas" não existe mais como item desativado
- `MODULOS` não lista módulo de tela que não existe
- `/health` não menciona "andaime" nem "não usar em produção"
- `docker compose run --rm dev` continua funcionando (o healthcheck não quebrou)

---

## Parte B — Acompanhantes: a peça real que falta no prontuário

### Por que esta e não outra coisa

O DER da RFC tem doze entidades. Sinal vital, evolução, prescrição e exame
não são uma delas — não tem onde guardar isso sem inventar tabela nova, e
tabela nova sem o usuário decidir isso é escopo que ninguém pediu. **Acompanhante
é diferente: já é uma das doze**, já tem RN03 a RN07 escritas, já tem uma
regra de negócio cumprida no backend (revogar acesso na alta) — só falta a
metade que cria, lista e revoga. É a única adição a este prontuário que é
100% dado real, 0% invenção.

O que a RFC manda (RN03-RN07): um acompanhante é vinculado a exatamente um
paciente; recebe um QR Code que dá acesso a UMA câmera (a do paciente dele);
o acesso expira; pode ser revogado a qualquer momento; e morre
automaticamente na alta (já funciona).

### Backend — rotas novas em `backend/app/rotas/acompanhantes.py`

Use `backend/app/rotas/cameras.py` como referência de estilo (é o exemplo
mais parecido: listar com JOIN, criar com validação de posse, mascarar dado
sensível). Import no `main.py` e `app.include_router(acompanhantes.router,
tags=["acompanhantes"])`, junto dos outros.

**Schemas** (`backend/app/schemas.py`), no padrão dos existentes:

```python
class AcompanhanteResumo(BaseModel):
    id: str
    nome: str
    documento: str
    ativo: bool
    expiraEm: str
    revogadoEm: str | None
    criadoEm: str

class AcompanhantePayload(BaseModel):
    tenantId: str
    pacienteId: str
    nome: str = Field(min_length=3, max_length=120)
    documento: str = Field(min_length=5, max_length=20)
    validadeHoras: int = Field(default=72, ge=1, le=720)  # 30 dias no máximo
```

**Token do QR**: gera com `secrets.token_urlsafe(32)`, devolve o token EM
CLARO só na resposta da criação (é a única vez que existe em texto puro), e
guarda o hash no banco com o mesmo mecanismo que `usuarios.py` já usa para
senha — `crypt(%s, gen_salt('bf', 12))` do `pgcrypto`, que a extensão já
está habilitada (`db/init/01_schema.sql`, topo do arquivo). Verificar depois
é `crypt(candidato, token_qrcode) = token_qrcode`.

**Rotas:**

```
GET  /api/pacientes/{pacienteId}/acompanhantes    lista, mais recentes primeiro
POST /api/acompanhantes                            cria; devolve o token em claro
POST /api/acompanhantes/{id}/revogar                ativo=false, revogado_em=now()
```

Regras que o banco já não deixa violar (a rota só precisa não brigar com
elas): `expira_em` não pode ser nulo; revogar exige `revogado_em` preenchido
(`acompanhante_revogacao_coerente`); `token_qrcode` é único.

Permissão: módulo novo `companions` (inglês, para ficar no padrão dos que já
existem — `dashboard`, `monitoring`, `patients`). `view` para listar, `edit`
para criar e revogar. Adiciona em `MODULOS` (Parte A3) e no seed de perfis se
o projeto tiver um (`db/init/03_seed.sql`) — confira antes: se os perfis
padrão (Enfermeiro, Médico, Administrativo) não citam módulo por módulo,
não precisa mexer lá.

### Frontend — nova aba "Acompanhantes" no PEP

`frontend/src/app/data/api.ts` — adicionar no mesmo arquivo, perto de
`fetchPacientes`:

```ts
export interface AcompanhanteResumo {
  id: string;
  nome: string;
  documento: string;
  ativo: boolean;
  expiraEm: string;
  revogadoEm: string | null;
  criadoEm: string;
}

export interface AcompanhanteCriado extends AcompanhanteResumo {
  /** Só existe nesta resposta. Depois disso, não há como recuperar — o backend guarda só o hash. */
  tokenQrcode: string;
}

export const fetchAcompanhantes = (tenantId: string, pacienteId: string) => ...
export const criarAcompanhante = (payload: {...}) => ...
export const revogarAcompanhante = (tenantId: string, id: string) => ...
```

Nova aba (`components/pep/tabs/CompanionsTab.tsx`), no padrão de
`PatientListScreen.tsx` (busca com `useEffect`, estado de carregando/erro):

- Lista de acompanhantes do paciente: nome, documento, status (ativo/expirado/revogado
  — calcule "expirado" comparando `expiraEm` com agora, não é campo do banco),
  validade, botão revogar (`BotaoIndisponivel`-style não se aplica aqui — a
  ação existe de verdade, é botão normal com confirmação)
- Botão "Novo acompanhante": abre modal com nome, documento, validade em
  horas — no padrão de `ModalPaciente.tsx`
- **Depois de criar, mostra o QR Code uma vez só**, com aviso claro de que não
  vai aparecer de novo (é a mesma UX de "mostrar a senha uma vez" que
  qualquer sistema sério usa para segredo de curta duração)

Para renderizar o QR de verdade (a RN05/RN06 falam em QR Code, não em link
de texto), adicionar uma dependência pequena — `qrcode.react` ou
`react-qr-code` — e rodar `npm audit` depois de instalar, no mesmo espírito
da limpeza que já tirou `xlsx`/`jspdf` por vulnerabilidade. Se preferir não
adicionar dependência agora, alternativa aceitável: mostrar o link/token com
botão de copiar, e registrar o QR visual como próximo passo — mas diga
isso explicitamente na tela, não deixe parecer que o QR devia estar ali e
sumiu.

Registrar a aba em `PEPScreen.tsx` (import + `tabs` + render condicional),
igual às outras.

### Critério de aceite da Parte B

- `POST /api/acompanhantes` cria um registro real, com token hasheado no
  banco (nunca em claro fora da resposta de criação)
- Dar alta no paciente (fluxo já existente) continua revogando os
  acompanhantes ativos — não pode regredir
- A aba mostra dado de `fetchAcompanhantes`, nunca uma lista fixa
- Revogar manualmente funciona e reflete no banco (`ativo=false`,
  `revogado_em` preenchido)
- `companions` aparece em `MODULOS` e na tela de permissões

---

## Parte C — Consolidar as seis abas ilustrativas do PEP

### O que existe hoje

`PEPScreen.tsx` tem 9 abas. Duas são reais (Visão Geral, Histórico
Completo). As outras sete:

| Aba | Arquivo | O que é |
|---|---|---|
| Linha do Tempo Clínica | `ClinicalTimelineTab.tsx` | ilustrativa (`AvisoForaDoMVP`) |
| Evoluções | `EvolutionsTab.tsx` | ilustrativa |
| Medicações | `MedicationsTab.tsx` | ilustrativa (725 linhas — a maior do PEP) |
| Exames | `ExamsTab.tsx` | ilustrativa |
| Sinais Vitais | `VitalSignsTab.tsx` | ilustrativa |
| Documentos | `DocumentsTab.tsx` | ilustrativa |
| Alertas & IA | `AIAlertsTab.tsx` | **não** é ilustrativa como as outras — mostra ocorrência real *e* sugestão de IA fabricada (`aiSuggestion`, com texto de recomendação inventado) misturadas na mesma lista |

### `AIAlertsTab` some — não vira "fora do MVP", vira nada

O conceito real dela (ocorrência detectada, câmera, escore de confiança,
linha do tempo) já está inteiro em `HistoryTab.tsx`, com dado real. O que
`AIAlertsTab` acrescenta é só a sugestão de IA fabricada — recomendação
como "avaliar reforço de vigilância" que nenhum modelo gerou. Isso não é
"visão de produto futura" no mesmo sentido das outras seis: é a mesma
informação real duplicada com uma camada de invenção em cima. Apaga o
arquivo, o `AISuggestionCard.tsx` (só é usado por ela) e a aba.

### As outras seis viram uma

Seis abas, cada uma com seu próprio mock e seu próprio `AvisoForaDoMVP`,
para dizer a mesma coisa seis vezes: "isso é visão de produto, não existe no
modelo de dados". Isso não é mais completo que uma aba só — é mais clique
para chegar no mesmo aviso, e mais chance de alguém entrar em cada uma
achando que vai ser diferente da anterior.

Criar `components/pep/tabs/RoadmapTab.tsx`, uma lista simples:

```
Sinais vitais         Frequência cardíaca, temperatura, saturação — depende de sensor, fora desta versão
Evoluções clínicas    Registro de evolução pelo profissional — sem entidade no modelo de dados
Medicações            Prescrição e administração — sem entidade no modelo de dados
Exames                Resultado de exame — sem entidade no modelo de dados
Documentos            Upload de documento do paciente — sem entidade no modelo de dados
Linha do tempo clínica  Depende de evolução e exame existirem primeiro
```

Um `AvisoForaDoMVP` só, no topo da lista, não um por linha. Apaga os seis
arquivos de aba (`ClinicalTimelineTab.tsx`, `EvolutionsTab.tsx`,
`MedicationsTab.tsx`, `ExamsTab.tsx`, `VitalSignsTab.tsx`,
`DocumentsTab.tsx`) depois de migrar qualquer texto explicativo que valha a
pena manter.

### PEP final: 4 abas

```
Visão Geral      real (OverviewTab, sem mudança)
Acompanhantes    real, nova (Parte B)
Histórico        real (HistoryTab, sem mudança)
Em breve         ilustrativa, uma só (RoadmapTab, substitui as outras seis)
```

Atualizar `PEPScreen.tsx`: tipo `TabType`, array `tabs`, imports e render
condicional.

### Critério de aceite da Parte C

- `AIAlertsTab.tsx` e `AISuggestionCard.tsx` não existem mais; nenhuma
  referência a eles sobra (`grep -r AIAlertsTab`, `grep -r AISuggestionCard`)
- As seis abas viram uma (`RoadmapTab.tsx`); os seis arquivos antigos não
  existem mais
- PEP tem 4 abas, não 9
- Nenhuma sugestão de IA fabricada em lugar nenhum do prontuário

---

## Ordem de execução

```
[sessão]  A. Limpeza do menu e dos módulos (rápido, sem risco)
[sessão]  B. Acompanhantes — backend primeiro, depois a aba
[sessão]  C. Consolidar as seis abas ilustrativas em uma
```

A e C não dependem uma da outra nem de B. B é a única com trabalho de
backend e banco — se o tempo for curto, A e C sozinhas já deixam o produto
mais limpo.

## O que fica de fora deste plano

- **Sinais vitais, evolução, prescrição, exame, documento** — nenhuma dessas
  entidades existe no DER. Adicionar exige mudança de schema e é decisão de
  produto, não limpeza; fica para quando o usuário decidir que quer isso de
  verdade.
- **QR Code renderizado como imagem** — se a sessão que executar a Parte B
  optar por não adicionar a dependência agora, registrar como pendência
  explícita na tela (não deixar como se estivesse completo).
- **Log de acesso por paciente** ("quem já viu o prontuário deste paciente")
  — `log_acesso` existe e é real, mas não tem `paciente_id`, só
  `clinica_id`/`usuario_id`/`acompanhante_id`; filtrar por paciente exigiria
  mudança de schema ou heurística sobre o campo `acao` (texto livre), que não
  é confiável. Fora deste plano.
