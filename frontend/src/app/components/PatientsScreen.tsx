import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import { StructureView } from './patients/StructureView';
import { ListView } from './patients/ListView';
import { ModalPaciente } from './pep/ModalPaciente';
import { useAuth } from '../contexts/AuthContext';
import { fetchAmbientes, fetchPacientes } from '../data/api';
import type { AmbienteResumo, PacienteResumo } from '../data/api';

/**
 * Gestao de pacientes.
 *
 * Tinha dez pacientes fixos no codigo, com diagnostico, leito e um "risco de
 * IA" que ninguem calculava. Agora le o cadastro real -- os MESMOS pacientes
 * que o prontuario mostra, que e o que um avaliador espera ao clicar aqui.
 *
 * A legenda da Figura 5 da RFC autoriza exatamente este recorte: "no MVP,
 * aproveita-se o cadastro e o status dos pacientes monitorados".
 */

interface Props {
  /** Abre o prontuario do paciente, quando quem monta a tela sabe navegar. */
  aoAbrirPaciente?: (paciente: PacienteResumo) => void;
}

export function PatientsScreen({ aoAbrirPaciente }: Props) {
  const { tenantId, can } = useAuth();
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [ambientes, setAmbientes] = useState<AmbienteResumo[]>([]);
  const [visao, setVisao] = useState<'estrutura' | 'lista'>('estrutura');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalNovo, setModalNovo] = useState(false);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [p, a] = await Promise.all([fetchPacientes(tenantId), fetchAmbientes(tenantId)]);
      setPacientes(p);
      setAmbientes(a);
      setErro(null);
    } catch {
      setErro('Não foi possível carregar os pacientes.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const contagem = useMemo(() => {
    const de = (s: PacienteResumo['situacao']) => pacientes.filter((p) => p.situacao === s).length;
    return {
      total: pacientes.length,
      estaveis: de('stable'),
      atencao: de('attention'),
      criticos: de('critical'),
      semVinculo: pacientes.filter((p) => !p.ambienteId).length,
    };
  }, [pacientes]);

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Gestão de Pacientes</h1>
          <p className="text-sm text-gray-500">
            {carregando
              ? 'Carregando…'
              : `${contagem.total} paciente(s) internado(s) · ${ambientes.length} ambiente(s)`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={carregar}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2
                       text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
          {can('patients', 'create') && (
            <button
              type="button"
              onClick={() => setModalNovo(true)}
              className="flex items-center gap-2 rounded-lg bg-marca px-5 py-2.5 text-sm
                         text-white shadow-sm transition-colors hover:bg-marca-hover"
            >
              <UserPlus className="h-4 w-4" />
              Admitir paciente
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Indicador rotulo="Internados" valor={contagem.total} borda="" />
        <Indicador rotulo="Estáveis" valor={contagem.estaveis} borda="border-l-4 border-l-green-500" />
        <Indicador rotulo="Em atenção" valor={contagem.atencao} borda="border-l-4 border-l-yellow-500" />
        <Indicador rotulo="Com ocorrência aberta" valor={contagem.criticos} borda="border-l-4 border-l-red-500" />
        {/* Sem ambiente = queda detectada que nao tem a quem ser atribuida.
            Merece um contador proprio, nao um detalhe escondido na lista. */}
        <Indicador rotulo="Sem ambiente" valor={contagem.semVinculo} borda="border-l-4 border-l-amber-500" />
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-gray-600">Visualizar por:</span>
          <div className="flex rounded-lg bg-gray-100 p-1">
            {([
              ['estrutura', 'Ambientes', LayoutGrid],
              ['lista', 'Lista de pacientes', List],
            ] as const).map(([valor, texto, Icone]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setVisao(valor)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors ${
                  visao === valor
                    ? 'bg-marca text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Icone className="h-4 w-4" />
                {texto}
              </button>
            ))}
          </div>
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-8 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Carregando pacientes…</span>
        </div>
      ) : visao === 'estrutura' ? (
        <StructureView pacientes={pacientes} ambientes={ambientes} aoAbrir={aoAbrirPaciente} />
      ) : (
        <ListView pacientes={pacientes} aoAbrir={aoAbrirPaciente} />
      )}

      {modalNovo && (
        <ModalPaciente
          aoFechar={() => setModalNovo(false)}
          aoSalvar={() => {
            setModalNovo(false);
            void carregar();
          }}
        />
      )}
    </main>
  );
}

function Indicador({ rotulo, valor, borda }: { rotulo: string; valor: number; borda: string }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${borda} p-4 shadow-sm`}>
      <p className="mb-1 text-sm text-gray-500">{rotulo}</p>
      <p className="text-3xl text-gray-800">{valor}</p>
    </div>
  );
}
