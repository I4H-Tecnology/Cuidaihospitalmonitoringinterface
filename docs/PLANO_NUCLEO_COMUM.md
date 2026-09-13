# Plano do núcleo comum — análise estática e Wiki

> **Para quem for executar numa sessão nova.** Leia a seção 0 antes de
> qualquer coisa. O contexto técnico completo está em `docs/PLANO_IA.md`
> (serviço de visão) e `docs/PLANO_RESILIENCIA.md` (o que já foi entregue).

> Fonte normativa: `portfolio-directions-GERAL.md` e
> `portfolio-directions-ia.md`, no repositório The-Portfolio-Playbook da
> Católica SC, mais a RFC em `docs/_cRFC_MedSignal_N3.pdf`.

Este plano fecha os **dois últimos itens obrigatórios** do núcleo comum de
engenharia. Item obrigatório ausente reprova pela régua, independentemente de
todas as outras notas.

---

## 0. Contexto para executar

```
Projeto:  C:\Projetos\MedSignal
Branch:   qa        (nunca commitar em dev nem em main)
Remoto:   github.com/lucasmm13/Cuidaihospitalmonitoringinterface
Python:   visao/.venv/Scripts/python.exe      <- não é o do sistema
```

### Verificação obrigatória antes de encerrar

```bash
cd C:/Projetos/MedSignal/frontend && npx tsc --noEmit && npm test -- --run
cd C:/Projetos/MedSignal && visao/.venv/Scripts/python.exe -m unittest discover -s visao/testes -t .
cd C:/Projetos/MedSignal && python -m py_compile backend/app/*.py backend/app/rotas/*.py visao/app/*.py
```

Esperado: **95 testes no frontend**, **47 na visão**, typecheck limpo.

### Restrições que não podem ser violadas

**Git.** Mensagens em português, formato `tipo(escopo): descrição`, **sem
nenhum trailer de coautoria ou menção a assistente** — a autoria é do aluno, e
há prova de autoria na disciplina. Não commite sem o usuário pedir.

**Não invente número.** Nenhuma métrica de IA foi medida ainda. Se a Wiki
precisar citar precisão ou recall, escreva que a validação está pendente dos
vídeos encenados. Valor fabricado é reprovação direta nesta linha.

**A webcam acende uma luz física.** Nada neste plano precisa dela.

### Estado dos quatro itens

| Item obrigatório | Estado |
|---|---|
| Documentação em Wiki | **falta** |
| Pipeline CI/CD | pronto (`.github/workflows/ci.yml`, jobs `qualidade`, `visao`, `imagem`) |
| Análise estática de código e segurança | **falta** |
| Monitoramento ou observabilidade | pronto (`/api/saude`, `/health` da visão, tela Saúde do Sistema) |

---

## 1. O repositório é privado, e isso está decidido

O repositório é privado, por decisão tratada e aprovada com o orientador da disciplina. **Nenhuma parte deste plano
depende de visibilidade**: a Wiki do GitHub existe em repositório privado
(visível a quem tem acesso ao código), o CI roda igual, e a análise estática
escolhida abaixo roda dentro do CI, sem serviço externo.

A versão anterior deste documento mandava tornar o repositório público para
usar o SonarCloud, cujo plano gratuito exige isso. A premissa estava errada e
foi retirada; o registro fica aqui para nenhuma sessão futura repetir a
cobrança.

**Pendência de documento, não de código:** a seção 5.6 e o RNF20 da RFC
afirmam "repositório público". Como a RFC já foi entregue e avaliada, a saída
limpa é uma errata quando ela for revisada com as métricas da validação; até
lá, a decisão está registrada na Wiki (Segurança e LGPD; Decisões técnicas,
item 17). Preencher ali a data e a forma da aprovação (orientação registrada,
e-mail) assim que o usuário informar.

### Já verificado: nenhum segredo no histórico

Varredura do histórico completo feita em 11/09/2026: nenhuma senha, chave ou
token em nenhum commit; `.env` nunca foi versionado; `.env.example` tem só
campos vazios. As únicas URLs de infraestrutura (`.env.production`, `.env.qa`)
apontam para hospedagem já cancelada. Não reescrever o histórico por isso.

---

## Parte A — Análise estática e de segurança

### O que a direction exige

> *Análise estática de código e segurança (ex.: SonarQube, SonarCloud,
> CodeClimate).*

Os três nomes são exemplos; o requisito é o "e segurança": a ferramenta
precisa apontar vulnerabilidade, não só formatação.

### O que foi feito

Job `seguranca` em `.github/workflows/ci.yml`, sem serviço externo, conta ou
token, que roda a cada push e pull request:

| Ferramenta | O que cobre | Quando derruba o job |
|---|---|---|
| Semgrep OSS (`p/ci`, `p/secrets`) | regras de segurança para Python e TypeScript, segredos no código | achado de severidade ERROR |
| Bandit | vulnerabilidades em Python (backend e visão) | severidade alta |
| `pip-audit` | CVE conhecida nas dependências Python pinadas | qualquer CVE sem correção aplicada |
| `npm audit` | CVE conhecida nas dependências do frontend | severidade alta ou crítica |

