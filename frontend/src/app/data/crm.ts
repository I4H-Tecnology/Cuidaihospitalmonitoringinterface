import { request } from './api';

/** CRM Saúde (backend/app/rotas/crm.py). */

const t = (tenantId: string) => `tenantId=${encodeURIComponent(tenantId)}`;
const post = <T,>(caminho: string, corpo: unknown) => request<T>(caminho, { method: 'POST', body: JSON.stringify(corpo) });
const patch = <T,>(caminho: string, corpo: unknown) => request<T>(caminho, { method: 'PATCH', body: JSON.stringify(corpo) });

/* ---- agenda ----------------------------------------------------------------- */

export type TipoAgenda = 'consulta' | 'exame' | 'terapia' | 'procedimento' | 'visita' | 'outro';
export type StatusAgenda = 'agendado' | 'realizado' | 'cancelado' | 'faltou';

export interface Agendamento {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  ambienteNome: string | null;
  tipo: TipoAgenda;
  titulo: string;
  inicio: string;
  fim: string | null;
  local: string | null;
  profissional: string | null;
  status: StatusAgenda;
  observacao: string | null;
  criadoPorNome: string | null;
}

export const fetchAgenda = (tenantId: string, inicio: string, fim: string, pacienteId?: string) =>
  request<Agendamento[]>(`/api/agenda?${t(tenantId)}&inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}${pacienteId ? `&pacienteId=${pacienteId}` : ''}`);
export const criarAgendamento = (tenantId: string, a: Omit<Agendamento, 'id' | 'pacienteNome' | 'ambienteNome' | 'status' | 'criadoPorNome'>) =>
  post<Agendamento>('/api/agenda', { tenantId, ...a });
export const editarAgendamento = (tenantId: string, id: string, mudanca: Partial<Pick<Agendamento, 'status' | 'titulo' | 'inicio' | 'fim' | 'local' | 'profissional' | 'observacao'>>) =>
  patch<Agendamento>(`/api/agenda/${id}`, { tenantId, ...mudanca });

