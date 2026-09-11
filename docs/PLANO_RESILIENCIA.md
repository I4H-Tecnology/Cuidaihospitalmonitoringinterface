# Plano de resiliência, retenção e observabilidade — MedSignal

> **Para quem for executar este plano numa sessão nova.** Leia a seção 0 antes
> de qualquer coisa: ela tem como rodar o projeto e as restrições que não podem
> ser violadas. O contexto técnico completo do serviço de visão está em
> `docs/PLANO_IA.md`, seção 0 — vale ler os dois.

> Fonte normativa: a RFC (`docs/_cRFC_MedSignal_N3.pdf`) e a direction da linha
> de projeto (`portfolio-directions-ia.md`, repositório The-Portfolio-Playbook
> da Católica SC). Onde houver divergência, elas mandam.

Este plano entrega quatro coisas que a RFC declara e o sistema ainda não fazia,
e fecha **um dos quatro itens obrigatórios do núcleo comum de engenharia**.

---

## Estado em 11/09/2026 — as quatro partes estão feitas e verificadas

| Parte | O que ficou | Onde |
|---|---|---|
| A. Câmera que cai e volta | Backoff exponencial 1 s → 60 s; estados `capturando` / `reconectando` / `parado` em `/estado` e `/health`; ping para a API só com captura viva; painel distingue "serviço fora do ar" de "câmera fora do ar" | `visao/app/servidor.py`, `visao/app/fonte_video.py` (`EsperaDeReconexao`), `visao/app/publicador.py`, `frontend/src/app/components/CameraAoVivo.tsx`, `frontend/src/app/data/visao.ts` |
| B. Clipe de 10 s e expurgo em 24 h | Buffer circular de 5 s + 5 s seguintes, H.264 via `imageio-ffmpeg`, nome = id da ocorrência, expurgo no boot e de hora em hora (na visão e na API); `GET /api/ocorrencias/{id}/clipe` com token e tenant; `temClipe` na listagem; botão "Ver clipe" no card do alerta | `visao/app/clipes.py`, `backend/app/clipes.py`, `backend/app/rotas/ocorrencias.py`, `frontend/src/app/components/AlertsScreen.tsx`, `docker-compose.yml` (bind mount `./visao/dados/clipes`) |
| C. Observabilidade | `/health` da visão com fps real, latência média/p95/máx, quadros, uptime, quedas/reconexões, clipes e expurgo; `GET /api/saude` na API (banco, uptime, canal de alertas, câmeras, ocorrências, clipes, log); log JSON nos dois serviços (`LOG_LEVEL`, `LOG_FORMATO`); tela **Saúde do Sistema** no menu SISTEMA | `visao/app/registro.py`, `backend/app/registro.py`, `backend/app/rotas/saude.py`, `frontend/src/app/components/SaudeScreen.tsx` |
| D. CI rodando a visão | Job `visao`: torch do índice CPU, `requirements.txt`, `unittest discover`, `py_compile` de backend e visão; o job de imagens depende dele | `.github/workflows/ci.yml` |

### O que foi verificado de verdade

Rodada em 11/09/2026 com o serviço de visão sobre `VISAO_FONTE=arquivo`
(sem câmera), porta 8002, e a API no Docker (`docker compose --profile api up
-d --build backend`), usando a conta de serviço do `.env`:

| Critério de aceite | Resultado |
|---|---|
| A: renomear o vídeo faz o estado virar `reconectando` | ok, em 2 s: `tentativa` 1 → 2 → 3 com espera crescente, `erro` = "Não foi possível abrir o arquivo de vídeo" |
| A: com a fonte caída, o ping é suprimido e a câmera aparece **desconectada** no painel em até 90 s | ok: `publicacao.pingando=false` em 7 s; `GET /api/cameras` mostrou `conectada=false` 85 s depois |
| A: restaurar o nome faz voltar a `capturando` sem reiniciar o processo | ok, 30 s depois (o backoff já estava em 32 s); `reconexoes=1`, `quedas_da_fonte=1`, ping voltou em 2 s, câmera conectada de novo |
| A: painel distingue serviço fora do ar de câmera fora do ar | `diagnosticarCaptura()` com 6 testes em `visao.test.ts`; `CameraAoVivo` mostra "Câmera fora do ar — tentando reconectar (tentativa N, próxima em X s)" quando `/estado` responde `reconectando` |
| B: clipe de ~10 s por ocorrência | verificado no nível do gravador (`test_resiliencia.py`: antes + depois, renomeação pelo id da API, H.264 pelo ffmpeg); **não** verificado ponta a ponta com uma queda real — depende dos vídeos encenados do `PLANO_IA.md` |
| B: 401 sem token; 404 com token de outra clínica; 200 `video/mp4` com token da dona | ok, os três |
| B: clipe apagado, ocorrência continua | ok: após remover o arquivo, a rota devolve 404 e a ocorrência segue na listagem; expurgo por idade testado em unidade (25 h apagado, recente mantido) |
| C: `/health` devolve todos os campos, mudando conforme trabalha | ok (fps, p95, quadros, uptime, estado da fonte, clipes, último expurgo); `/api/saude` responde com token e devolve 401 sem |
| C: tela de saúde alcançável pelo menu | rota `saude` (módulo `monitoring`), item "Saúde do Sistema" em SISTEMA; `tsc` limpo e 95 testes; **não** vista no navegador nesta sessão (a tela exige login, e a sessão não digita senha) |
| D: job da visão verde no GitHub Actions | workflow escrito; **só confirma no próximo push** |

