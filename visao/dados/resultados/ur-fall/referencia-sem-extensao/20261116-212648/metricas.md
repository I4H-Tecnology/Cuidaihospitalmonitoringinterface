> **UR Fall (conjunto publico, camera 0) — NAO sao numeros da RFC.** Ver `visao/dados/resultados/ur-fall/LEIA-ME.md`. Pasta 'estendido' = clipes com extensao sintetica.

# Validação do detector de quedas — todos

Gerado em 2026-11-16T21:26:48.110525+00:00 · semente 42 · peso YOLO `f59b3d833e2f` · commit `f64c1b2`

Clipes: **70** anotados, **55** avaliados, **15** não avaliáveis (não entram na matriz).

## Matriz de confusão (por clipe)

|                     | Alertou | Não alertou |
|---------------------|--------:|------------:|
| **Tinha queda**     | TP   0 | FN      16 |
| **Não tinha queda** | FP   0 | TN      39 |

## Métricas

| Métrica | Valor | Alvo (RFC 1.6) | Situação |
|---|---:|---:|---|
| Recall | 0.0% | ≥ 90% | não atingido |
| Precisão | não medido | ≥ 80% | — |
| Taxa de falso positivo | 0.0% | ≤ 15% | atingido |
| Acurácia | 70.9% | — | |
| F1 | não medido | — | |
| Latência média (queda → alerta) | não medido | ≤ 5 s | — |
| Latência p95 | não medido | | |
| Latência máxima | não medido | | |

Latência medida em 0 verdadeiro(s) positivo(s), do `inicio_s` anotado até o primeiro alerta dentro da janela. Inclui, por construção, os 3.0 s de permanência no chão exigidos pela RN10.

Custo de processamento em CPU: 63 ms por quadro em média, p95 81 ms.

Taxa de FP = FP / (FP + TN): fração dos clipes sem queda em que houve alerta. Alertas fora da janela em clipes com queda: 0 (listados em `erros.csv`, fora da matriz).

## Limiares usados

| Parâmetro | Valor |
|---|---:|
| `angulo_caido` | 55.0 |
| `razao_aspecto_caido` | 0.9 |
| `razao_altura_caido` | 0.55 |
| `velocidade_queda` | 0.8 |
| `quadros_para_confirmar` | 6 |
| `quadros_para_recuperar` | 10 |
| `segundos_para_ocorrencia` | 3.0 |

Tolerância após `fim_s`: 5.0 s · mínimo de quadros classificados para avaliar: 8

## Por clipe

| Clipe | Cenário | Esperado | Veredito | Latência | Cobertura | Observação |
|---|---|---|---|---:|---:|---|
| adl-01-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 71% | UR Fall cam0; atividade normal |
| adl-02-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 61% | UR Fall cam0; atividade normal |
| adl-03-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 80% | UR Fall cam0; atividade normal |
| adl-04-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 53% | UR Fall cam0; atividade normal |
| adl-05-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 71% | UR Fall cam0; atividade normal |
| adl-06-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 73% | UR Fall cam0; atividade normal |
| adl-07-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 84% | UR Fall cam0; atividade normal |
| adl-08-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 82% | UR Fall cam0; atividade normal |
| adl-09-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 82% | UR Fall cam0; atividade normal |
| adl-10-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 68% | UR Fall cam0; atividade normal |
| adl-11-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 69% | UR Fall cam0; atividade normal |
| adl-12-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 53% | UR Fall cam0; atividade normal |
| adl-13-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 56% | UR Fall cam0; atividade normal |
| adl-14-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 84% | UR Fall cam0; atividade normal |
| adl-15-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 62% | UR Fall cam0; atividade normal |
| adl-16-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 48% | UR Fall cam0; atividade normal |
| adl-17-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 36% | UR Fall cam0; atividade normal |
| adl-18-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 41% | UR Fall cam0; atividade normal |
| adl-19-cam0.mp4 | adl_ur_fall | sem queda | NAO_AVALIAVEL | — | 22% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; atividade normal |
| adl-20-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 77% | UR Fall cam0; atividade normal |
| adl-21-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 57% | UR Fall cam0; atividade normal |
| adl-22-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 53% | UR Fall cam0; atividade normal |
| adl-23-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 57% | UR Fall cam0; atividade normal |
| adl-24-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 61% | UR Fall cam0; atividade normal |
| adl-25-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 75% | UR Fall cam0; atividade normal |
| adl-26-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 71% | UR Fall cam0; atividade normal |
| adl-27-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 72% | UR Fall cam0; atividade normal |
| adl-28-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 68% | UR Fall cam0; atividade normal |
| adl-29-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 78% | UR Fall cam0; atividade normal |
| adl-30-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 23% | UR Fall cam0; atividade normal |
| adl-31-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 48% | UR Fall cam0; atividade normal |
| adl-32-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 57% | UR Fall cam0; atividade normal |
| adl-33-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 50% | UR Fall cam0; atividade normal |
| adl-34-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 36% | UR Fall cam0; atividade normal |
| adl-35-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 43% | UR Fall cam0; atividade normal |
| adl-36-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 70% | UR Fall cam0; atividade normal |
| adl-37-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 60% | UR Fall cam0; atividade normal |
| adl-38-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 26% | UR Fall cam0; atividade normal |
| adl-39-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 42% | UR Fall cam0; atividade normal |
| adl-40-cam0.mp4 | adl_ur_fall | sem queda | TN | — | 20% | UR Fall cam0; atividade normal |
| fall-01-cam0.mp4 | queda_ur_fall | queda | FN | — | 66% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-02-cam0.mp4 | queda_ur_fall | queda | FN | — | 48% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-03-cam0.mp4 | queda_ur_fall | queda | FN | — | 72% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-04-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 12% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-05-cam0.mp4 | queda_ur_fall | queda | FN | — | 68% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-06-cam0.mp4 | queda_ur_fall | queda | FN | — | 38% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-07-cam0.mp4 | queda_ur_fall | queda | FN | — | 65% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-08-cam0.mp4 | queda_ur_fall | queda | FN | — | 40% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-09-cam0.mp4 | queda_ur_fall | queda | FN | — | 76% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-10-cam0.mp4 | queda_ur_fall | queda | FN | — | 32% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-11-cam0.mp4 | queda_ur_fall | queda | FN | — | 39% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-12-cam0.mp4 | queda_ur_fall | queda | FN | — | 36% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-13-cam0.mp4 | queda_ur_fall | queda | FN | — | 43% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-14-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 36% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-15-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 38% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-16-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 36% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-17-cam0.mp4 | queda_ur_fall | queda | FN | — | 55% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-18-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 12% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-19-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 38% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-20-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 32% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-21-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 30% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-22-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 0% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-23-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 42% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-24-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 0% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-25-cam0.mp4 | queda_ur_fall | queda | FN | — | 59% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-26-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 22% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-27-cam0.mp4 | queda_ur_fall | queda | FN | — | 61% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-28-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 42% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-29-cam0.mp4 | queda_ur_fall | queda | FN | — | 58% | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |
| fall-30-cam0.mp4 | queda_ur_fall | queda | NAO_AVALIAVEL | — | 33% | aprendendo a altura de pé desta pessoa (aguarde alguns quadros) | UR Fall cam0; inicio=1o quadro 'caindo', fim=1o quadro 'deitado' (rotulos oficiais) |

