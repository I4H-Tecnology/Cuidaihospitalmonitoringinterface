> **UR Fall (conjunto publico, camera 0) — NAO sao numeros da RFC.** Ver `visao/dados/resultados/ur-fall/LEIA-ME.md`. Pasta 'estendido' = clipes com extensao sintetica.

# Validação do detector de quedas — teste

Gerado em 2026-11-16T21:34:24.391809+00:00 · semente 42 · peso YOLO `f59b3d833e2f` · commit `f64c1b2`

Clipes: **35** anotados, **34** avaliados, **1** não avaliáveis (não entram na matriz).

## Matriz de confusão (por clipe)

|                     | Alertou | Não alertou |
|---------------------|--------:|------------:|
| **Tinha queda**     | TP   0 | FN      15 |
| **Não tinha queda** | FP   0 | TN      19 |

## Métricas

| Métrica | Valor | Alvo (RFC 1.6) | Situação |
|---|---:|---:|---|
| Recall | 0.0% | ≥ 90% | não atingido |
| Precisão | não medido | ≥ 80% | — |
| Taxa de falso positivo | 0.0% | ≤ 15% | atingido |
| Acurácia | 55.9% | — | |
| F1 | não medido | — | |
| Latência média (queda → alerta) | não medido | ≤ 5 s | — |
| Latência p95 | não medido | | |
| Latência máxima | não medido | | |

Latência medida em 0 verdadeiro(s) positivo(s), do `inicio_s` anotado até o primeiro alerta dentro da janela. Inclui, por construção, os 2.0 s de permanência no chão exigidos pela RN10.

Custo de processamento em CPU: 49 ms por quadro em média, p95 78 ms.

Taxa de FP = FP / (FP + TN): fração dos clipes sem queda em que houve alerta. Alertas fora da janela em clipes com queda: 0 (listados em `erros.csv`, fora da matriz).

## Limiares usados

| Parâmetro | Valor |
|---|---:|
| `angulo_caido` | 55.0 |
| `razao_aspecto_caido` | 0.9 |
| `razao_altura_caido` | 0.55 |
| `velocidade_queda` | 0.8 |
| `quadros_para_confirmar` | 4 |
| `quadros_para_recuperar` | 10 |
| `segundos_para_ocorrencia` | 2.0 |

Tolerância após `fim_s`: 5.0 s · mínimo de quadros classificados para avaliar: 8

## Por clipe

| Clipe | Cenário | Esperado | Veredito | Latência | Cobertura | Observação |
|---|---|---|---|---:|---:|---|
| adl-02-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 61% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-05-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 58% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-06-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 73% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-07-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 81% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-08-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 82% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-15-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 62% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-16-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 48% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-17-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 36% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-19-cam0.mp4 | adl_ur_fall | sem queda | NAO_AVALIAVEL | — | 22% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-21-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 57% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-23-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 57% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-26-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 82% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-27-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 82% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-29-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 85% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-30-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 23% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-32-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 72% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-33-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 65% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-34-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 62% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-35-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 59% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| adl-40-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 20% | UR Fall cam0; atividade normal; +2 s no inicio: SINTETICO |
| fall-06-cam0.mp4 | queda_ur_fall | queda | FN | — | 80% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-07-cam0.mp4 | queda_ur_fall | queda | FN | — | 76% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-10-cam0.mp4 | queda_ur_fall | queda | FN | — | 70% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-11-cam0.mp4 | queda_ur_fall | queda | FN | — | 78% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-12-cam0.mp4 | queda_ur_fall | queda | FN | — | 77% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-13-cam0.mp4 | queda_ur_fall | queda | FN | — | 76% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-15-cam0.mp4 | queda_ur_fall | queda | FN | — | 72% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-16-cam0.mp4 | queda_ur_fall | queda | FN | — | 35% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-17-cam0.mp4 | queda_ur_fall | queda | FN | — | 41% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-20-cam0.mp4 | queda_ur_fall | queda | FN | — | 78% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-22-cam0.mp4 | queda_ur_fall | queda | FN | — | 25% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-23-cam0.mp4 | queda_ur_fall | queda | FN | — | 74% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-26-cam0.mp4 | queda_ur_fall | queda | FN | — | 71% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-27-cam0.mp4 | queda_ur_fall | queda | FN | — | 79% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |
| fall-30-cam0.mp4 | queda_ur_fall | queda | FN | — | 33% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais); clipe estendido (+2 s no inicio, +4 s no fim): SINTETICO |

## Erros e clipes não avaliáveis

- **adl-19-cam0.mp4** — não avaliável: 6 quadro(s) classificado(s) de 27 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (10×), ombros e quadris fora de vista — a câmera precisa enquadrar o corpo inteiro para medir a verticalidade do tronco (7×).
- **fall-06-cam0.mp4** — FN: nenhum alerta entre 2.3s e 8.3s. Cobertura 80%.
- **fall-07-cam0.mp4** — FN: nenhum alerta entre 4.8s e 10.8s. Cobertura 76%.
- **fall-10-cam0.mp4** — FN: nenhum alerta entre 3.3s e 9.3s. Cobertura 70%.
- **fall-11-cam0.mp4** — FN: nenhum alerta entre 3.6s e 9.6s. Cobertura 78%.
- **fall-12-cam0.mp4** — FN: nenhum alerta entre 2.8s e 8.8s. Cobertura 77%.
- **fall-13-cam0.mp4** — FN: nenhum alerta entre 3.4s e 9.4s. Cobertura 76%.
- **fall-15-cam0.mp4** — FN: nenhum alerta entre 2.9s e 8.9s. Cobertura 72%.
- **fall-16-cam0.mp4** — FN: nenhum alerta entre 2.5s e 8.5s. Cobertura 35%.
- **fall-17-cam0.mp4** — FN: nenhum alerta entre 3.9s e 9.9s. Cobertura 41%.
- **fall-20-cam0.mp4** — FN: nenhum alerta entre 2.6s e 8.6s. Cobertura 78%.
- **fall-22-cam0.mp4** — FN: nenhum alerta entre 2.1s e 8.1s. Cobertura 25%.
- **fall-23-cam0.mp4** — FN: nenhum alerta entre 2.9s e 8.9s. Cobertura 74%.
- **fall-26-cam0.mp4** — FN: nenhum alerta entre 2.4s e 8.4s. Cobertura 71%.
- **fall-27-cam0.mp4** — FN: nenhum alerta entre 3.7s e 9.7s. Cobertura 79%.
- **fall-30-cam0.mp4** — FN: nenhum alerta entre 2.8s e 8.8s. Cobertura 33%.
