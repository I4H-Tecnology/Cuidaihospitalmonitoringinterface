import { useCallback, useEffect, useState } from 'react';
import { MobileHeader } from './components/mobile/MobileHeader';
import { MobileBottomNav } from './components/mobile/MobileBottomNav';
import type { AbaMobile } from './components/mobile/MobileBottomNav';
import { HomeScreen } from './components/mobile/HomeScreen';
import { PatientDetailScreen } from './components/mobile/PatientDetailScreen';
import { AlertsScreen } from './components/mobile/AlertsScreen';
import { useAuth } from './contexts/AuthContext';
import { fetchPacientes, iniciarAtendimento } from './data/api';
import type { PacienteResumo } from './data/api';
import { useAlertas } from './data/useAlertas';

/**
 * App da enfermagem, aberto pelo botão "Ver Versão Mobile" do painel.
 *
 * Mesmas fontes da versão web: pacientes de `/api/pacientes`, ocorrências do
 * `useAlertas`, nome de quem está logado. Antes havia seis pacientes fixos com
 * sinais vitais, uma "Ana Dias" e onze notificações inventadas.
 */

const INTERVALO_MS = 30000;

export function MobileApp() {
  const { tenantId, user, can } = useAuth();
  const { ocorrencias, carregando: carregandoOcorrencias, erro: erroOcorrencias, recarregar } = useAlertas(tenantId);
  const [activeTab, setActiveTab] = useState<AbaMobile>('home');
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<PacienteResumo | null>(null);
  const [atendendo, setAtendendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      setPacientes(await fetchPacientes(tenantId));
      setErro(null);
    } catch {
      setErro('Não foi possível carregar os pacientes.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
    const timer = window.setInterval(carregar, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const pendentes = ocorrencias.filter((o) => o.status === 'pendente').length;

  const atender = async (id: string) => {
    if (!tenantId) return;
    setAtendendo(id);
    try {
      await iniciarAtendimento(tenantId, id);
      await Promise.all([recarregar(), carregar()]);
    } catch {
      setErro('Não foi possível registrar o atendimento.');
    } finally {
      setAtendendo(null);
    }
  };

  if (selecionado) {
    return (
      <PatientDetailScreen
        paciente={selecionado}
        tenantId={tenantId}
        onBack={() => setSelecionado(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FBFC]">
      <MobileHeader userName={user?.name ?? '—'} notificationCount={pendentes} />

      {activeTab === 'home' && (
        <HomeScreen
          pacientes={pacientes}
          carregando={carregando}
          erro={erro}
          onPatientClick={setSelecionado}
        />
      )}

      {activeTab === 'alerts' && (
        <AlertsScreen
          ocorrencias={ocorrencias}
          carregando={carregandoOcorrencias}
          erro={erroOcorrencias ?? erro}
          podeAtender={can('alerts', 'edit')}
          ocupado={atendendo}
          aoAtender={atender}
        />
      )}

      <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} alertasPendentes={pendentes} />
    </div>
  );
}
