/** Rótulos de tela para os códigos que a API devolve. Um lugar só, para não divergir entre telas. */

export const TIPOS_DE_CONTA: Record<string, string> = {
  caixa: 'Caixa',
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  investimento: 'Investimento',
  cartao_credito: 'Cartão de crédito',
  outro: 'Outra',
};

export const VINCULOS: Record<string, string> = {
  clt: 'CLT',
  aprendiz: 'Aprendiz',
  estagio: 'Estágio',
  prolabore: 'Pró-labore (sócio)',
  pj: 'PJ',
  autonomo: 'Autônomo',
};

export const REGIMES: Record<string, string> = {
  mei: 'MEI',
  simples: 'Simples Nacional',
  presumido: 'Lucro Presumido',
  real: 'Lucro Real',
  outro: 'Outro',
};

export const FREQUENCIAS: Record<string, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export const CLASSES_DE_BEM: Record<string, string> = {
  terreno: 'Terreno',
  imovel: 'Edificação',
  instalacoes: 'Instalações',
  maquina: 'Máquinas e equipamentos',
  movel: 'Móveis e utensílios',
  veiculo: 'Veículo',
  informatica: 'Computadores e periféricos',
  outro: 'Outro',
};
