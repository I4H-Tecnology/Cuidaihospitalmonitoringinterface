> **UR Fall (conjunto publico, camera 0) — NAO sao numeros da RFC.** Ver `visao/dados/resultados/ur-fall/LEIA-ME.md`. Pasta 'estendido' = clipes com extensao sintetica.

# Calibração dos limiares

Gerado em 2026-11-16T21:28:38.210982+00:00 · semente 42 · commit `f64c1b2`

**Critério (fixado antes da varredura):** maximizar recall, sujeito a precisão ≥ 0.80.

**Critério atendido na calibração:** sim.

## Divisão holdout

- Calibração: 35 clipes (15 com queda) — usados aqui
- Teste: 35 clipes (15 com queda) — reservados para `avaliar.py --conjunto teste`

Registro completo em `divisao.csv`.

## Limiares vencedores (métricas no conjunto de CALIBRAÇÃO, não no de teste)

| Parâmetro | Padrão (regras.py) | Vencedor |
|---|---:|---:|
| `angulo_caido` | 55.0 | 55.0 |
| `razao_aspecto_caido` | 0.9 | 0.9 |
| `razao_altura_caido` | 0.55 | 0.55 |
| `velocidade_queda` | 0.8 | 0.8 |
| `quadros_para_confirmar` | 6 | 4 |
| `quadros_para_recuperar` | 10 | 10 |
| `segundos_para_ocorrencia` | 3.0 | 2.0 |

| Métrica | Padrão | Vencedor |
|---|---:|---:|
| Recall | 0.0% | 6.7% |
| Precisão | não medido | 100.0% |
| Taxa de FP | 0.0% | 0.0% |
| F1 | não medido | 12.5% |
| Latência média | não medido | 5.77 s |
| Não avaliáveis | 0 | 0 |

## Dez melhores combinações

| angulo_caido | razao_aspecto_caido | razao_altura_caido | velocidade_queda | quadros_para_confirmar | quadros_para_recuperar | segundos_para_ocorrencia | recall | precisão | F1 | latência |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 55.0 | 0.9 | 0.55 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 55.0 | 0.8 | 0.55 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 55.0 | 1.0 | 0.55 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 45.0 | 0.9 | 0.55 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 55.0 | 0.9 | 0.45 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 55.0 | 0.9 | 0.65 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 45.0 | 0.8 | 0.55 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 45.0 | 1.0 | 0.55 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 55.0 | 0.8 | 0.45 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |
| 55.0 | 0.8 | 0.65 | 0.8 | 4 | 10 | 2.0 | 6.7% | 100.0% | 12.5% | 5.77 s |

## Próximo passo

Medir UMA vez no conjunto de teste. Esse é o número que vai para a RFC:

```bash
visao/.venv/Scripts/python.exe visao/avaliar.py --conjunto teste --divisao visao\dados\resultados\ur-fall\estendido\calibracao-20261116-212838\divisao.csv --limiares visao\dados\resultados\ur-fall\estendido\calibracao-20261116-212838\limiares.json
```
