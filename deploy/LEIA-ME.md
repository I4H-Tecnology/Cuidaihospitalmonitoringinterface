# Colocar o MedSignal na VPS (painel, API e banco)

Esta pasta sobe a versão **estável** (o commit que passou no CI) atrás de um proxy com HTTPS.
**Não** é o `docker-compose.yml` da raiz: aquele é de desenvolvimento e publica o banco e o Adminer.

Nunca cole senha, chave SSH nem o conteúdo do `.env` em chat, print ou commit.

## Como a versão chega na VPS: pelo pipeline (caminho normal)

Quem publica é o **pipeline** (`.github/workflows/ci.yml`, job `publicar`), não uma pessoa:

```
push na branch → 5 jobs de teste → (todos verdes) → publicar → site conferido
```

1. **Só a `main` publica.** Um push na `main` (normalmente o merge de um PR) dispara os **cinco jobs de teste** (qualidade/tipos/testes do painel, visão, backend, financeiro, análise estática). **Se algum falhar, nada é publicado.** Branches de trabalho, `dev`, `qa` e pull requests rodam os mesmos testes, mas **nunca publicam**.
2. O job `publicar` confere a **impressão digital do servidor** antes de confiar nele, envia a árvore **exata do commit testado** e roda `deploy/atualizar.sh` na VPS.
3. O `atualizar.sh` guarda as imagens atuais como `:anterior`, reconstrói só backend, frontend e (se habilitada) a visão, espera ficarem saudáveis e, **se não ficarem, volta sozinho à imagem anterior** e faz o job falhar. O banco não é tocado. O Caddy só é recriado se o `Caddyfile` mudou, e antes a configuração nova é validada.
4. No fim o pipeline confere o site pela internet (API, painel, rota protegida com 401) e confirma que o commit no ar (`~/medsignal/VERSAO`) é o que acabou de passar nos testes.

O que **não** vem do pipeline: o `deploy/.env` (senhas e `SECRET_KEY` ficam só na VPS), o vídeo de demonstração (`deploy/videos/`), os pesos do YOLO (`visao/pesos/`) e os usuários do Dozzle. O envio não apaga nada que só exista na VPS. **Migração de banco não é automática** (o `db/init` só roda na criação do volume; reaplicar `02_perfis.sql` sobrescreveria permissões editadas pela tela): mudança de banco continua sendo um script rodado à mão, deliberadamente.

### Configuração única do pipeline

1. **Chave SSH só do pipeline** (no seu computador, PowerShell; sem senha, porque o pipeline não tem quem digite):

   ```powershell
   ssh-keygen -t ed25519 -C "pipeline-medsignal" -f "$env:USERPROFILE\.ssh\medsignal_pipeline" -N '""'
   ```

2. **Autorizar a chave pública na VPS** (a senha root é pedida uma vez):

   ```powershell
   type "$env:USERPROFILE\.ssh\medsignal_pipeline.pub" | ssh root@IP_DA_VPS "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```

   Teste, sem pedir senha: `ssh -i "$env:USERPROFILE\.ssh\medsignal_pipeline" -o IdentitiesOnly=yes root@IP_DA_VPS "echo ok"`.

3. **GitHub → Settings → Secrets and variables → Actions** (do repositório; "Environments" não é usado porque em repositório privado exige plano pago):
   - Aba **Secrets** → *New repository secret* `VPS_SSH_KEY`: o conteúdo do arquivo `medsignal_pipeline` (a chave **privada**; abra no Bloco de Notas e copie. Nunca em chat, print ou commit).
   - Aba **Variables** → *New repository variable*: `VPS_HOST` (IP da VPS), `VPS_USER` (`root`), `DOMINIO` (sem `https://`) e `VPS_FINGERPRINT` (a impressão digital ED25519 do servidor, que se vê na VPS com `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`, no formato `SHA256:...`).
   - Se o plano do GitHub permitir, dá para mover isso para um *environment* com **Required reviewers** (a publicação espera um clique de aprovação); sem isso, quem controla a publicação é a branch.

