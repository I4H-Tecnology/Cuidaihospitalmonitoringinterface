import { useMemo, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle, Clock, Loader2, MapPin, Search, User, Wifi, WifiOff,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAlertas } from '../data/useAlertas';
import { ApiError, darCiencia, encerrarOcorrencia, iniciarAtendimento } from '../data/api';
import type { ClassificacaoOcorrencia, OcorrenciaResumo } from '../data/api';
import { ModalEncerrarOcorrencia } from './ModalEncerrarOcorrencia';

/**
 * Central de alertas.
 *
 * Substitui a lista fixa de seis alertas inventados pelas ocorrencias reais, e
 * fecha o ciclo do RF17 ao RF20: ciencia, atendimento e encerramento com
 * classificacao.
 *
 * O alerta permanece visivel ate alguem dar ciencia (RN12). Nada some por
 * tempo -- alerta que desaparece sozinho vira alerta esquecido.
 */

const ROTULO_EVENTO: Record<string, string> = {
  queda: 'Queda',
  permanencia_solo: 'Permanência no chão',
  perda_verticalidade: 'Perda de verticalidade',
  ausencia_prolongada: 'Ausência prolongada',
};

const ESTILO: Record<string, { fundo: string; barra: string; chip: string; rotulo: string }> = {
  pendente: {
    fundo: 'bg-red-50', barra: 'border-l-red-500',
    chip: 'bg-red-500 text-white', rotulo: 'Pendente',
  },
  em_atendimento: {
    fundo: 'bg-blue-50', barra: 'border-l-blue-500',
    chip: 'bg-blue-500 text-white', rotulo: 'Em atendimento',
  },
  queda_confirmada: {
    fundo: 'bg-white', barra: 'border-l-red-700',
    chip: 'bg-red-700 text-white', rotulo: 'Queda confirmada',
  },
  falso_positivo: {
    fundo: 'bg-white', barra: 'border-l-gray-400',
    chip: 'bg-gray-400 text-white', rotulo: 'Falso positivo',
  },
  encerrada: {
    fundo: 'bg-white', barra: 'border-l-green-500',
    chip: 'bg-green-500 text-white', rotulo: 'Encerrada',
  },
};

type Filtro = 'todos' | 'pendente' | 'em_atendimento' | 'encerrados';

