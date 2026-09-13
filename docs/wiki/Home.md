# MedSignal

Detecção de quedas de pacientes idosos em clínicas de repouso por visão computacional. Uma câmera observa o ambiente; o serviço de visão acompanha postura e movimentação; ao identificar uma possível queda, registra a ocorrência e dispara o alerta no painel em até 5 segundos. A enfermagem dá ciência, atende e encerra a ocorrência classificando o que aconteceu.

Projeto de Portfólio de Engenharia de Software, Centro Universitário Católica de Santa Catarina. Linha principal: **Projetos com IA (Visão Computacional)**. A especificação é a RFC `docs/_cRFC_MedSignal_N3.pdf`; cada página desta Wiki cita a seção da RFC que a motiva.

> O repositório mantém o nome original `Cuidaihospitalmonitoringinterface` para preservar o histórico. O produto foi renomeado de CuidAI para MedSignal na v1.0 da RFC (seção 5.6). O repositório é privado, por decisão tratada e aprovada com o orientador da disciplina; a seção 5.6 e o RNF20 da RFC, que falam em repositório público, ficam sujeitos a errata. Ver [[Decisões técnicas|Decisoes-tecnicas]].

## Mapa da Wiki

| Página | O que responde |
|---|---|
| [[Arquitetura]] | Os quatro contêineres do C4 nível 2, o que cada um faz e como conversam |
| [[Modelo de dados]] | As 12 entidades do DER e as regras de negócio que viraram constraint |
| [[Serviço de visão|Servico-de-visao]] | O pipeline de sete etapas, as cinco features, os sete limiares e a máquina de estados |
| [[Validação do modelo|Validacao-do-modelo]] | Metodologia (holdout, matriz de confusão, seis métricas) e **o que ainda não foi medido** |
| [[Segurança e LGPD|Seguranca-e-LGPD]] | JWT, RBAC no servidor, isolamento por clínica, retenção de 24 h, trilha de auditoria |
| [[Como rodar]] | Docker, serviço de visão nativo, variáveis do `.env`, bateria de verificação |
| [[Observabilidade]] | `/api/saude`, `/health` da visão, log estruturado, tela Saúde do Sistema |
| [[Decisões técnicas|Decisoes-tecnicas]] | As escolhas que o projeto precisa defender, com a seção da RFC de cada uma |

## Estado do projeto (11/09/2026)

| Frente | Situação |
|---|---|
| Frontend (dashboard web e app da enfermagem) | funcional; dashboard, alertas, notificações, ambientes, câmeras ao vivo, ciclo de atendimento, app mobile e tela de saúde ligados à API. Sem paciente, sinal vital ou módulo inventado desde 13/09/2026 |
| API (FastAPI) | andaime funcional: login com JWT, RBAC no servidor, câmeras, ocorrências, alertas por WebSocket, clipes, saúde |
| Serviço de visão | pipeline completo, reconexão automática, clipe de evidência com expurgo em 24 h, `/health` |
| Validação da IA | **pendente dos vídeos encenados**; arnês e calibração prontos, nenhuma métrica medida ainda |
| Núcleo comum | CI/CD, análise estática e de segurança, observabilidade e Wiki prontos |

## Onde está o código

Os links desta Wiki apontam para a branch `qa`, onde o desenvolvimento acontece. A raiz do repositório tem `README.md` com a estrutura de pastas; cada serviço tem o próprio README (`frontend/`, `backend/`, `visao/`). Os planos de trabalho que originaram estas páginas estão em `docs/PLANO_IA.md`, `docs/PLANO_RESILIENCIA.md` e `docs/PLANO_NUCLEO_COMUM.md`.

A Wiki explica **por quê**. O código mostra **como**. Quando os dois divergirem, o código é a verdade e esta página está desatualizada: abra um issue.
