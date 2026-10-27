import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, ArrowDownRight, ArrowUpRight, Camera, CheckCircle2, ClipboardCheck, Copy, Cpu, DoorOpen, Download, Eye, History, Moon, Plus,
  Radio, ShieldAlert, Stethoscope, Wifi, WifiOff,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, fetchAmbientes, fetchCameras, type AmbienteResumo } from '../../data/api';
import {
  ROTULO_STATUS, ROTULO_TIPO, ROTULO_TURNO, baixarCsv, fetchEventos, formatarDuracaoCurta, type EventoMonitoramento,
} from '../../data/analytics';
import {
  FAIXA_MORSE, ITENS_MORSE, TIPOS_SENSOR, avaliarMorse, cadastrarSensor, desativarSensor, fetchAvaliacoesMorse, fetchLeituras,
  fetchPainelDeRisco, fetchSensores,
  type ItensMorse, type RiscoDoPaciente, type Sensor, type TipoSensor,
} from '../../data/operacional';
import { quandoFoi } from '../../data/tempo';
import { useAcao, useDados } from '../../data/useDados';
import type { PropsTela } from '../../telas';
import {
  AbasDeFiltro, Aviso, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, BotaoAtualizar, Busca, CAMPO, CabecalhoTela, Carregando, Dado, Etiqueta,
  Indicador, Janela, Painel, ROTULO, SeletorDias, Tela, Vazio,
} from '../settings/ui';

/** Monitoramento inteligente: as leituras do que câmeras e sensores registraram, e a Escala de Morse. */

const DICA = { backgroundColor: 'var(--grafico-dica)', border: '1px solid var(--grafico-grade)', borderRadius: 8, fontSize: 12 };
const EIXO = { stroke: 'var(--grafico-eixo)', fontSize: 11 };
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const ABERTOS = new Set(['pendente', 'em_atendimento']);

/** As quatro etapas de uma ocorrência, com quem e em quanto tempo. */
function EtapasDaOcorrencia({ e }: { e: EventoMonitoramento }) {
  const etapas = [
    { rotulo: 'Detectada', quando: e.dataHora, quem: e.ambienteNome, depois: null as number | null, Icone: Eye },
    { rotulo: 'Ciência', quando: e.cienciaEm, quem: e.cienciaPor, depois: e.segundosAteCiencia, Icone: CheckCircle2 },
    { rotulo: 'Atendimento', quando: e.atendimentoEm, quem: e.atendidoPor, depois: e.segundosAteAtendimento, Icone: Stethoscope },
    { rotulo: ROTULO_STATUS[e.status].rotulo, quando: e.encerradaEm, quem: null, depois: e.segundosAteEncerramento, Icone: ClipboardCheck },
  ];
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {etapas.map((s, i) => (
        <li key={i} className={`rounded-lg p-2.5 ${s.quando ? 'bg-gray-50' : 'border border-dashed border-gray-300'}`}>
          <p className={`flex items-center gap-1.5 text-xs font-medium ${s.quando ? 'text-gray-900' : 'text-gray-600'}`}><s.Icone className="h-3.5 w-3.5" aria-hidden="true" />{i === 3 && !s.quando ? 'Encerramento' : s.rotulo}</p>
          {s.quando ? (
            <p className="mt-0.5 text-xs text-gray-700">{hora(s.quando)}{s.depois != null && ` · +${formatarDuracaoCurta(s.depois)}`}{s.quem && i > 0 && <span className="block truncate text-gray-600">{s.quem}</span>}</p>
          ) : <p className="mt-0.5 text-xs text-gray-600">ainda não</p>}
        </li>
      ))}
    </ol>
  );
}

/* ============================================================================
 * Histórico de incidentes
 * ========================================================================== */

type FiltroDesfecho = 'todos' | 'abertos' | 'queda_confirmada' | 'falso_positivo' | 'encerrada';

