# Serviço de Visão Computacional

Detecta quedas a partir do vídeo e envia a ocorrência para a API. É o container
separado que o C4 nível 2 da RFC desenha — separado de propósito, pelo peso das
dependências e para poder escalar sozinho.

## Estado atual

Implementado:

- **Captura** com a fonte trocável por configuração: webcam, câmera IP (RTSP) e
  arquivo de vídeo, todos pela mesma interface
- Amostragem na taxa alvo, com descarte de frame antigo em fonte ao vivo
- Diagnóstico de câmera (`verificar_camera.py`)

- Detecção de pessoa (YOLOv8n + ByteTrack) e landmarks de pose (MediaPipe Pose)
- Extração das cinco features de queda, invariantes a escala
- Camada de regras temporais e a máquina NORMAL → CAINDO → CAIDO
- **Registro da ocorrência na API** (RF13, RF14), com fila em disco quando a API
  está fora do ar e chave de deduplicação para não gerar alerta repetido

- **Arnês de avaliação** (`avaliar.py`) e **calibração por holdout**
  (`calibrar.py`): vídeos anotados → matriz de confusão → as seis métricas da
  RFC. Ver `dados/README.md`. Aguarda os clipes encenados para produzir número.

- **Reconexão automática** quando a fonte cai (RF30, RN15, RNF16, RNF17):
  backoff exponencial de 1 s a 60 s, estado exposto em `/estado` e `/health`
  (`capturando` / `reconectando` / `parado`), e o ping para a API só sai com
  captura viva — a câmera aparece desconectada no painel em até 90 s
- **Clipe de evidência** de 10 s por ocorrência (5 s antes + 5 s depois), em
  H.264, com **expurgo em 24 h** (RNF05, RN08, RN09). A ocorrência sobrevive
  ao clipe (RNF18); a API serve o arquivo só a usuário autenticado da clínica
- **`/health` para observabilidade**: fps real, latência média/p95/máx por
  quadro, quadros processados, uptime, quedas e reconexões da fonte, clipes
  em disco e último expurgo. Log estruturado em JSON (`LOG_LEVEL`, `LOG_FORMATO`)

## Validar o detector

```bash
visao/.venv/Scripts/python.exe -m unittest discover -s visao/testes -t .   # lógica do arnês, sem vídeo
visao/.venv/Scripts/python.exe visao/calibrar.py                          # divide e varre os limiares
visao/.venv/Scripts/python.exe visao/avaliar.py --conjunto teste     --divisao <pasta da calibração>/divisao.csv --limiares <pasta da calibração>/limiares.json
```

O arnês roda o **mesmo** `PipelineDeteccao` do serviço, lendo o arquivo com
`VISAO_ARQUIVO_TEMPO_REAL=false`: o timestamp passa a ser a posição no vídeo,
em segundos, e a amostragem é por passo fixo de quadros — assim o mesmo clipe
produz sempre o mesmo resultado. Não usa câmera. O protocolo de gravação e o
formato das anotações estão em `dados/README.md`.

## Registrar ocorrências

Sem `VISAO_CAMERA_ID` o serviço detecta, desenha na tela e **não grava nada** —
é o modo de quem está ensaiando enquadramento, e continua sendo o padrão.

Para ligar o registro, crie a conta de máquina e descubra o id da câmera:

```bash
docker compose exec -T db psql -U medsignal -d medsignal   -v tenant="'clinica-demo'" -v login="'servico-visao'"   -v senha="'$(python -c "import secrets; print(secrets.token_urlsafe(32))")'"   -f /scripts/criar-servico-visao.sql
```

O script imprime as câmeras da clínica ao final. Copie o `visao_camera_id` da
que este processo observa e preencha no `.env`:

```
VISAO_CAMERA_ID=<id impresso pelo script>
VISAO_API_LOGIN=servico-visao
VISAO_API_SENHA=<a senha que você gerou>
```

A conta usa o perfil `SYSTEM`, com permissão apenas de ler o cadastro da
própria câmera e registrar ocorrência. Se a credencial vazar, o estrago
possível é criar alerta falso — não há acesso a usuário, paciente nem
configuração.

O `/estado` e o `/health` passam a mostrar um bloco `publicacao` com quantas
ocorrências foram registradas e quantas estão esperando em disco.

## Antes de qualquer coisa: teste a câmera

```bash
python visao/verificar_camera.py --listar
```

Lista os índices de webcam que respondem nesta máquina. Depois:

```bash
python visao/verificar_camera.py --salvar
```

Abre a fonte configurada no `.env`, mede a taxa real de quadros, avisa se algum
intervalo passou dos 5 segundos que a RFC promete para o alerta, e salva uma
amostra em `capturas/`.

Rode isso **antes da apresentação**, no local da apresentação. Descobrir que o
índice da câmera mudou ou que o RTSP não responde é barato agora e caro no dia.

## Configuração

Tudo vem do `.env` na raiz do projeto:

