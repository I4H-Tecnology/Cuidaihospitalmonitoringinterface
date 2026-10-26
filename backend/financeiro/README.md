# Módulo financeiro

Contas a pagar e a receber, caixa e bancos, conciliação bancária, folha de
pagamento, capital (sócios, empréstimos, investimentos, patrimônio), orçamento
e relatórios (DRE, fluxo de caixa realizado e projetado, inadimplência) — num
pacote que **não sabe em qual sistema está rodando**.

Nasceu dentro do MedSignal, mas não importa nada dele (há teste para isso nos
dois lados). Serve a outro sistema de dois jeitos:

| Jeito | Para quem | O hospedeiro entrega |
|---|---|---|
| **Embutido** | sistema em Python/FastAPI | um pool do Postgres e uma função que diz quem está chamando |
| **Serviço próprio** | qualquer outro (Laravel, Node, …) | um JWT assinado com o segredo compartilhado |

A interface React fica em `frontend/src/modulos/financeiro` (ver o README de lá).

---

## Os conceitos, em uma página

| Termo | O que é | Exemplo |
|---|---|---|
| **Empresa** (`organizacao`) | quem é dona dos dados; tudo é separado por ela | a clínica |
| **Conta** | onde o dinheiro está | Caixa, Banco do Brasil, CDB, cartão |
| **Categoria** | o que é o dinheiro, dentro de um **grupo** fixo | "Aluguel" no grupo "Despesas administrativas" |
| **Grupo** | decide a linha da DRE e a atividade do fluxo de caixa | "Aporte de sócio" fica **fora** da DRE |
| **Centro de custo** | de quem é o gasto | Enfermagem, Unidade Centro |
| **Pessoa** | a outra ponta: cliente, fornecedor, colaborador, sócio, banco | |
| **Título** | uma conta a pagar ou a receber, com número sequencial na empresa | "Título 42 — Aluguel de setembro" |
| **Parcela** | quando e quanto vence | 3 × R$ 100 |
| **Reparcelamento** | refazer as parcelas em aberto de um título: mudar vencimento e valor, incluir, excluir | o saldo de 800 em 4 × 200 |
| **Rateio** | em que categorias e centros o título cai | 60% aluguel, 40% energia |
| **Baixa** | o pagamento (total ou parcial) de uma parcela | pago R$ 60 + R$ 2 de juros |
| **Movimento** | o livro-caixa: toda entrada e saída de cada conta | o saldo é a soma deles |
| **Competência** | o mês a que o valor **pertence** (DRE) | a nota de setembro paga em outubro é despesa de setembro |
| **Recorrência** | molde de uma conta que se repete | aluguel todo dia 10 |
| **Folha / holerite / rubrica** | a folha do mês, o resultado de cada pessoa, e os eventos (salário, hora extra, INSS…) | |
| **Período fechado** | meses que não aceitam mais alteração | fechado até 31/08 |

**Dois regimes, duas perguntas.** Competência: "deu lucro em setembro?".
Caixa: "quanto entrou e saiu em setembro?". A DRE mostra os dois; o fluxo de
caixa, o segundo.

---

## Como está organizado

```
financeiro/
  dominio/        regra pura — imposto, parcela, juros, depreciação, DRE, OFX.
                  Sem banco, sem HTTP. É a parte com mais teste.
  servicos/       cada caso de uso: abre a transação, lê, grava, usa o domínio.
  api/            HTTP: valida o formato, confere a permissão, chama o serviço.
  migracoes/      o schema `financeiro`, em arquivos SQL versionados.
  banco.py        o Postgres: transação com autor (para a auditoria) e
                  tradução de erro de banco em mensagem de tela.
  acesso.py       o Operador (quem chama) e as permissões "recurso:ação".
  servidor.py     o módulo como serviço próprio (JWT).
  tarefas.py      tarefa periódica (gerar recorrências) para o hospedeiro agendar.
  testes/         domínio (sem banco) e integração (Postgres descartável).
```

De fora para dentro: `api → servicos → dominio`, com `banco.py` ao lado.
Funções de serviço públicas abrem a própria transação; as que começam com `_`
recebem uma transação aberta e são compostas (fechar a folha cria as contas a
pagar na mesma transação do fechamento — ou tudo, ou nada).

### O que o banco garante sozinho

A aplicação valida antes, para a mensagem sair clara; o banco garante depois,
para nenhum caminho de código escapar:

