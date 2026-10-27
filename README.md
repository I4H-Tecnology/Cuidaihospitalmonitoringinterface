# MedSignal — Monitoramento Inteligente de Quedas

Detecção de quedas de pacientes idosos em clínicas de repouso por visão computacional.
Uma câmera observa o ambiente, a IA acompanha postura e movimentação e, ao identificar
uma possível queda, registra a ocorrência e dispara alerta em até 5 segundos no dashboard
web e no aplicativo da enfermagem.

Projeto de Portfólio — Engenharia de Software, Centro Universitário Católica SC.
Linha: **Projetos com IA (Visão Computacional)**, com Web Apps e Mobile como apoio.
A especificação completa está na RFC (`_cRFC_MedSignal_N3.pdf`).

> O repositório mantém o nome original `Cuidaihospitalmonitoringinterface` para preservar
> o histórico de versionamento. O produto foi renomeado de CuidAI para MedSignal na v1.0
> da RFC.

---

## Estrutura

```
MedSignal/
├── frontend/     dashboard web e app do enfermeiro (React + Vite + Tailwind)
│   ├── src/app/
│   │   ├── components/     telas e componentes
│   │   ├── contexts/       autenticação e tema
│   │   └── data/           api.ts, authStore.ts, rbac.ts
│   ├── Dockerfile          imagem de produção (build + Nginx)
│   └── Dockerfile.dev      Vite com hot reload
│
├── backend/      API de autenticação e permissões (Python + FastAPI)
│   └── app/
│       ├── main.py         rotas
│       ├── seguranca.py    JWT e verificação de permissão
│       ├── schemas.py      contratos de entrada e saída
│       └── db.py           acesso ao Postgres
│
├── visao/        serviço de visão computacional (YOLOv8 + MediaPipe)
│   ├── app/                captura, detecção, pose, features, regras
│   ├── detectar.py         roda o pipeline
│   └── verificar_camera.py diagnóstico da fonte de vídeo
│
├── db/           banco de dados
│   ├── init/               schema (12 entidades do DER) e seed
│   └── scripts/            scripts avulsos, rodados sob demanda
│
├── docs/         RFC do projeto e documentos de apoio
│
├── docker-compose.yml
└── .env
```

Cada serviço tem o próprio `README.md` com as instruções específicas.

---

## Rodando localmente

Pré-requisitos: **Docker Desktop** (banco e API) e **Node 22+** no Windows
(frontend; o `jsdom` 30 dos testes exige o 22).

```bash
cp .env.example .env
```

Preencha `POSTGRES_PASSWORD` e `SECRET_KEY` no `.env`. Para gerar a chave:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Na primeira vez, instale as dependências do frontend:

```bash
cd frontend && npm install
```

Depois, um comando só, de dentro de `frontend/`:

```bash
npm run dev:completo
```

Sobe banco e API no Docker, espera os dois ficarem saudáveis e abre o frontend
em http://localhost:5173. `Ctrl+C` derruba só o frontend; banco e API continuam
no ar até `docker compose down`.

Se preferir separado (por exemplo, para ver o aviso de pronto do Docker):

```bash
docker compose run --rm dev
```

E, em outro terminal:

```bash
cd frontend && npm run dev
```

| Serviço | Endereço | O que é |
| --- | --- | --- |
| frontend (`npm run dev`) | http://localhost:5173 | Vite com hot reload, direto no Windows |
| `backend` | http://localhost:8000/docs | API (FastAPI), documentação interativa |
| `db` | localhost:5432 | PostgreSQL 16 |

O `npm run dev` lê o mesmo `.env` da raiz (`VITE_API_URL`, `VITE_VISAO_URL`,
`MEDSIGNAL_MODO_TESTE`, `FRONTEND_DEV_PORT`), com os mesmos padrões de antes.

#### Por que o frontend não roda mais no Docker

No Windows, o container lê o código por uma pasta montada, e cada leitura de
arquivo passa por essa ponte. Medido em 25/10/2026: a primeira abertura de cada
arquivo levava **de 10 a 21 s** no container, contra 0,05 a 0,1 s com o Vite
nativo. O `index.html` levava de 3 a 6 s a cada recarga. Na prática, toda tela
aberta pela primeira vez, ou logo depois de uma edição, ficava esses segundos
em "Carregando…". Banco e API não sofrem com isso: a API é imagem, não pasta
montada.

O serviço `frontend-dev` continua no compose, fora da subida padrão, para quem
roda em Linux ou com o projeto dentro do WSL2, onde a montagem é rápida:

```bash
docker compose --profile frontend-docker up -d frontend-dev
```

Se você já tinha o container antigo rodando, pare-o antes do `npm run dev`; ele
ocupa a porta 5173 e o Vite recusa subir:

```bash
docker compose stop frontend-dev
```

Para criar seu usuário administrador, veja `db/scripts/criar-admin.sql`.

O Adminer (cliente web do banco) não sobe junto — é opcional, à parte:

```bash
docker compose up -d adminer
```

Sobe em http://localhost:8081. Entre com sistema `PostgreSQL`, servidor `db`,
e o usuário/senha do `.env`.

### Testar a imagem de produção

A mesma imagem que vai para o servidor — build multi-stage terminando em Nginx:

```bash
docker compose --profile prod up -d --build frontend
```

Sobe em http://localhost:8080.

### Rebuildar só o backend

