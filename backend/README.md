# Backend — API de autenticação

Existe por um motivo só: o frontend do MedSignal só autentica contra uma API, e
o backend FastAPI definitivo ainda não está disponível nesta máquina. Sem isso,
a tela de login falha com erro de rede independentemente do que exista no banco.

**Isto é provisório.** Quando o FastAPI definitivo chegar, substitua o conteúdo
desta pasta — o serviço `backend` do `docker-compose.yml` continua servindo.

## Como subir

Sobe junto com o resto (sem profile, desde que virou a API que o produto usa
de verdade):

```bash
docker compose run --rm dev
```

Só o backend, para rebuildar depois de mudar código:

```bash
docker compose up -d --build backend
```

Sobe em http://localhost:8000. Documentação interativa em `/docs`.

## O que ele implementa

Exatamente os endpoints que `src/app/data/api.ts` chama, nada além:

| Método | Rota | Para quê |
| --- | --- | --- |
| GET | `/api/tenants` | seleção de clínica |
| POST | `/api/auth/login` | login |
| POST | `/api/auth/force-change-password` | troca obrigatória |
| POST | `/api/auth/forgot-password/request` | pedido de recuperação |
| POST | `/api/auth/forgot-password/reset` | conclusão da recuperação |
| GET/PUT | `/api/permissions/{tenant}/{role}` | RBAC |
| GET/POST/PUT/DELETE | `/api/users` | gestão de usuários |
| GET/PUT | `/api/security-policy` | política de senha |
| GET/POST | `/api/access-logs` | trilha de auditoria |
| GET | `/api/operational-overview` | painel operacional |

## Decisões que valem explicar

**Senha.** O hash é bcrypt gerado pelo `pgcrypto` dentro do Postgres, com
`crypt(senha, gen_salt('bf', 12))`. Duas consequências boas: não há dependência
de biblioteca de hash no Python, e o formato `$2a$` é o mesmo que
`passlib`/`bcrypt` do FastAPI definitivo verifica, sem conversão.

**Mensagem de erro única.** Usuário inexistente e senha errada devolvem o mesmo
texto. Diferenciar os dois entrega a existência da conta a quem está tentando
adivinhar login.

**Formato do erro.** O frontend lê `payload.error`; o FastAPI devolveria
`detail`. Há um `exception_handler` traduzindo — sem ele toda mensagem viraria
o genérico "Erro inesperado." na tela.

**Bloqueio.** Cinco tentativas erradas bloqueiam pelo tempo da política. A
partir daí nem a senha correta entra, até o prazo passar ou um administrador
liberar com `db/scripts/criar-admin.sql`.

**Números do painel.** Tudo em `/api/operational-overview` sai de consulta ao
banco. Sem dado, o número é zero — nada é gerado aleatoriamente.

**Tabela própria.** A política de segurança não está no DER da RFC. Para não
sujar `db/init/`, que espelha o diagrama, o andaime cria
`stub_politica_seguranca` na subida. O backend definitivo decide onde isso mora.

## O que já foi além do andaime

- **Emite JWT no login e exige em toda rota protegida** (`seguranca.py`): a
  permissão é conferida no servidor contra o perfil do banco, e o tenant sai do
  token. O texto antigo desta seção dizia que o RBAC existia só no cliente;
  isso deixou de ser verdade em `fix(seguranca)`.
- Câmeras e ambientes, ingestão de ocorrências com deduplicação, alertas por
  WebSocket, ciclo de atendimento, clipes de evidência e `/api/saude`. Cada
  domínio em `app/rotas/`.

## O que falta, de propósito

- Sem refresh token, sem revogação (logout só descarta no cliente), sem rate
  limit no login.
- O código de recuperação de senha fica em memória e some ao reiniciar. Não há
  envio de e-mail: o código volta na resposta, em `devResetCode`.
