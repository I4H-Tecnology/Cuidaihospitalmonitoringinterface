import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, CameraOff, DoorOpen, RefreshCw, Search, UserRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, fetchAmbientes, type AmbienteResumo } from '../../data/api';
import type { Screen } from '../../data/rbac';
import { Aviso, BOTAO_SECUNDARIO, CabecalhoSecao, Carregando } from './ui';
import type { SecaoConfiguracao } from './secoes';

/**
 * Ambientes: quartos e áreas da clínica, direto de `/api/ambientes`.
 *
 * Substitui a árvore Andar → Setor → Quarto → Leito, que era inventada: o
 * modelo não tem andar, setor nem leito, só ambiente (com tipo), câmera e
 * paciente internado nele. A tela mostra isso, e aponta o que pede ação:
 * ambiente sem câmera é ambiente onde queda não é detectada.
 */

const TIPOS: Record<string, string> = {
  quarto: 'Quarto', corredor: 'Corredor', sala_convivencia: 'Sala de convivência',
  refeitorio: 'Refeitório', banheiro: 'Banheiro', outro: 'Outro',
};

export function SecaoAmbientes({ aoIrPara, onNavigate }: {
  aoIrPara: (secao: SecaoConfiguracao) => void; onNavigate?: (tela: Screen) => void;
}) {
  const { tenantId, can } = useAuth();
  const [ambientes, setAmbientes] = useState<AmbienteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('todos');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      setAmbientes(await fetchAmbientes(tenantId));
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError && err.status === 403
        ? 'Seu perfil não permite ver os ambientes (é preciso acesso ao monitoramento).'
        : 'Não foi possível carregar os ambientes.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  const tiposPresentes = useMemo(() => [...new Set(ambientes.map((a) => a.tipo))].sort(), [ambientes]);
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ambientes
      .filter((a) => tipo === 'todos' || a.tipo === tipo)
      .filter((a) => !termo || `${a.nome} ${a.pacienteNome ?? ''}`.toLowerCase().includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  }, [ambientes, busca, tipo]);

  const semCamera = ambientes.filter((a) => a.cameras === 0).length;
  const ocupados = ambientes.filter((a) => a.pacienteNome).length;

  return (
    <div className="space-y-6">
      <CabecalhoSecao
        titulo="Ambientes"
        descricao="Quartos e áreas da clínica, com as câmeras e o paciente internado em cada um."
        acao={
          <button type="button" onClick={carregar} disabled={carregando} className={BOTAO_SECUNDARIO}>
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
        }
      />

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!erro && (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Indicador rotulo="Ambientes" valor={ambientes.length} />
          <Indicador rotulo="Com paciente" valor={ocupados} />
          <Indicador rotulo="Sem câmera" valor={semCamera} destaque={semCamera > 0} />
        </dl>
      )}

      {semCamera > 0 && (
        <Aviso>
          {semCamera === 1 ? '1 ambiente não tem câmera' : `${semCamera} ambientes não têm câmera`}: queda ali não é detectada.{' '}
          <button type="button" onClick={() => aoIrPara('dispositivos')} className="font-medium underline">
            Vincular uma câmera
          </button>
        </Aviso>
      )}

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Buscar ambiente ou paciente</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ambiente ou paciente"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Tipo
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva"
            >
              <option value="todos">Todos</option>
              {tiposPresentes.map((t) => <option key={t} value={t}>{TIPOS[t] ?? t}</option>)}
            </select>
          </label>
        </div>

        {carregando && ambientes.length === 0 ? (
          <div className="px-4"><Carregando /></div>
        ) : visiveis.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-600">
            {ambientes.length === 0 ? 'Nenhum ambiente cadastrado ainda.' : 'Nenhum ambiente com esse filtro.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visiveis.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-suave text-marca-texto">
                  <DoorOpen className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{a.nome}</p>
                  <p className="text-xs text-gray-600">{TIPOS[a.tipo] ?? a.tipo}</p>
                </div>
                <span className="flex min-w-[10rem] items-center gap-1.5 text-sm text-gray-700">
                  <UserRound className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                  {a.pacienteNome ?? <span className="text-gray-500">Sem paciente</span>}
                </span>
                {a.cameras > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-700">
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    {a.cameras === 1 ? '1 câmera' : `${a.cameras} câmeras`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">
                    <CameraOff className="h-3.5 w-3.5" aria-hidden="true" />
                    Sem câmera
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-gray-600">
        Criar e renomear ambientes ainda não tem tela: hoje isso é feito no cadastro inicial da clínica.
        {onNavigate && can('beds', 'view') && (
          <>
            {' '}A ocupação em tempo real fica em{' '}
            <button type="button" onClick={() => onNavigate('beds-rooms')} className="text-marca-texto underline">
              Ambientes Monitorados
            </button>.
          </>
        )}
      </p>
    </div>
  );
}

function Indicador({ rotulo, valor, destaque = false }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${destaque ? 'border-amber-200' : 'border-gray-200'}`}>
      <dt className="text-sm text-gray-600">{rotulo}</dt>
      <dd className={`mt-1 text-2xl ${destaque ? 'text-amber-800' : 'text-gray-900'}`}>{valor}</dd>
    </div>
  );
}