Bateria ao final: `tsc` limpo, **95 testes no frontend**, **47 na visão**, tudo
compilando.

### Observações para quem continuar

- Um `python.exe` já ocupava a porta 8001 nesta máquina; os testes rodaram
  na 8002. Se for o serviço de visão antigo, ele ainda não tem a reconexão —
  reinicie-o.
- No Windows o arquivo de vídeo fica travado enquanto o OpenCV lê: o
  "renomear com o serviço rodando" só funciona no instante em que a passada do
  arquivo termina. Um clipe curto (1–2 s) em laço dá essa janela a cada
  poucos segundos.
- O backend em Docker é imagem, não bind mount: mudança em `backend/app`
  exige `docker compose --profile api up -d --build backend`.
- Os clipes são gravados com os quadros anotados (caixa, esqueleto, estado):
  é o que explica por que o sistema alertou.

---

## 0. Contexto para executar

### Ambiente

```
Projeto:  C:\Projetos\MedSignal
Branch:   qa        (nunca commitar em dev nem em main)
Python:   visao/.venv/Scripts/python.exe      <- não é o do sistema
```

Suba a stack antes de começar:

```bash
cd C:/Projetos/MedSignal && docker compose --profile api up -d
```

Se o Docker recusar subir com erro em `sailor-ingest.sock`, a correção
conhecida é renomear `%LOCALAPPDATA%\Docker\run` e reiniciar o Docker Desktop.

### Verificação obrigatória antes de encerrar qualquer parte

```bash
cd C:/Projetos/MedSignal/frontend && npx tsc --noEmit && npm test -- --run
cd C:/Projetos/MedSignal && visao/.venv/Scripts/python.exe -m unittest discover -s visao/testes -t .
cd C:/Projetos/MedSignal && python -m py_compile backend/app/*.py backend/app/rotas/*.py visao/app/*.py
```

Hoje o esperado é **95 testes no frontend** e **47 na visão**, typecheck limpo,
tudo compilando. Se algum número piorar, algo quebrou.

### Restrições que não podem ser violadas

**A webcam acende uma luz física.** Nunca suba `visao/servir.py` com
`VISAO_FONTE=webcam` sem avisar o usuário antes, e encerre o processo assim que
terminar. Boa parte deste plano pode ser testada com `VISAO_FONTE=arquivo` ou
derrubando a fonte de propósito, sem câmera.

**Não invente número.** Se algo não puder ser medido, escreva que não foi
medido. Valor fabricado é item de reprovação direta nesta linha.

**Git.** Mensagens em português, formato `tipo(escopo): descrição`, **sem
nenhum trailer de coautoria ou menção a assistente** — a autoria do projeto é
do aluno, e há prova de autoria na disciplina. Não commite sem o usuário pedir.

**Não mexa no que já está provado.** Fases 2 e 3 estão verificadas ponta a
ponta: registro da ocorrência no Postgres, deduplicação, fila em disco, alerta
por WebSocket em 250 ms e o ciclo de atendimento. Se precisar tocar nesses
caminhos, rode a bateria antes e depois.

---

## 1. Por que este pacote, e nesta ordem

**A e B são requisitos que a RFC declara:**

| Requisito | O que promete |
|---|---|
| RF30 | o administrador visualiza o status da câmera (online/offline) |
| RN15 | câmera offline é sinalizada no dashboard |
| RNF16 | o sistema trata falha de câmera, de API e de envio de alerta |
| RNF17 | o sistema informa o administrador quando a câmera está indisponível |
| RNF05 / RN08 | vídeos e imagens retidos por **no máximo 24 horas** |
| RN09 | após 24 h, o registro de vídeo é excluído, mantendo os dados da ocorrência |
| RNF18 | o histórico da ocorrência sobrevive à exclusão do vídeo |

