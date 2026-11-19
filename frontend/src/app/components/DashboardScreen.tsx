import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, Bell, Camera, ChevronRight, Lightbulb, Loader2, Plus,
  RotateCcw, Target, Users,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { fetchCameras, fetchPacientes } from '../data/api';
import type { CameraResumo, OcorrenciaResumo, PacienteResumo } from '../data/api';
import {
  estaAberta, gravidadeDe, nasUltimasHoras, porHoraNasUltimas24h, porTipo, rotuloDoEvento,
} from '../data/ocorrencias';
import { perfilSoDaRfc, type Screen } from '../data/rbac';
import { quandoFoi } from '../data/tempo';
import { useAlertas } from '../data/useAlertas';
import { DashboardBuilder } from './DashboardBuilder';
import { EventCard } from './EventCard';
import { PatientRow } from './PatientRow';
import { StatCard } from './StatCard';

/**
 * Página de pouso depois do login.
 *
 * Tudo o que aparece aqui vem da API: pacientes (`/api/pacientes`), câmeras
 * (`/api/cameras`) e ocorrências (WebSocket com polling de segurança, o mesmo
 * `useAlertas` da central de alertas). Não há paciente de exemplo, sinal vital
 * nem leito: o MedSignal detecta queda por câmera, e o dashboard mostra
 * exatamente isso. Onde a base ainda é pequena para um gráfico dizer algo, a
 * tela diz "sem dados", não inventa uma curva.
 */

const INTERVALO_MS = 30000;

