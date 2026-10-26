/**
 * Gráficos do financeiro (recharts), com as regras de legibilidade aplicadas:
 *
 *  - duas séries (entradas e saídas) em azul e laranja — identidade, não
 *    "bom e ruim": verde e vermelho ficam para estado (vencido, pago);
 *    paleta conferida para daltonismo nos dois temas;
 *  - colunas finas (até 24px), cantos arredondados só na ponta, grade em
 *    linha fina e sólida, um eixo só;
 *  - o tooltip mostra o valor primeiro e todas as séries daquele ponto;
 *  - todo gráfico tem a versão em tabela a um clique (quem não enxerga a
 *    cor, ou quer o número exato, lê ali).
 */

import { useId, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { formatarBRL, formatarCompacto, paraCentavos } from '../util/dinheiro';
import { Secao, texto } from './base';

export const COR = {
  serie1: 'var(--fin-serie-1)',
  serie2: 'var(--fin-serie-2)',
  grade: 'var(--fin-grade)',
  eixo: 'var(--fin-eixo)',
};

/** Variáveis de cor dos gráficos, com o passo próprio do tema escuro. */
export const VARIAVEIS_DE_COR =
  '[--fin-serie-1:#2a78d6] [--fin-serie-2:#eb6834] [--fin-grade:#e5e7eb] [--fin-eixo:#6b7280] ' +
  'dark:[--fin-serie-1:#3987e5] dark:[--fin-serie-2:#d95926] dark:[--fin-grade:#374151] dark:[--fin-eixo:#9ca3af]';

export interface Serie {
  chave: string;
  rotulo: string;
  cor: string;
}

const eixo = { fontSize: 11, fill: COR.eixo };

interface DadosDaDica {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
}

function Dica({ dados, series, rotuloX }: { dados: unknown; series: Serie[]; rotuloX?: (x: string) => string }) {
  const { active, payload, label } = (dados ?? {}) as DadosDaDica;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-gray-600 dark:bg-gray-900">
      <p className={`mb-1 ${texto.suave}`}>{rotuloX ? rotuloX(String(label)) : label}</p>
      {series.map((s) => {
        const ponto = payload.find((p) => p.dataKey === s.chave);
        if (!ponto) return null;
        return (
          <div key={s.chave} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded" style={{ background: s.cor }} />
            <span className={`font-semibold tabular-nums ${texto.titulo}`}>{formatarBRL(ponto.value)}</span>
            <span className={texto.suave}>{s.rotulo}</span>
          </div>
        );
      })}
    </div>
  );
}

function Legenda({ series, extra }: { series: Serie[]; extra?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
      {series.map((s) => (
        <span key={s.chave} className={`inline-flex items-center gap-1.5 ${texto.normal}`}>
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />
          {s.rotulo}
        </span>
      ))}
      {extra}
    </div>
  );
}

/** Converte a linha da API (dinheiro em texto) em números para o gráfico. */
export function emReais<T extends Record<string, unknown>>(linhas: T[], chaves: string[]) {
  return linhas.map((l) => {
    const copia: Record<string, unknown> = { ...l };
    for (const c of chaves) copia[c] = paraCentavos(l[c] as string) / 100;
    return copia;
  });
}