## Erros e clipes não avaliáveis

- **adl-19-cam0.mp4** — não avaliável: 6 quadro(s) classificado(s) de 27 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (10×), ombros e quadris fora de vista — a câmera precisa enquadrar o corpo inteiro para medir a verticalidade do tronco (7×).
- **fall-01-cam0.mp4** — FN: nenhum alerta entre 2.7s e 8.7s. Cobertura 66%.
- **fall-02-cam0.mp4** — FN: nenhum alerta entre 1.3s e 7.3s. Cobertura 48%.
- **fall-03-cam0.mp4** — FN: nenhum alerta entre 4.9s e 10.9s. Cobertura 72%.
- **fall-04-cam0.mp4** — não avaliável: 2 quadro(s) classificado(s) de 17 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (15×).
- **fall-05-cam0.mp4** — FN: nenhum alerta entre 2.6s e 8.6s. Cobertura 68%.
- **fall-06-cam0.mp4** — FN: nenhum alerta entre 0.3s e 6.3s. Cobertura 38%.
- **fall-07-cam0.mp4** — FN: nenhum alerta entre 2.8s e 8.8s. Cobertura 65%.
- **fall-08-cam0.mp4** — FN: nenhum alerta entre 1.0s e 7.0s. Cobertura 40%.
- **fall-09-cam0.mp4** — FN: nenhum alerta entre 4.0s e 10.0s. Cobertura 76%.
- **fall-10-cam0.mp4** — FN: nenhum alerta entre 1.3s e 7.3s. Cobertura 32%.
- **fall-11-cam0.mp4** — FN: nenhum alerta entre 1.6s e 7.6s. Cobertura 39%.
- **fall-12-cam0.mp4** — FN: nenhum alerta entre 0.8s e 6.8s. Cobertura 36%.
- **fall-13-cam0.mp4** — FN: nenhum alerta entre 1.4s e 7.4s. Cobertura 43%.
- **fall-14-cam0.mp4** — não avaliável: 4 quadro(s) classificado(s) de 11 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×).
- **fall-15-cam0.mp4** — não avaliável: 6 quadro(s) classificado(s) de 16 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (8×), pose não detectada no recorte (2×).
- **fall-16-cam0.mp4** — não avaliável: 4 quadro(s) classificado(s) de 11 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×).
- **fall-17-cam0.mp4** — FN: nenhum alerta entre 1.9s e 7.9s. Cobertura 55%.
- **fall-18-cam0.mp4** — não avaliável: 1 quadro(s) classificado(s) de 8 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×).
- **fall-19-cam0.mp4** — não avaliável: 5 quadro(s) classificado(s) de 13 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×), pose não detectada no recorte (1×).
- **fall-20-cam0.mp4** — não avaliável: 7 quadro(s) classificado(s) de 22 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (15×).
- **fall-21-cam0.mp4** — não avaliável: 3 quadro(s) classificado(s) de 10 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×).
- **fall-22-cam0.mp4** — não avaliável: 0 quadro(s) classificado(s) de 6 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (5×), pose não detectada no recorte (1×).
- **fall-23-cam0.mp4** — não avaliável: 5 quadro(s) classificado(s) de 12 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×).
- **fall-24-cam0.mp4** — não avaliável: 0 quadro(s) classificado(s) de 7 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×).
- **fall-25-cam0.mp4** — FN: nenhum alerta entre 1.5s e 7.5s. Cobertura 59%.
- **fall-26-cam0.mp4** — não avaliável: 2 quadro(s) classificado(s) de 9 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×).
- **fall-27-cam0.mp4** — FN: nenhum alerta entre 1.7s e 7.7s. Cobertura 61%.
- **fall-28-cam0.mp4** — não avaliável: 5 quadro(s) classificado(s) de 12 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×).
- **fall-29-cam0.mp4** — FN: nenhum alerta entre 1.6s e 7.6s. Cobertura 58%.
- **fall-30-cam0.mp4** — não avaliável: 5 quadro(s) classificado(s) de 15 com pessoa. Impedimentos: aprendendo a altura de pé desta pessoa (aguarde alguns quadros) (7×), pose não detectada no recorte (3×).
