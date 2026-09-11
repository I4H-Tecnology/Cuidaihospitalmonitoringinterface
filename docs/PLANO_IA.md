# Plano da solução de IA — MedSignal

> **Para quem for executar este plano numa sessão nova.** Leia a seção 0
> primeiro: ela tem o que você precisa para rodar o projeto e as restrições que
> não podem ser violadas. Depois siga a ordem de execução no final.

> Documento de trabalho. A fonte normativa é a RFC (`docs/_cRFC_MedSignal_N3.pdf`,
> seção 5.5) e a direction da linha de projeto
> (`portfolio-directions-ia.md`, no repositório The-Portfolio-Playbook da
> Católica SC). Onde houver divergência, elas mandam.

Este plano cobre a única coisa que é avaliada como IA neste projeto: **detectar
queda a partir de vídeo, e provar com número que a detecção funciona**.

---

## 0. Contexto para executar

### Onde fica o quê

```
C:\Projetos\MedSignal\
├── visao/                    <- é aqui que este plano trabalha
│   ├── app/
│   │   ├── config.py         Config lida do .env; valida e falha cedo
│   │   ├── fonte_video.py    webcam | rtsp | arquivo, mesma interface
│   │   ├── deteccao.py       YOLOv8n + ByteTrack -> lista de Pessoa
│   │   ├── pose.py           MediaPipe Pose sobre o recorte do YOLO
│   │   ├── caracteristicas.py 5 features invariantes a escala
│   │   ├── regras.py         Limiares + ClassificadorQuedas (máquina de estados)
│   │   ├── pipeline.py       amarra tudo; é o que o arnês deve reusar
│   │   ├── servidor.py       /stream MJPEG, /estado, /health na porta 8001
│   │   └── publicador.py     envia a ocorrência para a API
│   ├── detectar.py           CLI: roda o pipeline, com --janela e --features
│   ├── servir.py             sobe o serviço HTTP
│   ├── pesos/yolov8n.pt      peso do YOLO (fora do Git)
│   └── .venv/                ambiente Python próprio
├── backend/                  FastAPI (não é escopo deste plano)
├── frontend/                 React + Vite (só o passo 6 toca aqui)
└── docs/                     a RFC e este documento
```

**O Python do serviço de visão é `visao/.venv/Scripts/python.exe`**, não o do
sistema. Rode sempre a partir da raiz do projeto:

```bash
cd C:/Projetos/MedSignal && visao/.venv/Scripts/python.exe visao/detectar.py --features --segundos 20
```

### Como rodar sobre um arquivo de vídeo

O arnês precisa disto. No `.env` da raiz:

```
MEDSIGNAL_MODO_TESTE=true
VISAO_FONTE=arquivo
VISAO_ARQUIVO=visao/dados/videos/queda-cama-01.mp4
```

Ou, sem tocar no `.env`, defina as variáveis no ambiente do processo — a
`Config` lê de `os.environ` na construção.

### Contrato do pipeline

É o que o arnês vai consumir. **Não reimplemente nada disto**: usar o mesmo
código do ao vivo é o que torna a medição válida.

```python
from visao.app.config import Config, Fonte
from visao.app.pipeline import PipelineDeteccao
from visao.app.regras import Limiares

cfg = Config()           # lê do ambiente; cfg.validar() falha cedo se inválido
pipeline = PipelineDeteccao(cfg, limiares=Limiares(...), pasta_pesos=Path("visao/pesos"))

for resultado in pipeline.executar():      # gerador de ResultadoQuadro
    resultado.quadro.timestamp             # float, epoch
    resultado.quadro.indice                # int, 1-based
    resultado.ms_total                     # latência do quadro
    resultado.ocorrencias                  # list[ResultadoPessoa] que dispararam
    resultado.caidos                       # list[ResultadoPessoa] em estado CAIDO
    for r in resultado.pessoas:
        r.pessoa.id_rastreio               # int, estável pelo ByteTrack
        r.caracteristicas                  # Caracteristicas | None
        r.avaliacao                        # Avaliacao | None
        r.impedimento                      # str | None -- por que não classificou
pipeline.fechar()
```