/** Colunas agrupadas (ex.: entradas e saídas por mês). `esmaecer` marca o que é projeção. */
export function GraficoColunas({
  dados,
  x,
  series,
  rotuloX,
  altura = 260,
  esmaecer,
  legendaExtra,
}: {
  dados: Array<Record<string, unknown>>;
  x: string;
  series: Serie[];
  rotuloX?: (x: string) => string;
  altura?: number;
  esmaecer?: (linha: Record<string, unknown>) => boolean;
  legendaExtra?: ReactNode;
}) {
  return (
    <div>
      {series.length > 1 && <Legenda series={series} extra={legendaExtra} />}
      <div style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={COR.grade} strokeWidth={1} />
            <XAxis dataKey={x} tick={eixo} tickLine={false} axisLine={{ stroke: COR.grade }} tickFormatter={rotuloX} />
            <YAxis tick={eixo} tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => formatarCompacto(v)} />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.12)' }}
              content={(p: unknown) => <Dica dados={p} series={series} rotuloX={rotuloX} />}
            />
            {series.map((s) => (
              <Bar key={s.chave} dataKey={s.chave} name={s.rotulo} fill={s.cor} maxBarSize={24} radius={[4, 4, 0, 0]}>
                {esmaecer && dados.map((linha, i) => <Cell key={i} fillOpacity={esmaecer(linha) ? 0.4 : 1} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Uma série no tempo (ex.: saldo projetado). Linha de 2px e o zero marcado. */
export function GraficoLinha({
  dados,
  x,
  y,
  rotulo,
  rotuloX,
  altura = 240,
}: {
  dados: Array<Record<string, unknown>>;
  x: string;
  y: string;
  rotulo: string;
  rotuloX?: (x: string) => string;
  altura?: number;
}) {
  const series = [{ chave: y, rotulo, cor: COR.serie1 }];
  const temNegativo = dados.some((d) => Number(d[y]) < 0);
  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke={COR.grade} strokeWidth={1} />
          <XAxis dataKey={x} tick={eixo} tickLine={false} axisLine={{ stroke: COR.grade }} tickFormatter={rotuloX} />
          <YAxis tick={eixo} tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => formatarCompacto(v)} />
          {temNegativo && <ReferenceLine y={0} stroke="#dc2626" strokeWidth={1} />}
          <Tooltip cursor={{ stroke: COR.eixo, strokeWidth: 1 }} content={(p: unknown) => <Dica dados={p} series={series} rotuloX={rotuloX} />} />
          <Line
            type="monotone"
            dataKey={y}
            stroke={COR.serie1}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--fin-superficie, #ffffff)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais de uma série só (ex.: despesa por categoria). Valor na ponta. */
export function GraficoBarrasHorizontais({ itens, rotulo }: { itens: Array<{ rotulo: string; valor: number }>; rotulo: string }) {
  const maximo = Math.max(...itens.map((i) => Math.abs(i.valor)), 1);
  return (
    <ul className="space-y-2" aria-label={rotulo}>
      {itens.map((item) => (
        <li key={item.rotulo} className="group grid grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-3 text-xs" title={`${item.rotulo}: ${formatarBRL(item.valor)}`}>
          <span className={`truncate ${texto.normal}`}>{item.rotulo}</span>
          <span className="h-3 rounded-r bg-transparent">
            <span
              className="block h-3 rounded-r-[4px] transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.max(2, (Math.abs(item.valor) / maximo) * 100)}%`, background: COR.serie1 }}
            />
          </span>
          <span className={`tabular-nums ${texto.titulo}`}>{formatarBRL(item.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Cartão de gráfico com a alternância para a tabela equivalente. */
export function CartaoGrafico({
  titulo,
  subtitulo,
  grafico,
  tabela,
  acoes,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  grafico: ReactNode;
  tabela: ReactNode;
  acoes?: ReactNode;
}) {
  const [modo, setModo] = useState<'grafico' | 'tabela'>('grafico');
  const id = useId();
  return (
    <Secao
      titulo={titulo}
      subtitulo={subtitulo}
      acoes={
        <>
          {acoes}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-600" role="group" aria-label="Forma de ver">
            {(['grafico', 'tabela'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modo === m}
                aria-controls={id}
                onClick={() => setModo(m)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                  modo === m ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500'
                }`}
              >
                {m === 'grafico' ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                {m === 'grafico' ? 'Gráfico' : 'Tabela'}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div id={id}>{modo === 'grafico' ? grafico : <div className="overflow-x-auto">{tabela}</div>}</div>
    </Secao>
  );
}
