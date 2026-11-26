import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BedDouble, Bell, Clock, Lightbulb, Shield, TrendingUp, Users } from 'lucide-react';
import { StatCard } from './StatCard';
import { fetchOperationalOverview, type OperationalOverviewResponse } from '../data/api';
import { useAuth } from '../contexts/AuthContext';

type OperationalStatus = OperationalOverviewResponse['status'];

const REFRESH_INTERVAL_MS = 30000;

const statusConfig: Record<OperationalStatus, { label: string; badge: string; text: string; border: string }> = {
  operational: {
    label: 'Operacional',
    badge: 'bg-green-100 text-green-700',
    text: 'text-green-700',
    border: 'border-green-200'
  },
  attention: {
    label: 'Atenção',
    badge: 'bg-yellow-100 text-yellow-800',
    text: 'text-yellow-700',
    border: 'border-yellow-200'
  },
  critical: {
    label: 'Crítico',
    badge: 'bg-red-100 text-red-700',
    text: 'text-red-700',
    border: 'border-red-200'
  }
};

const fallbackData: OperationalOverviewResponse = {
  status: 'attention',
  criticalAlerts: 7,
  criticalCases: 3,
  occupancyRate: 78,
  avgResponseMinutes: 18,
  incidentsLast24h: 12,
  updatedAt: new Date().toISOString(),
  criticalSectors: [
    { id: 'uti', name: 'UTI Adulto', occupancyRate: 92, activeAlerts: 4, status: 'critical' },
    { id: 'cardio', name: 'Cardiologia', occupancyRate: 85, activeAlerts: 2, status: 'attention' },
    { id: 'geriatria', name: 'Geriatria', occupancyRate: 81, activeAlerts: 1, status: 'attention' }
  ],
  insights: [
    {
      id: 'ins-1',
      title: 'Risco de superlotação na UTI',
      description: 'Projeção indica ocupação acima de 95% em até 4 horas. Recomenda-se liberar 2 leitos e acionar unidades parceiras.',
      priority: 'high'
    },
    {
      id: 'ins-2',
      title: 'Tempo de resposta acima da meta',
      description: 'Média de resposta aos alertas críticos está 3 min acima do alvo. Sugestão: reforçar equipe no plantão da tarde.',
      priority: 'medium'
    },
    {
      id: 'ins-3',
      title: 'Padrão de incidentes noturnos',
      description: 'Incidentes concentrados entre 02h-04h. Reavaliar protocolos e posicionamento de equipe.',
      priority: 'low'
    }
  ]
};

