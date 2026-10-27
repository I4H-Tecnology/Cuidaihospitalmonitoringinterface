import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertOctagon, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Download, FileBarChart, Info, Lightbulb, Printer, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  DIAS_DA_SEMANA, ROTULO_STATUS, ROTULO_TIPO, ROTULO_TURNO, baixarCsv, fetchComparativo, fetchIndicadoresClinicos, fetchInsights,
  fetchKpis, fetchMapaDeCalor, fetchPrevisao, fetchRelatorioQuedas, formatarDuracaoCurta, variacao, type Achado, type Metricas,
} from '../../data/analytics';
import { getModuleForScreen, type Screen } from '../../data/rbac';
import { formatarDia } from '../../data/tempo';
import { useDados } from '../../data/useDados';
import type { PropsTela } from '../../telas';
import {
  Aviso, BOTAO_SECUNDARIO, BotaoAtualizar, CAMPO, CabecalhoTela, Carregando, Etiqueta, Indicador, Interruptor, Painel,
  ROTULO, Segmentado, SeletorDias, Tela, Vazio,
} from '../settings/ui';

/**
 * Inteligência & Analytics: as sete telas, todas sobre `/api/analytics/*`.
 * Nenhum número é estimado na tela: o servidor calcula, a tela mostra, e onde
 * a base é pequena a tela diz isso ao lado do número.
 */

const DICA = { backgroundColor: 'var(--grafico-dica)', border: '1px solid var(--grafico-grade)', borderRadius: 8, fontSize: 12 };
const EIXO = { stroke: 'var(--grafico-eixo)', fontSize: 11 };
const diaLocal = (d: Date) => d.toLocaleDateString('sv-SE');
const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('pt-BR')}%`);
const num = (v: number | null | undefined, casas = 0) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: casas }));

/** Seta de variação: `melhorSeSobe` define a cor (mais quedas é ruim; mais ciência em 5 min é bom). */
function Variacao({ valor, melhorSeSobe }: { valor: number | null; melhorSeSobe: boolean }) {
  if (valor == null) return <span className="text-xs text-gray-600">sem base para comparar</span>;
  if (valor === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-gray-600"><ArrowRight className="h-3 w-3" aria-hidden="true" />igual</span>;
  const bom = valor > 0 === melhorSeSobe;
  const Seta = valor > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${bom ? 'text-green-700' : 'text-red-700'}`}>
      <Seta className="h-3 w-3" aria-hidden="true" />{valor > 0 ? '+' : ''}{valor}% <span className="text-gray-600">vs. anterior</span>
    </span>
  );
}

function BasePequenaAviso({ n, minimo = 10 }: { n: number; minimo?: number }) {
  if (n >= minimo) return null;
  return <Aviso>Base pequena: {n} ocorrência(s) no período. Use os números como pista, não como tendência.</Aviso>;
}

/* ============================================================================
 * KPIs Assistenciais
 * ========================================================================== */