`Limiares` é um dataclass congelado: para varrer a grade, construa instâncias
novas e passe no construtor. **Não edite `regras.py` durante a calibração.**

```python
@dataclass(frozen=True)
class Limiares:
    angulo_caido: float = 55.0
    razao_aspecto_caido: float = 0.9
    razao_altura_caido: float = 0.55
    velocidade_queda: float = 0.8
    quadros_para_confirmar: int = 6
    quadros_para_recuperar: int = 10
    segundos_para_ocorrencia: float = 3.0

@dataclass
class Avaliacao:
    estado: Estado                  # NORMAL | CAINDO | CAIDO
    confianca: float                # escore da regra, 0 a 1 -- NÃO é precisão do modelo
    mudou_de_estado: bool
    deve_gerar_ocorrencia: bool     # True só no quadro em que cruza a permanência
    motivo: str
    inicio_caido: float | None      # timestamp em que chegou ao chão
    viu_transicao: bool             # True se viu o movimento; False se já estava no chão

@dataclass(frozen=True)
class Caracteristicas:
    angulo_tronco: float        # graus da vertical: 0 = em pé, 90 = deitado
    razao_aspecto: float        # largura/altura da caixa
    razao_altura: float         # altura atual / altura de pé
    velocidade_queda: float     # corpos por segundo, positivo = descendo
    abertura_vertical: float    # ombro→tornozelo projetado na vertical
```

**Atenção ao `impedimento`.** Quando ele não é `None`, o pipeline **não
conseguiu classificar** aquela pessoa. Tratar isso como "normal" invalida a
medição: o clipe precisa ser descartado ou contado à parte, nunca como
verdadeiro negativo.

### O que já está verificado — não refaça

- Os estágios 1 a 5 e o 7 do pipeline funcionam ponta a ponta
- O registro da ocorrência chega ao Postgres, com deduplicação e fila em disco
- O alerta chega ao painel por WebSocket em 250 ms (alvo da RFC: 5 s)
- Máquina de estados testada nos três caminhos: queda observada, já-no-chão, e recuperação

### Restrições que não podem ser violadas

**A webcam acende uma luz física.** Nunca suba `visao/servir.py` nem
`detectar.py` com `VISAO_FONTE=webcam` sem avisar o usuário antes, e encerre o
processo assim que terminar. O arnês usa `VISAO_FONTE=arquivo` e não precisa
de câmera.

**Não invente número.** Se a métrica não puder ser medida, escreva que não foi
medida. Valor fabricado de IA é item de reprovação direta nesta linha — é
exatamente o que o passo 6 existe para remover.

**Git.** A branch de trabalho é `qa`; nunca commite em `dev` nem em `main`. As
mensagens são em português, no formato `tipo(escopo): descrição`, e **sem
nenhum trailer de coautoria ou menção a assistente** — a autoria do projeto é
do aluno, e há prova de autoria na disciplina.

**Vídeos não entram no Git.** Só as anotações. `visao/dados/videos/` e
`visao/dados/clipes/` devem estar no `.gitignore`.

### Ambiente

Docker precisa estar no ar para o backend, mas **o arnês não depende dele** —
ele roda direto sobre os arquivos de vídeo. Se o Docker recusar subir com erro
em `sailor-ingest.sock`, a correção conhecida é renomear
`%LOCALAPPDATA%\Docker\run` e reiniciar o Docker Desktop.

---

## 1. O que a RFC promete

A linha principal é **Projetos com IA (Visão Computacional)**. A seção 5.5
declara, em ordem:

