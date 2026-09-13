# Como rodar

Referência: RFC seção 5.6 (instruções de execução no README). Esta página é o resumo; os detalhes por serviço estão em `README.md`, `backend/README.md`, `visao/README.md` e `visao/dados/README.md`.

## Pré-requisitos

Docker Desktop. Para o serviço de visão com webcam, Python 3.12 nativo no Windows (contêiner não enxerga webcam).

## Subir a stack

```bash
cp .env.example .env          # preencha POSTGRES_PASSWORD e SECRET_KEY
docker compose run --rm dev
```

Sobe banco, API e frontend na ordem certa e avisa no terminal quando está
pronto. `Ctrl+C` só fecha o aviso; `docker compose down` desliga de verdade.

| Serviço | Endereço | O que é |
|---|---|---|
| `frontend-dev` | http://localhost:5173 | Vite com hot reload |
| `backend` | http://localhost:8000 | API; documentação interativa em `/docs`; liveness em `/health` |
| `db` | localhost:5432 | PostgreSQL 16, esquema criado na primeira subida |
| `adminer` | http://localhost:8081 | cliente web do banco, à parte: `docker compose up -d adminer` |

Gerar a chave de assinatura dos tokens:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

O backend em Docker é imagem, não bind mount: mudança em `backend/app` exige `docker compose up -d --build backend`.

## Primeiro acesso

O seed não cria usuários. Crie o administrador com `db/scripts/criar-admin.sql` e, para o serviço de visão registrar ocorrências, a conta de máquina com `db/scripts/criar-servico-visao.sql` (o script imprime o id da câmera para o `.env`). Recriar o banco do zero: `docker compose down -v && docker compose up -d`.

## Serviço de visão

```bash
python -m venv visao/.venv
visao/.venv/Scripts/python.exe -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 torchvision==0.20.1
visao/.venv/Scripts/python.exe -m pip install -r visao/requirements.txt
visao/.venv/Scripts/python.exe visao/verificar_camera.py --listar     # quais webcams respondem
visao/.venv/Scripts/python.exe visao/servir.py                        # sobe em :8001
```

**A webcam só é aceita com `MEDSIGNAL_MODO_TESTE=true`**, e acende a luz física da câmera. Em operação a fonte é a câmera IP (`VISAO_FONTE=rtsp`). Para ensaiar sem câmera, `VISAO_FONTE=arquivo` com `VISAO_ARQUIVO` apontando para um vídeo: em tempo real ele se comporta como câmera e recomeça em laço ao terminar.

O modo de teste vale para o projeto inteiro: a interface exibe uma tarja em todas as telas e as ocorrências ficam marcadas como teste.

## Variáveis do `.env` que importam

| Variável | Para quê |
|---|---|
| `POSTGRES_PASSWORD`, `SECRET_KEY` | sem padrão, de propósito |
| `MEDSIGNAL_MODO_TESTE` | liga o modo de teste em todos os serviços |
| `VISAO_FONTE`, `VISAO_ARQUIVO`, `VISAO_RTSP_URL`, `VISAO_WEBCAM_INDICE` | de onde os quadros vêm |
| `VISAO_CAMERA_ID`, `VISAO_API_LOGIN`, `VISAO_API_SENHA` | câmera cadastrada que o processo observa e a conta de serviço; vazio = detecta sem registrar |
| `VISAO_CLIPES`, `VISAO_CLIPES_RETENCAO_HORAS` | clipe de evidência (máximo 24 h) |
| `LOG_LEVEL`, `LOG_FORMATO` | log dos dois serviços, `json` ou `texto` |
| `VITE_API_URL`, `VITE_VISAO_URL` | endereços que o navegador usa |

## Verificação

```bash
cd frontend && npx tsc --noEmit && npm test -- --run
visao/.venv/Scripts/python.exe -m unittest discover -s visao/testes -t .
python -m py_compile backend/app/*.py backend/app/rotas/*.py visao/app/*.py
```

Esperado em 11/09/2026: typecheck limpo, 95 testes no frontend, 47 na visão (unittest, não pytest), tudo compilando. O CI (`.github/workflows/ci.yml`) roda a mesma bateria em cada push nas branches `main`, `dev` e `qa`, nos jobs `qualidade` (Node), `visao` (Python), `seguranca` (Semgrep, Bandit, auditorias de dependência) e, em `main`, `imagem` (Docker).

## Validar o detector

Depende dos vídeos encenados. Protocolo e comandos em `visao/dados/README.md` e em [[Validação do modelo|Validacao-do-modelo]].