export function OperationalOverviewScreen() {
  const { tenantId } = useAuth();
  const [data, setData] = useState<OperationalOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!tenantId) {
      setError('Selecione uma empresa para carregar a visão operacional.');
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await fetchOperationalOverview(tenantId);
      setData(response);
      setIsUsingFallback(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar os dados.';
      setError(message);
      if (import.meta.env.DEV) {
        setData(fallbackData);
        setIsUsingFallback(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadOverview();
    const interval = window.setInterval(loadOverview, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadOverview]);

  const status = data?.status ?? 'operational';
  const statusStyle = statusConfig[status];
  const updatedAtLabel = useMemo(() => {
    if (!data?.updatedAt) return null;
    const date = new Date(data.updatedAt);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [data?.updatedAt]);

  const insightPriority = {
    high: { dot: 'bg-red-500', label: 'Alta' },
    medium: { dot: 'bg-yellow-500', label: 'Média' },
    low: { dot: 'bg-green-500', label: 'Baixa' }
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex items-start justify-between">
        <div />
        <div className="text-right">
          <p className="text-xs text-gray-400">Atualiza a cada {Math.round(REFRESH_INTERVAL_MS / 1000)}s</p>
          {updatedAtLabel && (
            <p className="text-xs text-gray-500">Última atualização: {updatedAtLabel}</p>
          )}
          {isUsingFallback && (
            <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">
              Dados simulados (DEV)
            </span>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-500">Carregando visão operacional...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-white border border-red-200 rounded-lg p-6 mb-6">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {!isLoading && data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            <div className={`bg-white rounded-lg border ${statusStyle.border} p-5 shadow-sm`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">Status Operacional</p>
                <div className="w-10 h-10 rounded-lg bg-marca-suave flex items-center justify-center text-marca-texto">
                  <Shield className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyle.badge}`}>
                  {statusStyle.label}
                </span>
                <span className={`text-xs ${statusStyle.text}`}>Atual</span>
              </div>
              <p className="text-xs text-gray-400 mt-3">Baseado em alertas, ocupação e incidentes</p>
            </div>

            <StatCard
              title="Alertas Críticos Ativos"
              value={data.criticalAlerts}
              subtitle="Monitoramento em tempo real"
              icon={<Bell className="w-5 h-5" />}
              variant={data.criticalAlerts >= 8 ? 'critical' : data.criticalAlerts >= 4 ? 'warning' : 'default'}
            />
            <StatCard
              title="Casos Críticos"
              value={data.criticalCases}
              subtitle="Pacientes em estado crítico"
              icon={<Activity className="w-5 h-5" />}
              variant={data.criticalCases >= 5 ? 'critical' : data.criticalCases >= 3 ? 'warning' : 'default'}
            />
            <StatCard
              title="Taxa de Ocupação"
              value={`${data.occupancyRate}%`}
              subtitle="Leitos ocupados no momento"
              icon={<BedDouble className="w-5 h-5" />}
              variant={data.occupancyRate >= 90 ? 'critical' : data.occupancyRate >= 80 ? 'warning' : 'default'}
            />
            <StatCard
              title="Tempo Médio de Resposta"
              value={`${data.avgResponseMinutes} min`}
              subtitle="Alertas críticos"
              icon={<Clock className="w-5 h-5" />}
              variant={data.avgResponseMinutes >= 20 ? 'warning' : 'default'}
            />
            <StatCard
              title="Incidentes (24h)"
              value={data.incidentsLast24h}
              subtitle="Eventos críticos recentes"
              icon={<AlertTriangle className="w-5 h-5" />}
              variant={data.incidentsLast24h >= 10 ? 'critical' : data.incidentsLast24h >= 5 ? 'warning' : 'default'}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-gray-800 mb-1">Setores Críticos</h3>
                  <p className="text-xs text-gray-500">Setores com maior pressão operacional</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <TrendingUp className="w-4 h-4" />
                  Atualizado automaticamente
                </div>
              </div>
              <div className="space-y-3">
                {data.criticalSectors.map((sector) => {
                  const sectorStatus = statusConfig[sector.status];
                  return (
                    <div key={sector.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-4">
                      <div>
                        <p className="text-sm text-gray-800">{sector.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Ocupação {sector.occupancyRate}% · {sector.activeAlerts} alertas ativos
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${sectorStatus.badge}`}>
                        {sectorStatus.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-200 overflow-hidden">
              <div className="bg-gradient-to-r from-marca to-marca-hover px-5 py-4">
                <div className="flex items-center gap-2 text-white mb-1">
                  <Lightbulb className="w-5 h-5" />
                  <h3 className="text-white">Insights Automáticos (IA)</h3>
                </div>
                <p className="text-xs text-white/80">Sugestões geradas para ação imediata</p>
              </div>
              <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">
                {data.insights.map((insight) => {
                  const priority = insightPriority[insight.priority];
                  return (
                    <div key={insight.id} className="bg-white rounded-lg border border-blue-100 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">Prioridade</span>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${priority.dot}`}></span>
                          <span className="text-xs text-gray-600">{priority.label}</span>
                        </div>
                      </div>
                      <h4 className="text-sm text-gray-800 mb-2">{insight.title}</h4>
                      <p className="text-xs text-gray-600 leading-relaxed">{insight.description}</p>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-blue-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Users className="w-4 h-4" />
                  Insights consolidados por unidade e turno
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