| Item | O que está escrito |
|---|---|
| Abordagem | Modelos pré-treinados com ajuste fino, não treinamento do zero |
| Detecção | YOLOv8 — a pessoa no quadro |
| Pose | MediaPipe Pose — os pontos-chave do corpo |
| Decisão | Camada de regras / classificador leve sobre os landmarks |
| Dados | Vídeos encenados próprios, por barreira ética e LGPD |
| Pipeline | Sete etapas, da captura à implantação |
| Métricas | Acurácia, precisão, recall, F1, taxa de FP, latência |

E os alvos da seção 1.6:

```
recall    ≥ 90%     precisão  ≥ 80%
falsos +  ≤ 15%     latência  ≤ 5 s
```

A RFC também justifica por que **recall vem antes de precisão**: deixar de
detectar uma queda real é mais grave que gerar um alerta indevido. Essa frase
não é enfeite — ela vira a regra de decisão da calibração, no passo 4.

---

## 2. O que existe hoje

Os sete estágios do pipeline, como estão:

| # | Etapa | Estado | Onde |
|---|---|---|---|
| 1 | Captura | pronto | `visao/app/fonte_video.py` |
| 2 | Pré-processamento | pronto | amostragem a 8 fps, redimensionamento |
| 3 | Inferência | pronto | `deteccao.py` (YOLOv8n + ByteTrack) e `pose.py` |
| 4 | Pós-processamento | pronto | `caracteristicas.py` — 5 features |
| 5 | Decisão | pronto | `regras.py` — máquina de 3 estados |
| 6 | **Validação** | **arnês pronto; sem número até existirem clipes** | `visao/avaliar.py`, `visao/calibrar.py`, `visao/app/avaliacao.py` |
| 7 | Implantação | pronto | contêiner, `publicador.py`, alerta por WebSocket |

**A etapa 6 é a lacuna, e é a que mais pesa.** A direction da linha IA é
explícita: *"não há meta de cobertura obrigatória. Testes unitários não se
aplicam bem a pipeline de IA, e o que substitui a garantia de qualidade aqui é
a validação do modelo"*.

Ou seja: **a matriz de confusão é a sua suíte de testes**. Sem ela, a vertical
de IA não tem prova de funcionamento — e "ausência de testes ou evidência de
funcionamento" está na lista do que deve ser evitado.

---

## 3. A decisão central: por que camada de regras

A pergunta que a banca vai fazer é *"por que não uma rede neural?"*. A
resposta tem três partes, e vale saber as três.

**Porque a RFC já decidiu isso.** A seção 5.5 declara "camada de regras /
classificador leve". Mudar agora exigiria emendar a RFC já entregue.

**Porque cada limiar é defensável em voz alta.** Os sete parâmetros de
`regras.py` hoje:

| Parâmetro | Valor | Justificativa |
|---|---|---|
| `angulo_caido` | 55° | Em pé, mesmo inclinado para amarrar o sapato, o tronco raramente passa de 45° |
| `razao_aspecto_caido` | 0,9 | Caixa mais larga que alta. Em pé fica perto de 0,4; sentado, ~0,7 |
| `razao_altura_caido` | 0,55 | Metade da altura de pé. Agachar chega a ~0,6; deitar, a ~0,3 |
| `velocidade_queda` | 0,8 corpos/s | Sentar controlado fica em torno de 0,3/s; queda real passa de 0,8 |
| `quadros_para_confirmar` | 6 | A 8 fps são ~0,75 s: filtra agachamento rápido sem atrasar o alerta |
| `quadros_para_recuperar` | 10 | Maior que o anterior de propósito: sair do alerta deve custar mais que entrar |
| `segundos_para_ocorrencia` | 3,0 s | A "permanência anormal no chão" da RN10. Abaixo disso, quem deitou vira alerta |

Num LSTM você teria de defender pesos que ninguém consegue inspecionar. Aqui
você defende sete números, cada um com uma frase.

**Porque "resultados aleatórios ou não replicáveis" reprova direto.** Uma rede
treinada em 20 vídeos encenados teria variância alta e resultado difícil de
reproduzir. A camada de regras dá o mesmo resultado toda vez.

