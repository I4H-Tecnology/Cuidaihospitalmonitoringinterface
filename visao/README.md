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

A implementar:

1. Arnês de avaliação: vídeos anotados → matriz de confusão → as seis métricas
   da RFC (precisão, recall, F1, taxa de falso positivo, acurácia, latência)
2. Reconexão automática da câmera e sinalização de offline (RF30, RN15)
3. Clipe de 10s por ocorrência, com expurgo em 24h (RNF05)

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
| `VISAO_FPS_ALVO` | quadros por segundo processados (padrão 8) |
| `VISAO_LARGURA` | largura de trabalho em pixels (padrão 640) |

**A webcam só é aceita com `MEDSIGNAL_MODO_TESTE=true`.** Em operação real a
fonte tem de ser a câmera IP, como a RFC define. A validação está em
`app/config.py` e falha na subida, não no meio da execução.

Sobre os 8 fps: uma queda dura cerca de um segundo. Processar 30 fps gasta CPU
para produzir quadros quase idênticos; 8 fps dão oito amostras dentro do evento,
margem confortável para a análise temporal.

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
