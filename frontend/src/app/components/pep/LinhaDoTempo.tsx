import { AlertTriangle, CheckCircle, FileText, LogIn, LogOut, MinusCircle, XCircle } from 'lucide-react';
import type { EvolucaoResumo, OcorrenciaResumo, PacienteResumo } from '../../data/api';
import { ROTULO_STATUS, rotuloDoEvento } from '../../data/ocorrencias';
import { quandoFoi } from '../../data/tempo';

/**
 * Linha do tempo clínica: montagem e renderização compartilhadas entre a aba
 * do prontuário (um paciente) e a tela da clínica (todos os pacientes).
 *
 * Não é dado novo: junta ocorrências, evoluções e os marcos de admissão e
 * alta que o cadastro já carrega, ordenados do mais recente ao mais antigo.
 */

export type EventoDaLinha =
  | { tipo: 'ocorrencia'; quando: string; pacienteNome: string | null; dado: OcorrenciaResumo }
  | { tipo: 'evolucao'; quando: string; pacienteNome: string | null; dado: EvolucaoResumo }
  | { tipo: 'admissao'; quando: string; pacienteNome: string | null }
  | { tipo: 'alta'; quando: string; pacienteNome: string | null; status: string };

type MarcosDoPaciente = Pick<PacienteResumo, 'nome' | 'dataAdmissao' | 'dataAlta' | 'status'>;

export function marcosDe(paciente: MarcosDoPaciente): EventoDaLinha[] {
  // Datas de admissão e alta são só dia; ancoradas ao início e fim do dia local.
  const eventos: EventoDaLinha[] = [
    { tipo: 'admissao', quando: `${paciente.dataAdmissao}T00:00:00`, pacienteNome: paciente.nome },
  ];
  if (paciente.dataAlta && paciente.status !== 'internado') {
    eventos.push({ tipo: 'alta', quando: `${paciente.dataAlta}T23:59:59`, pacienteNome: paciente.nome, status: paciente.status });
  }
  return eventos;
}

export function montarLinhaDoTempo(
  pacientes: MarcosDoPaciente[],
  ocorrencias: OcorrenciaResumo[],
  evolucoes: EvolucaoResumo[],
): EventoDaLinha[] {
  const eventos: EventoDaLinha[] = [
    ...ocorrencias.map((o): EventoDaLinha => ({ tipo: 'ocorrencia', quando: o.dataHora, pacienteNome: o.pacienteNome ?? null, dado: o })),
    ...evolucoes.map((e): EventoDaLinha => ({ tipo: 'evolucao', quando: e.dataHora, pacienteNome: e.pacienteNome ?? null, dado: e })),
    ...pacientes.flatMap(marcosDe),
  ];
  return eventos.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
}

const OCORRENCIA = {
  pendente: { icone: AlertTriangle, cor: 'text-red-600', barra: 'border-l-red-500', chip: 'bg-red-100 text-red-700' },
  em_atendimento: { icone: AlertTriangle, cor: 'text-blue-600', barra: 'border-l-blue-500', chip: 'bg-blue-100 text-blue-700' },
  queda_confirmada: { icone: XCircle, cor: 'text-red-700', barra: 'border-l-red-700', chip: 'bg-red-100 text-red-800' },
  falso_positivo: { icone: MinusCircle, cor: 'text-gray-500', barra: 'border-l-gray-400', chip: 'bg-gray-100 text-gray-600' },
  encerrada: { icone: CheckCircle, cor: 'text-green-600', barra: 'border-l-green-500', chip: 'bg-green-100 text-green-700' },
} as const;

function dataBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function dataSoDia(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function LinhaDoTempoLista({
  eventos, mostrarPaciente = false, aoAbrirPaciente,
}: {
  eventos: EventoDaLinha[];
  /** Na tela da clínica cada item diz de quem é; na aba do paciente, não precisa. */
  mostrarPaciente?: boolean;
  aoAbrirPaciente?: (nome: string) => void;
}) {
  const Nome = ({ nome }: { nome: string | null }) => {
    if (!mostrarPaciente) return null;
    if (!nome) return <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">sem paciente vinculado</span>;
    return aoAbrirPaciente ? (
      <button type="button" onClick={() => aoAbrirPaciente(nome)} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200">
        {nome}
      </button>
    ) : (
      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{nome}</span>
    );
  };

  return (
    <ol className="relative space-y-3 border-l-2 border-gray-200 pl-6">
      {eventos.map((ev, i) => {
        if (ev.tipo === 'admissao' || ev.tipo === 'alta') {
          const Icone = ev.tipo === 'admissao' ? LogIn : LogOut;
          const texto = ev.tipo === 'admissao'
            ? `Admissão em ${dataSoDia(ev.quando)}`
            : `${ev.status === 'transferido' ? 'Transferência' : 'Alta'} em ${dataSoDia(ev.quando)}`;
          return (
            <li key={`${ev.tipo}-${ev.pacienteNome}-${i}`} className="relative">
              <span className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-300 bg-white">
                <Icone className="h-3 w-3 text-gray-400" />
              </span>
              <p className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
                {texto} <Nome nome={ev.pacienteNome} />
              </p>
            </li>
          );
        }
        if (ev.tipo === 'evolucao') {
          return (
            <li key={ev.dado.id} className="relative">
              <span className="absolute -left-[31px] top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#E8F4F8]">
                <FileText className="h-3 w-3 text-[#0A7EA4]" />
              </span>
              <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="rounded bg-[#E8F4F8] px-2 py-0.5 text-[#0A7EA4]">Evolução</span>
                  <Nome nome={ev.pacienteNome} />
                  <span>{ev.dado.autorNome}</span>
                  <span title={dataBR(ev.quando)}>{quandoFoi(ev.quando)}</span>
                </p>
                <p className="whitespace-pre-wrap text-sm text-gray-800">{ev.dado.texto}</p>
              </div>
            </li>
          );
        }
        const o = ev.dado;
        const a = OCORRENCIA[o.status as keyof typeof OCORRENCIA] ?? OCORRENCIA.encerrada;
        const Icone = a.icone;
        return (
          <li key={o.id} className="relative">
            <span className="absolute -left-[31px] top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white">
              <Icone className={`h-4 w-4 ${a.cor}`} />
            </span>
            <div className={`rounded-lg border border-gray-200 ${a.barra} border-l-4 bg-white p-3 shadow-sm`}>
              <p className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-800">{rotuloDoEvento(o.tipoEvento)}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${a.chip}`}>{ROTULO_STATUS[o.status] ?? o.status}</span>
                <Nome nome={ev.pacienteNome} />
              </p>
              <p className="text-xs text-gray-500">
                {dataBR(o.dataHora)}{o.ambienteNome && ` · ${o.ambienteNome}`}{o.cameraIdentificador && ` · ${o.cameraIdentificador}`}
              </p>
              {o.observacao && <p className="mt-2 rounded bg-gray-50 px-3 py-2 text-sm text-gray-600">{o.observacao}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
