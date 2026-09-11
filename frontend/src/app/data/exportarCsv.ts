import type { OcorrenciaResumo, PacienteResumo } from './api';

/**
 * Exporta o historico de ocorrencias do paciente como CSV.
 *
 * Roda inteiro no navegador, sobre os dados que a tela ja carregou: nao ha
 * rota nova nem segunda consulta. O arquivo sai com os mesmos campos que a
 * tela mostra, para que quem abrir a planilha reconheca o que viu.
 */

const CABECALHO = [
  'data_hora', 'tipo_evento', 'status', 'escore_deteccao',
  'ambiente', 'camera', 'encerrada_em', 'observacao',
];

/** Escapa segundo o RFC 4180: aspas dobradas e campo entre aspas. */
function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",;\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function dataHoraLocal(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR');
}

export function montarCsv(ocorrencias: OcorrenciaResumo[]): string {
  const linhas = ocorrencias.map((o) =>
    [
      dataHoraLocal(o.dataHora),
      o.tipoEvento,
      o.status,
      o.confianca != null ? o.confianca.toFixed(3) : '',
      o.ambienteNome,
      o.cameraIdentificador ?? '',
      dataHoraLocal(o.encerradaEm),
      o.observacao ?? '',
    ].map(celula).join(';')
  );
  // Ponto e virgula e o separador que o Excel em portugues espera; virgula
  // quebraria a planilha em maquina com locale pt-BR.
  return [CABECALHO.join(';'), ...linhas].join('\r\n');
}

export function baixarHistoricoCsv(
  paciente: PacienteResumo,
  ocorrencias: OcorrenciaResumo[]
): void {
  // BOM na frente: sem ele o Excel abre UTF-8 como Latin-1 e "ocorrência"
  // vira "ocorrÃªncia".
  const conteudo = '\uFEFF' + montarCsv(ocorrencias);
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const nome = paciente.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  const hoje = new Date().toISOString().slice(0, 10);

  const link = document.createElement('a');
  link.href = url;
  link.download = `ocorrencias-${nome}-${hoje}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