1. **Isolamento entre empresas.** Toda referência é pela dupla
   `(organizacao_id, id)`: um rateio da empresa B não consegue apontar para uma
   categoria da empresa A — a chave estrangeira não fecha.
2. **Dinheiro não some.** Parcelas e rateio somam exatamente o valor do título
   (conferido no COMMIT); uma parcela não recebe mais do que vale.
3. **Mês fechado é fechado.** Com `fechado_ate` preenchido, nada que mexa no
   caixa ou no resultado daquele período entra, muda ou sai. Estorno continua
   possível: ele não reescreve o passado, lança a devolução na data de hoje.
4. **Auditoria por gatilho.** Toda mudança vai para `financeiro.auditoria` com
   quem fez, o que mudou (só os campos alterados) e o motivo. Não depende de a
   aplicação lembrar de registrar.

Regras de uso que decorrem disso: pagamento não se edita nem se apaga —
**estorna-se**; título não se apaga — **cancela-se com motivo**; o que outra
parte do módulo gerou (folha, empréstimo) muda **por lá**.

**Reparcelar** (`PUT /titulos/{id}/parcelas`, `servicos.titulos.reparcelar`)
recebe as parcelas em aberto como devem ficar: com `id` são alteradas, sem `id`
entram, e as em aberto que não vierem são excluídas. As pagas ficam como estão.
O total do título vira a soma de tudo, e o rateio acompanha na mesma proporção;
no fim, as parcelas são renumeradas pela ordem de vencimento. Excluir parcela
exige `operacao:excluir` (além de `operacao:editar`), e excluir ou mudar o total
exige motivo. Parcela com pagamento (mesmo estornado) não sai: a baixa aponta
para ela. Com a competência fechada, as parcelas mudam mas o total não. É
edição do próprio título, e não um título novo, para a despesa continuar na
competência original.

Dinheiro é `Decimal` no Python, `numeric(15,2)` no banco e **texto** no JSON
(`"1234.56"`). Nunca float: 0,1 + 0,2 em float é 0,30000000000000004.

---

## Usar embutido (FastAPI)

```python
from fastapi import Depends
from financeiro.acesso import Operador
from financeiro.api import criar_router
from financeiro.banco import Banco
from financeiro.migracoes import migrar

banco = Banco(meu_pool_psycopg)            # o mesmo pool da sua aplicação

def operador(usuario = Depends(meu_usuario_logado)) -> Operador:
    return Operador(
        usuario_ref=str(usuario.id),
        usuario_nome=usuario.nome,
        organizacao_ref=str(usuario.empresa_id),   # a empresa do usuário
        organizacao_nome=usuario.empresa_nome,
        permissoes=frozenset({"operacao:ver", "operacao:criar", "relatorios:ver"}),
    )

migrar(meu_pool_psycopg)                   # na subida: cria/atualiza o schema
app.include_router(criar_router(banco, operador))   # rotas em /api/financeiro
```

O exemplo real é `backend/app/integracao_financeiro.py` do MedSignal: ~70
linhas, traduzindo o RBAC do MedSignal nas permissões do módulo.

Na primeira chamada de uma empresa, ela é **provisionada**: ganha o plano de
contas padrão, a conta Caixa, as rubricas da folha e os credores das guias.

## Usar como serviço próprio

```bash
docker build -t financeiro ./backend/financeiro
docker run -p 8100:8100 \
  -e FINANCEIRO_DATABASE_URL=postgresql://usuario:senha@host:5432/banco \
  -e FINANCEIRO_JWT_SEGREDO=<segredo compartilhado> \
  -e FINANCEIRO_CORS=https://app.minhaempresa.com \
  financeiro
```

O sistema de origem autentica o usuário e emite um JWT (HS256 por padrão):

```json
{ "sub": "42", "nome": "Ana", "org": "empresa-7", "org_nome": "Padaria X",
  "permissoes": ["operacao:ver", "operacao:criar", "relatorios:ver"], "exp": 1790000000 }
```

`"permissoes": ["*"]` libera tudo. Exemplo em Laravel (`firebase/php-jwt`):

```php
$token = \Firebase\JWT\JWT::encode([
    'sub' => (string) auth()->id(), 'nome' => auth()->user()->name,
    'org' => (string) auth()->user()->empresa_id, 'org_nome' => auth()->user()->empresa->nome,
    'permissoes' => ['operacao:ver', 'operacao:criar', 'relatorios:ver'],
    'exp' => time() + 8 * 3600,
], env('FINANCEIRO_JWT_SEGREDO'), 'HS256');
```