| Variável | Para quê |
| --- | --- |
| `MEDSIGNAL_MODO_TESTE` | liga o modo de teste no projeto inteiro |
| `VISAO_FONTE` | `webcam`, `rtsp` ou `arquivo` |
| `VISAO_WEBCAM_INDICE` | qual câmera, quando a fonte é webcam |
| `VISAO_RTSP_URL` | endereço da câmera IP |
| `VISAO_ARQUIVO` | caminho do vídeo, para ensaiar sem câmera |
| `VISAO_ARQUIVO_TEMPO_REAL` | `true` (padrão): o arquivo se comporta como câmera, com horário real; `false`: lê o mais rápido possível com timestamp em segundos de vídeo (é o que o arnês usa) |
| `VISAO_CLIPES` | `true` (padrão) grava o clipe de evidência de cada ocorrência; `false` desliga |
| `VISAO_CLIPES_PASTA` | pasta dos clipes (padrão `visao/dados/clipes`, a mesma que o compose monta na API) |
| `VISAO_CLIPES_RETENCAO_HORAS` | retenção, no máximo 24 (padrão 24) — acima disso a subida falha |
| `VISAO_CLIPES_SEGUNDOS_ANTES` / `_DEPOIS` | tamanho do clipe em torno da ocorrência (padrão 5 e 5) |
| `LOG_LEVEL` / `LOG_FORMATO` | nível e formato do log (`json`, padrão, ou `texto`) — iguais aos do backend |
| `VISAO_FPS_ALVO` | quadros por segundo processados (padrão 8) |
| `VISAO_LARGURA` | largura de trabalho em pixels (padrão 640) |

**A webcam só é aceita com `MEDSIGNAL_MODO_TESTE=true`.** Em operação real a
fonte tem de ser a câmera IP, como a RFC define. A validação está em
`app/config.py` e falha na subida, não no meio da execução.

Sobre os 8 fps: uma queda dura cerca de um segundo. Processar 30 fps gasta CPU
para produzir quadros quase idênticos; 8 fps dão oito amostras dentro do evento,
margem confortável para a análise temporal.

## Quando a câmera cai

A thread do pipeline não morre. `ServicoVisao` espera com backoff exponencial
(1 s, 2 s, 4 s… até 60 s), registra cada tentativa no log e expõe o estado:

```
GET /health   ->  "estado_da_fonte": "reconectando",
                  "captura": {"tentativa": 3, "proxima_tentativa_em_s": 3.2, "erro": "..."}
```

Enquanto não há quadro novo, o ping para a API é **suprimido**: o painel passa
a mostrar a câmera como desconectada em até 90 s, em vez de "conectada" para
uma câmera morta. Quando a fonte responde de novo, a captura volta sozinha e o
ping recomeça no segundo seguinte. Arquivo de vídeo que chega ao fim recomeça
do início, sem contar como queda — é a demonstração rodando em laço.

Para ensaiar sem câmera: suba com `VISAO_FONTE=arquivo` apontando para um
clipe curto e renomeie o arquivo com o serviço rodando (no Windows o arquivo
fica travado durante a leitura; tente de novo até a passada terminar). O
`/health` vira `reconectando`; restaure o nome e ele volta a `capturando`.

## Clipe de evidência e retenção

A cada ocorrência o serviço grava `visao/dados/clipes/<id da ocorrência>.mp4`
com os 5 s anteriores (buffer circular) e os 5 s seguintes, em H.264 (ffmpeg
do pacote `imageio-ffmpeg`; sem ele cai para mp4v, que não toca no navegador).
O expurgo roda no boot e de hora em hora, aqui e na API, e apaga o que passou
de 24 h. O registro da ocorrência no banco nunca é tocado.

A pasta é montada no container da API (`docker-compose.yml`), que serve o
arquivo em `GET /api/ocorrencias/{id}/clipe` só para usuário autenticado da
clínica dona. **Nunca comite um clipe**: a pasta está no `.gitignore`.

## Por que a webcam roda fora do container

Container no Windows **não enxerga webcam**. O Docker Desktop não expõe
dispositivo de vídeo, e repassar USB para o WSL2 depende de `usbipd-win`, exige
administrador e falha com frequência.

Então:

| Fonte | Onde roda |
| --- | --- |
| Webcam (teste) | nativo no Windows, com o venv desta pasta |
| Câmera IP (RTSP) | dentro do container — é só rede, funciona normalmente |
| Arquivo | os dois |

O código é idêntico nos dois casos. Muda apenas como o processo sobe.

## Rodando nativo (modo teste)

```bash
python -m venv visao/.venv
visao\.venv\Scripts\python.exe -m pip install -r visao/requirements.txt
visao\.venv\Scripts\python.exe visao/verificar_camera.py
```

## Se a câmera não abrir

- Outro programa pode estar segurando o dispositivo: Teams, Meet, o navegador
- Configurações do Windows → Privacidade e Segurança → Câmera
- Com mais de uma câmera, tente outro `VISAO_WEBCAM_INDICE`
- Dentro de container no Windows a webcam nunca aparece — rode nativo
