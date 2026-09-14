import { AlertTriangle, BedDouble, CalendarDays, CheckCircle, Clock, Info, Stethoscope, User } from 'lucide-react';
import { descreverAmbiente } from '../../../data/api';
import type { OcorrenciaResumo, PacienteResumo } from '../../../data/api';

/**
 * Visao geral do paciente.
 *
 * Antes esta aba mostrava cinco sinais vitais e quatro eventos clinicos, todos
 * com valor fixo no codigo. Nenhum deles existe no modelo de dados: a entidade
 * Paciente do DER tem nome, status, datas e o vinculo com o ambiente -- e nada
 * mais. Numero clinico inventado numa tela de prontuario e pior que numero
 * ausente, porque parece medicao.
 *
 * O que sobrou e o que o banco sustenta de verdade: o cadastro e o historico
 * de quedas daquele paciente (RF21, RF22).
 */

interface Props {
  paciente: PacienteResumo;
  ocorrencias: OcorrenciaResumo[];
}

const ROTULO_EVENTO: Record<string, string> = {
  queda: 'Queda',
  permanencia_solo: 'Permanência no chão',
  perda_verticalidade: 'Perda de verticalidade',
  ausencia_prolongada: 'Ausência prolongada',
};

const ROTULO_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  em_atendimento: 'Em atendimento',
  encerrada: 'Encerrada',
  falso_positivo: 'Falso positivo',
  queda_confirmada: 'Queda confirmada',
};

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function diasInternado(admissao: string): number {
  const ms = Date.now() - new Date(`${admissao}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function OverviewTab({ paciente, ocorrencias }: Props) {
  const abertas = ocorrencias.filter(
    (o) => o.status === 'pendente' || o.status === 'em_atendimento'
  );
  const confirmadas = ocorrencias.filter((o) => o.status === 'queda_confirmada');
  const falsos = ocorrencias.filter((o) => o.status === 'falso_positivo');
  const recentes = ocorrencias.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
          <h2 className="text-gray-800 mb-4">Cadastro</h2>
          <dl className="space-y-3 text-sm">
            <Linha icone={<User className="w-4 h-4" />} rotulo="Nome" valor={paciente.nome} />
            {paciente.idade != null && (
              <Linha
                icone={<CalendarDays className="w-4 h-4" />}
                rotulo="Idade"
                valor={`${paciente.idade} anos${
                  paciente.dataNascimento ? ` · ${dataBR(paciente.dataNascimento)}` : ''
                }`}
              />
            )}
            <Linha
              icone={<BedDouble className="w-4 h-4" />}
              rotulo="Ambiente monitorado"
              valor={descreverAmbiente(paciente.ambienteNome, paciente.ambienteTipo)}
            />
            <Linha
              icone={<Clock className="w-4 h-4" />}
              rotulo="Internação"
              valor={`${dataBR(paciente.dataAdmissao)} · ${diasInternado(paciente.dataAdmissao)} dias`}
            />
            <Linha
              icone={<CheckCircle className="w-4 h-4" />}
              rotulo="Situação cadastral"
              valor={paciente.status}
            />
            <Linha
              icone={<Stethoscope className="w-4 h-4" />}
              rotulo="Médico responsável"
              valor={paciente.medicoResponsavel || 'Não informado'}
            />
          </dl>

          <div className="mt-4">
            <p className="mb-1 text-xs text-gray-500">Histórico médico</p>
            {paciente.historicoMedico ? (
              <p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{paciente.historicoMedico}</p>
            ) : (
              <p className="text-sm text-gray-400">Não informado. Use "Editar paciente" para registrar.</p>
            )}
          </div>

          {/* Diz o que a tela NAO tem, em vez de preencher com valor fictício.
              Quem abre um prontuário precisa saber a diferença entre "normal"
              e "não medido". */}
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-600">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Alergias, medicações, evoluções e acompanhantes estão nas abas ao lado.
              Sinais vitais e exames não existem no sistema; nada aqui é estimado.
            </span>
          </p>
        </section>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Indicador rotulo="Ocorrências" valor={ocorrencias.length} cor="text-gray-800" />
            <Indicador rotulo="Em aberto" valor={abertas.length} cor="text-red-600" />
            <Indicador rotulo="Quedas confirmadas" valor={confirmadas.length} cor="text-red-700" />
            <Indicador rotulo="Falsos positivos" valor={falsos.length} cor="text-gray-500" />
          </div>

          <section className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <header className="px-5 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-gray-800">Ocorrências recentes</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Detectadas pelo serviço de visão neste ambiente
              </p>
            </header>

            {recentes.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <CheckCircle className="mx-auto mb-2 h-7 w-7 text-green-500" />
                <p className="text-gray-700">Nenhuma ocorrência registrada.</p>
                <p className="mt-1 text-sm text-gray-500">
                  Este paciente não teve queda detectada desde a internação.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentes.map((o) => (
                  <li key={o.id} className="flex items-start gap-3 px-5 py-3">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        o.status === 'queda_confirmada' ? 'text-red-600' : 'text-gray-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-gray-800">
                          {ROTULO_EVENTO[o.tipoEvento] ?? o.tipoEvento}
                        </span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {ROTULO_STATUS[o.status] ?? o.status}
                        </span>
                      </div>
                      {o.observacao && (
                        <p className="mt-0.5 text-sm text-gray-600">{o.observacao}</p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-500">
                        {quando(o.dataHora)}
                        {o.cameraIdentificador && ` · ${o.cameraIdentificador}`}
                        {o.confianca != null && ` · escore ${o.confianca.toFixed(2)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Linha({
  icone, rotulo, valor,
}: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-gray-400">{icone}</span>
      <div className="min-w-0">
        <dt className="text-xs text-gray-500">{rotulo}</dt>
        <dd className="text-gray-800">{valor}</dd>
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <p className={`text-2xl ${cor}`}>{valor}</p>
      <p className="text-xs text-gray-500">{rotulo}</p>
    </div>
  );
}
