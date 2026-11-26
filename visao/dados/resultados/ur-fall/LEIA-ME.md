# UR Fall — avaliação do detector em conjunto público

> **Estes NÃO são os números da RFC.** São de um conjunto público externo (UR
> Fall, câmera 0) e valem só como teste de generalização da camada de regras.
> O número da RFC sai das gravações próprias (`dados/README.md`).

Fonte: Kwolek e Kępski (2014), UR Fall Detection Dataset, licença CC BY-NC-SA 4.0
(uso acadêmico e não comercial). 70 clipes da câmera 0: 30 quedas e 40 atividades
normais, 30 fps, 640×240 (profundidade à esquerda, RGB à direita). Os rótulos de
`inicio_s` e `fim_s` vêm do arquivo oficial `urfall-cam0-falls.csv`.

Preparo: `python visao/preparar_urfall.py` (recorta o RGB, 320×240).

## O que cada pasta é

| Pasta | O que mede |
|---|---|
| `referencia-sem-extensao/` | Clipes recortados, como são, com os limiares padrão. |
| `estendido/calibracao-*/` | Varredura de 729 combinações de limiares, só no conjunto de calibração (35 clipes, semente 42). |
| `estendido/teste-calibrado/` | Conjunto de teste (35 clipes), medido uma vez com os limiares vencedores. |
| `estendido/teste-padrao/` | Os mesmos 35 clipes de teste, com os limiares padrão de `regras.py`. |

**"Estendido" é dado sintético.** Os clipes são curtos demais para o detector:
nas 30 quedas a pessoa fica no chão de 0,2 a 2,1 s até o fim (mediana 0,7 s), e a
RN10 exige 3 s; além disso, o detector precisa de 8 quadros da pessoa para
aprender a altura dela em pé. Na versão estendida, todo clipe ganha o primeiro
quadro repetido por 2 s no começo, e cada queda ganha o último quadro repetido
por 4 s no fim (os rótulos oficiais terminam com a pessoa deitada). Os tempos
das anotações foram deslocados em 2 s (`anotacoes-urfall-ext.csv`).

## Resultado

| Medição | Recall | Precisão | FP (atividades normais) | Não avaliáveis |
|---|---:|---:|---:|---:|
| Referência, 70 clipes, sem extensão, limiares padrão | 0% (0 de 16 avaliáveis) | — | 0 de 39 | 15 |
| Calibração, melhor das 729 combinações | 6,7% (1 de 15) | 100% | 0 de 20 | 0 |
| **Teste, limiares calibrados** | **0% (0 de 15)** | — | 0 de 19 | 1 |
| **Teste, limiares padrão** | **0% (0 de 15)** | — | 0 de 19 | 1 |

A calibração não ajudou: o melhor recall em qualquer das 729 combinações foi
6,7%, e no teste caiu a 0%. **Não aplique estes limiares em `regras.py`.**

## Por que o detector não acerta aqui

Nas 15 quedas do conjunto de calibração, depois que a pessoa chega ao chão:

- só há pessoa detectada em 32% dos quadros (178 de 557) e classificada em 23%;
  em 7 das 15 quedas quase não há detecção;
- nas 6 quedas com 7 ou mais quadros classificados, o ângulo do tronco (mediana
  de 61° a 86°) e a razão de aspecto (0,9 a 2,3) indicam "deitado" em todas, mas
  em 4 delas (fall-01, 04, 09 e 14) a razão de altura fica em ~1,0, e o limiar
  exige ≤ 0,55: a altura de referência da pessoa em pé não se separa da deitada.
  Nas outras duas (fall-02 e fall-03) as três medidas passam do limiar.

Causas prováveis: câmera baixa, paralela ao chão, com a pessoa cortada na base do
quadro; resolução de 320×240; e a razão de altura, que depende de uma referência
de pé que aqui fica ruim. O que o conjunto mostra é um limite do enquadramento e
da resolução, e não dos limiares: nenhuma combinação da grade resolve.

## O que isto significa para o TCC

- O MedSignal pede câmera lateral ou diagonal a 2–2,5 m, corpo inteiro em quadro,
  clipes de 10 a 20 s (`dados/README.md`). O UR Fall cam0 não cumpre nada disso.
- Para citar: "avaliado também no UR Fall (câmera 0, com extensão sintética), onde
  o detector não atingiu o recall alvo por limite de enquadramento e resolução".
