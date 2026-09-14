import { useMemo, useState } from 'react';
import { AlertCircle, Bell, CheckCircle, Clock, Info, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { OcorrenciaResumo } from '../data/api';
import { ROTULO_STATUS, gravidadeDe, rotuloDoEvento } from '../data/ocorrencias';
import { quandoFoi } from '../data/tempo';
import { useAlertas } from '../data/useAlertas';

/**
 * Sino do cabeçalho: um clique de distância em qualquer tela.
 *
 * Só existe uma fonte de notificação neste produto: as ocorrências que as
 * câmeras detectam. As sete notificações fixas de antes citavam farmácia,
 * laboratório, mensagens e estoque, módulos que não existem. Aqui a lista é
 * a mesma da central de alertas, pelo mesmo `useAlertas`.
 *
 * "Lida" e "dispensada" ficam na sessão do navegador: não há campo para isso
 * na API, e inventar um estado persistente seria mentir para o usuário.
 */

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const FONTE = 'Detecção por câmera';

type Tipo = 'critical' | 'warning' | 'info' | 'success';

function tipoDe(o: OcorrenciaResumo): Tipo {
  if (o.status === 'queda_confirmada' || o.status === 'encerrada') return 'success';
  return gravidadeDe(o);
}

function tituloDe(o: OcorrenciaResumo): string {
  const quem = o.pacienteNome ?? o.ambienteNome;
  return `${rotuloDoEvento(o.tipoEvento)} · ${quem}`;
}

function mensagemDe(o: OcorrenciaResumo): string {
  const onde = o.cameraIdentificador ? `${o.ambienteNome}, câmera ${o.cameraIdentificador}` : o.ambienteNome;
  const status = ROTULO_STATUS[o.status] ?? o.status;
  const ciencia = o.alertaStatus && o.alertaStatus !== 'ciente' ? ' · sem ciência' : '';
  return `${onde} · ${status}${ciencia}`;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const { isDarkMode } = useTheme();
  const { tenantId } = useAuth();
  const { ocorrencias, carregando, erro } = useAlertas(tenantId);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [lidas, setLidas] = useState<Set<string>>(() => new Set());
  const [dispensadas, setDispensadas] = useState<Set<string>>(() => new Set());

  const notificacoes = useMemo(
    () => ocorrencias.filter((o) => !dispensadas.has(o.id)),
    [ocorrencias, dispensadas],
  );

  // Ocorrência com ciência dada na central conta como lida aqui também: o
  // enfermeiro que confirmou o alerta já viu a notificação.
  const foiLida = (o: OcorrenciaResumo) => lidas.has(o.id) || o.alertaStatus === 'ciente';

  const marcarLida = (id: string) => setLidas((s) => new Set(s).add(id));
  const marcarTodasLidas = () => setLidas(new Set(notificacoes.map((o) => o.id)));
  const dispensar = (id: string) => setDispensadas((s) => new Set(s).add(id));

  const typeConfig = {
    critical: { icon: AlertCircle, color: 'bg-red-100 text-red-700', iconColor: 'text-red-600' },
    warning: { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-700', iconColor: 'text-yellow-600' },
    info: { icon: Info, color: 'bg-blue-100 text-blue-700', iconColor: 'text-blue-600' },
    success: { icon: CheckCircle, color: 'bg-green-100 text-green-700', iconColor: 'text-green-600' },
  };

  const typeConfigDark = {
    critical: { icon: AlertCircle, color: 'bg-red-900/30 text-red-400', iconColor: 'text-red-500' },
    warning: { icon: AlertCircle, color: 'bg-yellow-900/30 text-yellow-400', iconColor: 'text-yellow-500' },
    info: { icon: Info, color: 'bg-blue-900/30 text-blue-400', iconColor: 'text-blue-500' },
    success: { icon: CheckCircle, color: 'bg-green-900/30 text-green-400', iconColor: 'text-green-500' },
  };

  const config = isDarkMode ? typeConfigDark : typeConfig;

  const visiveis = filter === 'unread' ? notificacoes.filter((o) => !foiLida(o)) : notificacoes;
  const naoLidas = notificacoes.filter((o) => !foiLida(o)).length;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />

      <div className={`fixed right-0 top-0 h-full w-[450px] shadow-2xl z-50 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className={`w-5 h-5 ${isDarkMode ? 'text-cyan-400' : 'text-[#0EA5E9]'}`} />
              <h2 className={isDarkMode ? 'text-white' : 'text-gray-800'}>Notificações</h2>
              {naoLidas > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">{naoLidas}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`p-1 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                  filter === f
                    ? isDarkMode ? 'bg-cyan-600 text-white' : 'bg-[#0EA5E9] text-white'
                    : isDarkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? `Todas (${notificacoes.length})` : `Não lidas (${naoLidas})`}
              </button>
            ))}
          </div>

          {naoLidas > 0 && (
            <button
              type="button"
              onClick={marcarTodasLidas}
              className={`mt-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${isDarkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="overflow-y-auto h-[calc(100vh-180px)]">
          {erro && (
            <p className="px-6 py-3 text-sm text-red-600">{erro}</p>
          )}
          {visiveis.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <CheckCircle className={`w-16 h-16 mb-4 ${isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {carregando ? 'Carregando…' : filter === 'unread' ? 'Nenhuma notificação não lida' : 'Nenhuma ocorrência registrada'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {visiveis.map((o) => {
                const tipo = tipoDe(o);
                const TypeIcon = config[tipo].icon;
                const lida = foiLida(o);
                return (
                  <div
                    key={o.id}
                    className={`px-6 py-4 transition-colors ${
                      !lida
                        ? isDarkMode ? 'bg-gray-800/50' : 'bg-blue-50/50'
                        : isDarkMode ? 'hover:bg-gray-800/30' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${config[tipo].color}`}>
                        <TypeIcon className={`w-5 h-5 ${config[tipo].iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{tituloDe(o)}</h3>
                          {!lida && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>}
                        </div>
                        <p className={`text-sm mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{mensagemDe(o)}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs">
                            <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>{FONTE}</span>
                            <span className={`flex items-center gap-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              <Clock className="w-3 h-3" />
                              {quandoFoi(o.dataHora)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {!lida && (
                              <button
                                type="button"
                                onClick={() => marcarLida(o.id)}
                                className={`px-2 py-1 rounded text-xs transition-colors ${isDarkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                              >
                                Marcar como lida
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => dispensar(o.id)}
                              title="Dispensar desta lista"
                              className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
