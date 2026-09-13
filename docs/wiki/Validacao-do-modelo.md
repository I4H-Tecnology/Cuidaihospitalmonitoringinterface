# Validação do modelo

Referência: RFC seção 1.6 (Métricas de Sucesso) e 5.5 (Métricas de avaliação do modelo, etapa 6 do pipeline).

## Estado: nenhuma métrica foi medida ainda

Em 11/09/2026 **não existe número de precisão, recall, F1, acurácia, taxa de falso positivo nem latência para o detector de quedas**. O arnês que os produz está pronto e testado; o que falta são os vídeos encenados que a RFC define como base de dados. Qualquer valor que apareça em outra parte do projeto para essas métricas está errado e deve ser corrigido.

Nesta linha de projeto isso é dito com todas as letras, não escondido: um número inventado de IA reprova. A metodologia abaixo está definida e implementada, e será executada assim que os clipes existirem.

## Os alvos (RFC 1.6)

| Métrica | Alvo | Por quê |
|---|---|---|
| Recall (sensibilidade) | ≥ 90% | deixar de detectar uma queda real é mais grave do que um alerta indevido |
| Precisão | ≥ 80% | alerta indevido custa a confiança da equipe |
| Taxa de falsos positivos | ≤ 15% | por período de monitoramento |
| Latência | ≤ 5 s | da detecção à emissão do alerta |

A RFC prioriza recall sobre precisão. Isso vira a regra de decisão da calibração: **maximizar recall, sujeito a precisão ≥ 0,80**, fixada no código antes de qualquer resultado ser olhado (`visao/calibrar.py`).

## Base de dados

Vídeos encenados próprios, por barreira ética e de LGPD para usar imagens reais de pacientes (RFC 5.5). Mínimo de 20 clipes de 10 a 20 s, metade com queda (queda da cama, ao caminhar, para trás, escorregão, permanência no chão, já no chão ao entrar em cena) e metade sem (sentar rápido, agachar, deitar e levantar, amarrar o sapato, alongar no chão, sair e voltar ao quadro). Câmera lateral ou diagonal, a 2 a 2,5 m, enquadrando o corpo inteiro em pé e deitado. Os vídeos **não entram no Git**; só as anotações. Protocolo completo em `visao/dados/README.md`.

Limitação reconhecida pela própria RFC: dados encenados não capturam toda a variabilidade de quedas reais.

## Anotação

Um CSV, uma linha por clipe: `arquivo, tem_queda, inicio_s, fim_s, cenario, observacao` e, opcionalmente, `conjunto` para fixar a divisão à mão. `inicio_s` e `fim_s` marcam a janela em que o alerta seria correto.

## Metodologia

**Mesmo pipeline do ao vivo.** O arnês (`visao/avaliar.py`) roda o `PipelineDeteccao` real lendo o arquivo com timestamp em segundos de vídeo e amostragem por passo fixo de quadros, para o mesmo clipe produzir sempre o mesmo resultado. Um caminho separado só para avaliar mediria outra coisa.

**Holdout.** `visao/calibrar.py` divide os clipes em calibração e teste antes de qualquer varredura, estratificando por `tem_queda`, com semente registrada. A grade de limiares é varrida só no conjunto de calibração; o número que vai para a RFC sai de **uma** rodada no conjunto de teste. Calibrar e medir no mesmo conjunto produz um número bonito que não se sustenta.

**Matriz de confusão por clipe.**

| Veredito | Quando |
|---|---|
| TP | tinha queda e houve alerta entre `inicio_s` e `fim_s` + tolerância (5 s, o alvo de latência) |
| FN | tinha queda e nenhum alerta na janela |
| FP | não tinha queda e houve alerta |
| TN | não tinha queda e nenhum alerta |
| não avaliável | o pipeline classificou gente em menos de 8 quadros: **não entra na matriz** |

O último veredito existe porque um clipe em que a câmera não mostrou o corpo inteiro não é um acerto do sistema, e contá-lo como verdadeiro negativo inflaria a precisão.

**Seis métricas.** Acurácia, precisão, recall, F1, taxa de FP (= FP / (FP + TN)) e latência (média, p95 e máxima, do `inicio_s` anotado ao primeiro alerta). Denominador zero vira "não medido" no relatório, nunca 0% ou 100%. Como a ocorrência só nasce após 3 s de permanência no chão (RN10), a latência medida inclui esses 3 s por construção.

**Replicabilidade.** `metricas.json` registra a semente, o hash do peso do YOLO, as versões das bibliotecas e o commit. As features extraídas ficam em cache por clipe, de modo que a varredura de limiares reaplica só a camada de regras.

## O que já foi verificado do arnês

- 29 testes sem vídeo (`visao/testes/test_avaliacao.py`): leitura e validação das anotações, divisão holdout, casamento alerta versus janela, cálculo das métricas com "não medido", reprodução da camada de regras sobre trilhas sintéticas (queda gera uma ocorrência no instante certo; agachar e deitar-e-levantar não geram).
- Teste de fumaça de `avaliar.py` e `calibrar.py` sobre um clipe sintético sem corpo inteiro, que saiu como não avaliável por "quadris fora de vista", o comportamento esperado.

## Quando os vídeos existirem

```bash
visao/.venv/Scripts/python.exe visao/calibrar.py
visao/.venv/Scripts/python.exe visao/avaliar.py --conjunto teste --divisao <pasta>/divisao.csv --limiares <pasta>/limiares.json
```

O `metricas.md` da segunda rodada é o que vai para a RFC, o pôster e o card "Detecção de Quedas" do dashboard, que hoje está sem número de propósito. Se o alvo não for atingido, publica-se assim mesmo, com a análise de `erros.csv`: um recall de 82% explicado vale mais que um número redondo sem explicação.
