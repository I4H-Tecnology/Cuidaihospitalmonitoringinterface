/**
 * Utilitários de texto sem expressões regulares de custo super-linear.
 *
 * O SonarQube (S8786) apontou regex que, numa entrada montada de propósito,
 * levam tempo quadrático (ReDoS). As versões abaixo são lineares.
 */

/** Tamanho máximo de um endereço de e-mail (RFC 5321). */
export const EMAIL_TAMANHO_MAXIMO = 254;

/**
 * Valida o formato básico `local@dominio.tld`.
 *
 * O domínio não aceita ponto dentro de um rótulo (`[^\s@.]`), o que torna cada
 * parte inequívoca para o motor de regex: não há duas maneiras de casar o mesmo
 * trecho, logo não há retrocesso em cascata.
 */
export const emailValido = (email: string): boolean =>
  email.length <= EMAIL_TAMANHO_MAXIMO && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email);

/** Remove as barras do fim de uma URL (`http://x//` vira `http://x`). */
export const semBarraFinal = (url: string): string => {
  let fim = url.length;
  while (fim > 0 && url[fim - 1] === '/') fim -= 1;
  return url.slice(0, fim);
};