### O trade-off, dito com honestidade

A direction lista *"desenvolvimento de modelo próprio (em vez de apenas usar um
pré-treinado)"* como **diferencial** — algo que eleva o projeto. Ao ficar na
camada de regras, você abre mão desse ponto.

É uma troca consciente: você perde o diferencial e ganha replicabilidade,
explicabilidade e aderência ao que a RFC já prometeu. Se sobrar tempo depois
das métricas medidas, o caminho para recuperar o diferencial está no passo 6.

---

## 4. O caminho, em cinco passos

### Passo 1 — Gravar os vídeos *(o caminho crítico)*

**Nada avança sem isto.** É o único passo que depende só de você, e todos os
outros quatro dependem dele.

#### Posicionamento da câmera

Este é o ponto que já derrubou os testes com a webcam do notebook. O
diagnóstico que o próprio sistema emitiu:

> *quadris fora de vista — a câmera precisa enquadrar o corpo inteiro para
> medir a verticalidade do tronco*

Webcam de notebook enquadra como videochamada: do tronco para cima. Sem os
quadris, o pipeline **não calcula o ângulo do tronco nem a razão de altura** —
as duas features que decidem se alguém está caído.

Como posicionar:

- **Lateral ou em diagonal**, nunca de frente e perto
- **Altura de 2 a 2,5 m**, como uma câmera de ambiente de verdade
- **Distância suficiente para o corpo inteiro caber em pé e deitado** — teste
  antes: deite no chão e confira se os pés aparecem
- Iluminação do ambiente, sem contraluz forte na janela

#### Cenários

Mínimo de **20 clipes**, metade de cada. Cada um de 10 a 20 segundos.

**Positivos — deve alertar (10+)**

| Cenário | Por que importa |
|---|---|
| Queda da cama | É o caso mais comum na população-alvo |
| Queda ao caminhar | Testa a feature de velocidade |
| Queda para trás | Pose parcialmente oclusa |
| Escorregão | Transição rápida, testa `quadros_para_confirmar` |
| Permanência prolongada no chão | Testa a RN10 e os 3 s |
| Já no chão quando entra em cena | Testa o caminho sem transição observada |

**Negativos — não pode alertar (10+)**

| Cenário | O que ele ataca |
|---|---|
| Sentar rápido na cama | `velocidade_queda` |
| Agachar para pegar algo | `razao_altura` |
| Deitar de propósito e levantar em 2 s | `segundos_para_ocorrencia` |
| Amarrar o sapato | `angulo_caido` |
| Alongar no chão | Todas juntas — é o mais difícil |
| Sair e voltar ao quadro | Continuidade do rastreio |

**Varie** entre os clipes: iluminação (dia e noite), distância, ângulo, roupa
clara e escura. Variação é o que impede que a calibração fique presa a um
único cenário.

#### LGPD

Grave **você mesmo**, ou alguém que assine autorização de uso de imagem. A RFC
justifica os dados encenados exatamente por isso: *"o uso de imagens reais de
pacientes idosos em clínicas envolve barreiras éticas e de privacidade (LGPD)
que inviabilizam a coleta no escopo acadêmico"*.

Os vídeos **não vão para o Git** — só as anotações. São dados de imagem, e o
repositório é público.

---

### Passo 2 — Anotar

Um CSV, uma linha por clipe:

```
arquivo,tem_queda,inicio_s,fim_s,cenario,observacao
queda-cama-01.mp4,sim,4.2,6.0,queda_da_cama,
sentar-rapido-03.mp4,nao,,,sentar,negativo dificil
```

Formato simples de propósito: anotar à mão precisa ser rápido, senão o dataset
não cresce. `inicio_s` e `fim_s` marcam a janela em que o alerta seria correto.

---

### Passo 3 — Construir o arnês *(`visao/avaliar.py`)*

