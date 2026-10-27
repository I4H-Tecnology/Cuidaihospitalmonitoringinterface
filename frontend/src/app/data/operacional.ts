import { request } from './api';

/** Operacional e Monitoramento (operacional.py, risco_queda.py, sensores.py). */

const t = (tenantId: string) => `tenantId=${encodeURIComponent(tenantId)}`;
const post = <T,>(caminho: string, corpo: unknown) => request<T>(caminho, { method: 'POST', body: JSON.stringify(corpo) });

export type Turno = 'manha' | 'tarde' | 'noite';
export const TURNOS: Record<Turno, { rotulo: string; horario: string }> = {
  manha: { rotulo: 'Manhã', horario: '7h–13h' },
  tarde: { rotulo: 'Tarde', horario: '13h–19h' },
  noite: { rotulo: 'Noite', horario: '19h–7h' },
};

/** Turno do relógio local agora, para pré-selecionar formulários. */
export function turnoAtual(agora = new Date()): Turno {
  const h = agora.getHours();
  return h >= 7 && h < 13 ? 'manha' : h >= 13 && h < 19 ? 'tarde' : 'noite';
}

/* ---- checklists ------------------------------------------------------------- */

export type Frequencia = 'turno' | 'diaria' | 'semanal' | 'sob_demanda';
export const FREQUENCIAS: Record<Frequencia, string> = { turno: 'A cada turno', diaria: 'Diária', semanal: 'Semanal', sob_demanda: 'Quando precisar' };

export interface ModeloChecklist {
  id: string;
  titulo: string;
  descricao: string | null;
  itens: string[];
  frequencia: Frequencia;
  ativo: boolean;
  ultimaExecucaoEm: string | null;
  execucoes7d: number;
}

export interface ExecucaoChecklist {
  id: string;
  modeloId: string;
  titulo: string;
  turno: Turno;
  respostas: { item: string; feito: boolean; observacao: string | null }[];
  itensTotal: number;
  itensFeitos: number;
  observacao: string | null;
  usuarioNome: string;
  concluidoEm: string;
}

export type ModeloPayload = Pick<ModeloChecklist, 'titulo' | 'descricao' | 'itens' | 'frequencia' | 'ativo'>;

export const fetchModelos = (tenantId: string) => request<ModeloChecklist[]>(`/api/checklists/modelos?${t(tenantId)}`);
export const criarModelo = (tenantId: string, m: ModeloPayload) => post<ModeloChecklist>('/api/checklists/modelos', { tenantId, ...m });
export const editarModelo = (tenantId: string, id: string, m: ModeloPayload) =>
  request<ModeloChecklist>(`/api/checklists/modelos/${id}`, { method: 'PATCH', body: JSON.stringify({ tenantId, ...m }) });
export const fetchExecucoes = (tenantId: string, dias = 7) => request<ExecucaoChecklist[]>(`/api/checklists/execucoes?${t(tenantId)}&dias=${dias}`);
export const executarChecklist = (tenantId: string, e: { modeloId: string; turno: Turno; respostas: ExecucaoChecklist['respostas']; observacao?: string }) =>
  post<{ ok: boolean; itensFeitos: number; itensTotal: number }>('/api/checklists/execucoes', { tenantId, ...e });

/* ---- escalas ---------------------------------------------------------------- */

export interface Escala {
  turnos: { id: string; usuarioId: string; usuarioNome: string; data: string; turno: Turno; funcao: string | null }[];
  equipe: { id: string; nome: string; perfil: string }[];
}

export const fetchEscala = (tenantId: string, inicio: string, fim: string) => request<Escala>(`/api/escalas?${t(tenantId)}&inicio=${inicio}&fim=${fim}`);
export const escalar = (tenantId: string, e: { usuarioId: string; data: string; turno: Turno; funcao?: string }) => post<{ id: string }>('/api/escalas', { tenantId, ...e });
export const tirarDaEscala = (tenantId: string, id: string) => request<{ ok: boolean }>(`/api/escalas/${id}?${t(tenantId)}`, { method: 'DELETE' });

/* ---- movimentação ----------------------------------------------------------- */

export interface Movimentacoes {
  movimentacoes: {
    id: string; tipo: 'admissao' | 'transferencia' | 'alta' | 'transferencia_externa'; rotulo: string; dataHora: string;
    motivo: string | null; pacienteId: string; pacienteNome: string; origem: string | null; destino: string | null; usuarioNome: string | null;
  }[];
  censo: { ambienteId: string; nome: string; tipo: string; pacientes: number }[];
  semAmbiente: number;
}

export const fetchMovimentacoes = (tenantId: string, dias = 30) => request<Movimentacoes>(`/api/movimentacoes?${t(tenantId)}&dias=${dias}`);
export const transferirPaciente = (tenantId: string, pacienteId: string, ambienteId: string, motivo: string) =>
  post<{ ok: boolean }>(`/api/pacientes/${pacienteId}/transferir`, { tenantId, ambienteId, motivo });

/* ---- risco de queda (Morse) ------------------------------------------------- */

export type FaixaMorse = 'baixo' | 'moderado' | 'alto';

export interface RiscoDoPaciente {
  pacienteId: string;
  pacienteNome: string;
  ambienteNome: string | null;
  morse: number | null;
  faixa: FaixaMorse | null;
  morseAnterior: number | null;
  avaliadoEm: string | null;
  avaliadoPor: string | null;
  admissao: string;
  fatores: string[];
}

