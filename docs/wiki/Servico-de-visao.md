# Serviço de visão

Referência: RFC seção 5.5 (Solução de IA), RF09 a RF14, RN10, RN15, RNF05, RNF16, RNF17. Código em `visao/`; contexto de execução em `visao/README.md`.

## O pipeline de sete etapas

A RFC 5.5 descreve sete etapas. Este é o estado de cada uma:

| # | Etapa | Estado | Onde |
|---|---|---|---|
| 1 | Captura | pronta | `app/fonte_video.py`: webcam, RTSP ou arquivo pela mesma interface; reconexão com backoff |
| 2 | Pré-processamento | pronta | amostragem a 8 fps e redimensionamento para 640 px de largura |
| 3 | Inferência | pronta | `app/deteccao.py` (YOLOv8n + ByteTrack) e `app/pose.py` (MediaPipe Pose sobre o recorte da pessoa) |
| 4 | Pós-processamento | pronta | `app/caracteristicas.py`: cinco features invariantes a escala |
| 5 | Decisão | pronta | `app/regras.py`: limiares e máquina de três estados |
| 6 | Validação | **arnês pronto, sem número** | `avaliar.py`, `calibrar.py`, `app/avaliacao.py`; aguarda os vídeos encenados. Ver [[Validação do modelo|Validacao-do-modelo]] |
| 7 | Implantação | pronta | `app/publicador.py` (registro na API com fila em disco), `app/servidor.py` (MJPEG, estado, saúde), `app/clipes.py` |

Sobre os 8 fps: uma queda dura cerca de um segundo. Processar 30 fps gasta CPU para produzir quadros quase idênticos; 8 fps dão oito amostras dentro do evento.

## As cinco features

O problema central é **escala**: uma pessoa a dois metros ocupa o triplo dos pixels de uma a seis metros, e nenhuma medida em pixel serve de limiar fixo. Toda feature é adimensional ou normalizada pelo próprio corpo da pessoa, nunca pelo quadro.

| Feature | O que mede | Como |
|---|---|---|
| `angulo_tronco` | perda de verticalidade | ângulo do segmento quadril → ombro com a vertical: 0° em pé, 90° deitado; cair para frente ou para trás dá o mesmo número |
| `razao_aspecto` | a caixa virou | largura / altura da caixa do YOLO: ~0,4 em pé, > 1 caído |
| `razao_altura` | encolheu | altura atual / altura de pé, aprendida em execução pelo percentil 90 das alturas vistas |
| `velocidade_queda` | descida brusca | variação da altura normalizada, em corpos por segundo, comparando com o quadro mais antigo da janela |
| `abertura_vertical` | agachado ou caído | ombro → tornozelo projetado na vertical, sobre a diagonal da caixa |

Elas implementam a RN10 literalmente: "alteração brusca de postura, perda de verticalidade ou permanência anormal no chão".

## Os sete limiares

| Parâmetro | Valor | Justificativa |
|---|---|---|
| `angulo_caido` | 55° | em pé, mesmo inclinado para amarrar o sapato, o tronco raramente passa de 45° |
| `razao_aspecto_caido` | 0,9 | caixa mais larga que alta; em pé ~0,4, sentado ~0,7 |
| `razao_altura_caido` | 0,55 | metade da altura de pé; agachar chega a ~0,6, deitar a ~0,3 |
| `velocidade_queda` | 0,8 corpos/s | sentar controlado fica em ~0,3/s |
| `quadros_para_confirmar` | 6 | ~0,75 s a 8 fps: filtra agachamento rápido sem atrasar o alerta |
| `quadros_para_recuperar` | 10 | maior que o anterior de propósito: sair do alerta deve custar mais que entrar |
| `segundos_para_ocorrencia` | 3,0 s | a "permanência anormal no chão" da RN10; abaixo disso, quem deitou vira alerta |

Estes valores vieram da geometria do problema, **não de dados**. A calibração por holdout (`calibrar.py`) vai substituí-los pelos que a matriz de confusão escolher, e o comentário de cada um em `regras.py` passará a citar o resultado. Enquanto isso, são o que está no código e é assim que a Wiki os apresenta.

## A máquina de estados

```
 NORMAL ──descida ≥ 0,8 corpos/s──▶ CAINDO ──postura de caído por 6 quadros──▶ CAIDO
   ▲                                   │                                        │
   └──── postura normal por 10 quadros ─┴────────────── levantou ───────────────┘
```

Dois caminhos levam a CAIDO: a queda observada (NORMAL → CAINDO → CAIDO, `viu_transicao=True`) e a pessoa que já entrou em cena no chão ou caiu fora do enquadramento (NORMAL → CAIDO após 6 quadros de postura horizontal, `viu_transicao=False`). O tipo do evento registrado muda entre os dois (`queda` ou `permanencia_solo`).

A **ocorrência** não nasce ao entrar em CAIDO, e sim ao **permanecer** 3 s: é a diferença entre "deitou" e "caiu e não levantou". O instante gravado é o em que a pessoa chegou ao chão, não o em que o limiar de permanência foi cruzado.

## Quando o pipeline não consegue classificar

Isto é o comportamento mais importante de defender. Se a pose não mostra ombros e quadris (câmera enquadrando só o tronco, como webcam de notebook), o serviço **não responde "normal"**: expõe um `impedimento` com o motivo, por pessoa e por quadro, no `/estado` e na tela. Um monitor que falha calado é pior que um que não existe. O arnês de validação usa a mesma informação para tirar da matriz de confusão os clipes que não puderam ser avaliados.

## Da detecção ao registro

`publicador.py` leva a ocorrência à API sem segurar o pipeline: o envio sai numa thread com fila; o que falha vai para disco e é reenviado quando a API voltar (RNF16); cada evento carrega uma chave estável (câmera, pessoa, instante), então reenviar não duplica. A autenticação é a de um usuário de serviço com perfil SYSTEM, que só pode ler o cadastro da própria câmera e registrar ocorrência.

## Quando a fonte cai

A thread não morre (RNF16). Espera com backoff exponencial de 1 s a 60 s, expõe `capturando` / `reconectando` / `parado` com tentativa e próxima espera, e suprime o ping para a API enquanto não há quadro novo, de modo que o painel mostra a câmera desconectada em até 90 s (RF30, RN15, RNF17) e o painel distingue "serviço fora do ar" de "câmera fora do ar". Arquivo de vídeo que chega ao fim recomeça em laço: é a demonstração, não uma queda.

## Clipe de evidência

A cada ocorrência, 5 s antes (buffer circular) e 5 s depois viram `visao/dados/clipes/<id da ocorrência>.mp4` em H.264, com os quadros anotados. O expurgo roda no boot e de hora em hora e apaga o que passou de 24 h (RNF05, RN08, RN09); a ocorrência fica (RNF18). Ver [[Segurança e LGPD|Seguranca-e-LGPD]] para quem pode ver o clipe.

## Como rodar e ensaiar

Ver [[Como rodar]] para subir o serviço, e `visao/dados/README.md` para o protocolo de gravação dos vídeos encenados e o formato das anotações.
