# Módulo financeiro — interface React

A interface do módulo financeiro (a API é `backend/financeiro`). Esta pasta
**não importa nada do sistema que a hospeda** — `fronteira.test.ts` quebra se
alguém importar — e por isso pode ser copiada para outro projeto React.

Depende só de: `react`, `lucide-react`, `recharts` e Tailwind CSS (v4, com a
variante `dark:` por classe, como no MedSignal).

## Usar

```tsx
import { ModuloFinanceiro, AREAS_FINANCEIRO, criarClienteFinanceiro } from './modulos/financeiro';

const cliente = criarClienteFinanceiro({
  baseUrl: 'https://api.minhaempresa.com', // vazio = mesma origem
  obterToken: () => sessao.token,          // perguntado a cada chamada
  aoPerderSessao: () => irParaLogin(),     // a API respondeu 401
});

// No menu: uma entrada por área (rótulo, ícone e descrição vêm daqui).
AREAS_FINANCEIRO.map((a) => ({ rotulo: a.rotulo, icone: a.icone, destino: a.chave }));

// Na tela:
<ModuloFinanceiro cliente={cliente} area="pagar" aoNavegar={(area) => irPara(area)} />
```

As permissões vêm da própria API (`/sessao`): a interface esconde botão que o
servidor recusaria, mas quem decide é o servidor.

Opcional: `pessoasExternas` recebe uma função que devolve cadastros do sistema
hospedeiro para virar clientes (no MedSignal, os pacientes — botão "Importar
pacientes como clientes" em Cadastros › Pessoas).

## Marca

A cor principal é a variável CSS `--fin-primaria` (padrão `#0A7EA4`, a do
MedSignal) e `--fin-primaria-forte` para o hover. Os gráficos usam
`--fin-serie-1/2` (azul e laranja, conferidos para daltonismo nos dois temas).

## Como está organizado

```
index.ts              o que o hospedeiro importa
navegacao.ts          as áreas (leve: o menu importa só isto)
ModuloFinanceiro.tsx  porta de entrada: provê o contexto e desenha a área
contexto.tsx          cliente, sessão, permissões, avisos; useDados e useAcao
api/                  cliente HTTP e os tipos das respostas
util/                 dinheiro (centavos, BRL), datas (sem fuso), CSV
ui/                   kit visual próprio (Tailwind) e os gráficos
areas/                uma pasta ou arquivo por área do menu
```

Dinheiro chega da API como texto (`"1234.56"`) e toda soma aqui é em centavos
inteiros (`util/dinheiro.ts`) — nunca float.
