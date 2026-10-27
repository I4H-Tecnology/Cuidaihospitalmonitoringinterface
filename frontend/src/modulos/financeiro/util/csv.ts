/**
 * Exportação para planilha: CSV com ponto e vírgula e BOM, que é o que o
 * Excel em português abre certo com acento e com vírgula decimal.
 */

export type Coluna<T> = { titulo: string; valor: (linha: T) => string | number | null | undefined };

function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function montarCsv<T>(linhas: T[], colunas: Coluna<T>[]): string {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(';'));
  return [cabecalho, ...corpo].join('\r\n');
}

/** Valor da API ("1234.56") como a planilha brasileira espera ("1234,56"). */
export const numeroPlanilha = (valor: string | null | undefined) => (valor ?? '').replace('.', ',');

export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
