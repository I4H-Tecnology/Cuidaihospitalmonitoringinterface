/**
 * Módulo financeiro — interface React.
 *
 * Tudo o que um sistema hospedeiro precisa importar está aqui. Nada nesta
 * pasta importa do hospedeiro (há um teste que garante isso), então ela pode
 * ser copiada para outro projeto React com Tailwind e lucide-react.
 */

export { ModuloFinanceiro, type PropsDoModulo } from './ModuloFinanceiro';
export { AREAS_FINANCEIRO, descricaoDaArea, type AreaFinanceira, type DescricaoDaArea } from './navegacao';
export { criarClienteFinanceiro, ErroFinanceiro, type ClienteFinanceiro, type OpcoesDoCliente } from './api/cliente';
export type { Recurso, Acao } from './api/tipos';