function quandoFoi(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h atrás` : `${Math.floor(h / 24)}d atrás`;
}

export function AlertsScreen() {
  const { tenantId, can } = useAuth();
  const { ocorrencias, canal, carregando, erro, recarregar } = useAlertas(tenantId);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState<OcorrenciaResumo | null>(null);

  const podeAtender = can('alerts', 'edit');

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ocorrencias.filter((o) => {
      const casaBusca =
        !termo ||
        (o.pacienteNome ?? '').toLowerCase().includes(termo) ||
        o.ambienteNome.toLowerCase().includes(termo) ||
        (o.cameraIdentificador ?? '').toLowerCase().includes(termo);
      const casaFiltro =
        filtro === 'todos' ||
        (filtro === 'encerrados'
          ? ['encerrada', 'falso_positivo', 'queda_confirmada'].includes(o.status)
          : o.status === filtro);
      return casaBusca && casaFiltro;
    });
  }, [ocorrencias, busca, filtro]);

  const contagem = useMemo(() => {
    const de = (s: string) => ocorrencias.filter((o) => o.status === s).length;
    return {
      total: ocorrencias.length,
      pendente: de('pendente'),
      atendendo: de('em_atendimento'),
      confirmadas: de('queda_confirmada'),
      falsos: de('falso_positivo'),
    };
  }, [ocorrencias]);

  const agir = async (id: string, acao: () => Promise<unknown>) => {
    setOcupado(id);
    setFalha(null);
    try {
      await acao();
      await recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Central de Alertas</h1>
          <p className="text-sm text-gray-500">
            Ocorrências detectadas pelo serviço de visão, em tempo real
          </p>
        </div>
        {/* O estado do canal fica visivel de proposito: se o tempo real caiu, a
            equipe precisa saber que esta vendo dado com ate 20s de atraso. */}
        <IndicadorDoCanal estado={canal} />
      </div>

      {(erro || falha) && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{falha ?? erro}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Indicador rotulo="Total" valor={contagem.total} cor="border-gray-300" />
        <Indicador rotulo="Pendentes" valor={contagem.pendente} cor="border-red-500" />
        <Indicador rotulo="Em atendimento" valor={contagem.atendendo} cor="border-blue-500" />
        <Indicador rotulo="Quedas confirmadas" valor={contagem.confirmadas} cor="border-red-700" />
        {/* Falso positivo aparece no painel porque e insumo da RN14: e o unico
            rotulo que vem da operacao real e alimenta a recalibragem. */}
        <Indicador rotulo="Falsos positivos" valor={contagem.falsos} cor="border-gray-400" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por paciente, ambiente ou câmera"
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm
                       focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]"
          />
        </div>
        <div className="flex gap-1">
          {([
            ['todos', 'Todos'],
            ['pendente', 'Pendentes'],
            ['em_atendimento', 'Em atendimento'],
            ['encerrados', 'Encerrados'],
          ] as [Filtro, string][]).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filtro === valor
                  ? 'bg-[#0A7EA4] text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-8 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Carregando ocorrências…</span>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <CheckCircle className="mx-auto mb-3 h-8 w-8 text-gray-400" />
          <p className="text-gray-700">
            {ocorrencias.length === 0 ? 'Nenhuma ocorrência registrada.' : 'Nada neste filtro.'}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            O que aparecer aqui vem do serviço de visão. Nenhum alerta desta tela é de exemplo.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiveis.map((o) => (
            <CartaoAlerta
              key={o.id}
              ocorrencia={o}
              ocupado={ocupado === o.id}
              podeAtender={podeAtender}
              aoDarCiencia={() => agir(o.id, () => darCiencia(tenantId!, o.id))}
              aoAtender={() => agir(o.id, () => iniciarAtendimento(tenantId!, o.id))}
              aoEncerrar={() => setEncerrando(o)}
            />
          ))}
        </div>
      )}

      {encerrando && tenantId && (
        <ModalEncerrarOcorrencia
          ocorrencia={encerrando}
          aoFechar={() => setEncerrando(null)}
          aoConfirmar={async (classificacao: ClassificacaoOcorrencia, observacao?: string) => {
            await agir(encerrando.id, () =>
              encerrarOcorrencia(tenantId, encerrando.id, classificacao, observacao)
            );
            setEncerrando(null);
          }}
        />
      )}
    </main>
  );
}

function IndicadorDoCanal({ estado }: { estado: 'conectando' | 'conectado' | 'desconectado' }) {
  if (estado === 'conectado') {
    return (
      <span className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
        <Wifi className="w-4 h-4" />
        Tempo real ativo
      </span>
    );
  }
  if (estado === 'conectando') {
    return (
      <span className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
        <Loader2 className="w-4 h-4 animate-spin" />
        Conectando…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <WifiOff className="w-4 h-4" />
      Sem tempo real — atualizando a cada 20s
    </span>
  );
}

function Indicador({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className={`bg-white rounded-lg border-l-4 ${cor} border border-gray-200 p-4 shadow-sm`}>
      <p className="text-2xl text-gray-800">{valor}</p>
      <p className="text-xs text-gray-500">{rotulo}</p>
    </div>
  );
}

function CartaoAlerta({
  ocorrencia: o, ocupado, podeAtender, aoDarCiencia, aoAtender, aoEncerrar,
}: {
  ocorrencia: OcorrenciaResumo;
  ocupado: boolean;
  podeAtender: boolean;
  aoDarCiencia: () => void;
  aoAtender: () => void;
  aoEncerrar: () => void;
}) {
  const estilo = ESTILO[o.status] ?? ESTILO.encerrada;
  const aberta = o.status === 'pendente' || o.status === 'em_atendimento';
  const semCiencia = o.alertaStatus && o.alertaStatus !== 'ciente';

  return (
    <div className={`${estilo.fundo} ${estilo.barra} border-l-4 border border-gray-200 rounded-lg p-4 shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-gray-600" />
          <span className="text-gray-800">{ROTULO_EVENTO[o.tipoEvento] ?? o.tipoEvento}</span>
          {semCiencia && (
            <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
              sem ciência
            </span>
          )}
        </div>
        <span className={`rounded px-2 py-1 text-xs ${estilo.chip}`}>{estilo.rotulo}</span>
      </div>

      <div className="grid gap-1 text-sm text-gray-600">
        {o.pacienteNome && (
          <span className="flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> {o.pacienteNome}
          </span>
        )}
        <span className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5" /> {o.ambienteNome}
          {o.cameraIdentificador && ` · ${o.cameraIdentificador}`}
        </span>
        <span className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" /> {quandoFoi(o.dataHora)}
          {o.confianca != null && ` · escore ${o.confianca.toFixed(2)}`}
        </span>
      </div>

      {o.observacao && (
        <p className="mt-3 rounded bg-white/60 px-3 py-2 text-sm text-gray-600">{o.observacao}</p>
      )}

      {podeAtender && aberta && (
        <div className="mt-4 flex flex-wrap gap-2">
          {semCiencia && (
            <button
              type="button"
              onClick={aoDarCiencia}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2
                         text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              Dar ciência
            </button>
          )}
          {o.status === 'pendente' && (
            <button
              type="button"
              onClick={aoAtender}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0A7EA4] px-4 py-2 text-sm
                         text-white hover:bg-[#0EA5E9] disabled:opacity-60"
            >
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
              Iniciar atendimento
            </button>
          )}
          <button
            type="button"
            onClick={aoEncerrar}
            disabled={ocupado}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2
                       text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <CheckCircle className="w-4 h-4" />
            Encerrar
          </button>
        </div>
      )}
    </div>
  );
}
