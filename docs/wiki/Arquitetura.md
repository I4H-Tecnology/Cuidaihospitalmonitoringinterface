# Arquitetura

Referência: RFC seção 5.1 (Diagrama C4), 5.3 (Principais Componentes) e 5.4 (Stack Tecnológica).

## C4 nível 2 em texto

Quatro contêineres, cada um com um processo próprio:

```
 Enfermagem / Administrador
          │  navegador
          ▼
 ┌─────────────────────┐   REST + WebSocket   ┌──────────────────────┐
 │  Frontend            │ ───────────────────▶ │  API Backend          │
 │  React + Vite + TS   │ ◀─────────────────── │  Python + FastAPI     │
 │  (nginx em produção) │      alertas         │  JWT · RBAC · WS      │
 └─────────┬───────────┘                      └──────────┬───────────┘
           │ MJPEG + JSON (/stream, /estado, /health)     │ SQL
           ▼                                              ▼
 ┌─────────────────────┐   REST (login, contexto,  ┌──────────────────────┐
 │  Serviço de visão    │   ping, ocorrência)       │  PostgreSQL 16        │
 │  YOLOv8n + MediaPipe │ ─────────────────────────▶│  12 entidades do DER  │
 │  + camada de regras  │                           └──────────────────────┘
 └─────────┬───────────┘
           │ clipes .mp4 (pasta compartilhada, retenção 24 h)
           ▼
   câmera IP (RTSP) · webcam (só em modo de teste) · arquivo de vídeo
```

### Por que a visão é um contêiner separado

A RFC (5.1) modela o serviço de visão fora da API "dado o peso de suas dependências (OpenCV, MediaPipe, YOLOv8) e a possibilidade de escalá-lo de forma independente". Na prática apareceu um terceiro motivo: no Windows, contêiner não enxerga webcam. Com câmera IP o serviço roda no Docker; com webcam, nativo. O código é o mesmo nos dois casos, muda só como o processo sobe. Ver [[Como rodar]].

## O que cada contêiner faz

### Frontend (`frontend/`)

React 18, TypeScript, Vite, Tailwind, Vitest. Um único SPA com o dashboard web e uma simulação do app da enfermagem (`MobileApp.tsx`). Todas as telas do menu leem da API: dashboard (pacientes, câmeras e ocorrências reais), monitoramento com câmera ao vivo, central de alertas com o ciclo de atendimento, ambientes monitorados, pacientes, usuários, permissões, configurações e saúde do sistema. As telas de gestão hospitalar ampla (financeiro, RH, estoque, agendamento, relatórios genéricos) foram **removidas** em 13/09/2026: eram de outro produto, sem dado nenhum por trás, e estão fora do MVP pela RFC 2.6. O prontuário fica como visão de produto, marcado como tal na própria tela.

O vídeo ao vivo chega por MJPEG num `<img>` comum, e o estado da detecção por polling de `/estado`. Os alertas chegam por WebSocket, com polling lento de 20 s como rede de segurança (`frontend/src/app/data/useAlertas.ts`).

### API Backend (`backend/`)

FastAPI sobre o Postgres do compose. Chamado de "andaime" no código porque nasceu para destravar o login; hoje implementa autenticação com JWT, RBAC conferido no servidor, cadastro de câmeras e ambientes, ingestão de ocorrências com deduplicação, alertas por WebSocket, ciclo de atendimento, clipes de evidência e o endpoint de saúde. O que a RFC prevê e não existe ainda: a geração e a validação do acesso do acompanhante por QR Code (RF25 a RF27), modeladas no banco e sem rota; a revogação automática na alta (RF28, RN07) já existe, em `rotas/pacientes.py`.

Cada domínio mora em `backend/app/rotas/`; o que mais de um domínio usa fica em `comum.py`. O `main.py` só monta a aplicação.

### Serviço de visão (`visao/`)

Captura, detecção de pessoa, estimativa de pose, extração de features, camada de regras, publicação da ocorrência, clipe de evidência e o servidor HTTP que o frontend consome. Detalhado em [[Serviço de visão|Servico-de-visao]].

### Banco (`db/`)

PostgreSQL 16 com as 12 entidades do DER. As regras de negócio da RFC 2.5 estão codificadas como constraints. Detalhado em [[Modelo de dados]].

## Como os contêineres conversam

| De | Para | Como | Por quê assim |
|---|---|---|---|
| Frontend | API | REST com `Authorization: Bearer` | toda rota protegida exige o token do login (RNF01) |
| API | Frontend | WebSocket `/api/ws/alertas`, autenticado pela primeira mensagem | alerta em até 5 s (RNF07, RNF08); token fora da URL para não vazar em log e histórico |
| Frontend | Visão | `GET /stream` (MJPEG), `/estado`, `/health` | sem WebRTC e sem biblioteca; o navegador exibe MJPEG num `<img>` |
| Visão | API | login como usuário de serviço, `GET /api/cameras/{id}/contexto`, `POST .../ping`, `POST /api/ocorrencias` | reaproveita a autenticação humana em vez de inventar um token de máquina |
| Visão | API | pasta `visao/dados/clipes` montada no contêiner da API | a API serve o clipe com autenticação; o arquivo nunca sai por rota aberta |

## Stack

React 18 · TypeScript · Vite · Tailwind CSS 4 · Vitest · Python 3.12 · FastAPI · psycopg 3 · PyJWT · PostgreSQL 16 · OpenCV · YOLOv8n (ultralytics) · MediaPipe Pose · Docker · Nginx · GitHub Actions · Semgrep · Bandit.

É a stack da RFC 5.4, com uma diferença de estágio: a RFC descreve o serviço de visão como "previsto como prova de conceito"; ele está implementado e integrado. Ver [[Serviço de visão|Servico-de-visao]].
