import { Activity, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Screen } from '../../data/rbac';
import { formatarDuracao } from '../../data/visao';
import { Aviso, BOTAO_SECUNDARIO, CabecalhoSecao, Carregando, Cartao, Dado } from './ui';
import { useSaudeDoSistema } from './useSaudeDoSistema';

/** Sobre: versão e servidor, para quem abre chamado com o suporte saber o que dizer. */
export function SecaoSobre({ onNavigate }: { onNavigate?: (tela: Screen) => void }) {
  const { can } = useAuth();
  const { saude, erro, carregando, recarregar } = useSaudeDoSistema();

  return (
    <div className="space-y-6">
      <CabecalhoSecao
        titulo="Sobre o sistema"
        descricao="Versão e estado do servidor. Útil ao abrir um chamado com o suporte."
        acao={
          <button type="button" onClick={recarregar} disabled={carregando} className={BOTAO_SECUNDARIO}>
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
        }
      />

      <Cartao titulo="MedSignal">
        <dl className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <Dado rotulo="Painel web">{import.meta.env.MODE === 'production' ? 'Produção' : `Desenvolvimento (${import.meta.env.MODE})`}</Dado>
          <Dado rotulo="Versão do servidor">{saude?.versao ?? '—'}</Dado>
          <Dado rotulo="Situação">
            {saude ? (
              <span className={`rounded-full px-2 py-0.5 text-xs ${saude.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                {saude.status === 'ok' ? 'Tudo funcionando' : 'Degradado'}
              </span>
            ) : '—'}
          </Dado>
          <Dado rotulo="No ar há">{saude ? formatarDuracao(saude.uptime_s) : '—'}</Dado>
          <Dado rotulo="Hora do servidor">{saude ? new Date(saude.hora_servidor).toLocaleString('pt-BR') : '—'}</Dado>
          <Dado rotulo="Banco de dados">
            {saude ? (saude.banco.ok ? `Respondendo em ${saude.banco.latencia_ms ?? '?'} ms` : `Com erro: ${saude.banco.erro ?? 'sem detalhe'}`) : '—'}
          </Dado>
        </dl>
        {carregando && !saude && <Carregando />}
        {erro && <div className="pb-5"><Aviso>{erro}</Aviso></div>}
      </Cartao>

      {onNavigate && can('monitoring', 'view') && (
        <button type="button" onClick={() => onNavigate('saude')} className={BOTAO_SECUNDARIO}>
          <Activity className="h-4 w-4" aria-hidden="true" />
          Ver a saúde completa do sistema
        </button>
      )}
    </div>
  );
}