**C fecha um item obrigatório do núcleo comum** (monitoramento ou
observabilidade da solução em execução). **D corrige um furo do CI**: os
testes da visão não rodavam em lugar nenhum.

---

## Parte A — Câmera que cai e volta

`ServicoVisao._laco` não deixa a thread morrer: quando `pipeline.executar()`
levanta ou termina, entra `EsperaDeReconexao` (1 s dobrando até 60 s), o estado
vira `reconectando` com tentativa, próxima espera e o erro cru, e o pipeline é
reiniciado (`reiniciar()` zera rastreio, features e pose). No primeiro quadro
novo o estado volta a `capturando`, o backoff zera e `reconexoes` conta mais
um. Arquivo que chega ao fim recomeça em laço sem contar como queda.

O ping (`publicador.py`) só sai quando houve quadro nos últimos 10 s
(`JANELA_DE_CAPTURA_VIVA`); enquanto está suprimido o relógio do ping não
avança, para o primeiro sair no segundo seguinte à volta da captura.
"Conectada" no painel continua derivada de `ultimo_ping` na consulta —
nenhuma coluna de status foi introduzida.

No frontend, `diagnosticarCaptura(servicoNoAr, captura)` decide entre
`servico-fora` (a porta 8001 não respondeu), `camera-fora` (respondeu
`reconectando`), `iniciando`, `parado` e `ok`.

## Parte B — Clipe de evidência com expurgo em 24 h

`GravadorDeClipes` mantém um buffer circular de `segundos_antes × fps` quadros
anotados. `iniciar(chave)` copia o buffer e passa a acumular os próximos
`segundos_depois × fps`; ao completar, codifica em thread própria. O nome sai
do id que a API devolveu (`Publicador.ao_registrar` → `nomear`), antes ou
depois da gravação. `expurgar()` roda no boot e de hora em hora; a API tem o
mesmo expurgo (`backend/app/clipes.py`) para a retenção valer com a visão
fora do ar.

Configuração: `VISAO_CLIPES`, `VISAO_CLIPES_PASTA`,
`VISAO_CLIPES_RETENCAO_HORAS` (máximo 24, validado na subida),
`VISAO_CLIPES_SEGUNDOS_ANTES/DEPOIS`. Na API: `CLIPES_DIR`, montado pelo
compose em `./visao/dados/clipes`.

## Parte C — Observabilidade

- Visão: `GET /health` → `status` (`ok` / `degradado` / `iniciando` /
  `parado`), `estado_da_fonte`, `captura{...}`, `fps_real`, `fps_alvo`,
  `latencia_media_ms`, `latencia_p95_ms`, `latencia_max_ms`,
  `quadros_processados`, `uptime_s`, `ocorrencias`, `clipes{...}`,
  `publicacao{...}`.
- API: `GET /api/saude?tenantId=` (monitoring:view) → banco com latência,
  uptime, ouvintes do canal de alertas, câmeras conectadas/total,
  ocorrências 24 h/abertas, clipes e expurgo, nível e formato do log.
- Log: JSON por padrão nos dois serviços (`registro.py` em cada um), com
  `LOG_LEVEL` e `LOG_FORMATO=texto` para o legível.
- Tela: **SISTEMA → Saúde do Sistema** (`SaudeScreen.tsx`), polling de 5 s na
  API e 2 s na visão; quatro cartões de componente (API, banco, visão, canal)
  e os detalhes. Nada de Prometheus ou Grafana, de propósito.

## Parte D — CI rodando os testes da visão

Job `visao` em `.github/workflows/ci.yml`: Python 3.12, torch/torchvision do
índice CPU **antes** do `requirements.txt`, `python -m unittest discover -s
visao/testes -t . -v`, `py_compile` de backend e visão. O job `imagem` passa a
depender de `qualidade` e `visao`. Quando o arnês tiver clipes (ver
`PLANO_IA.md`), acrescentar a validação sobre 2 clipes curtos versionados.

### Sobre os outros dois itens do núcleo comum

- **Análise estática** (SonarCloud ou Codacy) depende de o repositório virar
  público — decisão do usuário, e também gate do RNF20.
- **Wiki** pode ser montada a partir de `README.md`, `docs/PLANO_IA.md`,
  `visao/README.md` e `visao/dados/README.md`.