const COLORS = {
  primary: 'var(--marca-viva)',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

// Cores do tema (ver styles/theme.css): o mesmo gráfico serve aos temas claros e escuros.
const ESTILO_DICA = {
  backgroundColor: 'var(--grafico-dica)',
  border: '1px solid var(--grafico-grade)',
  borderRadius: '8px',
};

type Filtro = 'all' | PacienteResumo['situacao'];

interface Props {
  onNavigate?: (screen: Screen) => void;
}

export function DashboardScreen({ onNavigate }: Props) {
  const { tenantId, user } = useAuth();
  // O editor de dashboard é um protótipo com números de exemplo, fora da RFC:
  // quem só vê o que a RFC especifica (a banca do TCC) não o recebe.
  const mostraNovoDashboard = !perfilSoDaRfc(user?.role);
  const { ocorrencias, carregando: carregandoOcorrencias } = useAlertas(tenantId);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [cameras, setCameras] = useState<CameraResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [mostrarBuilder, setMostrarBuilder] = useState(false);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [p, c] = await Promise.all([fetchPacientes(tenantId), fetchCameras(tenantId)]);
      setPacientes(p);
      setCameras(c);
      setErro(null);
      setAtualizadoEm(new Date());
    } catch {
      setErro('Não foi possível carregar os dados do painel.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(carregar, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const contar = (s: PacienteResumo['situacao']) => pacientes.filter((p) => p.situacao === s).length;
  const criticos = contar('critical');
  const atencao = contar('attention');
  const estaveis = contar('stable');
  const abertas = ocorrencias.filter(estaAberta);
  const camerasConectadas = cameras.filter((c) => c.conectada).length;

  const ultimas24h = useMemo(() => nasUltimasHoras(ocorrencias, 24), [ocorrencias]);
  const porHora = useMemo(() => porHoraNasUltimas24h(ultimas24h), [ultimas24h]);
  const tipos = useMemo(() => porTipo(ultimas24h), [ultimas24h]);

  const distribuicao = [
    { name: 'Estáveis', value: estaveis, color: COLORS.success },
    { name: 'Atenção', value: atencao, color: COLORS.warning },
    { name: 'Críticos', value: criticos, color: COLORS.danger },
  ].filter((d) => d.value > 0);

  const visiveis = filtro === 'all' ? pacientes : pacientes.filter((p) => p.situacao === filtro);
  const eventosRecentes = ocorrencias.slice(0, 5);

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-gray-800">Visão geral</h2>
          <p className="text-sm text-gray-500">Pacientes, câmeras e ocorrências desta clínica, direto do sistema.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-gray-500">
            {carregando || carregandoOcorrencias ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            )}
            {atualizadoEm ? `atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR')}` : 'carregando…'}
          </span>
          <button
            type="button"
            onClick={carregar}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="w-4 h-4" />
            Atualizar
          </button>
          {mostraNovoDashboard && (
            <button
              type="button"
              onClick={() => setMostrarBuilder(true)}
              className="flex items-center gap-2 px-3 py-2 bg-marca text-white rounded-lg text-sm hover:bg-marca-hover"
            >
              <Plus className="w-4 h-4" />
              Novo dashboard
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" />
          {erro}
        </div>
      )}

      <div className="space-y-6">
        {/* Contadores */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Pacientes internados"
            value={carregando ? '—' : pacientes.length}
            subtitle={carregando ? 'carregando' : `${criticos} em situação crítica`}
            icon={<Users className="w-6 h-6" />}
            variant={criticos > 0 ? 'critical' : 'default'}
          />
          <StatCard
            title="Ocorrências abertas"
            value={carregandoOcorrencias ? '—' : abertas.length}
            subtitle={`${abertas.filter((o) => o.status === 'pendente').length} sem ciência`}
            icon={<Bell className="w-6 h-6" />}
            variant={abertas.some((o) => o.status === 'pendente') ? 'critical' : abertas.length > 0 ? 'warning' : 'default'}
          />
          <StatCard
            title="Ocorrências em 24 h"
            value={carregandoOcorrencias ? '—' : ultimas24h.length}
            subtitle="detectadas pelas câmeras"
            icon={<AlertTriangle className="w-6 h-6" />}
          />
          <StatCard
            title="Câmeras conectadas"
            value={carregando ? '—' : `${camerasConectadas} / ${cameras.length}`}
            subtitle={cameras.length - camerasConectadas > 0 ? `${cameras.length - camerasConectadas} sem sinal` : 'todas com sinal'}
            icon={<Camera className="w-6 h-6" />}
            variant={cameras.length > 0 && camerasConectadas === 0 ? 'critical' : cameras.length - camerasConectadas > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Gráficos: só o que dá para calcular com o que a API devolveu */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Painel titulo="Pacientes por situação">
            {distribuicao.length === 0 ? (
              <Vazio texto={carregando ? 'Carregando…' : 'Nenhum paciente internado.'} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={distribuicao}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    // Rótulo na cor do eixo, não na da fatia: o verde de "Estáveis"
                    // como texto sobre o cartão ficava em 2,5:1.
                    label={({ name, percent, x, y, textAnchor }) => (
                      <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill="var(--grafico-eixo)" fontSize={12}>
                        {`${name} ${(percent * 100).toFixed(0)}%`}
                      </text>
                    )}
                    outerRadius={70}
                    dataKey="value"
                  >
                    {distribuicao.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={ESTILO_DICA} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Painel>

          <Painel titulo="Ocorrências por hora (24 h)">
            {ultimas24h.length === 0 ? (
              <Vazio texto="Nenhuma ocorrência nas últimas 24 horas." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={porHora}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" />
                  <XAxis dataKey="hora" stroke="var(--grafico-eixo)" style={{ fontSize: '11px' }} interval={3} />
                  <YAxis stroke="var(--grafico-eixo)" style={{ fontSize: '12px' }} allowDecimals={false} />
                  <Tooltip contentStyle={ESTILO_DICA} />
                  <Line type="monotone" dataKey="total" name="ocorrências" stroke={COLORS.danger} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Painel>

          <Painel titulo="Ocorrências por tipo (24 h)">
            {tipos.length === 0 ? (
              <Vazio texto="Nenhuma ocorrência nas últimas 24 horas." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tipos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" />
                  <XAxis dataKey="tipo" stroke="var(--grafico-eixo)" style={{ fontSize: '11px' }} />
                  <YAxis stroke="var(--grafico-eixo)" style={{ fontSize: '12px' }} allowDecimals={false} />
                  <Tooltip contentStyle={ESTILO_DICA} />
                  <Bar dataKey="total" name="ocorrências" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Painel>
        </div>

        {/* Eventos recentes, detecção e câmeras */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-800">Últimas ocorrências</h3>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('alerts')}
                  className="flex items-center gap-1 text-xs text-marca-texto hover:underline"
                >
                  Central de alertas <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
            {eventosRecentes.length === 0 ? (
              <Vazio texto={carregandoOcorrencias ? 'Carregando…' : 'Nenhuma ocorrência registrada.'} />
            ) : (
              eventosRecentes.map((o) => <EventCard key={o.id} event={paraEvento(o)} />)
            )}
          </div>

          {/* Sem número aqui até existir um número medido: a validação com os
              vídeos anotados (visao/avaliar.py) é o que produz precisão e
              recall. Antes disso, qualquer porcentagem seria inventada. */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-700">Detecção de quedas</h3>
              <Target className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-3xl text-gray-800 mb-1">—</p>
            <p className="text-sm text-gray-600">Precisão e recall ainda não medidos</p>
            <div className="mt-3 flex items-center gap-1 text-xs text-purple-700">
              <Lightbulb className="w-3 h-3" />
              <span>Publicados após a validação com vídeos anotados</span>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-800">Câmeras</h3>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('monitoring')}
                  className="flex items-center gap-1 text-xs text-marca-texto hover:underline"
                >
                  Monitoramento <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
            {cameras.length === 0 ? (
              <Vazio texto={carregando ? 'Carregando…' : 'Nenhuma câmera cadastrada.'} />
            ) : (
              <ul className="space-y-2">
                {cameras.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="min-w-0 truncate text-gray-700">
                      {c.identificador} <span className="text-gray-400">· {c.ambienteNome}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${c.conectada ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.conectada ? 'conectada' : 'sem sinal'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Pacientes */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-gray-800">Pacientes em monitoramento</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Activity className="w-5 h-5 text-marca-texto" />
                situação derivada das ocorrências abertas
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FiltroBotao ativo={filtro === 'all'} cor="bg-marca text-white" inativo="bg-gray-100 text-gray-600 hover:bg-gray-200" onClick={() => setFiltro('all')}>
                Todos ({pacientes.length})
              </FiltroBotao>
              <FiltroBotao ativo={filtro === 'critical'} cor="bg-red-500 text-white" inativo="bg-red-50 text-red-600 hover:bg-red-100" onClick={() => setFiltro('critical')}>
                Críticos ({criticos})
              </FiltroBotao>
              <FiltroBotao ativo={filtro === 'attention'} cor="bg-yellow-400 text-yellow-950" inativo="bg-yellow-50 text-yellow-600 hover:bg-yellow-100" onClick={() => setFiltro('attention')}>
                Atenção ({atencao})
              </FiltroBotao>
              <FiltroBotao ativo={filtro === 'stable'} cor="bg-green-500 text-white" inativo="bg-green-50 text-green-600 hover:bg-green-100" onClick={() => setFiltro('stable')}>
                Estáveis ({estaveis})
              </FiltroBotao>
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center gap-2 px-6 py-8 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando pacientes…
            </div>
          ) : visiveis.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500">
              {pacientes.length === 0 ? 'Nenhum paciente internado nesta clínica.' : 'Nenhum paciente neste filtro.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Paciente</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Ambiente</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Situação</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Ocorrências abertas</th>
                    <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Última ocorrência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {visiveis.map((p) => (
                    <PatientRow key={p.id} paciente={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {mostrarBuilder && <DashboardBuilder onClose={() => setMostrarBuilder(false)} />}
    </main>
  );
}

function paraEvento(o: OcorrenciaResumo) {
  return {
    id: o.id,
    type: gravidadeDe(o),
    title: rotuloDoEvento(o.tipoEvento),
    location: o.cameraIdentificador ? `${o.ambienteNome} · ${o.cameraIdentificador}` : o.ambienteNome,
    patient: o.pacienteNome ?? 'Paciente não identificado',
    time: quandoFoi(o.dataHora),
  };
}

function Painel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-gray-800 mb-4">{titulo}</h3>
      {children}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="flex h-[200px] items-center justify-center text-sm text-gray-400">{texto}</p>;
}

function FiltroBotao({
  ativo, cor, inativo, onClick, children,
}: {
  ativo: boolean; cor: string; inativo: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`px-4 py-2 rounded-lg text-sm transition-colors ${ativo ? cor : inativo}`}>
      {children}
    </button>
  );
}