Roda o **mesmo** `PipelineDeteccao` do ao vivo, com `VISAO_FONTE=arquivo`.
Usar o mesmo código é o que torna o resultado replicável — um caminho separado
para avaliação mediria outra coisa.

Como casar detecção com anotação:

- **TP** — ocorrência dentro de `[inicio_s, fim_s + tolerância]`
- **FN** — a janela passou sem ocorrência
- **FP** — ocorrência fora de qualquer janela
- **TN** — clipe negativo que terminou limpo

Saída em `visao/dados/resultados/<timestamp>/`:

| Arquivo | Para quê |
|---|---|
| `metricas.json` | leitura por máquina, e o CI compara com o alvo |
| `metricas.md` | a tabela que você cola na RFC e no pôster |
| `erros.csv` | cada FP e FN com clipe e segundo — é o que guia o passo 4 |

Registre no JSON a **semente** e a **versão dos pesos do YOLO**. "Resultados
replicáveis" é literalmente o critério da régua de aprovação.

---

### Passo 4 — Calibrar *(`visao/calibrar.py`)*

`Limiares` já é um dataclass congelado com tudo parametrizado — não precisa
refatorar nada, só variar.

**Separe os clipes em dois conjuntos antes de começar.** Calibre num,
meça no outro. Isso é holdout, que a direction cita nominalmente entre as
técnicas de validação aceitas. Calibrar e medir no mesmo conjunto produz um
número bonito que não se sustenta.

**Escreva o critério antes de olhar o resultado:**

> maximizar recall, sujeito a precisão ≥ 0,80

É a prioridade que a RFC declara na seção 1.6. Ter o critério fixado de
antemão é o que separa calibração de garimpo de número.

Depois, atualize os comentários de `regras.py`: cada limiar deixa de dizer
"calibrado na geometria" e passa a citar o resultado que o escolheu.

---

### Passo 5 — Medir e publicar

Uma única rodada no conjunto de teste. **Esse** é o número que vai para a RFC,
para o pôster e para a tela.

O que publicar:

- Matriz de confusão
- Acurácia, precisão, recall, F1, taxa de FP
- Latência: média, p95 e máxima, do primeiro quadro da queda até o alerta
- Análise dos erros: quais cenários falham, e por quê

**Se o alvo não for atingido, publique assim mesmo.** Um recall de 82% com a
análise de por que os 18% falharam vale mais que um número redondo sem
explicação — e é infinitamente melhor que um número inventado. A banca
distingue as duas coisas.

---

## 5. O que precisa sair do produto

A direction lista, em **"o que não pode ter"** (reprovação direta):

> *Modelo com resultados aleatórios ou não replicáveis*

Pendente hoje:

| Arquivo | Problema |
|---|---|
| `AIAssistant.tsx` | previsões geradas com `Math.random()` |
| `AIChatbot.tsx` | "IA" que é dicionário de strings fixas |
| `DashboardScreen.tsx` | "Precisão da IA 94,2%" e gráfico com `Math.random()` |
| `BedsRoomsScreen.tsx` | `aiRisk` (baixo/moderado/alto) fabricado por paciente |

Os dois primeiros já estão fora do MVP pela seção 2.6 da RFC — saem do
produto. Os números do Dashboard devem ser substituídos pelos **medidos no
passo 5**, ou removidos até que existam.

Ao final, `grep -rn "Math.random" frontend/src/app` não deve devolver nada no
caminho de IA.

---

## 6. Se sobrar tempo: recuperar o diferencial

Só depois das métricas medidas, e sem mexer no que já funciona:

**Classificador leve sobre as mesmas features.** Uma árvore de decisão ou
regressão logística treinada nos cinco valores que `caracteristicas.py` já
extrai. Continua inspecionável — dá para imprimir a árvore — e vira "modelo
próprio" de verdade. O arnês do passo 3 compara os dois de graça.

**Validação cruzada k-fold** em vez de holdout simples, se o número de clipes
permitir. A direction cita as duas.

