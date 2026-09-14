import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, Camera, DoorOpen, Loader2, RotateCcw, Search, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAmbientes, fetchCameras } from '../data/api';
import type { AmbienteResumo, CameraResumo } from '../data/api';
import { quandoFoi } from '../data/tempo';

/**
 * Ambientes monitorados: o que o produto sabe sobre cada lugar da clínica.
 *
 * A versão anterior desenhava andares, quartos e leitos individuais, com
 * nomes de paciente e "última ocorrência" inventados. O modelo de dados não
 * tem andar nem leito: tem `ambiente` (quarto, corredor, sala), com câmeras e,
 * quando há, um paciente internado. É isso que a tela mostra, tudo vindo de
 * `/api/ambientes` e `/api/cameras`.
 */

const INTERVALO_MS = 30000;

const TIPO: Record<string, string> = {
  quarto: 'Quarto',
  corredor: 'Corredor',
  sala_convivencia: 'Sala de convivência',
  refeitorio: 'Refeitório',
  banheiro: 'Banheiro',
  outro: 'Outro',
};

export function BedsRoomsScreen() {
  const { tenantId } = useAuth();
  const [ambientes, setAmbientes] = useState<AmbienteResumo[]>([]);
  const [cameras, setCameras] = useState<CameraResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [a, c] = await Promise.all([fetchAmbientes(tenantId), fetchCameras(tenantId)]);
      setAmbientes(a);
      setCameras(c);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar os ambientes.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
    const timer = window.setInterval(carregar, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const camerasPorAmbiente = useMemo(() => {
    const mapa = new Map<string, CameraResumo[]>();
    for (const c of cameras) {
      mapa.set(c.ambienteId, [...(mapa.get(c.ambienteId) ?? []), c]);
    }
    return mapa;
  }, [cameras]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return ambientes;
    return ambientes.filter(
      (a) => a.nome.toLowerCase().includes(termo) || (a.pacienteNome ?? '').toLowerCase().includes(termo),
    );
  }, [ambientes, busca]);

  const conectadas = cameras.filter((c) => c.conectada).length;
  const comPaciente = ambientes.filter((a) => a.pacienteNome).length;

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Ambientes monitorados</h1>
          <p className="text-sm text-gray-500">
            {carregando
              ? 'Carregando…'
              : `${ambientes.length} ambiente${ambientes.length === 1 ? '' : 's'} · ${comPaciente} com paciente · ${conectadas} de ${cameras.length} câmeras conectadas`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ambiente ou paciente"
              className="rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
            />
          </div>
          <button
            type="button"
            onClick={carregar}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" />
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando ambientes…
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          {ambientes.length === 0
            ? 'Nenhum ambiente cadastrado. Cadastre quartos e câmeras em Monitoramento.'
            : 'Nenhum ambiente corresponde à busca.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visiveis.map((a) => {
            const cams = camerasPorAmbiente.get(a.id) ?? [];
            const ocorrencias24h = cams.reduce((s, c) => s + c.ocorrencias24h, 0);
            const ultima = cams
              .map((c) => c.ultimaOcorrencia)
              .filter((u): u is string => !!u)
              .sort()
              .at(-1);
            const semSinal = cams.filter((c) => !c.conectada).length;
            return (
              <section key={a.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <DoorOpen className="h-5 w-5 text-[#0A7EA4]" />
                    <div>
                      <h3 className="text-gray-800">{a.nome}</h3>
                      <p className="text-xs text-gray-500">{TIPO[a.tipo] ?? a.tipo}</p>
                    </div>
                  </div>
                  {ocorrencias24h > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      <Bell className="h-3 w-3" /> {ocorrencias24h} em 24 h
                    </span>
                  )}
                </header>

                <div className="mb-3 flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-gray-400" />
                  {a.pacienteNome ? (
                    <span className="text-gray-700">{a.pacienteNome}</span>
                  ) : (
                    <span className="text-gray-400">Sem paciente vinculado</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {cams.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-gray-400">
                      <Camera className="h-4 w-4" /> Nenhuma câmera neste ambiente
                    </p>
                  ) : (
                    cams.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-700">
                          <Camera className="h-4 w-4 text-gray-400" /> {c.identificador}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${c.conectada ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.conectada ? 'conectada' : 'sem sinal'}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <footer className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  {ultima ? `Última ocorrência ${quandoFoi(ultima)}` : 'Nenhuma ocorrência registrada'}
                  {semSinal > 0 && <span className="ml-2 text-amber-700">· {semSinal} câmera{semSinal > 1 ? 's' : ''} sem sinal</span>}
                </footer>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
