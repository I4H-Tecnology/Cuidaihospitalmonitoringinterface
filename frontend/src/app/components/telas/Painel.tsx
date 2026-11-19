import { useEffect, useState } from 'react';
import {
  AlarmClock, ArrowRight, BedDouble, Bell, Camera, CheckCircle2, ClipboardCheck, HeartHandshake, MessageCircle, ShieldAlert, ShoppingCart,
  Siren, Stethoscope, Timer,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { darCiencia, fetchCameras, fetchOcorrencias, iniciarAtendimento, request, type OcorrenciaResumo } from '../../data/api';
import { formatarDuracaoCurta } from '../../data/analytics';
import { fetchLembretes } from '../../data/crm';
import { getModuleForScreen, type Screen } from '../../data/rbac';
import { rotuloDoEvento } from '../../data/ocorrencias';
import { useAcao, useDados } from '../../data/useDados';
import type { PropsTela } from '../../telas';
import { Aviso, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, BotaoAtualizar, CabecalhoTela, Carregando, Etiqueta, Painel, Tela, Vazio } from '../settings/ui';

/** Dashboard: Indicadores-chave e Alertas prioritários. */

interface IndicadoresChave {
  monitoramento?: { ocorrencias24h: number; ocorrencias7d: number; abertas: number; quedasConfirmadas7d: number; cienciaMediana7d: number | null; camerasConectadas: number; camerasTotal: number };
  pacientes?: { internados: number; quartosOcupados: number; quartosTotal: number; admissoes7d: number };
  risco?: { morseAlto: number; semAvaliacao: number };
  relacionamento?: { lembretesAtrasados: number; mensagensNaoLidas: number; agendaHoje: number; nps90: number | null; respostasNps90: number };
  operacao?: { checklistsHoje: number; escaladosHoje: number };
  administracao?: { pedidosAguardando?: number; contratosVencendo?: number };
}

/** "1 admissão", "3 admissões", "nenhuma admissão" fica para quem chama. */
const contar = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

const fetchIndicadoresChave = (tenantId: string) =>
  request<IndicadoresChave>(`/api/dashboard/indicadores-chave?tenantId=${encodeURIComponent(tenantId)}`);

/* ============================================================================
 * Indicadores-chave
 * ========================================================================== */

interface Bloco {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  tela?: Screen;
  tom?: 'neutro' | 'atencao' | 'critico' | 'bom';
  Icone: typeof Bell;
}

export function IndicadoresChaveScreen({ onNavigate }: PropsTela) {
  const { can } = useAuth();
  const { dados: d, carregando, erro, recarregar } = useDados((t) => fetchIndicadoresChave(t), [], 60_000);
  const ir = (tela?: Screen) => (tela && can(getModuleForScreen(tela), 'view') ? () => onNavigate(tela) : undefined);

  const grupos: { titulo: string; blocos: Bloco[] }[] = [];
  if (d?.monitoramento) {
    const m = d.monitoramento;
    grupos.push({ titulo: 'Monitoramento', blocos: [
      { rotulo: 'Ocorrências abertas', valor: m.abertas, tela: 'alertas-prioritarios', tom: m.abertas ? 'critico' : 'bom', Icone: Siren, detalhe: m.abertas ? 'precisam de alguém agora' : 'nenhuma pendente' },
      { rotulo: 'Ocorrências em 24 h', valor: m.ocorrencias24h, detalhe: `${contar(m.ocorrencias7d, 'ocorrência', 'ocorrências')} em 7 dias`, tela: 'linha-eventos', Icone: Bell },
      { rotulo: 'Quedas confirmadas', valor: m.quedasConfirmadas7d, detalhe: 'últimos 7 dias', tela: 'incidentes', tom: m.quedasConfirmadas7d ? 'atencao' : 'neutro', Icone: ShieldAlert },
      { rotulo: 'Tempo até a ciência', valor: formatarDuracaoCurta(m.cienciaMediana7d), detalhe: 'mediana, últimos 7 dias', tela: 'kpis', Icone: Timer },
      { rotulo: 'Câmeras com sinal', valor: `${m.camerasConectadas}/${m.camerasTotal}`, tela: 'sensores', tom: m.camerasConectadas < m.camerasTotal ? 'atencao' : 'bom', Icone: Camera },
    ] });
  }
  if (d?.pacientes || d?.risco) {
    const blocos: Bloco[] = [];
    if (d.pacientes) {
      blocos.push({ rotulo: 'Internados', valor: d.pacientes.internados, detalhe: `${contar(d.pacientes.admissoes7d, 'admissão', 'admissões')} em 7 dias`, tela: 'internacoes', Icone: BedDouble });
      blocos.push({ rotulo: 'Ocupação dos quartos', valor: d.pacientes.quartosTotal ? `${Math.round((100 * d.pacientes.quartosOcupados) / d.pacientes.quartosTotal)}%` : '—', detalhe: `${d.pacientes.quartosOcupados} de ${d.pacientes.quartosTotal}`, tela: 'fluxo-paciente', Icone: BedDouble });
    }
    if (d.risco) {
      blocos.push({ rotulo: 'Risco alto de queda', valor: d.risco.morseAlto, detalhe: 'Morse 45 ou mais', tela: 'score-risco', tom: d.risco.morseAlto ? 'atencao' : 'neutro', Icone: ShieldAlert });
      blocos.push({ rotulo: 'Sem avaliação de risco', valor: d.risco.semAvaliacao, tela: 'score-risco', tom: d.risco.semAvaliacao ? 'atencao' : 'bom', Icone: Stethoscope });
    }
    grupos.push({ titulo: 'Pacientes', blocos });
  }
  if (d?.relacionamento || d?.operacao) {
    const blocos: Bloco[] = [];
    if (d.relacionamento) {
      const r = d.relacionamento;
      blocos.push({ rotulo: 'Mensagens não lidas', detalhe: 'da família, pelo portal', valor: r.mensagensNaoLidas, tela: 'mensagens', tom: r.mensagensNaoLidas ? 'atencao' : 'bom', Icone: MessageCircle });
      blocos.push({ rotulo: 'Lembretes atrasados', valor: r.lembretesAtrasados, tela: 'lembretes', tom: r.lembretesAtrasados ? 'critico' : 'bom', Icone: AlarmClock });
      blocos.push({ rotulo: 'Compromissos hoje', valor: r.agendaHoje, tela: 'agenda', Icone: CheckCircle2 });
      blocos.push({ rotulo: 'NPS (90 dias)', valor: r.nps90 ?? '—', detalhe: r.respostasNps90 ? contar(r.respostasNps90, 'resposta', 'respostas') : 'nenhuma resposta ainda', tela: 'nps', tom: r.nps90 == null ? 'neutro' : r.nps90 >= 50 ? 'bom' : r.nps90 < 0 ? 'atencao' : 'neutro', Icone: HeartHandshake });
    }
    if (d.operacao) {
      blocos.push({ rotulo: 'Checklists hoje', valor: d.operacao.checklistsHoje, tela: 'checklists', Icone: ClipboardCheck });
      blocos.push({ rotulo: 'Escalados hoje', valor: d.operacao.escaladosHoje, tela: 'escalas', tom: d.operacao.escaladosHoje ? 'neutro' : 'atencao', Icone: Stethoscope });
    }
    grupos.push({ titulo: 'Equipe e família', blocos });
  }
  if (d?.administracao && Object.keys(d.administracao).length) {
    const a = d.administracao;
    const blocos: Bloco[] = [];
    if (a.pedidosAguardando != null) blocos.push({ rotulo: 'Pedidos aguardando aprovação', valor: a.pedidosAguardando, tela: 'compras', tom: a.pedidosAguardando ? 'atencao' : 'neutro', Icone: ShoppingCart });
    if (a.contratosVencendo != null) blocos.push({ rotulo: 'Contratos para decidir', valor: a.contratosVencendo, tela: 'contratos', tom: a.contratosVencendo ? 'atencao' : 'neutro', Icone: ClipboardCheck });
    grupos.push({ titulo: 'Administração', blocos });
  }

  const corDoTom = { critico: 'border-red-200', atencao: 'border-amber-200', bom: 'border-green-200', neutro: 'border-gray-200' } as const;

  return (
    <Tela>
      <CabecalhoTela titulo="Indicadores-chave" descricao="Um número de cada área, atualizado a cada minuto. Toque em um para ir onde se age sobre ele." acoes={<BotaoAtualizar carregando={carregando} aoClicar={recarregar} />} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!d && carregando && <Carregando />}
      {d && grupos.length === 0 && <Painel><Vazio icone={Bell} titulo="Nenhum indicador para o seu perfil" /></Painel>}
      {grupos.map((g) => (
        <section key={g.titulo}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">{g.titulo}</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-4">
            {g.blocos.map((b) => {
              const acao = ir(b.tela);
              return (
                <li key={b.rotulo}>
                  <button type="button" onClick={acao} disabled={!acao}
                    className={`flex h-full w-full flex-col rounded-xl border bg-white p-4 text-left transition-colors enabled:hover:bg-gray-50 ${corDoTom[b.tom ?? 'neutro']}`}>
                    <span className="flex items-center justify-between gap-2 text-sm text-gray-600">{b.rotulo}<b.Icone className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" /></span>
                    <span className="mt-2 text-2xl text-gray-900">{b.valor}</span>
                    {b.detalhe && <span className="mt-0.5 text-xs text-gray-600">{b.detalhe}</span>}
                    {acao && <span className="mt-auto flex items-center gap-1 pt-2 text-xs text-marca-texto">Ver <ArrowRight className="h-3 w-3" aria-hidden="true" /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Tela>
  );
}

/* ============================================================================
 * Alertas prioritários
 * ========================================================================== */

/** Ordem de prioridade: sem ciência antes de em atendimento; dentro de cada um, quem espera há mais tempo. */
function prioridade(o: OcorrenciaResumo): number {
  const espera = (Date.now() - new Date(o.dataHora).getTime()) / 60000;
  return (o.status === 'pendente' ? 100000 : 0) + (o.tipoEvento === 'queda' ? 10000 : 0) + espera;
}

export function AlertasPrioritariosScreen({ onNavigate }: PropsTela) {
  const { tenantId, can } = useAuth();
  const ocorrencias = useDados((t) => fetchOcorrencias(t, 100), [], 10_000);
  const cameras = useDados((t) => (can('monitoring', 'view') ? fetchCameras(t) : Promise.resolve([])), [], 60_000);
  const lembretes = useDados((t) => (can('crm', 'view') ? fetchLembretes(t) : Promise.resolve([])), [], 60_000);
  const { enviando, erro, executar } = useAcao();
  const [, setRelogio] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setRelogio((n) => n + 1), 30_000); return () => window.clearInterval(id); }, []);

  const abertas = (ocorrencias.dados ?? []).filter((o) => o.status === 'pendente' || o.status === 'em_atendimento').sort((a, b) => prioridade(b) - prioridade(a));
  const semSinal = (cameras.dados ?? []).filter((c) => !c.conectada);
  const atrasados = (lembretes.dados ?? []).filter((l) => l.ativo && new Date(l.proximaEm) < new Date());
  const podeAgir = can('alerts', 'edit');

  const agir = async (fazer: () => Promise<unknown>) => { if (await executar(fazer)) void ocorrencias.recarregar(); };

  return (
    <Tela>
      <CabecalhoTela
        titulo="Alertas prioritários"
        descricao="O que precisa de alguém agora, do mais urgente para o menos. Atualiza a cada 10 segundos."
        acoes={<BotaoAtualizar carregando={ocorrencias.carregando} aoClicar={ocorrencias.recarregar} />}
      />
      {(ocorrencias.erro || erro) && <Aviso tom="erro">{ocorrencias.erro ?? erro}</Aviso>}
      <Painel titulo={`Ocorrências abertas (${abertas.length})`} semPadding>
        {!ocorrencias.dados && ocorrencias.carregando ? <div className="px-4"><Carregando /></div> : abertas.length === 0 ? (
          <Vazio icone={CheckCircle2} titulo="Nenhuma ocorrência aberta" texto="Quando uma câmera detectar algo, aparece aqui no topo, junto com o aviso na tela." />
        ) : (
          <ol className="divide-y divide-gray-100">
            {abertas.map((o, i) => {
              const minutos = Math.floor((Date.now() - new Date(o.dataHora).getTime()) / 60000);
              const urgente = o.status === 'pendente' && minutos >= 5;
              return (
                <li key={o.id} className={`flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center ${urgente ? 'bg-red-50' : ''}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${o.status === 'pendente' ? 'bg-red-600 text-white' : 'bg-blue-100 text-blue-700'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{rotuloDoEvento(o.tipoEvento)} · {o.pacienteNome ?? 'Paciente não vinculado'} · {o.ambienteNome}</p>
                    <p className={`text-sm ${urgente ? 'font-medium text-red-700' : 'text-gray-700'}`}>
                      {o.status === 'pendente' ? 'Ninguém deu ciência' : 'Em atendimento'} · há {minutos < 1 ? 'menos de 1 min' : `${minutos} min`}
                      {urgente && ' — acima de 5 minutos'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Etiqueta classe={o.status === 'pendente' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}>{o.status === 'pendente' ? 'Aguardando ciência' : 'Em atendimento'}</Etiqueta>
                    {podeAgir && tenantId && o.status === 'pendente' && !o.alertaStatus?.includes('ciente') && (
                      <button type="button" disabled={enviando} onClick={() => agir(() => darCiencia(tenantId, o.id))} className={`${BOTAO_SECUNDARIO} px-3 py-1.5`}>Dar ciência</button>
                    )}
                    {podeAgir && tenantId && o.status === 'pendente' && (
                      <button type="button" disabled={enviando} onClick={() => agir(() => iniciarAtendimento(tenantId, o.id))} className={`${BOTAO_PRIMARIO} px-3 py-1.5`}>Vou atender</button>
                    )}
                    {o.status === 'em_atendimento' && can('alerts', 'view') && (
                      <button type="button" onClick={() => onNavigate('alerts')} className={`${BOTAO_SECUNDARIO} px-3 py-1.5`}>Encerrar na central</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Painel>
      {(semSinal.length > 0 || atrasados.length > 0) && (
        <Painel titulo="Outras pendências" semPadding>
          <ul className="divide-y divide-gray-100">
            {semSinal.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <Camera className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <p className="flex-1 text-sm text-gray-800">Câmera <strong className="font-medium text-gray-900">{c.identificador}</strong> ({c.ambienteNome}) sem sinal — quedas ali não são detectadas.</p>
                <button type="button" onClick={() => onNavigate('sensores')} className="text-sm text-marca-texto hover:underline">Ver</button>
              </li>
            ))}
            {atrasados.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                <AlarmClock className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <p className="flex-1 text-sm text-gray-800">Lembrete atrasado: <strong className="font-medium text-gray-900">{l.titulo}</strong>{l.pacienteNome && ` (${l.pacienteNome})`}</p>
                <button type="button" onClick={() => onNavigate('lembretes')} className="text-sm text-marca-texto hover:underline">Ver</button>
              </li>
            ))}
          </ul>
        </Painel>
      )}
    </Tela>
  );
}