Variáveis: ver o topo de `servidor.py`. O serviço aplica as migrações na
subida (`FINANCEIRO_MIGRAR=1`) e responde `/health`. A documentação interativa
das rotas fica em `/docs`.

---

## Permissões

Pares `recurso:ação`, com ação em `ver`, `criar`, `editar`, `excluir`:

| Recurso | Cobre |
|---|---|
| `operacao` | contas a pagar e a receber, pagamentos, caixa, transferências, conciliação |
| `cadastros` | contas, plano de contas, centros de custo, pessoas, recorrências, feriados |
| `pessoal` | colaboradores e folha — **salário é dado pessoal (LGPD)**, separe de quem lança conta |
| `capital` | sócios, empréstimos, investimentos, patrimônio |
| `planejamento` | orçamento |
| `relatorios` | visão geral, DRE, fluxos, inadimplência |
| `configuracoes` | parâmetros, tabelas de imposto, fechamento de período, auditoria |

Cancelar e estornar exigem `excluir`. Listar cadastros aceita qualquer `ver`
(quem lança conta precisa escolher a categoria).

## Folha de pagamento

**Calcula e aceita ajuste.** O módulo calcula a folha mensal e o adiantamento:
salário (proporcional na admissão e no desligamento), variáveis do mês, reflexo
das horas extras no DSR, INSS progressivo do empregado e 11% do pró-labore,
IRRF com dependentes, pensão, desconto simplificado e a redução da Lei
15.270/2025, FGTS (8%, aprendiz 2%) e encargos patronais configuráveis por
regime. Se a contabilidade fechar com outro número, o dela **prevalece** e o
calculado fica guardado para comparação. Fechar a folha gera as contas a pagar:
líquidos, DCTFWeb (INSS e IRRF), FGTS e repasses (pensão, consignado), com
vencimentos pelos prazos legais e antecipação para dia útil.

**Não calcula (ainda):** férias, 13º e rescisão. A provisão mensal de férias e
13º é calculada, e a projeção de caixa estima o 13º em novembro e dezembro.

**Tabelas são dado, não código.** INSS e IRRF ficam em `tabela_fiscal`, com
vigência e a norma que as publicou. As de 2026 vêm na migração 0002:

- INSS: Portaria Interministerial MPS/MF nº 13, de 9/1/2026.
- IRRF: Lei nº 15.191/2025 (tabela) e Lei nº 15.270/2025 (redução até R$ 7.350).

Quando sair a tabela de 2027: Configurações › Tabelas de imposto, com a fonte.

## Migrações

`migracoes/NNNN_nome.sql`, aplicadas em ordem, uma vez cada, registradas em
`financeiro.migracao` com checksum. **Migração aplicada não se edita**: correção
vira arquivo novo (o checksum recusa a subida se alguém editar). Duas
instâncias subindo juntas não migram em dobro (advisory lock).

```bash
python -m financeiro.migracoes postgresql://usuario:senha@host/banco
```

## Testes

```bash
# da raiz do MedSignal; domínio: sem banco
visao/.venv/Scripts/python.exe -m unittest discover -s backend/financeiro/testes -t backend

# com integração: num banco DESCARTÁVEL (o nome precisa conter "test";
# os testes apagam e recriam o schema `financeiro`)
FINANCEIRO_TESTE_DSN=postgresql://usuario:senha@localhost:5432/financeiro_teste \
  visao/.venv/Scripts/python.exe -m unittest discover -s backend/financeiro/testes -t backend
```

Os valores de imposto nos testes foram conferidos à mão contra as tabelas
oficiais (ex.: o INSS no teto de 2026 é R$ 988,09 — arredondando faixa a
faixa daria R$ 988,10, e o teste pega isso).

## O que fica para depois

- Folha: férias, 13º e rescisão (hoje: provisão e estimativa na projeção).
- Emissão de boleto e cobrança por PIX (exige integração com banco).
- Nota fiscal de serviço (NFS-e).
- Anexos (comprovante, nota em PDF) nos lançamentos.
- Aprovação de pagamento por alçada (dois usuários para valores altos). O mesmo
  valeria para reparcelamento: hoje basta a permissão e a confirmação de quem faz.
- Renegociação que gera um título novo e encerra o antigo "por renegociação"
  (como a liquidação de alguns ERPs). Pede baixa sem dinheiro e cuidado com a
  DRE para a despesa não contar duas vezes; o reparcelamento no próprio título
  resolve o dia a dia sem isso.
- Baixa por perda (inadimplência) no período corrente, sem reabrir o mês.