export interface AvaliacaoMorse {
  id: string;
  pacienteId: string;
  historicoQueda: number;
  diagnosticoSecundario: number;
  auxilioDeambulacao: number;
  terapiaEndovenosa: number;
  marcha: number;
  estadoMental: number;
  total: number;
  faixa: FaixaMorse;
  observacao: string | null;
  autorNome: string;
  criadoEm: string;
}

export type ItensMorse = Pick<AvaliacaoMorse, 'historicoQueda' | 'diagnosticoSecundario' | 'auxilioDeambulacao' | 'terapiaEndovenosa' | 'marcha' | 'estadoMental'>;

export const fetchPainelDeRisco = (tenantId: string) => request<RiscoDoPaciente[]>(`/api/risco-queda?${t(tenantId)}`);
export const fetchAvaliacoesMorse = (tenantId: string, pacienteId: string) => request<AvaliacaoMorse[]>(`/api/pacientes/${pacienteId}/avaliacoes-morse?${t(tenantId)}`);
export const avaliarMorse = (tenantId: string, pacienteId: string, itens: ItensMorse, observacao?: string) =>
  post<AvaliacaoMorse>('/api/avaliacoes-morse', { tenantId, pacienteId, ...itens, observacao });

export const FAIXA_MORSE: Record<FaixaMorse, { rotulo: string; classe: string; faixa: string }> = {
  baixo: { rotulo: 'Risco baixo', classe: 'bg-green-100 text-green-700', faixa: '0–24' },
  moderado: { rotulo: 'Risco moderado', classe: 'bg-amber-100 text-amber-800', faixa: '25–44' },
  alto: { rotulo: 'Risco alto', classe: 'bg-red-100 text-red-700', faixa: '45 ou mais' },
};

/** Os seis itens da Escala de Morse, com as opções e os pontos de cada uma. */
export const ITENS_MORSE: { chave: keyof ItensMorse; titulo: string; opcoes: { pontos: number; texto: string }[] }[] = [
  { chave: 'historicoQueda', titulo: 'Histórico de quedas', opcoes: [{ pontos: 0, texto: 'Não' }, { pontos: 25, texto: 'Sim (nos últimos 3 meses)' }] },
  { chave: 'diagnosticoSecundario', titulo: 'Diagnóstico secundário', opcoes: [{ pontos: 0, texto: 'Não' }, { pontos: 15, texto: 'Sim (mais de um diagnóstico)' }] },
  { chave: 'auxilioDeambulacao', titulo: 'Auxílio na deambulação', opcoes: [
    { pontos: 0, texto: 'Nenhum, acamado ou auxiliado pela enfermagem' }, { pontos: 15, texto: 'Muleta, bengala ou andador' }, { pontos: 30, texto: 'Apoia-se nos móveis para andar' },
  ] },
  { chave: 'terapiaEndovenosa', titulo: 'Terapia endovenosa / dispositivo', opcoes: [{ pontos: 0, texto: 'Não' }, { pontos: 20, texto: 'Sim (acesso venoso)' }] },
  { chave: 'marcha', titulo: 'Marcha', opcoes: [
    { pontos: 0, texto: 'Normal, acamado ou em cadeira de rodas' }, { pontos: 10, texto: 'Fraca' }, { pontos: 20, texto: 'Comprometida, cambaleante' },
  ] },
  { chave: 'estadoMental', titulo: 'Estado mental', opcoes: [{ pontos: 0, texto: 'Orientado, reconhece a própria capacidade' }, { pontos: 15, texto: 'Superestima a capacidade ou esquece limitações' }] },
];

/* ---- sensores --------------------------------------------------------------- */

export type TipoSensor = 'cama' | 'porta' | 'presenca' | 'botao_chamada' | 'ambiente' | 'outro';
export const TIPOS_SENSOR: Record<TipoSensor, string> = {
  cama: 'Sensor de cama', porta: 'Sensor de porta', presenca: 'Presença', botao_chamada: 'Botão de chamada', ambiente: 'Ambiente (temp./umidade)', outro: 'Outro',
};

export interface Sensor {
  id: string;
  nome: string;
  tipo: TipoSensor;
  ambienteId: string | null;
  ambienteNome: string | null;
  ativo: boolean;
  ultimoSinal: string | null;
  ultimaLeitura: Record<string, unknown> | null;
  online: boolean;
  alertas24h: number;
  criadoEm: string;
}

export const fetchSensores = (tenantId: string) => request<Sensor[]>(`/api/sensores?${t(tenantId)}`);
export const cadastrarSensor = (tenantId: string, s: { nome: string; tipo: TipoSensor; ambienteId?: string }) =>
  post<Sensor & { token: string }>('/api/sensores', { tenantId, ...s });
export const desativarSensor = (tenantId: string, id: string) => request<{ ok: boolean }>(`/api/sensores/${id}/desativar?${t(tenantId)}`, { method: 'POST' });
export const fetchLeituras = (tenantId: string, id: string) =>
  request<{ valor: Record<string, unknown>; alerta: boolean; recebidaEm: string }[]>(`/api/sensores/${id}/leituras?${t(tenantId)}`);