4. Depois que a chave funcionar, **desligue o login por senha** na VPS (`PasswordAuthentication no` em `/etc/ssh/sshd_config.d/`, depois `systemctl reload ssh`). Mantenha uma sessão aberta enquanto testa, para não se trancar fora.

### Emergência / sem o pipeline

Se o GitHub estiver fora ou o pipeline quebrado: envie o código à mão (passos abaixo, ou `git archive` + `scp`) e rode, na VPS, `bash ~/medsignal/deploy/atualizar.sh <sha-do-commit>`. É o mesmo script que o pipeline usa.

## O que fica exposto

| Porta | Quem responde | Observação |
|---|---|---|
| 80 e 443 | Caddy | Único que publica porta. HTTPS automático. |
| 5432 (banco), 8000 (API), 8081 (Adminer) | ninguém | Ficam só na rede interna do Docker. Adminer e SonarQube **não sobem**. |
| `/logs` (dentro do 443) | Dozzle, **com login** | Opcional (profile `logs`). Ver "Logs em tempo real (Dozzle)". |

O painel e a API usam o **mesmo endereço**: `/api/*` vai para a API (inclusive o WebSocket de alertas) e o resto vai para o painel.

## Instalação inicial (uma vez; depois o pipeline atualiza)

**1. Criar a VPS** (Ubuntu 22.04 ou 24.04) e anotar o IP. No painel da hospedagem, deixe o firewall só com as portas 22, 80 e 443.

**2. Endereço.** Aponte um registro A do seu domínio para o IP. Se o domínio ainda não propagou, use `IP-com-hifens.sslip.io` (ex.: `203-0-113-10.sslip.io`), que funciona com HTTPS.

**3. Docker na VPS** (se a imagem não vier com ele):

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
less get-docker.sh        # leia antes de rodar
sudo sh get-docker.sh
```

**4. Firewall do servidor:**

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

O Docker publica portas passando por cima do `ufw`. Por isso só o Caddy pode publicar porta, e é assim que este compose está escrito.

**5. Enviar a versão estável** (no seu computador, na raiz do repositório, em Git Bash). Isto envia o que está **commitado**, sem as alterações locais não commitadas:

```bash
git archive --format=tar -o medsignal.tar HEAD
tar -rf medsignal.tar --exclude=deploy/.env deploy
gzip -f medsignal.tar
scp medsignal.tar.gz SEU_USUARIO@IP_DA_VPS:~/
```

Na VPS: `mkdir -p medsignal && tar -xzf medsignal.tar.gz -C medsignal`.

**6. Configurar** (na VPS):

```bash
cd ~/medsignal/deploy
cp .env.prod.example .env && chmod 600 .env
nano .env     # DOMINIO, POSTGRES_PASSWORD (openssl rand -hex 24) e SECRET_KEY (openssl rand -hex 32)
```

**7. Subir** (o primeiro build demora alguns minutos numa VPS de 1 vCPU):

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml ps
```

Todos devem aparecer como `Up`, e `db` e `backend` como `healthy`.

**8. Conferir de fora** (do seu computador, não da VPS):

```bash
curl -I https://SEU_DOMINIO              # 200
curl -s https://SEU_DOMINIO/api/tenants  # JSON com a clínica
curl -m 5 http://IP_DA_VPS:5432          # tem que FALHAR (banco fechado)
curl -m 5 http://IP_DA_VPS:8081          # tem que FALHAR (sem Adminer)
```

**9. Criar o administrador.** A senha é digitada só no terminal da VPS:

```bash
read -rs SENHA; echo
docker compose -f docker-compose.prod.yml exec -T db psql -U medsignal -d medsignal \
  -v tenant="'clinica-demo'" -v login="'SEU_LOGIN'" -v email="'voce@exemplo.com'" -v nome="'Seu Nome'" \
  -v senha="'$SENHA'" -f /scripts/criar-admin.sql
unset SENHA
```