export const TIPOS_AGENDA: Record<TipoAgenda, string> = {
  consulta: 'Consulta', exame: 'Exame', terapia: 'Terapia', procedimento: 'Procedimento', visita: 'Visita', outro: 'Outro',
};
export const STATUS_AGENDA: Record<StatusAgenda, { rotulo: string; classe: string }> = {
  agendado: { rotulo: 'Agendado', classe: 'bg-blue-100 text-blue-700' },
  realizado: { rotulo: 'Realizado', classe: 'bg-green-100 text-green-700' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-gray-100 text-gray-700' },
  faltou: { rotulo: 'Não compareceu', classe: 'bg-amber-100 text-amber-800' },
};

/* ---- lembretes -------------------------------------------------------------- */

export type Recorrencia = 'nenhuma' | 'diaria' | 'semanal' | 'mensal';

export interface Lembrete {
  id: string;
  titulo: string;
  descricao: string | null;
  pacienteId: string | null;
  pacienteNome: string | null;
  proximaEm: string;
  recorrencia: Recorrencia;
  ativo: boolean;
  criadoPorNome: string | null;
  ultimaConclusaoEm: string | null;
  ultimaConclusaoPor: string | null;
}

export const fetchLembretes = (tenantId: string) => request<Lembrete[]>(`/api/lembretes?${t(tenantId)}`);
export const criarLembrete = (tenantId: string, l: { titulo: string; descricao?: string; pacienteId?: string; proximaEm: string; recorrencia: Recorrencia }) =>
  post<Lembrete>('/api/lembretes', { tenantId, ...l });
export const concluirLembrete = (tenantId: string, id: string, observacao?: string) =>
  post<Lembrete>(`/api/lembretes/${id}/concluir`, { tenantId, observacao });
export const desativarLembrete = (tenantId: string, id: string) =>
  request<{ ok: boolean }>(`/api/lembretes/${id}/desativar?${t(tenantId)}`, { method: 'POST' });

export const RECORRENCIAS: Record<Recorrencia, string> = { nenhuma: 'Uma vez', diaria: 'Todo dia', semanal: 'Toda semana', mensal: 'Todo mês' };

/* ---- mensagens -------------------------------------------------------------- */

export interface Conversa {
  pacienteId: string;
  pacienteNome: string;
  ambienteNome: string | null;
  acompanhantesAtivos: number;
  naoLidas: number;
  ultimaTexto: string | null;
  ultimaAutor: 'equipe' | 'familia' | null;
  ultimaEm: string | null;
}

export interface Mensagem {
  id: string;
  autor: 'equipe' | 'familia';
  autorNome: string | null;
  texto: string;
  lidaEm: string | null;
  criadoEm: string;
}

export const fetchConversas = (tenantId: string) => request<Conversa[]>(`/api/mensagens/conversas?${t(tenantId)}`);
export const fetchMensagens = (tenantId: string, pacienteId: string) => request<Mensagem[]>(`/api/pacientes/${pacienteId}/mensagens?${t(tenantId)}`);
export const enviarMensagem = (tenantId: string, pacienteId: string, texto: string) => post<Mensagem>('/api/mensagens', { tenantId, pacienteId, texto });

/* ---- respostas prontas ------------------------------------------------------ */

export interface RespostaPronta {
  id: string;
  pergunta: string;
  palavrasChave: string[];
  resposta: string;
  ativa: boolean;
  usos: number;
  atualizadoEm: string;
}

export interface PerguntaRecebida {
  id: string;
  texto: string;
  criadoEm: string;
  respondidaCom: string | null;
}

export type RespostaPayload = Pick<RespostaPronta, 'pergunta' | 'palavrasChave' | 'resposta' | 'ativa'>;

export const fetchRespostas = (tenantId: string) => request<RespostaPronta[]>(`/api/chatbot/respostas?${t(tenantId)}`);
export const criarResposta = (tenantId: string, r: RespostaPayload) => post<RespostaPronta>('/api/chatbot/respostas', { tenantId, ...r });
export const editarResposta = (tenantId: string, id: string, r: RespostaPayload) => patch<RespostaPronta>(`/api/chatbot/respostas/${id}`, { tenantId, ...r });
export const fetchPerguntas = (tenantId: string) => request<PerguntaRecebida[]>(`/api/chatbot/perguntas?${t(tenantId)}`);
export const testarPergunta = (tenantId: string, texto: string) =>
  post<{ resposta: string | null; pergunta: string | null }>('/api/chatbot/testar', { tenantId, texto });

/* ---- exames ----------------------------------------------------------------- */

export type CanalExame = 'presencial' | 'telefone' | 'portal' | 'email' | 'outro';

export interface ComunicacaoExame {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  exame: string;
  dataExame: string;
  resultado: string;
  destinatario: string;
  canal: CanalExame;
  comunicadoEm: string;
  cienciaEm: string | null;
  observacao: string | null;
  autorNome: string;
}

export const fetchExames = (tenantId: string) => request<ComunicacaoExame[]>(`/api/exames?${t(tenantId)}`);
export const comunicarExame = (tenantId: string, e: { pacienteId: string; exame: string; dataExame: string; resultado: string; destinatario: string; canal: CanalExame; observacao?: string }) =>
  post<ComunicacaoExame>('/api/exames', { tenantId, ...e });

export const CANAIS: Record<CanalExame, string> = {
  presencial: 'Presencial', telefone: 'Telefone', portal: 'Portal da família', email: 'E-mail', outro: 'Outro',
};

/* ---- satisfação ------------------------------------------------------------- */

export interface ResumoNps {
  total: number;
  promotores: number;
  neutros: number;
  detratores: number;
  nps: number | null;
}

export interface Satisfacao extends ResumoNps {
  distribuicao: number[];
  porMes: ({ mes: string } & ResumoNps)[];
  respostas: {
    id: string; nota: number; comentario: string | null; canal: string;
    pacienteNome: string | null; acompanhanteNome: string | null; registradoPorNome: string | null; criadoEm: string;
  }[];
}

export const fetchSatisfacao = (tenantId: string, dias: number) => request<Satisfacao>(`/api/satisfacao?${t(tenantId)}&dias=${dias}`);
export const registrarSatisfacao = (tenantId: string, r: { nota: number; comentario?: string; canal: 'telefone' | 'presencial' | 'formulario'; pacienteId?: string }) =>
  post<{ ok: boolean }>('/api/satisfacao', { tenantId, ...r });

/* ---- campanhas -------------------------------------------------------------- */

export type TipoCampanha = 'vacinacao' | 'prevencao' | 'educacao' | 'rastreamento' | 'outro';

export interface Campanha {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoCampanha;
  inicio: string;
  fim: string;
  metaParticipantes: number | null;
  encerradaEm: string | null;
  criadoPorNome: string | null;
  participantes: { pacienteId: string; pacienteNome: string; registradoEm: string; registradoPorNome: string | null; observacao: string | null }[];
}

export const fetchCampanhas = (tenantId: string) => request<Campanha[]>(`/api/campanhas?${t(tenantId)}`);
export const criarCampanha = (tenantId: string, c: { titulo: string; descricao?: string; tipo: TipoCampanha; inicio: string; fim: string; metaParticipantes?: number | null }) =>
  post<Campanha>('/api/campanhas', { tenantId, ...c });
export const registrarParticipantes = (tenantId: string, id: string, pacienteIds: string[], observacao?: string) =>
  post<Campanha>(`/api/campanhas/${id}/participantes`, { tenantId, pacienteIds, observacao });
export const encerrarCampanha = (tenantId: string, id: string) =>
  request<Campanha>(`/api/campanhas/${id}/encerrar?${t(tenantId)}`, { method: 'POST' });

export const TIPOS_CAMPANHA: Record<TipoCampanha, string> = {
  vacinacao: 'Vacinação', prevencao: 'Prevenção', educacao: 'Educação em saúde', rastreamento: 'Rastreamento', outro: 'Outro',
};

/* ---- histórico -------------------------------------------------------------- */

export interface ItemHistorico {
  tipo: 'mensagem' | 'exame' | 'agenda' | 'satisfacao' | 'familia' | 'movimentacao' | 'ocorrencia';
  quando: string | null;
  titulo: string;
  detalhe: string | null;
  quem: string | null;
}

export const fetchHistorico = (tenantId: string, pacienteId: string) =>
  request<ItemHistorico[]>(`/api/pacientes/${pacienteId}/historico-atendimento?${t(tenantId)}`);
