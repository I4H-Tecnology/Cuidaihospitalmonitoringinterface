import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Ban, Loader2, QrCode, ShieldCheck, ShieldOff, UserPlus } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { ApiError, fetchAcompanhantes, revogarAcompanhante } from '../../../data/api';
import type { AcompanhanteResumo, PacienteResumo } from '../../../data/api';
import { quandoFoi } from '../../../data/tempo';
import { ModalAcompanhante } from '../ModalAcompanhante';

/**
 * Acompanhantes do paciente (RF25-RF28, RN03-RN07): a única aba nova do
 * prontuário que é 100% dado real. Lista, cria e revoga pelo backend; a alta
 * do paciente continua revogando tudo sozinha.
 */

interface Props {
  paciente: PacienteResumo;
}

type Situacao = 'ativo' | 'expirado' | 'revogado';

/** "Expirado" não é coluna: é o prazo comparado com agora. */
export function situacaoDe(a: AcompanhanteResumo, agora: number = Date.now()): Situacao {
  if (!a.ativo) return 'revogado';
  if (new Date(a.expiraEm).getTime() <= agora) return 'expirado';
  return 'ativo';
}

const CHIP: Record<Situacao, { rotulo: string; cor: string; Icone: typeof ShieldCheck }> = {
  ativo: { rotulo: 'Ativo', cor: 'bg-green-100 text-green-700', Icone: ShieldCheck },
  expirado: { rotulo: 'Expirado', cor: 'bg-gray-100 text-gray-600', Icone: ShieldOff },
  revogado: { rotulo: 'Revogado', cor: 'bg-red-100 text-red-700', Icone: Ban },
};

function dataHoraBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function CompanionsTab({ paciente }: Props) {
  const { tenantId, can } = useAuth();
  const [acompanhantes, setAcompanhantes] = useState<AcompanhanteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [revogando, setRevogando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const podeEditar = can('companions', 'edit');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      setAcompanhantes(await fetchAcompanhantes(tenantId, paciente.id));
      setErro(null);
    } catch (err) {
      setErro(
        err instanceof ApiError && err.status === 403
          ? 'Seu perfil não permite ver os acompanhantes deste paciente.'
          : 'Não foi possível carregar os acompanhantes.',
      );
    } finally {
      setCarregando(false);
    }
  }, [tenantId, paciente.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const revogar = async (a: AcompanhanteResumo) => {
    if (!tenantId) return;
    if (!window.confirm(`Revogar agora o acesso de ${a.nome}? O QR Code deixa de valer na hora.`)) return;
    setRevogando(a.id);
    setAviso(null);
    try {
      await revogarAcompanhante(tenantId, a.id);
      await carregar();
      setAviso(`Acesso de ${a.nome} revogado.`);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível revogar o acesso.');
    } finally {
      setRevogando(null);
    }
  };

  const ativos = acompanhantes.filter((a) => situacaoDe(a) === 'ativo').length;
  const internado = paciente.status === 'internado';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-gray-800">Acompanhantes</h2>
          <p className="text-sm text-gray-500">
            Familiares com acesso temporário à câmera do quarto deste paciente.
            {!carregando && ` ${ativos} acesso${ativos === 1 ? '' : 's'} ativo${ativos === 1 ? '' : 's'}.`}
          </p>
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setModal(true)}
            disabled={!internado}
            title={internado ? undefined : 'Paciente sem internação ativa: o acesso seria cancelado na hora (RN07)'}
            className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            Novo acompanhante
          </button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
        <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p>
          Cada acompanhante recebe um QR Code individual, com prazo, que dá acesso apenas à câmera
          deste paciente. O acesso expira sozinho, pode ser revogado aqui e é cancelado
          automaticamente na alta. O aplicativo que lê o QR Code ainda não existe nesta versão.
        </p>
      </div>

      {aviso && <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</p>}
      {erro && (
        <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" /> {erro}
        </p>
      )}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : acompanhantes.length === 0 ? (
        !erro && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            Nenhum acompanhante cadastrado para este paciente.
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Acompanhante</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Documento</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Situação</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Validade</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Criado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {acompanhantes.map((a) => {
                const situacao = situacaoDe(a);
                const chip = CHIP[situacao];
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">{a.nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.documento}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${chip.cor}`}>
                        <chip.Icone className="h-3 w-3" /> {chip.rotulo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {situacao === 'revogado' && a.revogadoEm
                        ? `revogado ${quandoFoi(a.revogadoEm)}`
                        : `até ${dataHoraBR(a.expiraEm)}`}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{quandoFoi(a.criadoEm)}</td>
                    <td className="px-4 py-3 text-right">
                      {podeEditar && situacao === 'ativo' && (
                        <button
                          type="button"
                          onClick={() => revogar(a)}
                          disabled={revogando === a.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          {revogando === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalAcompanhante
          paciente={paciente}
          aoFechar={() => setModal(false)}
          aoCriar={() => { void carregar(); }}
        />
      )}
    </div>
  );
}