O backend em Docker é imagem, não bind mount: mudança em `backend/app` exige
rebuild manual (veja [`backend/README.md`](backend/README.md)):

```bash
docker compose up -d --build backend
```

### Trocando para um backend FastAPI externo

`backend/` é a API real do produto, não mais um andaime — mas se um dia ela
for substituída por um repositório FastAPI separado, clone-o ao lado deste
(ou ajuste `BACKEND_PATH` no `.env`) e:

```bash
docker compose stop backend
docker compose --profile externo up -d --build backend-externo
```

Pare o `backend` padrão antes: os dois publicam a porta 8000.

### Recriar o banco do zero

Os scripts de `db/init/` rodam **uma única vez**, na criação do volume. Para reexecutá-los:

```bash
docker compose down -v && docker compose up -d
```

### Builds por ambiente

Além do `.env`, o Vite aceita arquivos por modo. Herdado da configuração que já
existia na branch `dev`:

| Arquivo | Como usar |
| --- | --- |
| `.env.development` | padrão do `npm run dev` |
| `.env.qa` | `vite --mode qa` ou `npm run build -- --mode qa` |
| `.env.production` | padrão do `npm run build` |

`VITE_API_URL` é a URL base da API. Sem ela, o frontend cai para requisições
same-origin e registra um erro no console.

---

## Sem Docker

O frontend já roda direto no Windows, com Node 22+ (ver
[Rodando localmente](#rodando-localmente)): `npm install` e `npm run dev` em
`frontend/`. Sem a API no ar, a tela de login falha com erro de rede.

---

## Documentação e qualidade

A documentação de referência está na **[Wiki do repositório](https://github.com/lucasmm13/Cuidaihospitalmonitoringinterface/wiki)**:
arquitetura, modelo de dados, serviço de visão, validação do modelo, segurança e
LGPD, como rodar, observabilidade e as decisões técnicas com a seção da RFC que
as motiva. As páginas ficam versionadas em [`docs/wiki/`](docs/wiki/README.md) e
são publicadas de lá.

A análise estática de código e segurança roda dentro do CI, no job `seguranca`,
a cada push: **Semgrep** (regras de segurança para Python e TypeScript, mais
detecção de segredos), **Bandit** (vulnerabilidades em Python), **pip-audit** e
**npm audit** (dependências com CVE conhecida). Os relatórios ficam como artefato
de cada execução. Sem serviço externo, sem conta e sem token: o repositório é
privado por decisão aprovada com o orientador, e nada aqui depende de visibilidade.

## Qualidade

```bash
npm run typecheck      # tsc --noEmit
npm run test           # Vitest
npm run test:coverage  # com relatório de cobertura em coverage/
npm run build          # build de produção
```

O pipeline em `.github/workflows/ci.yml` roda os quatro em cada push e pull request
nas branches `main`, `dev` e `qa`, publica o relatório de cobertura como artifact e,
em `main`, valida também o build da imagem Docker. O job `visao` roda os testes do
serviço de visão (`unittest`) e compila backend e visão; o job `seguranca` roda a
análise estática e de segurança.

```bash
visao/.venv/Scripts/python.exe -m unittest discover -s visao/testes -t .   # testes da visão
```

O limiar de cobertura usa catraca: sobe sozinho conforme a cobertura melhora e nunca
regride. A linha de projeto (IA) não exige percentual mínimo — o que se avalia é a
qualidade do teste, não o número.

---

## Banco de dados

`db/init/01_schema.sql` implementa as 12 entidades do DER da RFC. As regras de negócio
da seção 2.5 estão codificadas como constraints, não só na aplicação — o banco recusa
dado inválido mesmo que a API esqueça de validar. Cada constraint referencia a regra
correspondente (RN01, RN05, RN11...) em comentário.

`db/init/02_perfis.sql` cria os perfis de acesso (ADMIN, MANAGER, NURSE) com a matriz
de permissão por módulo. É **idempotente**: serve de init num volume novo e de reparo num
banco que já existe, sem duplicar a matriz em dois arquivos.

```bash
docker compose exec -T db psql -U medsignal -d medsignal   -f /docker-entrypoint-initdb.d/02_perfis.sql
```

Duas armadilhas que ele existe para evitar: o **nome** do perfil precisa estar na união
`Role` do frontend (`authStore.ts`), e o **formato** é dicionário de módulo para ações em
inglês — `{"monitoring": {"view": true}}` —, que é o que `exigir_permissao` lê. Perfil
fora de qualquer uma das duas regras falha em toda rota protegida, em silêncio.

`db/init/03_seed.sql` cria uma clínica de demonstração com ambientes, câmeras e pacientes
fictícios. **Não cria usuários**: a senha exige hash real gerado pelo backend, e
credencial versionada não entra neste repositório.

Imagens e vídeos não ficam neste banco. Pela RN08/RN09, são retidos por no máximo 24h
no serviço de visão computacional, que tem rotina de expurgo própria; aqui persiste
apenas o registro da ocorrência.

---

## Stack

React 18 · TypeScript · Vite · Tailwind CSS 4 · Vitest · Docker · Nginx · PostgreSQL 16

Backend previsto: Python + FastAPI, WebSockets para alertas em tempo real.
Visão computacional: OpenCV, MediaPipe Pose e YOLOv8.

---

## Licenças de terceiros

Componentes de UI do [shadcn/ui](https://ui.shadcn.com/) sob licença MIT e imagens do
Unsplash sob a licença da plataforma. Detalhes em [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
