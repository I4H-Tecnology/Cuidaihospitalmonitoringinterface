import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileCheck2, QrCode, RefreshCw, ShieldCheck, Smartphone, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  ApiError, fetchAcompanhantesDaClinica, fetchPacientes, revogarAcompanhante,
  type AcompanhanteDaClinica, type PacienteResumo,
} from '../data/api';
import { quandoFoi, quantoFalta } from '../data/tempo';
import { ModalAcompanhante } from './pep/ModalAcompanhante';
import {
  AbasDeFiltro, Aviso, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Busca, CAMPO, Carregando, Indicador, Janela, ROTULO,
} from './settings/ui';

/**
 * App Paciente: os acessos da família à câmera do paciente, da clínica toda.
 *
 * O acesso nasce na aba de acompanhantes do prontuário (ou aqui, escolhendo o
 * paciente) e é usado no portal /familia, que o QR Code abre. Esta tela é o
 * painel da equipe sobre isso: quem tem acesso agora, a quem, até quando, se
 * já aceitou o termo de confidencialidade (RN04) e quando usou pela última
 * vez. Revogar daqui corta o vídeo da família em até 30 s (RN07).
 */

type Filtro = 'ativos' | 'encerrados' | 'todos';

const vale = (a: AcompanhanteDaClinica) => a.ativo && new Date(a.expiraEm).getTime() > Date.now();

/** Documento só com o fim à vista: a lista é vista por toda a enfermagem. */
const mascarar = (doc: string) => (doc.length > 4 ? `•••${doc.slice(-4)}` : doc);