export function KpisScreen(_: PropsTela) {
  const [dias, setDias] = useState(30);
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchKpis(t, dias), [dias]);
  const a = dados?.atual;
  const b = dados?.anterior;

  return (
    <Tela>
      <CabecalhoTela
        titulo="KPIs Assistenciais"
        descricao="Quanto tempo a equipe leva para ver, chegar e encerrar cada ocorrência, e como elas terminam."
        acoes={<><SeletorDias valor={dias} aoMudar={setDias} /><BotaoAtualizar carregando={carregando} aoClicar={recarregar} /></>}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!a && carregando && <Carregando />}
      {a && b && (
        <>
          <BasePequenaAviso n={a.total} />
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <dt className="text-sm text-gray-600">Ocorrências</dt>
              <dd className="mt-1 text-2xl text-gray-900">{a.total}</dd>
              <dd><Variacao valor={variacao(a.total, b.total)} melhorSeSobe={false} /></dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <dt className="text-sm text-gray-600">Tempo até a ciência (mediana)</dt>
              <dd className="mt-1 text-2xl text-gray-900">{formatarDuracaoCurta(a.tempoCiencia.mediana)}</dd>
              <dd><Variacao valor={variacao(a.tempoCiencia.mediana, b.tempoCiencia.mediana)} melhorSeSobe={false} /></dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <dt className="text-sm text-gray-600">Ciência em até 5 min</dt>
              <dd className="mt-1 text-2xl text-gray-900">{pct(a.cienciaEm5Min)}</dd>
              <dd><Variacao valor={variacao(a.cienciaEm5Min, b.cienciaEm5Min)} melhorSeSobe /></dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <dt className="text-sm text-gray-600">Falsos positivos</dt>
              <dd className="mt-1 text-2xl text-gray-900">{pct(a.taxaFalsoPositivo)}</dd>
              <dd className="text-xs text-gray-600">{a.falsosPositivos} de {a.encerradas} encerradas</dd>
            </div>
          </dl>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Painel titulo="Ocorrências por dia">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.porDia.map((d) => ({ ...d, rotulo: formatarDia(d.dia).slice(0, 5) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" vertical={false} />
                    <XAxis dataKey="rotulo" {...EIXO} interval="preserveStartEnd" />
                    <YAxis {...EIXO} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={DICA} formatter={(v) => [v, 'ocorrências']} />
                    <Bar dataKey="total" fill="var(--marca-viva)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Painel>
            <Painel titulo="Por turno">
              <ul className="space-y-3">
                {(['manha', 'tarde', 'noite'] as const).map((turno) => {
                  const n = a.porTurno[turno] ?? 0;
                  return (
                    <li key={turno}>
                      <div className="mb-1 flex justify-between text-sm"><span className="text-gray-700">{ROTULO_TURNO[turno]}</span><span className="text-gray-900">{n}</span></div>
                      <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-marca" style={{ width: `${a.total ? (100 * n) / a.total : 0}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            </Painel>
          </div>

          <Painel titulo="Tempos de resposta" descricao="Contados a partir do registro da ocorrência. P90: 9 em cada 10 casos ficaram abaixo disso.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-600">
                  <tr><th className="py-2 pr-4 font-medium">Etapa</th><th className="py-2 pr-4 text-right font-medium">Mediana</th><th className="py-2 pr-4 text-right font-medium">Média</th><th className="py-2 pr-4 text-right font-medium">P90</th><th className="py-2 text-right font-medium">Casos</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {([['Ciência (alguém viu)', a.tempoCiencia], ['Atendimento (alguém foi)', a.tempoAtendimento], ['Encerramento (desfecho registrado)', a.tempoEncerramento]] as const).map(([rotulo, t]) => (
                    <tr key={rotulo}>
                      <td className="py-2 pr-4 text-gray-800">{rotulo}</td>
                      <td className="py-2 pr-4 text-right text-gray-900">{formatarDuracaoCurta(t.mediana)}</td>
                      <td className="py-2 pr-4 text-right text-gray-700">{formatarDuracaoCurta(t.media)}</td>
                      <td className="py-2 pr-4 text-right text-gray-700">{formatarDuracaoCurta(t.p90)}</td>
                      <td className="py-2 text-right text-gray-700">{t.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Painel>

          <Painel titulo="Como terminaram">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(Object.keys(a.porStatus) as (keyof Metricas['porStatus'])[]).map((s) => (
                <li key={s} className="rounded-lg bg-gray-50 p-3">
                  <Etiqueta classe={ROTULO_STATUS[s].classe}>{ROTULO_STATUS[s].rotulo}</Etiqueta>
                  <p className="mt-2 text-xl text-gray-900">{a.porStatus[s]}</p>
                </li>
              ))}
            </ul>
          </Painel>
        </>
      )}
    </Tela>
  );
}

/* ============================================================================
 * Indicadores Clínicos
 * ========================================================================== */

export function IndicadoresClinicosScreen({ onNavigate }: PropsTela) {
  const { can } = useAuth();
  const [dias, setDias] = useState(30);
  const { dados: d, carregando, erro, recarregar } = useDados((t) => fetchIndicadoresClinicos(t, dias), [dias]);
  const ir = (tela: Screen) => (can(getModuleForScreen(tela), 'view') ? () => onNavigate(tela) : undefined);

  const perfil: { rotulo: string; valor: number; detalhe: string; tela: Screen; tom: 'critico' | 'atencao' | 'neutro' }[] = d ? [
    { rotulo: 'Morse alto (≥ 45)', valor: d.morseAlto, detalhe: 'risco alto de queda na última avaliação', tela: 'score-risco', tom: d.morseAlto ? 'critico' : 'neutro' },
    { rotulo: 'Morse moderado', valor: d.morseModerado, detalhe: '25 a 44 pontos', tela: 'score-risco', tom: d.morseModerado ? 'atencao' : 'neutro' },
    { rotulo: 'Sem avaliação de Morse', valor: d.semMorse, detalhe: 'internados nunca avaliados', tela: 'score-risco', tom: d.semMorse ? 'atencao' : 'neutro' },
    { rotulo: 'Polifarmácia', valor: d.polifarmacia, detalhe: '5 ou mais medicamentos ativos', tela: 'pep', tom: d.polifarmacia ? 'atencao' : 'neutro' },
    { rotulo: 'Alergia grave', valor: d.alergiaGrave, detalhe: 'pacientes com alergia grave ativa', tela: 'riscos', tom: 'neutro' },
    { rotulo: 'Sem evolução há 3 dias', valor: d.semEvolucao3d, detalhe: 'internados sem registro recente', tela: 'evolucoes', tom: d.semEvolucao3d ? 'atencao' : 'neutro' },
  ] : [];

  return (
    <Tela>
      <CabecalhoTela
        titulo="Indicadores Clínicos"
        descricao="Taxa de quedas pelo padrão do protocolo de prevenção, perfil dos internados e onde agir."
        acoes={<><SeletorDias valor={dias} aoMudar={setDias} opcoes={[30, 90, 365]} /><BotaoAtualizar carregando={carregando} aoClicar={recarregar} /></>}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!d && carregando && <Carregando />}
      {d && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-600">Taxa de quedas</p>
              <p className="mt-1 text-4xl text-gray-900">{num(d.taxaQuedas1000, 2)}</p>
              <p className="text-sm text-gray-700">quedas confirmadas por 1.000 pacientes-dia</p>
              <p className="mt-3 text-xs text-gray-600">
                {d.quedasConfirmadas} queda(s) em {num(d.pacientesDia)} pacientes-dia, de {formatarDia(d.inicio)} a {formatarDia(d.fim)}.
                Pacientes-dia somam cada dia de cada internação no período.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Indicador rotulo="Internados agora" valor={d.internados} />
              <Indicador rotulo="Admissões" valor={d.admissoes} detalhe="no período" />
              <Indicador rotulo="Saídas" valor={d.saidas} detalhe="altas e transferências" />
              <Indicador rotulo="Permanência média" valor={d.permanenciaMediaDias != null ? `${num(d.permanenciaMediaDias, 1)} d` : '—'} detalhe="de quem saiu no período" />
              <Indicador rotulo="Idade média" valor={d.idadeMedia != null ? `${num(d.idadeMedia, 1)} anos` : '—'} />
              <Indicador rotulo="80 anos ou mais" valor={d.idosos80} detalhe="internados" />
            </dl>
          </div>

          <Painel titulo="Perfil de risco dos internados" descricao="Cada número leva à tela onde se age sobre ele.">
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {perfil.map((p) => {
                const acao = ir(p.tela);
                const cor = p.tom === 'critico' ? 'border-red-200' : p.tom === 'atencao' ? 'border-amber-200' : 'border-gray-200';
                return (
                  <li key={p.rotulo}>
                    <button
                      type="button"
                      onClick={acao}
                      disabled={!acao}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-4 text-left transition-colors enabled:hover:bg-gray-50 ${cor}`}
                    >
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{p.rotulo}</span>
                        <span className="block text-xs text-gray-600">{p.detalhe}</span>
                      </span>
                      <span className="flex items-center gap-2 text-2xl text-gray-900">
                        {p.valor}
                        {acao && <ArrowRight className="h-4 w-4 text-gray-500" aria-hidden="true" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Painel>
        </>
      )}
    </Tela>
  );
}

/* ============================================================================
 * Relatórios Regulatórios
 * ========================================================================== */

const PRESETS_RELATORIO = {
  'mes-passado': 'Mês passado',
  'este-mes': 'Este mês',
  '30': 'Últimos 30 dias',
  '90': 'Últimos 90 dias',
} as const;

function periodoDoPreset(p: keyof typeof PRESETS_RELATORIO): [string, string] {
  const h = new Date();
  if (p === 'mes-passado') return [diaLocal(new Date(h.getFullYear(), h.getMonth() - 1, 1)), diaLocal(new Date(h.getFullYear(), h.getMonth(), 0))];
  if (p === 'este-mes') return [diaLocal(new Date(h.getFullYear(), h.getMonth(), 1)), diaLocal(h)];
  return [diaLocal(somarDias(h, -(Number(p) - 1))), diaLocal(h)];
}

export function RelatoriosScreen(_: PropsTela) {
  const [periodo, setPeriodo] = useState<[string, string]>(() => periodoDoPreset('mes-passado'));
  const { dados: r, carregando, erro, recarregar } = useDados((t) => fetchRelatorioQuedas(t, periodo[0], periodo[1]), [periodo[0], periodo[1]]);

  const exportar = () => {
    if (!r) return;
    baixarCsv(
      `quedas-${r.inicio}-a-${r.fim}.csv`,
      ['Data e hora', 'Tipo', 'Desfecho', 'Ambiente', 'Paciente', 'Idade', 'Turno', 'Até a ciência (min)', 'Até o atendimento (min)', 'Observação'],
      r.eventos.map((e) => [
        new Date(e.dataHora).toLocaleString('pt-BR'), ROTULO_TIPO[e.tipo], ROTULO_STATUS[e.status].rotulo, e.ambienteNome, e.pacienteNome ?? '',
        e.idade ?? '', ROTULO_TURNO[e.turno],
        e.segundosAteCiencia != null ? (e.segundosAteCiencia / 60).toFixed(1).replace('.', ',') : '',
        e.segundosAteAtendimento != null ? (e.segundosAteAtendimento / 60).toFixed(1).replace('.', ',') : '',
        e.observacao ?? '',
      ]),
    );
  };

  return (
    <Tela>
      <CabecalhoTela
        titulo="Relatórios Regulatórios"
        descricao="Eventos de queda e o indicador por 1.000 pacientes-dia, prontos para a notificação (RDC 36/2013) e para a auditoria interna."
        acoes={
          <>
            <button type="button" onClick={exportar} disabled={!r?.eventos.length} className={BOTAO_SECUNDARIO}><Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV</button>
            <button type="button" onClick={() => window.print()} disabled={!r} className={BOTAO_SECUNDARIO}><Printer className="h-4 w-4" aria-hidden="true" /> Imprimir</button>
          </>
        }
      />

      <Painel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PRESETS_RELATORIO) as (keyof typeof PRESETS_RELATORIO)[]).map((p) => (
              <button key={p} type="button" onClick={() => setPeriodo(periodoDoPreset(p))} className={`${BOTAO_SECUNDARIO} px-3 py-1.5`}>{PRESETS_RELATORIO[p]}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 lg:ml-auto">
            <label><span className={ROTULO}>De</span><input type="date" value={periodo[0]} max={periodo[1]} onChange={(e) => setPeriodo([e.target.value, periodo[1]])} className={CAMPO} /></label>
            <label><span className={ROTULO}>Até</span><input type="date" value={periodo[1]} min={periodo[0]} onChange={(e) => setPeriodo([periodo[0], e.target.value])} className={CAMPO} /></label>
            <BotaoAtualizar carregando={carregando} aoClicar={recarregar} />
          </div>
        </div>
      </Painel>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!r && carregando && <Carregando />}
      {r && (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-gray-600">{r.clinicaNome} · {formatarDia(r.inicio)} a {formatarDia(r.fim)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-5">
              <div><dt className="text-sm text-gray-600">Taxa de quedas</dt><dd className="text-2xl text-gray-900">{num(r.taxaQuedas1000, 2)}</dd><dd className="text-xs text-gray-600">por 1.000 pacientes-dia</dd></div>
              <div><dt className="text-sm text-gray-600">Quedas confirmadas</dt><dd className="text-2xl text-gray-900">{r.quedasConfirmadas}</dd></div>
              <div><dt className="text-sm text-gray-600">Pacientes-dia</dt><dd className="text-2xl text-gray-900">{num(r.pacientesDia)}</dd></div>
              <div><dt className="text-sm text-gray-600">Ocorrências registradas</dt><dd className="text-2xl text-gray-900">{r.ocorrencias}</dd><dd className="text-xs text-gray-600">{r.falsosPositivos} falso(s) positivo(s) excluído(s)</dd></div>
              <div><dt className="text-sm text-gray-600">Ciência (mediana)</dt><dd className="text-2xl text-gray-900">{formatarDuracaoCurta(r.tempoCiencia.mediana)}</dd></div>
            </dl>
          </section>

          <Painel titulo="Eventos do período" descricao="Falsos positivos ficam de fora: não são evento adverso." semPadding>
            {r.eventos.length === 0 ? (
              <Vazio icone={FileBarChart} titulo="Nenhum evento no período" texto="Sem quedas ou quase-quedas registradas nestas datas." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Data e hora</th><th className="px-4 py-2 font-medium">Evento</th><th className="px-4 py-2 font-medium">Paciente</th>
                      <th className="px-4 py-2 font-medium">Ambiente</th><th className="px-4 py-2 font-medium">Desfecho</th><th className="px-4 py-2 text-right font-medium">Até a ciência</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {r.eventos.map((e) => (
                      <tr key={e.id}>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-800">{new Date(e.dataHora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-4 py-2 text-gray-900">{ROTULO_TIPO[e.tipo]}</td>
                        <td className="px-4 py-2 text-gray-800">{e.pacienteNome ?? '—'}{e.idade != null && <span className="text-gray-600"> · {e.idade} anos</span>}</td>
                        <td className="px-4 py-2 text-gray-800">{e.ambienteNome}</td>
                        <td className="px-4 py-2"><Etiqueta classe={ROTULO_STATUS[e.status].classe}>{ROTULO_STATUS[e.status].rotulo}</Etiqueta></td>
                        <td className="px-4 py-2 text-right text-gray-800">{formatarDuracaoCurta(e.segundosAteCiencia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Painel>

          <p className="flex items-start gap-2 text-xs text-gray-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            A notificação de evento adverso ao Notivisa (Anvisa) é feita no sistema da Anvisa; este relatório reúne os dados que ela pede.
          </p>
        </>
      )}
    </Tela>
  );
}

/* ============================================================================
 * Análise Preditiva
 * ========================================================================== */

export function PrevisaoScreen(_: PropsTela) {
  const { dados: p, carregando, erro, recarregar } = useDados((t) => fetchPrevisao(t));
  const serie = useMemo(() => {
    if (!p) return [];
    const n = p.semanas.length;
    const media = p.semanas.reduce((s, x) => s + x.total, 0) / n;
    return [
      ...p.semanas.map((s, k) => ({ rotulo: formatarDia(s.inicio).slice(0, 5), total: s.total, tendencia: Math.max(0, +(media + p.inclinacaoPorSemana * (k - (n - 1) / 2)).toFixed(2)) })),
      { rotulo: 'próx.', previsao: p.previsaoProximaSemana, tendencia: p.previsaoProximaSemana },
    ];
  }, [p]);
  const maxHora = p ? Math.max(0.01, ...p.mediaPorHoraEDia.flat()) : 1;

  return (
    <Tela>
      <CabecalhoTela
        titulo="Análise Preditiva"
        descricao="Para onde as ocorrências estão indo e em que horários o risco é maior, por estatística simples e explicada."
        acoes={<BotaoAtualizar carregando={carregando} aoClicar={recarregar} />}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!p && carregando && <Carregando />}
      {p && (
        <>
          {p.semanasComDados < 4 && (
            <Aviso>Só {p.semanasComDados} das últimas 12 semanas têm ocorrências. A previsão fica mais confiável a partir de umas 8 semanas de histórico.</Aviso>
          )}
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Indicador rotulo="Previsão para a próxima semana" valor={num(p.previsaoProximaSemana, 1)} detalhe="ocorrências (tendência das 12 semanas)" />
            <Indicador rotulo="Esta semana até agora" valor={p.semanaAtual} />
            <Indicador
              rotulo="Tendência"
              valor={p.inclinacaoPorSemana > 0.05 ? 'Subindo' : p.inclinacaoPorSemana < -0.05 ? 'Caindo' : 'Estável'}
              detalhe={`${p.inclinacaoPorSemana > 0 ? '+' : ''}${num(p.inclinacaoPorSemana, 2)} por semana`}
              tom={p.inclinacaoPorSemana > 0.05 ? 'atencao' : 'neutro'}
            />
            <Indicador rotulo="Horário de maior risco" valor={p.picos[0] ? `${DIAS_DA_SEMANA[p.picos[0].diaDaSemana]} ${p.picos[0].hora}h` : '—'} detalhe={p.picos[0] ? `${num(p.picos[0].mediaSemanal, 2)} por semana, em média` : 'sem dados'} />
          </dl>

          <Painel titulo="Ocorrências por semana e tendência" descricao="Barras: ocorrências reais (sem falsos positivos). Linha: reta de tendência. Última barra: a reta estendida.">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" vertical={false} />
                  <XAxis dataKey="rotulo" {...EIXO} />
                  <YAxis {...EIXO} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={DICA} />
                  <Bar dataKey="total" name="ocorrências" fill="var(--marca-viva)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="previsao" name="previsão" fill="var(--marca-clara)" radius={[4, 4, 0, 0]} />
                  <Line dataKey="tendencia" name="tendência" stroke="var(--grafico-eixo)" strokeDasharray="5 4" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Painel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Painel titulo="Média semanal por dia e hora" descricao="Últimas 8 semanas. Quanto mais escuro, mais ocorrências naquele horário.">
              <MapaGrade linhas={p.mediaPorHoraEDia} rotulos={DIAS_DA_SEMANA} maximo={maxHora} casas={1} />
            </Painel>
            <Painel titulo="Onde se concentram" descricao="Média semanal por ambiente, últimas 8 semanas.">
              {p.ambientes.length === 0 ? <p className="text-sm text-gray-600">Sem ocorrências no período.</p> : (
                <ul className="space-y-2">
                  {p.ambientes.map((a) => (
                    <li key={a.nome} className="flex justify-between gap-3 text-sm"><span className="truncate text-gray-800">{a.nome}</span><span className="text-gray-900">{num(a.mediaSemanal, 2)}</span></li>
                  ))}
                </ul>
              )}
            </Painel>
          </div>

          <p className="flex items-start gap-2 text-xs text-gray-600">
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Método: contagem semanal das últimas 12 semanas e reta de mínimos quadrados; horários pela média das últimas 8 semanas. Não é modelo de IA, e cada número pode ser conferido no Histórico de Incidentes.
          </p>
        </>
      )}
    </Tela>
  );
}

/** Grade de calor genérica: linhas × 24 horas. */
function MapaGrade({ linhas, rotulos, maximo, casas = 0 }: { linhas: number[][]; rotulos: string[]; maximo: number; casas?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="w-28" />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} scope="col" className="text-center text-[10px] font-normal text-gray-600">{h % 3 === 0 ? `${h}h` : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={rotulos[i]}>
              <th scope="row" className="truncate pr-2 text-left text-xs font-normal text-gray-700" title={rotulos[i]}>{rotulos[i]}</th>
              {linha.map((v, h) => {
                const alfa = v > 0 ? 0.15 + 0.85 * (v / maximo) : 0;
                return (
                  <td
                    key={h}
                    title={`${rotulos[i]}, ${h}h: ${num(v, casas)}`}
                    className="h-7 min-w-[22px] rounded text-center text-[10px]"
                    style={{
                      backgroundColor: v > 0 ? `rgb(220 38 38 / ${alfa.toFixed(2)})` : 'var(--grafico-grade)',
                      color: alfa > 0.55 ? '#fff' : 'var(--foreground)',
                      opacity: v > 0 ? 1 : 0.5,
                    }}
                  >
                    {v > 0 ? num(v, casas) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================================
 * Mapa de calor de risco
 * ========================================================================== */

export function MapaDeCalorScreen(_: PropsTela) {
  const [dias, setDias] = useState(30);
  const [falsos, setFalsos] = useState(false);
  const { dados: m, carregando, erro, recarregar } = useDados((t) => fetchMapaDeCalor(t, dias, falsos), [dias, falsos]);
  const ambientes = m ? m.ambientes.filter((a) => a.total > 0).sort((a, b) => b.total - a.total) : [];
  const maxAmb = Math.max(1, ...ambientes.flatMap((a) => a.horas));
  const maxSem = m ? Math.max(1, ...m.diasDaSemana.flat()) : 1;

  return (
    <Tela>
      <CabecalhoTela
        titulo="Mapa de Calor de Risco"
        descricao="Onde e em que horário as ocorrências se concentram. Bom para decidir rondas e reforço de equipe."
        acoes={
          <>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Interruptor rotulo="Incluir falsos positivos" ligado={falsos} aoMudar={setFalsos} /> Incluir falsos positivos
            </label>
            <SeletorDias valor={dias} aoMudar={setDias} />
            <BotaoAtualizar carregando={carregando} aoClicar={recarregar} />
          </>
        }
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!m && carregando && <Carregando />}
      {m && (
        m.total === 0 ? (
          <Painel><Vazio icone={CheckCircle2} titulo="Nenhuma ocorrência no período" texto="Sem dado para o mapa. Amplie o período ou volte depois." /></Painel>
        ) : (
          <>
            <BasePequenaAviso n={m.total} />
            <Painel titulo="Por ambiente e hora do dia" descricao={`${m.total} ocorrência(s) de ${formatarDia(m.inicio)} a ${formatarDia(m.fim)}. Ambientes sem ocorrência ficam de fora.`}>
              <MapaGrade linhas={ambientes.map((a) => a.horas)} rotulos={ambientes.map((a) => a.nome)} maximo={maxAmb} />
            </Painel>
            <Painel titulo="Por dia da semana e hora">
              <MapaGrade linhas={m.diasDaSemana} rotulos={DIAS_DA_SEMANA} maximo={maxSem} />
            </Painel>
          </>
        )
      )}
    </Tela>
  );
}

/* ============================================================================
 * Comparativos por período
 * ========================================================================== */

type Preset = 'semana' | 'mes' | '30' | 'livre';

function periodosDoPreset(p: Preset): { a: [string, string]; b: [string, string] } {
  const h = new Date();
  if (p === 'semana') {
    const seg = somarDias(h, -((h.getDay() + 6) % 7));
    return { a: [diaLocal(seg), diaLocal(h)], b: [diaLocal(somarDias(seg, -7)), diaLocal(somarDias(h, -7))] };
  }
  if (p === 'mes') {
    const ini = new Date(h.getFullYear(), h.getMonth(), 1);
    const iniAnt = new Date(h.getFullYear(), h.getMonth() - 1, 1);
    const fimAnt = new Date(h.getFullYear(), h.getMonth() - 1, Math.min(h.getDate(), new Date(h.getFullYear(), h.getMonth(), 0).getDate()));
    return { a: [diaLocal(ini), diaLocal(h)], b: [diaLocal(iniAnt), diaLocal(fimAnt)] };
  }
  return { a: [diaLocal(somarDias(h, -29)), diaLocal(h)], b: [diaLocal(somarDias(h, -59)), diaLocal(somarDias(h, -30))] };
}

export function ComparativosScreen(_: PropsTela) {
  const [preset, setPreset] = useState<Preset>('30');
  const [p, setP] = useState(() => periodosDoPreset('30'));
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchComparativo(t, p.a, p.b), [p.a.join(), p.b.join()]);

  const escolher = (novo: Preset) => {
    setPreset(novo);
    if (novo !== 'livre') setP(periodosDoPreset(novo));
  };

  const linhas: { rotulo: string; a: number | null; b: number | null; formato: (v: number | null) => string; melhorSeSobe: boolean }[] = dados ? [
    { rotulo: 'Ocorrências', a: dados.a.total, b: dados.b.total, formato: (v) => num(v), melhorSeSobe: false },
    { rotulo: 'Quedas confirmadas', a: dados.a.quedasConfirmadas, b: dados.b.quedasConfirmadas, formato: (v) => num(v), melhorSeSobe: false },
    { rotulo: 'Taxa por 1.000 pacientes-dia', a: dados.a.taxaQuedas1000 ?? null, b: dados.b.taxaQuedas1000 ?? null, formato: (v) => num(v, 2), melhorSeSobe: false },
    { rotulo: 'Pacientes-dia', a: dados.a.pacientesDia ?? null, b: dados.b.pacientesDia ?? null, formato: (v) => num(v), melhorSeSobe: true },
    { rotulo: 'Falsos positivos', a: dados.a.taxaFalsoPositivo, b: dados.b.taxaFalsoPositivo, formato: pct, melhorSeSobe: false },
    { rotulo: 'Ciência em até 5 min', a: dados.a.cienciaEm5Min, b: dados.b.cienciaEm5Min, formato: pct, melhorSeSobe: true },
    { rotulo: 'Tempo até a ciência (mediana)', a: dados.a.tempoCiencia.mediana, b: dados.b.tempoCiencia.mediana, formato: formatarDuracaoCurta, melhorSeSobe: false },
    { rotulo: 'Tempo até o atendimento (mediana)', a: dados.a.tempoAtendimento.mediana, b: dados.b.tempoAtendimento.mediana, formato: formatarDuracaoCurta, melhorSeSobe: false },
  ] : [];

  return (
    <Tela>
      <CabecalhoTela titulo="Comparativos por Período" descricao="Dois períodos lado a lado, com a variação de cada indicador." acoes={<BotaoAtualizar carregando={carregando} aoClicar={recarregar} />} />
      <Painel>
        <div className="space-y-4">
          <Segmentado rotulo="Comparar" valor={preset} aoMudar={escolher} opcoes={[
            { valor: 'semana', rotulo: 'Semana × anterior' }, { valor: 'mes', rotulo: 'Mês × anterior' },
            { valor: '30', rotulo: '30 dias × 30 anteriores' }, { valor: 'livre', rotulo: 'Escolher datas' },
          ]} />
          {preset === 'livre' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(['a', 'b'] as const).map((k) => (
                <fieldset key={k} className="rounded-lg border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-medium text-gray-800">Período {k.toUpperCase()}</legend>
                  <div className="flex flex-wrap gap-3">
                    <label><span className={ROTULO}>De</span><input type="date" value={p[k][0]} onChange={(e) => setP({ ...p, [k]: [e.target.value, p[k][1]] })} className={CAMPO} /></label>
                    <label><span className={ROTULO}>Até</span><input type="date" value={p[k][1]} onChange={(e) => setP({ ...p, [k]: [p[k][0], e.target.value] })} className={CAMPO} /></label>
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>
      </Painel>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando && <Carregando />}
      {dados && (
        <Painel semPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-5 py-3 font-medium">Indicador</th>
                  <th className="px-5 py-3 text-right font-medium">A · {formatarDia(dados.a.inicio)} a {formatarDia(dados.a.fim)}</th>
                  <th className="px-5 py-3 text-right font-medium">B · {formatarDia(dados.b.inicio)} a {formatarDia(dados.b.fim)}</th>
                  <th className="px-5 py-3 text-right font-medium">A em relação a B</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linhas.map((l) => (
                  <tr key={l.rotulo}>
                    <td className="px-5 py-3 text-gray-800">{l.rotulo}</td>
                    <td className="px-5 py-3 text-right text-gray-900">{l.formato(l.a)}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{l.formato(l.b)}</td>
                    <td className="px-5 py-3 text-right"><Variacao valor={variacao(l.a, l.b)} melhorSeSobe={l.melhorSeSobe} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}
    </Tela>
  );
}

/* ============================================================================
 * Insights automatizados
 * ========================================================================== */

const NIVEL: Record<Achado['nivel'], { rotulo: string; Icone: typeof Info; caixa: string; icone: string }> = {
  critico: { rotulo: 'Agir agora', Icone: AlertOctagon, caixa: 'border-red-200', icone: 'bg-red-100 text-red-700' },
  atencao: { rotulo: 'Atenção', Icone: Lightbulb, caixa: 'border-amber-200', icone: 'bg-amber-100 text-amber-800' },
  info: { rotulo: 'Para saber', Icone: Info, caixa: 'border-gray-200', icone: 'bg-blue-100 text-blue-700' },
  positivo: { rotulo: 'Boa notícia', Icone: CheckCircle2, caixa: 'border-green-200', icone: 'bg-green-100 text-green-700' },
};

export function InsightsScreen({ onNavigate }: PropsTela) {
  const { can } = useAuth();
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchInsights(t));
  const telaValida = (tela: string | null): tela is Screen => !!tela && !!getModuleForScreen(tela as Screen) && can(getModuleForScreen(tela as Screen), 'view');

  return (
    <Tela>
      <CabecalhoTela
        titulo="Insights Automatizados"
        descricao="As verificações que um gestor atento faria todo dia, rodadas sozinhas sobre os dados da clínica."
        acoes={<BotaoAtualizar carregando={carregando} aoClicar={recarregar} />}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando && <Carregando />}
      {dados && (
        <>
          {dados.achados.length === 0 ? (
            <Painel><Vazio icone={CheckCircle2} titulo="Nada a apontar agora" texto="Nenhuma verificação encontrou algo fora do esperado." /></Painel>
          ) : (
            <ul className="space-y-3">
              {dados.achados.map((a, i) => {
                const n = NIVEL[a.nivel];
                return (
                  <li key={i} className={`flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center ${n.caixa}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${n.icone}`}><n.Icone className="h-5 w-5" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-gray-600"><span className="font-medium uppercase tracking-wide">{n.rotulo}</span>· {a.categoria}</p>
                      <p className="mt-0.5 text-sm font-medium text-gray-900">{a.titulo}</p>
                      <p className="mt-0.5 text-sm text-gray-700">{a.detalhe}</p>
                    </div>
                    {telaValida(a.tela) && (
                      <button type="button" onClick={() => onNavigate(a.tela as Screen)} className={`${BOTAO_SECUNDARIO} shrink-0`}>
                        Ver <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-gray-600">
            Gerado {new Date(dados.geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Regras fixas e conhecidas
            (ocorrência parada, repetição por ambiente e paciente, tempo de ciência, falso positivo, câmera sem sinal, avaliação de Morse,
            evolução, contratos, compras, lembretes, mensagens e NPS) — não é IA. Cada achado mostra o número que o disparou.
          </p>
        </>
      )}
    </Tela>
  );
}