---

## 7. O que você precisa saber defender

Perguntas prováveis, e onde está a resposta:

| Pergunta | Resposta |
|---|---|
| Por que não uma rede neural? | Seção 3 deste documento |
| De onde vieram esses limiares? | Passo 4 — e o `erros.csv` que justificou cada ajuste |
| Como sei que não está superajustado? | Holdout: calibrado num conjunto, medido em outro |
| E se a câmera não pegar o corpo inteiro? | O sistema diz que não conseguiu classificar, em vez de responder "normal" |
| Onde estão os dados? | Vídeos encenados próprios, com a justificativa LGPD da seção 5.5 |
| O resultado é reproduzível? | Semente fixa e versão dos pesos registradas em `metricas.json` |

O item mais forte da sua defesa não é a acurácia: é o fato de o pipeline
**declarar quando não consegue classificar**. Um monitor que falha calado é
pior que um que não existe, e esse comportamento já está implementado.

---

## Ordem de execução

```
[você]  1. Gravar 20+ clipes            ← nada anda sem isto
[você]  2. Anotar o CSV                 (modelo: visao/dados/anotacoes.exemplo.csv)
[code]  3. Arnês de avaliação           FEITO — visao/avaliar.py
[code]  4. Calibração com holdout       FEITO — visao/calibrar.py (roda quando houver clipes)
[code]  5. Medir, publicar, atualizar a RFC   ← pendente: depende de 1 e 2
[code]  6. Remover a IA falsa do produto      FEITO
```

Estado em 11/09/2026: os passos 3, 4 e 6 estão prontos e verificados (29
testes do arnês sem vídeo; `tsc` limpo; 86 testes do frontend; teste de fumaça
de `avaliar.py` e `calibrar.py` sobre um clipe sintético, que saiu como
NAO_AVALIAVEL por não mostrar os quadris — o comportamento esperado). O que
falta é o que só você pode fazer: gravar e anotar. Depois disso:

```bash
visao/.venv/Scripts/python.exe visao/calibrar.py
visao/.venv/Scripts/python.exe visao/avaliar.py --conjunto teste --divisao <pasta>/divisao.csv --limiares <pasta>/limiares.json
```

O passo 6 é o único que não depende dos vídeos, e é o que fecha o risco de
reprovação direta. Os passos 3 a 5 ficam prontos para rodar assim que os
clipes existirem.

---

## 8. Critério de aceite por passo

Um passo só está pronto quando o item verificável abaixo existe e foi conferido.

| Passo | Pronto quando |
|---|---|
| 1. Gravar | `visao/dados/videos/` tem 20+ clipes; rodar `detectar.py --features` num deles mostra `impedimento: None` na maioria dos quadros |
| 2. Anotar | `visao/dados/anotacoes.csv` cobre todos os clipes; toda linha com `tem_queda=sim` tem `inicio_s` e `fim_s` |
| 3. Arnês | `visao/avaliar.py` roda ponta a ponta e grava `metricas.json`, `metricas.md` e `erros.csv` |
| 4. Calibrar | `visao/calibrar.py` devolve os limiares vencedores; conjuntos de calibração e teste são disjuntos e isso está registrado |
| 5. Medir | `metricas.md` tem matriz de confusão e as seis métricas, com semente e versão dos pesos |
| 6. Limpar | `grep -rn "Math.random" frontend/src/app` não devolve nada em caminho de IA; `tsc --noEmit` limpo; testes passando |

### Antes de encerrar qualquer passo

```bash
cd C:/Projetos/MedSignal/frontend && npx tsc --noEmit && npm test -- --run
cd C:/Projetos/MedSignal && python -m py_compile backend/app/*.py backend/app/rotas/*.py visao/app/*.py
```

Hoje o esperado é: typecheck limpo, **86 testes passando**, tudo compilando.
Se algum número desses mudar para pior, algo quebrou.