Os relatórios completos (JSON e SARIF) ficam como artefato de cada execução,
inclusive os achados que não derrubam o job. `frontend/src/app/components/ui`
(shadcn, código de terceiro) fica fora da análise.

### Critério de aceite

- O job `seguranca` roda no GitHub Actions e os relatórios aparecem como artefato
- Achado de segurança alto derruba o build; o restante fica visível no relatório
- A Wiki (Decisões técnicas, item 16) explica a escolha

---

## Parte B — Wiki

### O que a direction exige

> *Documentação em Wiki junto ao repositório (Wiki do GitHub ou equivalente).*

### A boa notícia

**Quase todo o conteúdo já existe**, escrito e verificado. A tarefa é
organizar, não redigir do zero:

| Fonte | O que tem |
|---|---|
| `README.md` | visão geral, como subir o ambiente, arquitetura |
| `docs/PLANO_IA.md` | pipeline de IA, contrato dos módulos, protocolo de gravação, o que defender |
| `docs/PLANO_RESILIENCIA.md` | câmera offline, retenção de 24 h, observabilidade, o que foi verificado |
| `visao/README.md` | serviço de visão, como rodar, como registrar ocorrência |
| `visao/dados/README.md` | formato das anotações, protocolo de gravação |
| `backend/README.md` | o andaime de API |
| `db/init/*.sql` | os comentários já explicam cada regra de negócio |

### Estrutura sugerida

```
Home                      o que é o MedSignal, em 5 linhas, e o mapa da Wiki
Arquitetura               C4 nível 2 em texto, os quatro contêineres e por que
Modelo de dados           as 12 entidades do DER e as RN como constraint
Serviço de visão          o pipeline de 7 etapas e o estado de cada uma
Validação do modelo       metodologia, holdout, métricas -- e que estão pendentes
Segurança e LGPD          JWT, RBAC no servidor, retenção de 24 h, isolamento por tenant
Como rodar                Docker, serviço de visão nativo, variáveis do .env
Observabilidade           /api/saude, /health, log estruturado, tela de saúde
Decisões técnicas         por que camada de regras e não rede neural; por que "conectada" é derivada
```

A página **Decisões técnicas** é a que mais vale para a prova de autoria. É
onde ficam registradas as escolhas que o aluno vai precisar defender — e cada
uma já está justificada nos documentos de origem.

### Três regras para o conteúdo

**Não duplique o que está no código.** A Wiki explica *por que*; o código
mostra *como*. Duplicar garante divergência na primeira mudança.

**Onde não há número, diga que não há.** A página de validação deve declarar
que as métricas dependem dos vídeos encenados, com a metodologia já definida.
Isso é mais forte que silêncio, e infinitamente mais forte que número inventado.

**Cite a RFC.** Cada decisão que vem dela deve apontar a seção. É o que mostra
que o produto segue o documento entregue.

### Como publicar

A Wiki do GitHub é um repositório próprio, clonável:

```bash
git clone https://github.com/lucasmm13/Cuidaihospitalmonitoringinterface.wiki.git
```

**A Wiki só existe depois que a primeira página é criada pela interface web.**
Se o clone falhar com "repository not found", é isso: o usuário precisa abrir a
aba Wiki no GitHub e criar a Home uma vez.

### Critério de aceite

- A aba Wiki do repositório tem as páginas acima, navegáveis pela Home
- Nenhuma métrica de IA inventada; a página de validação declara o que falta
- O `README.md` aponta para a Wiki, e a Wiki aponta de volta para o código

---

## Ordem de execução

```
[sessão]   A. Análise estática e de segurança dentro do CI
[sessão]   B. Wiki a partir dos documentos que já existem
[usuário]  C. Criar a Home da Wiki pela interface e publicar; errata da RFC (5.6, RNF20)
```

---

## O que fica de fora deste plano

Registrado para não se perder:

- **Validação do modelo de IA** — depende dos vídeos encenados. Ver
  `docs/PLANO_IA.md`.
- **Dashboard, DashboardBuilder e MobileApp** ainda têm pacientes fictícios.
  Não é item obrigatório, mas o Dashboard é a primeira tela que o avaliador vê.
- **Duas orientações evidenciadas até 30/09/2026** — gate de habilitação que
  não depende de código nenhum.

---

## Estado em 11/09/2026

| Item | Situação |
|---|---|
| Visibilidade | privado, por decisão aprovada com o orientador. Nada depende disso. Errata da RFC (5.6, RNF20) pendente; data e forma da aprovação a registrar na Wiki. |
| A. Análise estática e de segurança | job `seguranca` no CI (Semgrep, Bandit, `pip-audit`, `npm audit`), relatórios como artefato. Ferramentas rodadas localmente antes: sem achado de severidade alta; as dependências vulneráveis encontradas foram atualizadas. Confirma-se verde no próximo push. |
| B. Wiki | nove páginas em `docs/wiki/`, mais `_Sidebar` e `_Footer`, com a seção da RFC em cada decisão e a validação declarada como pendente. Falta: criar a Home pela interface do GitHub uma vez e publicar com os comandos de `docs/wiki/README.md`. |

Verificado: `tsc` limpo, 95 testes no frontend, 47 na visão, tudo compilando;
`ci.yml` válido com os jobs `qualidade`, `visao`, `seguranca` e `imagem`.