export function AppPacienteScreen() {
  const { tenantId, can } = useAuth();
  const [acessos, setAcessos] = useState<AcompanhanteDaClinica[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [busca, setBusca] = useState('');
  const [revogando, setRevogando] = useState<AcompanhanteDaClinica | null>(null);
  const [escolhendoPaciente, setEscolhendoPaciente] = useState(false);
  const [pacienteDoNovoAcesso, setPacienteDoNovoAcesso] = useState<PacienteResumo | null>(null);
  const podeLiberar = can('companions', 'edit');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      setAcessos(await fetchAcompanhantesDaClinica(tenantId));
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os acessos.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  const ativos = acessos.filter(vale);
  const venceLogo = ativos.filter((a) => new Date(a.expiraEm).getTime() - Date.now() < 24 * 3600_000);
  const usaram = ativos.filter((a) => a.ultimoAcessoEm);
  const semTermo = ativos.filter((a) => !a.termoAceitoEm);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return acessos
      .filter((a) => filtro === 'todos' || (filtro === 'ativos' ? vale(a) : !vale(a)))
      .filter((a) => !termo || `${a.nome} ${a.pacienteNome} ${a.ambienteNome ?? ''}`.toLowerCase().includes(termo));
  }, [acessos, filtro, busca]);

  return (
    <main className="flex-1 space-y-6 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-gray-900">App Paciente</h1>
          <p className="mt-1 text-sm text-gray-600">Quem da família pode ver a câmera de cada paciente, até quando, e se já usou.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={carregar} disabled={carregando} className={BOTAO_SECUNDARIO}>
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
          {podeLiberar && (
            <button type="button" onClick={() => setEscolhendoPaciente(true)} className={BOTAO_PRIMARIO}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Novo acesso
            </button>
          )}
        </div>
      </div>

      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo="Acessos ativos" valor={ativos.length} />
        <Indicador rotulo="Vencem em 24 h" valor={venceLogo.length} tom={venceLogo.length ? 'atencao' : 'neutro'} />
        <Indicador rotulo="Já usaram o app" valor={usaram.length} detalhe={ativos.length ? `de ${ativos.length} ativos` : undefined} />
        <Indicador rotulo="Sem termo aceito" valor={semTermo.length} detalhe="não veem vídeo até aceitar" />
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center">
            <AbasDeFiltro
              rotulo="Filtrar acessos"
              valor={filtro}
              aoMudar={setFiltro}
              opcoes={[
                { valor: 'ativos', rotulo: 'Ativos', contagem: ativos.length },
                { valor: 'encerrados', rotulo: 'Encerrados', contagem: acessos.length - ativos.length },
                { valor: 'todos', rotulo: 'Todos', contagem: acessos.length },
              ]}
            />
            <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar familiar, paciente ou quarto" />
          </div>

          {carregando && acessos.length === 0 ? (
            <div className="px-4"><Carregando /></div>
          ) : visiveis.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Smartphone className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
              <p className="mt-2 text-sm text-gray-700">
                {acessos.length === 0 ? 'Nenhum acesso de família criado ainda.' : 'Nenhum acesso com esse filtro.'}
              </p>
              {acessos.length === 0 && podeLiberar && (
                <button type="button" onClick={() => setEscolhendoPaciente(true)} className={`${BOTAO_SECUNDARIO} mt-4`}>
                  Criar o primeiro acesso
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {visiveis.map((a) => {
                const ativo = vale(a);
                return (
                  <li key={a.id} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{a.nome}</p>
                      <p className="text-xs text-gray-600">Doc. {mascarar(a.documento)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-800">{a.pacienteNome}</p>
                      <p className="truncate text-xs text-gray-600">{a.ambienteNome ?? 'Sem quarto vinculado'}</p>
                    </div>
                    <div className="space-y-1 text-xs">
                      {ativo ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-green-700">Vence {quantoFalta(a.expiraEm)}</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                          {a.revogadoEm ? `Revogado ${quandoFoi(a.revogadoEm)}` : 'Expirado'}
                        </span>
                      )}
                      <p className="flex items-center gap-1 text-gray-600">
                        <FileCheck2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {a.termoAceitoEm ? 'Termo aceito' : 'Termo pendente'}
                        {' · '}
                        {a.ultimoAcessoEm ? `usou ${quandoFoi(a.ultimoAcessoEm)}` : 'nunca usou'}
                      </p>
                    </div>
                    <div className="md:text-right">
                      {ativo && podeLiberar && (
                        <button type="button" onClick={() => setRevogando(a)} className="rounded-lg px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                          Revogar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-base text-gray-900">Como funciona</h2>
            <ol className="mt-3 space-y-3 text-sm text-gray-700">
              <li className="flex gap-3"><QrCode className="mt-0.5 h-4 w-4 shrink-0 text-marca-texto" aria-hidden="true" />A equipe cria o acesso e mostra o QR Code ao familiar (uma vez só).</li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-marca-texto" aria-hidden="true" />O familiar abre no celular e aceita o termo de confidencialidade.</li>
              <li className="flex gap-3"><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-marca-texto" aria-hidden="true" />Vê só a câmera do quarto do paciente, até o prazo vencer, a alta ou a revogação.</li>
            </ol>
            <a href="/familia" target="_blank" rel="noreferrer" className={`${BOTAO_SECUNDARIO} mt-4 w-full`}>
              Abrir o portal da família <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </section>
          <p className="text-xs text-gray-600">
            Cada entrada, aceite de termo e abertura de vídeo da família fica no histórico de acessos, com data e endereço de rede.
          </p>
        </aside>
      </div>

      {revogando && (
        <JanelaRevogar
          acesso={revogando}
          aoFechar={() => setRevogando(null)}
          aoRevogar={async () => {
            if (!tenantId) return;
            await revogarAcompanhante(tenantId, revogando.id);
            setAviso(`Acesso de ${revogando.nome} revogado. O vídeo dele para em até 30 segundos.`);
            setRevogando(null);
            carregar();
          }}
        />
      )}

      {escolhendoPaciente && (
        <JanelaEscolherPaciente
          aoFechar={() => setEscolhendoPaciente(false)}
          aoEscolher={(p) => { setEscolhendoPaciente(false); setPacienteDoNovoAcesso(p); }}
        />
      )}

      {pacienteDoNovoAcesso && (
        <ModalAcompanhante
          paciente={pacienteDoNovoAcesso}
          aoFechar={() => { setPacienteDoNovoAcesso(null); carregar(); }}
          aoCriar={() => undefined}
        />
      )}
    </main>
  );
}

function JanelaRevogar({ acesso, aoFechar, aoRevogar }: {
  acesso: AcompanhanteDaClinica; aoFechar: () => void; aoRevogar: () => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Janela
      titulo="Revogar acesso?"
      aoFechar={aoFechar}
      bloqueada={enviando}
      rodape={
        <>
          <button type="button" onClick={aoFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>Manter acesso</button>
          <button
            type="button"
            disabled={enviando}
            onClick={async () => {
              setEnviando(true);
              try { await aoRevogar(); } catch (err) {
                setErro(err instanceof ApiError ? err.message : 'Não foi possível revogar.');
                setEnviando(false);
              }
            }}
            className={BOTAO_PERIGO}
          >
            {enviando ? 'Revogando…' : 'Revogar acesso'}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-700">
        <strong className="text-gray-900">{acesso.nome}</strong> deixa de ver a câmera de {acesso.pacienteNome} agora.
        Para liberar de novo, será preciso criar outro acesso e mostrar um QR Code novo.
      </p>
      {erro && <div className="mt-4"><Aviso tom="erro">{erro}</Aviso></div>}
    </Janela>
  );
}

function JanelaEscolherPaciente({ aoFechar, aoEscolher }: { aoFechar: () => void; aoEscolher: (p: PacienteResumo) => void }) {
  const { tenantId } = useAuth();
  const [pacientes, setPacientes] = useState<PacienteResumo[] | null>(null);
  const [escolhido, setEscolhido] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    fetchPacientes(tenantId)
      .then((lista) => setPacientes(lista.filter((p) => p.status === 'internado')))
      .catch(() => setErro('Não foi possível carregar os pacientes.'));
  }, [tenantId]);

  const paciente = pacientes?.find((p) => p.id === escolhido);

  return (
    <Janela
      titulo="Novo acesso da família"
      descricao="Só pacientes internados recebem acompanhante."
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>Cancelar</button>
          <button type="button" disabled={!paciente} onClick={() => paciente && aoEscolher(paciente)} className={BOTAO_PRIMARIO}>Continuar</button>
        </>
      }
    >
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!pacientes && !erro && <Carregando />}
      {pacientes && (
        pacientes.length === 0 ? (
          <p className="text-sm text-gray-700">Nenhum paciente internado agora.</p>
        ) : (
          <label className="block">
            <span className={ROTULO}>Paciente</span>
            <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={CAMPO}>
              <option value="">Escolha o paciente</option>
              {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )
      )}
    </Janela>
  );
}
