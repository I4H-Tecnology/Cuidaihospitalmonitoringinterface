import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Search, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { Screen } from '../data/rbac';
import { AbaClinica } from './settings/AbaClinica';
import { AbaCameras } from './settings/AbaCameras';
import { SecaoAmbientes } from './settings/SecaoAmbientes';
import { SecaoAparencia } from './settings/SecaoAparencia';
import { SecaoConta } from './settings/SecaoConta';
import { SecaoDeteccao } from './settings/SecaoDeteccao';
import { SecaoIntegracoes } from './settings/SecaoIntegracoes';
import { SecaoNotificacoes } from './settings/SecaoNotificacoes';
import { SecaoSeguranca } from './settings/SecaoSeguranca';
import { SecaoSobre } from './settings/SecaoSobre';
import { GRUPOS, SECOES, filtrarSecoes, type SecaoConfiguracao } from './settings/secoes';
import { CabecalhoSecao } from './settings/ui';

/**
 * Configurações, em seções com navegação lateral (como as configurações de
 * qualquer sistema operacional), no lugar das cinco abas horizontais.
 *
 * - Pessoal (conta, aparência, notificações) abre para qualquer perfil.
 * - Clínica e Sistema exigem a permissão `settings`; sem ela as seções não
 *   aparecem, e um aviso diz por quê, em vez de a tela parecer incompleta.
 * - Cada seção salva por conta própria: ajuste pessoal vale na hora, cadastro
 *   da clínica salva no próprio formulário. Não há "Salvar alterações" geral
 *   fingindo guardar algo pendente.
 * - A seção atual mora no App, para o menu do avatar ("Meu perfil",
 *   "Preferências") abrir direto nela.
 */

interface Props {
  secao: SecaoConfiguracao;
  aoTrocarSecao: (secao: SecaoConfiguracao) => void;
  onNavigate?: (tela: Screen) => void;
}

export function SettingsScreen({ secao, aoTrocarSecao, onNavigate }: Props) {
  const { can } = useAuth();
  const [busca, setBusca] = useState('');
  const conteudo = useRef<HTMLDivElement>(null);

  const permitidas = useMemo(() => SECOES.filter((s) => !s.modulo || can(s.modulo, 'view')), [can]);
  const filtradas = filtrarSecoes(permitidas, busca);
  const escondidas = SECOES.length - permitidas.length;
  // Seção pedida sem permissão (atalho antigo, perfil trocado): cai na primeira liberada.
  const atual = permitidas.find((s) => s.id === secao) ?? permitidas[0];

  useEffect(() => {
    if (atual && atual.id !== secao) aoTrocarSecao(atual.id);
  }, [atual, secao, aoTrocarSecao]);

  const ir = (id: SecaoConfiguracao) => {
    aoTrocarSecao(id);
    // Quem troca de seção pelo teclado continua no conteúdo novo, não no menu.
    requestAnimationFrame(() => conteudo.current?.focus({ preventScroll: true }));
    // Só rola se o topo da seção ficou para cima da tela (menu fixo, página rolada).
    if (conteudo.current && conteudo.current.getBoundingClientRect().top < 0) {
      conteudo.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  return (
    <main className="flex-1 px-4 py-6 sm:px-8">
      <div className="mb-6">
        <h1 className="text-gray-900">Configurações</h1>
        <p className="mt-1 text-sm text-gray-600">Suas preferências e, conforme o seu perfil, os ajustes da clínica.</p>
      </div>

      {/* Celular e tablet: a lista lateral vira um seletor. */}
      <label className="mb-6 block lg:hidden">
        <span className="mb-1.5 block text-sm font-medium text-gray-800">Seção</span>
        <select
          value={atual?.id}
          onChange={(e) => ir(e.target.value as SecaoConfiguracao)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva"
        >
          {GRUPOS.map((g) => {
            const itens = permitidas.filter((s) => s.grupo === g.id);
            return itens.length > 0 && (
              <optgroup key={g.id} label={g.rotulo}>
                {itens.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
              </optgroup>
            );
          })}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <nav aria-label="Seções de configurações" className="hidden lg:block">
          <div className="sticky top-6 space-y-5">
            <label className="relative block">
              <span className="sr-only">Buscar configuração</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtradas[0]) ir(filtradas[0].id);
                  if (e.key === 'Escape') setBusca('');
                }}
                placeholder="Buscar configuração"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-500 hover:text-gray-800"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </label>

            {GRUPOS.map((g) => {
              const itens = filtradas.filter((s) => s.grupo === g.id);
              if (itens.length === 0) return null;
              return (
                <div key={g.id}>
                  <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{g.rotulo}</p>
                  <ul className="space-y-0.5">
                    {itens.map((s) => {
                      const ativa = s.id === atual?.id;
                      const Icone = s.icone;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => ir(s.id)}
                            aria-current={ativa ? 'page' : undefined}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva ${
                              ativa ? 'bg-marca-suave font-medium text-marca-texto' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                          >
                            <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {s.rotulo}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}

            {filtradas.length === 0 && (
              <p className="px-3 text-sm text-gray-600">Nada encontrado para “{busca}”.</p>
            )}

            {escondidas > 0 && (
              <p className="flex items-start gap-2 border-t border-gray-200 px-3 pt-4 text-xs text-gray-600">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                As configurações da clínica e do sistema aparecem para perfis com acesso a Configurações.
              </p>
            )}
          </div>
        </nav>

        <div ref={conteudo} tabIndex={-1} className="min-w-0 scroll-mt-6 focus:outline-none">
          {atual && <Conteudo secao={atual.id} aoIrPara={ir} onNavigate={onNavigate} />}
        </div>
      </div>
    </main>
  );
}

function Conteudo({ secao, aoIrPara, onNavigate }: {
  secao: SecaoConfiguracao; aoIrPara: (s: SecaoConfiguracao) => void; onNavigate?: (tela: Screen) => void;
}) {
  switch (secao) {
    case 'conta': return <SecaoConta />;
    case 'aparencia': return <SecaoAparencia />;
    case 'notificacoes': return <SecaoNotificacoes />;
    case 'clinica': return (
      <>
        <CabecalhoSecao titulo="Dados da clínica" descricao="Nome, endereço e contatos da clínica desta conta." />
        <AbaClinica />
      </>
    );
    case 'ambientes': return <SecaoAmbientes aoIrPara={aoIrPara} onNavigate={onNavigate} />;
    case 'dispositivos': return (
      <>
        <CabecalhoSecao titulo="Dispositivos" descricao="Câmeras cadastradas, com o estado de conexão real e o serviço de visão de cada uma." />
        <AbaCameras />
      </>
    );
    case 'deteccao': return <SecaoDeteccao onNavigate={onNavigate} />;
    case 'seguranca': return <SecaoSeguranca onNavigate={onNavigate} />;
    case 'integracoes': return <SecaoIntegracoes />;
    case 'sobre': return <SecaoSobre onNavigate={onNavigate} />;
  }
}
