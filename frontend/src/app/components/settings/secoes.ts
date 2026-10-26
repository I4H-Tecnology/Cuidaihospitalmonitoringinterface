import {
  Bell, Building2, Camera, DoorOpen, Info, Palette, Plug, ShieldCheck, Siren, UserRound,
  type LucideIcon,
} from 'lucide-react';

/**
 * Seções de Configurações. As pessoais abrem para qualquer perfil; as da
 * clínica e do sistema exigem a permissão `settings` (a API também exige).
 */

export type SecaoConfiguracao =
  | 'conta' | 'aparencia' | 'notificacoes'
  | 'clinica' | 'ambientes' | 'dispositivos' | 'deteccao'
  | 'seguranca' | 'integracoes' | 'sobre';

export type GrupoConfiguracao = 'pessoal' | 'clinica' | 'sistema';

export interface DescricaoSecao {
  id: SecaoConfiguracao;
  rotulo: string;
  descricao: string;
  grupo: GrupoConfiguracao;
  icone: LucideIcon;
  /** Palavras que a busca também encontra, além do rótulo e da descrição. */
  termos: string;
  /** Módulo do RBAC exigido para ver; sem ele, a seção é pessoal. */
  modulo?: string;
}

export const GRUPOS: { id: GrupoConfiguracao; rotulo: string }[] = [
  { id: 'pessoal', rotulo: 'Pessoal' },
  { id: 'clinica', rotulo: 'Clínica' },
  { id: 'sistema', rotulo: 'Sistema' },
];

export const SECOES: DescricaoSecao[] = [
  { id: 'conta', rotulo: 'Minha conta', grupo: 'pessoal', icone: UserRound,
    descricao: 'Seus dados de acesso, troca de senha e sessão.',
    termos: 'perfil senha login usuário sair sessão' },
  { id: 'aparencia', rotulo: 'Aparência', grupo: 'pessoal', icone: Palette,
    descricao: 'Tema de cores, tamanho do texto e animações.',
    termos: 'tema escuro claro areia café sálvia contraste fonte letra acessibilidade' },
  { id: 'notificacoes', rotulo: 'Notificações', grupo: 'pessoal', icone: Bell,
    descricao: 'Como o aviso de queda chama a sua atenção neste aparelho.',
    termos: 'som alerta vibrar vibração notificação queda aviso' },
  { id: 'clinica', rotulo: 'Dados da clínica', grupo: 'clinica', icone: Building2, modulo: 'settings',
    descricao: 'Nome, endereço e contatos da clínica desta conta.',
    termos: 'unidade cnpj endereço telefone e-mail cadastro' },
  { id: 'ambientes', rotulo: 'Ambientes', grupo: 'clinica', icone: DoorOpen, modulo: 'settings',
    descricao: 'Quartos e áreas monitoradas, com câmeras e pacientes.',
    termos: 'quarto estrutura física leito sala área' },
  { id: 'dispositivos', rotulo: 'Dispositivos', grupo: 'clinica', icone: Camera, modulo: 'settings',
    descricao: 'Câmeras cadastradas, status e serviço de visão.',
    termos: 'câmera rtsp stream visão ping' },
  { id: 'deteccao', rotulo: 'Detecção e alertas', grupo: 'clinica', icone: Siren, modulo: 'settings',
    descricao: 'O que o sistema detecta e o caminho de um alerta até o encerramento.',
    termos: 'queda alerta ocorrência clipe retenção ciência atendimento' },
  { id: 'seguranca', rotulo: 'Segurança', grupo: 'sistema', icone: ShieldCheck, modulo: 'settings',
    descricao: 'Política de senha, bloqueio e inatividade da clínica.',
    termos: 'senha bloqueio tentativas inatividade política lgpd' },
  { id: 'integracoes', rotulo: 'Integrações', grupo: 'sistema', icone: Plug, modulo: 'settings',
    descricao: 'API, serviço de visão, canal de alertas e módulo financeiro.',
    termos: 'api webhook websocket documentação financeiro visão' },
  { id: 'sobre', rotulo: 'Sobre o sistema', grupo: 'sistema', icone: Info, modulo: 'settings',
    descricao: 'Versão, servidor e onde acompanhar a saúde da solução.',
    termos: 'versão servidor uptime saúde' },
];

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca sem acento e sem caixa: "cafe" acha "Café", "SENHA" acha "senha". */
export function filtrarSecoes(secoes: DescricaoSecao[], busca: string): DescricaoSecao[] {
  const termo = normalizar(busca.trim());
  if (!termo) return secoes;
  return secoes.filter((s) => normalizar(`${s.rotulo} ${s.descricao} ${s.termos}`).includes(termo));
}
