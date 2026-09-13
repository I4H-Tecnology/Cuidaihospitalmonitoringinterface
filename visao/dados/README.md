# Dados de validação

Aqui ficam os vídeos encenados, as anotações e os resultados da avaliação do
detector de quedas. **Só as anotações e os resultados entram no Git.** Vídeos e
o cache de features são ignorados: são dados de imagem de pessoas, e imagem de pessoa
não entra em repositório, privado ou não.

```
visao/dados/
├── anotacoes.csv            <- você preenche (modelo em anotacoes.exemplo.csv)
├── videos/                  <- os clipes (fora do Git)
├── cache/                   <- features extraídas, reaproveitadas pela calibração (fora do Git)
└── resultados/<timestamp>/  <- metricas.json, metricas.md, erros.csv, clipes.csv
```

## 1. Gravar

Mínimo de 20 clipes, metade com queda e metade sem, cada um de 10 a 20 s.

**Câmera:** lateral ou em diagonal, a 2–2,5 m de altura, longe o bastante para
o corpo inteiro caber em pé **e deitado**. Antes de gravar, deite no chão e
confira se os pés aparecem. A webcam de notebook não serve: enquadra do tronco
para cima e o pipeline não consegue medir a verticalidade sem os quadris.

**Com queda (deve alertar):** queda da cama, queda ao caminhar, queda para
trás, escorregão, permanência prolongada no chão, já no chão ao entrar em cena.

**Sem queda (não pode alertar):** sentar rápido na cama, agachar para pegar
algo, deitar de propósito e levantar em 2 s, amarrar o sapato, alongar no chão,
sair e voltar ao quadro.

Varie iluminação, distância, ângulo e roupa. Grave você mesmo, ou alguém que
assine autorização de uso de imagem (LGPD).

Conferir se um clipe está enquadrado:

```bash
VISAO_FONTE=arquivo VISAO_ARQUIVO=visao/dados/videos/queda-cama-01.mp4 visao/.venv/Scripts/python.exe visao/detectar.py --features
```

A maioria dos quadros deve sair **sem** "sem classificação". Se aparecer
"quadris fora de vista", o enquadramento está errado.

## 2. Anotar

Uma linha por clipe em `anotacoes.csv`:

| Coluna | O que é |
|---|---|
| `arquivo` | nome do clipe dentro de `videos/` |
| `tem_queda` | `sim` ou `nao` |
| `inicio_s` | segundo em que a queda começa (só se `tem_queda=sim`) |
| `fim_s` | segundo em que a pessoa chega ao chão (só se `tem_queda=sim`) |
| `cenario` | rótulo livre: `queda_da_cama`, `sentar`, `agachar`... |
| `observacao` | livre |
| `conjunto` | opcional: `calibracao` ou `teste` para fixar a divisão à mão |

O alerta é considerado correto se cair entre `inicio_s` e `fim_s` mais a
tolerância (5 s por padrão, o alvo de latência da RFC). Como a ocorrência só
nasce após 3 s de permanência no chão (RN10), a latência medida sempre inclui
esses 3 s.

## 3. Calibrar e medir

```bash
# divide em calibração/teste, varre a grade de limiares no conjunto de calibração
visao/.venv/Scripts/python.exe visao/calibrar.py

# mede UMA vez no conjunto de teste, com os limiares vencedores
visao/.venv/Scripts/python.exe visao/avaliar.py --conjunto teste \
    --divisao visao/dados/resultados/calibracao-<ts>/divisao.csv \
    --limiares visao/dados/resultados/calibracao-<ts>/limiares.json
```

O `metricas.md` dessa última rodada é o que vai para a RFC. Se o alvo não for
atingido, publica-se assim mesmo, com a análise de `erros.csv`.

Para uma passada rápida em tudo, com os limiares padrão de `regras.py`:

```bash
visao/.venv/Scripts/python.exe visao/avaliar.py
```

## Como o veredito de cada clipe é decidido

| Veredito | Quando |
|---|---|
| TP | tinha queda e houve alerta dentro da janela |
| FN | tinha queda e nenhum alerta na janela |
| FP | não tinha queda e houve alerta |
| TN | não tinha queda e nenhum alerta |
| NAO_AVALIAVEL | o pipeline classificou gente em menos de 8 quadros — não entra na matriz |

O último existe de propósito: um clipe em que a câmera não mostrou o corpo
inteiro não é um "acerto" do sistema, e contá-lo como TN inflaria a precisão.
