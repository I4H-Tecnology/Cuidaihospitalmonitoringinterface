import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BedDouble, ChevronRight, Loader2, RotateCcw, Search, User, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { descreverAmbiente, editarPaciente, fetchPacientes } from '../../data/api';
import { ModalPaciente } from './ModalPaciente';
import type { PacienteResumo } from '../../data/api';

/**
 * Lista de pacientes do prontuario.
 *
 * Vinha de uma lista fixa de seis nomes inventados. Agora le o cadastro real,
 * que e o que a legenda da Figura 5 da RFC autoriza usar no MVP: "aproveita-se
 * o cadastro e o status dos pacientes monitorados".
 */

interface Props {
  onSelectPatient: (paciente: PacienteResumo) => void;
}

const SITUACAO = {
  stable: { rotulo: 'Estável', cor: 'bg-green-100 text-green-700' },
  attention: { rotulo: 'Atenção', cor: 'bg-yellow-100 text-yellow-700' },
  critical: { rotulo: 'Crítico', cor: 'bg-red-100 text-red-700' },
} as const;

function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function PatientListScreen({ onSelectPatient }: Props) {
  const { tenantId, can } = useAuth();
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Alta nao apaga o paciente. Sem este interruptor, dar saida no ultimo
  // fazia a tela ficar vazia sem nenhum caminho de volta.
  const [mostrarSaidas, setMostrarSaidas] = useState(false);
  const [modalNovo, setModalNovo] = useState(false);
  const [reinternando, setReinternando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      setPacientes(await fetchPacientes(tenantId, mostrarSaidas));
      setErro(null);
    } catch {
      setErro('Não foi possível carregar os pacientes.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId, mostrarSaidas]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const reinternar = async (id: string) => {
    setReinternando(id);
    try {
      await editarPaciente(id, { tenantId: tenantId!, status: 'internado' });
      await carregar();
    } catch {
      setErro('Não foi possível reinternar o paciente.');
    } finally {
      setReinternando(null);
    }
  };

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return pacientes;
    return pacientes.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        (p.ambienteNome ?? '').toLowerCase().includes(termo)
    );
  }, [pacientes, busca]);

  const contar = (s: PacienteResumo['situacao']) =>
    pacientes.filter((p) => p.situacao === s).length;

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Prontuário Eletrônico</h1>
          <p className="text-sm text-gray-500">Selecione um paciente para visualizar o prontuário</p>
        </div>
        {can('patients', 'create') && (
          <button
            type="button"
            onClick={() => setModalNovo(true)}
            className="px-5 py-2.5 bg-[#0A7EA4] text-white rounded-lg text-sm
                       hover:bg-[#0EA5E9] transition-colors flex items-center gap-2 shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Admitir paciente
          </button>
        )}
      </div>

      {erro && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou ambiente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Cartao rotulo="Internados" valor={pacientes.length} borda="" />
        <Cartao rotulo="Estáveis" valor={contar('stable')} borda="border-l-4 border-l-green-500" />
        <Cartao rotulo="Atenção" valor={contar('attention')} borda="border-l-4 border-l-yellow-500" />
        <Cartao rotulo="Com ocorrência aberta" valor={contar('critical')} borda="border-l-4 border-l-red-500" />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-gray-800">
            {mostrarSaidas ? 'Todos os pacientes' : 'Pacientes internados'}
          </h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={mostrarSaidas}
              onChange={(e) => setMostrarSaidas(e.target.checked)}
            />
            Mostrar quem recebeu alta ou foi transferido
          </label>
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 px-6 py-10 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando pacientes…</span>
          </div>
        ) : visiveis.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-gray-700">
              {pacientes.length === 0 ? 'Nenhum paciente internado.' : 'Nada nesta busca.'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {pacientes.length === 0 && !mostrarSaidas
                ? 'Marque a caixa acima para ver quem recebeu alta, ou admita um paciente novo.'
                : 'Os pacientes vêm do cadastro da clínica, não de dados de exemplo.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {visiveis.map((p) => {
              const s = SITUACAO[p.situacao];
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectPatient(p)}
                  className="w-full px-6 py-4 hover:bg-gray-50 transition-colors flex items-center gap-4 group text-left"
                >
                  <div className="w-12 h-12 shrink-0 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-full flex items-center justify-center text-white">
                    <User className="w-6 h-6" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                      <h3 className="text-gray-800">{p.nome}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs ${s.cor}`}>{s.rotulo}</span>
                      {p.ocorrenciasAbertas > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded text-xs">
                          <AlertCircle className="w-3 h-3" />
                          {p.ocorrenciasAbertas} em aberto
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      {/* Só o que o cadastro tem. A tela antiga mostrava sexo e
                          leito; nenhum dos dois existe na entidade Paciente. */}
                      {p.idade != null && <span>{p.idade} anos</span>}
                      {p.ambienteNome && (
                        <span className="flex items-center gap-1">
                          <BedDouble className="w-4 h-4" />
                          {descreverAmbiente(p.ambienteNome, p.ambienteTipo)}
                        </span>
                      )}
                      <span>Internado em {dataBR(p.dataAdmissao)}</span>
                      {p.status !== 'internado' && (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {p.status === 'alta' ? 'Alta' : 'Transferido'}
                          {p.dataAlta && ` em ${dataBR(p.dataAlta)}`}
                        </span>
                      )}
                      {p.totalOcorrencias > 0 && (
                        <span>{p.totalOcorrencias} ocorrência(s) no histórico</span>
                      )}
                    </div>
                  </div>

                  {p.status !== 'internado' && can('patients', 'edit') && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); reinternar(p.id); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault(); e.stopPropagation(); reinternar(p.id);
                        }
                      }}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-300
                                 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                    >
                      {reinternando === p.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw className="w-3.5 h-3.5" />}
                      Reinternar
                    </span>
                  )}
                  <ChevronRight className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-[#0A7EA4] transition-colors" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      {modalNovo && (
        <ModalPaciente
          aoFechar={() => setModalNovo(false)}
          aoSalvar={(novo) => {
            setModalNovo(false);
            setPacientes((atuais) => [novo, ...atuais]);
          }}
        />
      )}
    </main>
  );
}

function Cartao({ rotulo, valor, borda }: { rotulo: string; valor: number; borda: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${borda} p-4 shadow-sm`}>
      <p className="text-sm text-gray-500 mb-1">{rotulo}</p>
      <p className="text-3xl text-gray-800">{valor}</p>
    </div>
  );
}