export function IncidentesScreen(_: PropsTela) {
  const [dias, setDias] = useState(30);
  const [desfecho, setDesfecho] = useState<FiltroDesfecho>('todos');
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<EventoMonitoramento | null>(null);
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchEventos(t, { dias, tipo: tipo || undefined }), [dias, tipo]);
  const eventos = dados?.eventos ?? [];
  const conta = (f: FiltroDesfecho) => eventos.filter((e) => passa(e, f)).length;
  function passa(e: EventoMonitoramento, f: FiltroDesfecho) {
    return f === 'todos' || (f === 'abertos' ? ABERTOS.has(e.status) : e.status === f);
  }
  const visiveis = eventos.filter((e) => passa(e, desfecho))
    .filter((e) => !busca.trim() || `${e.pacienteNome ?? ''} ${e.ambienteNome}`.toLowerCase().includes(busca.trim().toLowerCase()));

  const exportar = () => baixarCsv(`incidentes-${dados?.inicio}-a-${dados?.fim}.csv`,
    ['Data e hora', 'Tipo', 'Desfecho', 'Ambiente', 'Paciente', 'Ciência por', 'Até a ciência (s)', 'Atendido por', 'Até o atendimento (s)', 'Observação'],
    visiveis.map((e) => [dataHora(e.dataHora), ROTULO_TIPO[e.tipo], ROTULO_STATUS[e.status].rotulo, e.ambienteNome, e.pacienteNome, e.cienciaPor, e.segundosAteCiencia, e.atendidoPor, e.segundosAteAtendimento, e.observacao]));

  return (
    <Tela>
      <CabecalhoTela
        titulo="Histórico de Incidentes"
        descricao="Todas as ocorrências, com quem viu, quem atendeu, quanto tempo levou e como terminou."
        acoes={<>
          <SeletorDias valor={dias} aoMudar={setDias} opcoes={[7, 30, 90, 365]} />
          <button type="button" onClick={exportar} disabled={!visiveis.length} className={BOTAO_SECUNDARIO}><Download className="h-4 w-4" aria-hidden="true" /> CSV</button>
          <BotaoAtualizar carregando={carregando} aoClicar={recarregar} />
        </>}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Painel semPadding>
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 xl:flex-row xl:items-center">
          <AbasDeFiltro rotulo="Desfecho" valor={desfecho} aoMudar={setDesfecho} opcoes={[
            { valor: 'todos', rotulo: 'Todos', contagem: eventos.length }, { valor: 'abertos', rotulo: 'Em aberto', contagem: conta('abertos') },
            { valor: 'queda_confirmada', rotulo: 'Quedas', contagem: conta('queda_confirmada') }, { valor: 'falso_positivo', rotulo: 'Falsos positivos', contagem: conta('falso_positivo') },
            { valor: 'encerrada', rotulo: 'Encerradas', contagem: conta('encerrada') },
          ]} />
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar paciente ou ambiente" />
            <select aria-label="Tipo de evento" value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva">
              <option value="">Todos os tipos</option>{Object.entries(ROTULO_TIPO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
        </div>
        {!dados && carregando ? <div className="px-4"><Carregando /></div> : visiveis.length === 0 ? (
          <Vazio icone={History} titulo="Nenhum incidente com esses filtros" texto="Amplie o período ou tire um filtro." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Evento</th><th className="px-4 py-2 font-medium">Paciente · ambiente</th>
                  <th className="px-4 py-2 font-medium">Desfecho</th><th className="px-4 py-2 text-right font-medium">Até a ciência</th><th className="px-4 py-2 text-right font-medium">Até o atendimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visiveis.map((e) => (
                  <tr key={e.id} onClick={() => setAberto(e)} className="cursor-pointer hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-800"><button type="button" className="text-left hover:underline" onClick={() => setAberto(e)}>{dataHora(e.dataHora)}</button></td>
                    <td className="px-4 py-2.5 text-gray-900">{ROTULO_TIPO[e.tipo]}</td>
                    <td className="px-4 py-2.5 text-gray-800">{e.pacienteNome ?? '—'}<span className="block text-xs text-gray-600">{e.ambienteNome}</span></td>
                    <td className="px-4 py-2.5"><Etiqueta classe={ROTULO_STATUS[e.status].classe}>{ROTULO_STATUS[e.status].rotulo}</Etiqueta></td>
                    <td className="px-4 py-2.5 text-right text-gray-800">{formatarDuracaoCurta(e.segundosAteCiencia)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-800">{formatarDuracaoCurta(e.segundosAteAtendimento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
      {aberto && (
        <Janela titulo={`${ROTULO_TIPO[aberto.tipo]} · ${aberto.ambienteNome}`} descricao={dataHora(aberto.dataHora)} aoFechar={() => setAberto(null)} largura="max-w-2xl">
          <div className="space-y-4">
            <Etiqueta classe={ROTULO_STATUS[aberto.status].classe}>{ROTULO_STATUS[aberto.status].rotulo}</Etiqueta>
            <EtapasDaOcorrencia e={aberto} />
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Dado rotulo="Paciente">{aberto.pacienteNome ?? 'Não vinculado'}{aberto.idade != null && <span className="block text-xs text-gray-600">{aberto.idade} anos</span>}</Dado>
              <Dado rotulo="Turno">{ROTULO_TURNO[aberto.turno]}</Dado>
              <Dado rotulo="Até o encerramento">{formatarDuracaoCurta(aberto.segundosAteEncerramento)}</Dado>
            </dl>
            {aberto.observacao && <div><p className="text-xs uppercase tracking-wide text-gray-500">Observação de quem encerrou</p><p className="mt-1 whitespace-pre-line text-sm text-gray-800">{aberto.observacao}</p></div>}
          </div>
        </Janela>
      )}
    </Tela>
  );
}

/* ============================================================================
 * Linha do tempo de eventos
 * ========================================================================== */

export function LinhaEventosScreen(_: PropsTela) {
  const [dias, setDias] = useState(7);
  const [ambiente, setAmbiente] = useState('');
  const ambientes = useDados<AmbienteResumo[]>((t) => fetchAmbientes(t));
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchEventos(t, { dias, ambienteId: ambiente || undefined }), [dias, ambiente], 30_000);
  const grupos = useMemo(() => {
    const g: { dia: string; eventos: EventoMonitoramento[] }[] = [];
    for (const e of dados?.eventos ?? []) {
      const dia = new Date(e.dataHora).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      const ultimo = g[g.length - 1];
      if (ultimo?.dia === dia) ultimo.eventos.push(e); else g.push({ dia, eventos: [e] });
    }
    return g;
  }, [dados]);

  return (
    <Tela>
      <CabecalhoTela
        titulo="Linha do Tempo de Eventos"
        descricao="Cada ocorrência em ordem, com o passo a passo da resposta. Atualiza sozinha a cada 30 segundos."
        acoes={<>
          <select aria-label="Ambiente" value={ambiente} onChange={(e) => setAmbiente(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva">
            <option value="">Todos os ambientes</option>{(ambientes.dados ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <SeletorDias valor={dias} aoMudar={setDias} opcoes={[1, 7, 30]} />
          <BotaoAtualizar carregando={carregando} aoClicar={recarregar} />
        </>}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando ? <Carregando /> : grupos.length === 0 ? (
        <Painel><Vazio icone={Activity} titulo="Nenhum evento no período" texto="Quando uma câmera detectar algo, aparece aqui na hora." /></Painel>
      ) : grupos.map((g) => (
        <section key={g.dia}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">{g.dia} · {g.eventos.length} evento(s)</h2>
          <ol className="relative space-y-3 border-l-2 border-gray-200 pl-5">
            {g.eventos.map((e) => (
              <li key={e.id} className="relative rounded-xl border border-gray-200 bg-white p-4">
                <span style={{ boxShadow: '0 0 0 4px var(--fundo-app)' }} className={`absolute -left-[29px] top-5 h-3.5 w-3.5 rounded-full ${ABERTOS.has(e.status) ? 'bg-red-600' : e.status === 'falso_positivo' ? 'bg-gray-400' : 'bg-marca'}`} aria-hidden="true" />
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{hora(e.dataHora)} · {ROTULO_TIPO[e.tipo]}</span>
                  <span className="text-sm text-gray-700">{e.pacienteNome ? `${e.pacienteNome}, ` : ''}{e.ambienteNome}</span>
                  <Etiqueta classe={ROTULO_STATUS[e.status].classe}>{ROTULO_STATUS[e.status].rotulo}</Etiqueta>
                </div>
                <EtapasDaOcorrencia e={e} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </Tela>
  );
}

/* ============================================================================
 * Agitação noturna
 * ========================================================================== */

/** A "noite" de um evento é a da véspera quando ele acontece de madrugada. */
const noiteDe = (iso: string) => {
  const d = new Date(iso);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv-SE');
};
const HORAS_NOITE = [22, 23, 0, 1, 2, 3, 4, 5];

export function AgitacaoNoturnaScreen(_: PropsTela) {
  const [dias, setDias] = useState(30);
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchEventos(t, { dias, noturno: true }), [dias]);
  const eventos = (dados?.eventos ?? []).filter((e) => e.status !== 'falso_positivo');
  const noites = new Set(eventos.map((e) => noiteDe(e.dataHora)));
  const porPaciente = useMemo(() => {
    const m = new Map<string, { nome: string; ambiente: string; eventos: number; noites: Set<string>; ultimo: string }>();
    for (const e of eventos) {
      const chave = e.pacienteId ?? `amb:${e.ambienteId}`;
      const atual = m.get(chave) ?? { nome: e.pacienteNome ?? `(sem paciente) ${e.ambienteNome}`, ambiente: e.ambienteNome, eventos: 0, noites: new Set(), ultimo: e.dataHora };
      atual.eventos += 1;
      atual.noites.add(noiteDe(e.dataHora));
      if (e.dataHora > atual.ultimo) atual.ultimo = e.dataHora;
      m.set(chave, atual);
    }
    return [...m.values()].sort((a, b) => b.noites.size - a.noites.size || b.eventos - a.eventos);
  }, [eventos]);
  const porHora = HORAS_NOITE.map((h) => ({ hora: `${h}h`, total: eventos.filter((e) => new Date(e.dataHora).getHours() === h).length }));

  return (
    <Tela>
      <CabecalhoTela
        titulo="Agitação Noturna"
        descricao="Eventos detectados entre 22h e 6h. Paciente que se levanta toda noite pede revisão de sono, dor, medicação e ronda."
        acoes={<><SeletorDias valor={dias} aoMudar={setDias} /><BotaoAtualizar carregando={carregando} aoClicar={recarregar} /></>}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando ? <Carregando /> : (
        <>
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Indicador rotulo="Eventos noturnos" valor={eventos.length} detalhe="sem falsos positivos" />
            <Indicador rotulo="Noites com evento" valor={noites.size} detalhe={`de ${dias}`} />
            <Indicador rotulo="Pacientes envolvidos" valor={porPaciente.filter((p) => !p.nome.startsWith('(sem')).length} />
            <Indicador rotulo="Em 3 noites ou mais" valor={porPaciente.filter((p) => p.noites.size >= 3).length} tom={porPaciente.some((p) => p.noites.size >= 3) ? 'atencao' : 'neutro'} detalhe="padrão que se repete" />
          </dl>
          {eventos.length === 0 ? (
            <Painel><Vazio icone={Moon} titulo="Noites tranquilas" texto="Nenhum evento noturno no período." /></Painel>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Painel titulo="Por paciente" descricao="Ordenado pelo número de noites diferentes com evento." semPadding>
                <ul className="divide-y divide-gray-100">
                  {porPaciente.map((p) => (
                    <li key={p.nome} className="flex items-center gap-4 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{p.nome}</p>
                        <p className="text-xs text-gray-600">{p.ambiente} · último {quandoFoi(p.ultimo)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">{p.noites.size} noite(s)</p>
                        <p className="text-xs text-gray-600">{p.eventos} evento(s)</p>
                      </div>
                      {p.noites.size >= 3 && <Etiqueta classe="bg-amber-100 text-amber-800">Repetitivo</Etiqueta>}
                    </li>
                  ))}
                </ul>
              </Painel>
              <Painel titulo="Por hora da noite">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porHora}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" vertical={false} />
                      <XAxis dataKey="hora" {...EIXO} />
                      <YAxis {...EIXO} allowDecimals={false} width={28} />
                      <Tooltip contentStyle={DICA} formatter={(v) => [v, 'eventos']} />
                      <Bar dataKey="total" fill="var(--marca-viva)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Painel>
            </div>
          )}
        </>
      )}
    </Tela>
  );
}

/* ============================================================================
 * Ausência no quarto
 * ========================================================================== */

export function AusenciaScreen(_: PropsTela) {
  const [dias, setDias] = useState(30);
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchEventos(t, { dias, tipo: 'ausencia_prolongada' }), [dias], 30_000);
  const eventos = dados?.eventos ?? [];
  const agora = eventos.filter((e) => ABERTOS.has(e.status));
  const porAmbiente = Object.entries(eventos.reduce<Record<string, number>>((m, e) => ({ ...m, [e.ambienteNome]: (m[e.ambienteNome] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);

  return (
    <Tela>
      <CabecalhoTela
        titulo="Ausência no Quarto"
        descricao="O serviço de visão avisa quando o quarto fica vazio além do tempo esperado. Pode ser só um passeio, ou alguém caído no banheiro."
        acoes={<><SeletorDias valor={dias} aoMudar={setDias} /><BotaoAtualizar carregando={carregando} aoClicar={recarregar} /></>}
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando ? <Carregando /> : (
        <>
          {agora.length > 0 ? (
            <Painel titulo={`Fora do quarto agora (${agora.length})`}>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {agora.map((e) => (
                  <li key={e.id} className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-800"><DoorOpen className="mr-1 inline h-4 w-4" aria-hidden="true" />{e.pacienteNome ?? 'Paciente não vinculado'} · {e.ambienteNome}</p>
                    <p className="mt-1 text-sm text-red-700">Desde {hora(e.dataHora)} ({quandoFoi(e.dataHora)}) · {ROTULO_STATUS[e.status].rotulo}</p>
                  </li>
                ))}
              </ul>
            </Painel>
          ) : (
            <Aviso tom="sucesso">Ninguém fora do quarto além do tempo agora.</Aviso>
          )}
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Indicador rotulo="Ausências no período" valor={eventos.length} />
            <Indicador rotulo="Tempo mediano até a ciência" valor={formatarDuracaoCurta((() => { const t = eventos.map((e) => e.segundosAteCiencia).filter((x): x is number => x != null).sort((a, b) => a - b); return t.length ? t[Math.floor(t.length / 2)] : null; })())} />
            <Indicador rotulo="Ambientes com ausência" valor={porAmbiente.length} />
          </dl>
          {eventos.length === 0 ? (
            <Painel><Vazio icone={DoorOpen} titulo="Nenhuma ausência registrada" texto="A detecção de ausência depende do serviço de visão estar configurado para ela em cada câmera. Sem esse evento, a tela fica vazia." /></Painel>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Painel titulo="Histórico" semPadding>
                <ul className="divide-y divide-gray-100">
                  {eventos.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">{e.pacienteNome ?? '—'} · {e.ambienteNome}</p>
                        <p className="text-xs text-gray-600">{dataHora(e.dataHora)}{e.cienciaPor && ` · ciência de ${e.cienciaPor} em ${formatarDuracaoCurta(e.segundosAteCiencia)}`}</p>
                      </div>
                      <Etiqueta classe={ROTULO_STATUS[e.status].classe}>{ROTULO_STATUS[e.status].rotulo}</Etiqueta>
                    </li>
                  ))}
                </ul>
              </Painel>
              <Painel titulo="Por ambiente">
                <ul className="space-y-2">{porAmbiente.map(([nome, n]) => <li key={nome} className="flex justify-between text-sm"><span className="text-gray-800">{nome}</span><span className="text-gray-900">{n}</span></li>)}</ul>
              </Painel>
            </div>
          )}
        </>
      )}
    </Tela>
  );
}

/* ============================================================================
 * Score de risco (Escala de Morse)
 * ========================================================================== */

type FiltroFaixa = 'todos' | 'alto' | 'moderado' | 'baixo' | 'sem';

export function ScoreRiscoScreen(_: PropsTela) {
  const { can } = useAuth();
  const { dados, carregando, erro, recarregar } = useDados((t) => fetchPainelDeRisco(t));
  const [filtro, setFiltro] = useState<FiltroFaixa>('todos');
  const [avaliando, setAvaliando] = useState<RiscoDoPaciente | null>(null);
  const [historico, setHistorico] = useState<RiscoDoPaciente | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = dados ?? [];
  const desatualizada = (r: RiscoDoPaciente) => !r.avaliadoEm || Date.now() - new Date(r.avaliadoEm).getTime() > 7 * 86400000;
  const conta = (f: FiltroFaixa) => lista.filter((r) => (f === 'todos' ? true : f === 'sem' ? r.morse == null : r.faixa === f)).length;
  const visiveis = lista.filter((r) => (filtro === 'todos' ? true : filtro === 'sem' ? r.morse == null : r.faixa === filtro));

  return (
    <Tela>
      <CabecalhoTela
        titulo="Score de Risco"
        descricao="Risco de queda de cada internado pela Escala de Morse, mais o que o sistema já sabe sobre ele. Reavalie a cada 7 dias e depois de toda queda."
        acoes={<BotaoAtualizar carregando={carregando} aoClicar={recarregar} />}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Risco alto" valor={conta('alto')} tom={conta('alto') ? 'critico' : 'neutro'} detalhe="Morse 45 ou mais" />
        <Indicador rotulo="Risco moderado" valor={conta('moderado')} tom={conta('moderado') ? 'atencao' : 'neutro'} detalhe="25 a 44" />
        <Indicador rotulo="Nunca avaliados" valor={conta('sem')} tom={conta('sem') ? 'atencao' : 'neutro'} />
        <Indicador rotulo="Avaliação vencida" valor={lista.filter((r) => r.morse != null && desatualizada(r)).length} detalhe="mais de 7 dias" />
      </dl>
      <Painel semPadding>
        <div className="border-b border-gray-100 p-4">
          <AbasDeFiltro rotulo="Faixa de risco" valor={filtro} aoMudar={setFiltro} opcoes={[
            { valor: 'todos', rotulo: 'Todos', contagem: conta('todos') }, { valor: 'alto', rotulo: 'Alto', contagem: conta('alto') },
            { valor: 'moderado', rotulo: 'Moderado', contagem: conta('moderado') }, { valor: 'baixo', rotulo: 'Baixo', contagem: conta('baixo') },
            { valor: 'sem', rotulo: 'Sem avaliação', contagem: conta('sem') },
          ]} />
        </div>
        {!dados && carregando ? <div className="px-4"><Carregando /></div> : visiveis.length === 0 ? (
          <Vazio icone={ShieldAlert} titulo="Nenhum paciente nesta faixa" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {visiveis.map((r) => {
              const subiu = r.morse != null && r.morseAnterior != null && r.morse > r.morseAnterior;
              const caiu = r.morse != null && r.morseAnterior != null && r.morse < r.morseAnterior;
              return (
                <li key={r.pacienteId} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.3fr)_9rem_minmax(0,1.5fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{r.pacienteNome}</p>
                    <p className="text-xs text-gray-600">{r.ambienteNome ?? 'Sem quarto'}</p>
                  </div>
                  <div>
                    {r.morse != null && r.faixa ? (
                      <>
                        <p className="flex items-center gap-1.5 text-2xl text-gray-900">
                          {r.morse}
                          {subiu && <ArrowUpRight className="h-4 w-4 text-red-700" aria-label={`subiu de ${r.morseAnterior}`} />}
                          {caiu && <ArrowDownRight className="h-4 w-4 text-green-700" aria-label={`caiu de ${r.morseAnterior}`} />}
                        </p>
                        <Etiqueta classe={FAIXA_MORSE[r.faixa].classe}>{FAIXA_MORSE[r.faixa].rotulo}</Etiqueta>
                      </>
                    ) : <Etiqueta classe="bg-gray-100 text-gray-700">Sem avaliação</Etiqueta>}
                  </div>
                  <div className="min-w-0 text-xs">
                    {r.avaliadoEm && <p className={desatualizada(r) ? 'text-amber-800' : 'text-gray-600'}>Avaliado {quandoFoi(r.avaliadoEm)} por {r.avaliadoPor}{desatualizada(r) ? ' — reavaliar' : ''}</p>}
                    {r.fatores.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.fatores.map((f) => <Etiqueta key={f} classe="bg-gray-100 text-gray-700">{f}</Etiqueta>)}</div>}
                  </div>
                  <div className="flex gap-2 md:justify-end">
                    {r.avaliadoEm && <button type="button" onClick={() => setHistorico(r)} className="rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Histórico</button>}
                    {can('clinical_logs', 'create') && <button type="button" onClick={() => setAvaliando(r)} className={`${BOTAO_PRIMARIO} px-3 py-1.5`}>{r.morse == null ? 'Avaliar' : 'Reavaliar'}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Painel>
      <p className="text-xs text-gray-600">Escala de Morse (Morse, 1989), versão adaptada para o Brasil. Os fatores do sistema são contexto e não entram na soma, para não alterar a escala validada.</p>
      {avaliando && <AvaliacaoMorseForm paciente={avaliando} aoFechar={() => setAvaliando(null)} aoSalvar={(total) => { setAvaliando(null); setAviso(`Avaliação registrada: ${total} pontos.`); recarregar(); }} />}
      {historico && <HistoricoMorse paciente={historico} aoFechar={() => setHistorico(null)} />}
    </Tela>
  );
}

function AvaliacaoMorseForm({ paciente, aoFechar, aoSalvar }: { paciente: RiscoDoPaciente; aoFechar: () => void; aoSalvar: (total: number) => void }) {
  const { tenantId } = useAuth();
  const { enviando, erro, setErro, executar } = useAcao();
  const [itens, setItens] = useState<Partial<ItensMorse>>({});
  const [observacao, setObservacao] = useState('');
  const completos = ITENS_MORSE.every((i) => itens[i.chave] != null);
  const total = ITENS_MORSE.reduce((s, i) => s + (itens[i.chave] ?? 0), 0);
  const faixa = total >= 45 ? 'alto' : total >= 25 ? 'moderado' : 'baixo';

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completos) return setErro('Responda os seis itens.');
    if (!tenantId) return;
    const r = await executar(() => avaliarMorse(tenantId, paciente.pacienteId, itens as ItensMorse, observacao.trim() || undefined));
    if (r) aoSalvar(r.total);
  };

  return (
    <Janela titulo="Escala de Morse" descricao={paciente.pacienteNome} aoFechar={aoFechar} bloqueada={enviando} largura="max-w-2xl" rodape={<>
      <span className="mr-auto text-sm text-gray-700">
        Total: <strong className="text-gray-900">{total}</strong>{completos && <> · <Etiqueta classe={FAIXA_MORSE[faixa].classe}>{FAIXA_MORSE[faixa].rotulo}</Etiqueta></>}
      </span>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-morse" disabled={enviando || !completos} className={BOTAO_PRIMARIO}>{enviando ? 'Salvando…' : 'Registrar avaliação'}</button>
    </>}>
      <form id="form-morse" onSubmit={enviar} noValidate className="space-y-5">
        {ITENS_MORSE.map((item, n) => (
          <fieldset key={item.chave}>
            <legend className="mb-2 text-sm font-medium text-gray-900">{n + 1}. {item.titulo}</legend>
            <div className="space-y-1.5">
              {item.opcoes.map((o) => (
                <label key={o.pontos} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${itens[item.chave] === o.pontos ? 'border-marca bg-marca-suave text-gray-900' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name={item.chave} checked={itens[item.chave] === o.pontos} onChange={() => setItens({ ...itens, [item.chave]: o.pontos })} className="h-4 w-4 accent-[var(--marca)]" />
                    {o.texto}
                  </span>
                  <span className="shrink-0 text-xs text-gray-600">{o.pontos} pts</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="block"><span className={ROTULO}>Observação / conduta</span><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={1000} placeholder="Ex.: grades elevadas, acompanhante orientado, cadeira higiênica ao lado do leito" className={CAMPO} /></label>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

function HistoricoMorse({ paciente, aoFechar }: { paciente: RiscoDoPaciente; aoFechar: () => void }) {
  const { dados, carregando, erro } = useDados((t) => fetchAvaliacoesMorse(t, paciente.pacienteId), [paciente.pacienteId]);
  return (
    <Janela titulo="Avaliações de Morse" descricao={paciente.pacienteNome} aoFechar={aoFechar} largura="max-w-2xl">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando ? <Carregando /> : (
        <ul className="divide-y divide-gray-100">
          {(dados ?? []).map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-900"><strong>{a.total}</strong> pontos · <Etiqueta classe={FAIXA_MORSE[a.faixa].classe}>{FAIXA_MORSE[a.faixa].rotulo}</Etiqueta></p>
                <p className="text-xs text-gray-600">{dataHora(a.criadoEm)} · {a.autorNome}</p>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {ITENS_MORSE.map((i) => `${i.titulo}: ${a[i.chave]}`).join(' · ')}
              </p>
              {a.observacao && <p className="mt-1 text-sm text-gray-800">{a.observacao}</p>}
            </li>
          ))}
        </ul>
      )}
    </Janela>
  );
}

/* ============================================================================
 * Sensores IoT
 * ========================================================================== */

export function SensoresScreen(_: PropsTela) {
  const { can } = useAuth();
  const cameras = useDados((t) => fetchCameras(t), [], 30_000);
  const sensores = useDados((t) => fetchSensores(t), [], 30_000);
  const [novo, setNovo] = useState(false);
  const [criado, setCriado] = useState<(Sensor & { token: string }) | null>(null);
  const [leituras, setLeituras] = useState<Sensor | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { tenantId } = useAuth();
  const { executar, erro: erroAcao } = useAcao();
  const cams = cameras.dados ?? [];
  const sens = (sensores.dados ?? []).filter((s) => s.ativo);
  const online = cams.filter((c) => c.conectada).length + sens.filter((s) => s.online).length;
  const total = cams.length + sens.length;

  return (
    <Tela>
      <CabecalhoTela
        titulo="Sensores IoT"
        descricao="Tudo o que manda sinal para o sistema: as câmeras e qualquer outro dispositivo (cama, porta, botão de chamada) integrado pela API."
        acoes={<>
          <BotaoAtualizar carregando={cameras.carregando || sensores.carregando} aoClicar={() => { cameras.recarregar(); sensores.recarregar(); }} />
          {can('monitoring', 'edit') && <button type="button" onClick={() => setNovo(true)} className={BOTAO_PRIMARIO}><Plus className="h-4 w-4" aria-hidden="true" /> Cadastrar sensor</button>}
        </>}
      />
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {(cameras.erro || sensores.erro || erroAcao) && <Aviso tom="erro">{cameras.erro ?? sensores.erro ?? erroAcao}</Aviso>}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Dispositivos" valor={total} />
        <Indicador rotulo="Com sinal agora" valor={online} tom={online < total ? 'atencao' : 'neutro'} detalhe={total ? `${Math.round((100 * online) / total)}% do parque` : undefined} />
        <Indicador rotulo="Câmeras" valor={cams.length} detalhe={`${cams.filter((c) => c.conectada).length} conectada(s)`} />
        <Indicador rotulo="Alertas de sensores (24 h)" valor={sens.reduce((s, x) => s + x.alertas24h, 0)} />
      </dl>

      <Painel titulo="Câmeras" descricao="Conectada = mandou sinal de vida nos últimos 90 segundos." semPadding>
        {!cameras.dados && cameras.carregando ? <div className="px-4"><Carregando /></div> : cams.length === 0 ? (
          <Vazio icone={Camera} titulo="Nenhuma câmera cadastrada" texto="Cadastre em Configurações → Dispositivos." />
        ) : (
          <ul className="grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-2 xl:grid-cols-3">
            {cams.map((c) => (
              <li key={c.id} className="flex items-center gap-3 bg-white px-5 py-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.conectada ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{c.conectada ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{c.identificador}</p>
                  <p className="truncate text-xs text-gray-600">{c.ambienteNome} · {c.conectada ? 'conectada' : c.ultimoPing ? `sem sinal ${quandoFoi(c.ultimoPing)}` : 'nunca conectou'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel titulo="Outros sensores" descricao="Online = mandou leitura nos últimos 5 minutos." semPadding>
        {!sensores.dados && sensores.carregando ? <div className="px-4"><Carregando /></div> : (sensores.dados ?? []).length === 0 ? (
          <Vazio icone={Cpu} titulo="Nenhum sensor além das câmeras" texto="O MedSignal recebe leitura de qualquer dispositivo que faça uma chamada HTTP. Cadastre o sensor para gerar o token dele." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {(sensores.dados ?? []).map((s) => (
              <li key={s.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${s.ativo ? '' : 'opacity-60'}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}><Radio className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{s.nome} <span className="font-normal text-gray-600">· {TIPOS_SENSOR[s.tipo]}</span></p>
                  <p className="truncate text-xs text-gray-600">{s.ambienteNome ?? 'Sem ambiente'} · {!s.ativo ? 'desativado' : s.ultimoSinal ? `último sinal ${quandoFoi(s.ultimoSinal)}` : 'aguardando a primeira leitura'}</p>
                </div>
                {s.alertas24h > 0 && <Etiqueta classe="bg-red-100 text-red-700">{s.alertas24h} alerta(s) em 24 h</Etiqueta>}
                <button type="button" onClick={() => setLeituras(s)} className="rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Leituras</button>
                {s.ativo && can('monitoring', 'edit') && (
                  <button type="button" onClick={async () => { if (tenantId && await executar(() => desativarSensor(tenantId, s.id))) { setAviso(`Sensor ${s.nome} desativado.`); sensores.recarregar(); } }} className="rounded-lg px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Desativar</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Painel>

      {novo && <NovoSensor aoFechar={() => setNovo(false)} aoCriar={(s) => { setNovo(false); setCriado(s); sensores.recarregar(); }} />}
      {criado && <TokenDoSensor sensor={criado} aoFechar={() => setCriado(null)} />}
      {leituras && <LeiturasDoSensor sensor={leituras} aoFechar={() => setLeituras(null)} />}
    </Tela>
  );
}

function NovoSensor({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (s: Sensor & { token: string }) => void }) {
  const { tenantId } = useAuth();
  const ambientes = useDados<AmbienteResumo[]>((t) => fetchAmbientes(t));
  const { enviando, erro, setErro, executar } = useAcao();
  const [f, setF] = useState({ nome: '', tipo: 'cama' as TipoSensor, ambienteId: '' });
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.nome.trim().length < 2) return setErro('Dê um nome ao sensor (ex.: "Cama 101").');
    if (!tenantId) return;
    const r = await executar(() => cadastrarSensor(tenantId, { nome: f.nome.trim(), tipo: f.tipo, ambienteId: f.ambienteId || undefined }));
    if (r) aoCriar(r);
  };
  return (
    <Janela titulo="Cadastrar sensor" aoFechar={aoFechar} bloqueada={enviando} rodape={<>
      <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Cancelar</button>
      <button type="submit" form="form-sensor" disabled={enviando} className={BOTAO_PRIMARIO}>{enviando ? 'Cadastrando…' : 'Cadastrar e gerar token'}</button>
    </>}>
      <form id="form-sensor" onSubmit={enviar} noValidate className="space-y-4">
        <label className="block"><span className={ROTULO}>Nome *</span><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={80} placeholder="Ex.: Tapete da cama 101" className={CAMPO} /></label>
        <label className="block"><span className={ROTULO}>Tipo *</span><select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoSensor })} className={CAMPO}>{Object.entries(TIPOS_SENSOR).map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
        <label className="block"><span className={ROTULO}>Ambiente</span><select value={f.ambienteId} onChange={(e) => setF({ ...f, ambienteId: e.target.value })} className={CAMPO}><option value="">Nenhum</option>{(ambientes.dados ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Janela>
  );
}

function TokenDoSensor({ sensor, aoFechar }: { sensor: Sensor & { token: string }; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const exemplo = `curl -X POST ${API_BASE_URL || window.location.origin}/api/sensores/leitura \\\n  -H "Content-Type: application/json" \\\n  -d '{"sensorId":"${sensor.id}","token":"${sensor.token}","valor":{"ocupado":true},"alerta":false}'`;
  return (
    <Janela titulo={`Sensor "${sensor.nome}" cadastrado`} aoFechar={aoFechar} largura="max-w-2xl" rodape={<button type="button" onClick={aoFechar} className={BOTAO_PRIMARIO}>Já guardei o token</button>}>
      <div className="space-y-4">
        <Aviso tom="erro"><strong>O token aparece só agora.</strong> O sistema guarda apenas uma assinatura dele. Se perder, desative o sensor e cadastre outro.</Aviso>
        <p className="text-sm text-gray-700">Configure o dispositivo para mandar cada leitura assim (qualquer JSON em <code>valor</code>; <code>alerta: true</code> destaca a leitura na tela):</p>
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-white/90">{exemplo}</pre>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(exemplo); setCopiado(true); } catch { /* sem permissão: o texto está à vista */ } }} className={BOTAO_SECUNDARIO}>
          <Copy className="h-4 w-4" aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar exemplo'}
        </button>
      </div>
    </Janela>
  );
}

function LeiturasDoSensor({ sensor, aoFechar }: { sensor: Sensor; aoFechar: () => void }) {
  const { dados, carregando, erro } = useDados((t) => fetchLeituras(t, sensor.id), [sensor.id]);
  return (
    <Janela titulo={`Leituras de ${sensor.nome}`} descricao="As 50 mais recentes (o sistema guarda 7 dias)." aoFechar={aoFechar} largura="max-w-2xl">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando ? <Carregando /> : (dados ?? []).length === 0 ? <p className="text-sm text-gray-600">Nenhuma leitura recebida ainda.</p> : (
        <ul className="divide-y divide-gray-100">
          {(dados ?? []).map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2">
              <code className="min-w-0 break-all text-xs text-gray-800">{JSON.stringify(l.valor)}</code>
              <span className="shrink-0 text-right text-xs text-gray-600">{dataHora(l.recebidaEm)}{l.alerta && <span className="mt-0.5 block"><Etiqueta classe="bg-red-100 text-red-700">alerta</Etiqueta></span>}</span>
            </li>
          ))}
        </ul>
      )}
    </Janela>
  );
}
