/**
 * As áreas do financeiro, na ordem do menu. O hospedeiro monta o menu dele a
 * partir desta lista (rótulo, ícone e recurso que dá acesso), e o módulo
 * renderiza a área escolhida.
 */

import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarRange,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  Scale,
  Settings2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Recurso } from './api/tipos';

export type AreaFinanceira =
  | 'visao-geral'
  | 'pagar'
  | 'receber'
  | 'caixa'
  | 'conciliacao'
  | 'pessoal'
  | 'capital'
  | 'planejamento'
  | 'relatorios'
  | 'cadastros'
  | 'configuracoes';

export interface DescricaoDaArea {
  chave: AreaFinanceira;
  rotulo: string;
  descricao: string;
  recurso: Recurso;
  icone: LucideIcon;
}

export const AREAS_FINANCEIRO: DescricaoDaArea[] = [
  { chave: 'visao-geral', rotulo: 'Visão geral', descricao: 'Saldos, vencimentos, resultado do mês e alertas', recurso: 'relatorios', icone: LayoutDashboard },
  { chave: 'pagar', rotulo: 'Contas a pagar', descricao: 'Fornecedores, impostos, salários e parcelas a pagar', recurso: 'operacao', icone: ReceiptText },
  { chave: 'receber', rotulo: 'Contas a receber', descricao: 'Mensalidades, serviços e o que clientes devem', recurso: 'operacao', icone: Wallet },
  { chave: 'caixa', rotulo: 'Caixa e bancos', descricao: 'Extrato de cada conta, transferências e ajustes', recurso: 'operacao', icone: Landmark },
  { chave: 'conciliacao', rotulo: 'Conciliação bancária', descricao: 'Extrato do banco (OFX/CSV) contra o que foi lançado', recurso: 'operacao', icone: Scale },
  { chave: 'pessoal', rotulo: 'Pessoal e folha', descricao: 'Colaboradores, folha de pagamento e custo de pessoal', recurso: 'pessoal', icone: Users },
  { chave: 'capital', rotulo: 'Capital e patrimônio', descricao: 'Sócios, empréstimos, investimentos e bens', recurso: 'capital', icone: Building2 },
  { chave: 'planejamento', rotulo: 'Orçamento', descricao: 'Planejado por categoria e mês, contra o realizado', recurso: 'planejamento', icone: CalendarRange },
  { chave: 'relatorios', rotulo: 'Relatórios', descricao: 'DRE, fluxo de caixa, projeção e inadimplência', recurso: 'relatorios', icone: BarChart3 },
  { chave: 'cadastros', rotulo: 'Cadastros', descricao: 'Contas, plano de contas, centros de custo, pessoas e recorrências', recurso: 'cadastros', icone: BookOpen },
  { chave: 'configuracoes', rotulo: 'Configurações', descricao: 'Empresa, fechamento de período, impostos e auditoria', recurso: 'configuracoes', icone: Settings2 },
];


export function descricaoDaArea(area: AreaFinanceira): DescricaoDaArea {
  return AREAS_FINANCEIRO.find((a) => a.chave === area) ?? AREAS_FINANCEIRO[0];
}