**10. Dados de demonstração (opcional).** Recria os pacientes de demonstração e apaga o que foi registrado para eles:

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U medsignal -d medsignal -v autor="'SEU_LOGIN'" -f /scripts/demo-apresentacao.sql
```

**11. Testar no navegador**, de outro aparelho e rede: entrar, abrir um paciente, abrir os alertas.

## Dia a dia

- **Backup:** `docker compose -f docker-compose.prod.yml exec -T db pg_dump -U medsignal medsignal > backup-$(date +%F).sql`
- **Parar sem apagar nada:** `docker compose -f docker-compose.prod.yml down`
- **NUNCA** rode `down -v`: ele apaga o banco.
- **Atualizar:** leve a mudança para a `main` (merge do PR); o pipeline testa e publica (acima). Só em emergência: envio manual e `bash deploy/atualizar.sh <sha>`.
- **Ver o que está no ar:** `cat ~/medsignal/VERSAO` (o commit publicado) ou a aba *Actions* do GitHub.
- **Ver logs:** `docker compose -f docker-compose.prod.yml logs -f backend`, ou pelo navegador em `https://SEU_DOMINIO/logs` (abaixo).

## Logs em tempo real (Dozzle)

Mostra os logs e o consumo de CPU/memória **só dos contêineres deste projeto**, em `https://SEU_DOMINIO/logs`, **sempre com login**. Ações (parar/reiniciar contêiner), shell e MCP ficam desligados. Não abre porta nova: passa pelo Caddy, no 443.

Na VPS, dentro de `~/medsignal/deploy`. **Gere o arquivo de usuário ANTES de subir**: sem ele o Docker cria uma pasta vazia no lugar, o Dozzle se recusa a subir e `/logs` dá 502 (nunca abre sem login). Se isso acontecer, apague a pasta com `rmdir dozzle/users.yml` e gere o arquivo.

```bash
mkdir -p dozzle
read -rs -p "Senha do Dozzle: " S; echo
docker run --rm amir20/dozzle:v11.4.3 generate admin --password "$S" --name "MedSignal" > dozzle/users.yml
unset S
chmod 600 dozzle/users.yml
grep -c 'password: \$2' dozzle/users.yml      # tem de dar 1 (a senha fica guardada como hash bcrypt)

docker compose -f docker-compose.prod.yml --env-file .env --profile logs up -d dozzle
docker compose -f docker-compose.prod.yml --env-file .env up -d --no-deps --force-recreate caddy
```

O `--no-deps --force-recreate caddy` só recria o Caddy (para ele ler o `Caddyfile` novo); painel, API, banco e visão não são tocados. O login vale por 8 horas. Para trocar a senha, gere o arquivo de novo e rode `docker compose -f docker-compose.prod.yml --env-file .env --profile logs up -d --force-recreate dozzle`. Para desligar: `docker compose -f docker-compose.prod.yml --env-file .env --profile logs stop dozzle` (o `/logs` passa a dar 502).

Limites: o Dozzle lê o socket do Docker (enxerga a máquina toda; o filtro só esconde o que não é do projeto na tela), não bloqueia depois de senhas erradas (no ensaio, 20 erradas seguidas e a certa entrou na hora: use uma senha longa) e a senha passa pela linha de comando do `docker run` durante o `generate`.

## O que esta pasta NÃO faz

- **Visão com webcam.** A VPS roda a visão só com **vídeo gravado em laço** (profile `visao`, ver `visao.Dockerfile`), em modo de teste e identificada como demonstração. Webcam em nuvem não existe: os clipes usam pasta compartilhada e não há envio de vídeo ao vivo de outro lugar.
- **Métricas com histórico, alertas de monitoramento e backup automático.** Não estão incluídos (o Dozzle mostra logs e consumo ao vivo, sem guardar histórico).
- **E-mail de recuperação de senha.** Não existe no projeto.
