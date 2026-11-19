import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Building2, Edit, Loader2, Mail, MapPin, Phone, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, editarClinica, fetchClinica } from '../../data/api';
import type { ClinicaResumo } from '../../data/api';

/**
 * Configurações → Unidades: a clínica do próprio tenant.
 *
 * O modelo tem uma clínica por conta (`clinica` é o tenant, e o token vem
 * preso a uma só). A tela mostra esse cartão único, com o que a API devolve,
 * e deixa editável só o que é seguro em autoatendimento: nome, endereço,
 * telefone e e-mail. O resto continua visível e travado, com o motivo:
 * "Nova unidade" (uma clínica por conta), "Excluir" (encerramento é pelo
 * suporte), "Status" (desativar tranca todos os usuários) e "Tipo" (não
 * existe coluna para isso; nada no sistema distingue os três).
 */

const MOTIVO_NOVA = 'Cada conta corresponde a uma única clínica; suporte a múltiplas unidades por conta é item futuro.';
const MOTIVO_EXCLUIR = 'Encerramento de conta é feito pelo suporte, não por aqui: apagar a clínica levaria junto pacientes, câmeras e ocorrências.';
const MOTIVO_STATUS = 'Desativar a clínica corta o acesso de todos os usuários de uma vez, login incluso. Não é ação de autoatendimento.';
const MOTIVO_TIPO = 'O cadastro não distingue hospital, clínica e casa de repouso; o sistema trata todos como clínica.';

export function AbaClinica() {
  const { tenantId, can } = useAuth();
  const [clinica, setClinica] = useState<ClinicaResumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const podeEditar = can('settings', 'edit');

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    try {
      setClinica(await fetchClinica(tenantId));
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError && err.status === 403
        ? 'Seu perfil não permite ver o cadastro da clínica.'
        : 'Não foi possível carregar o cadastro da clínica.');
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button
          type="button"
          disabled
          title={MOTIVO_NOVA}
          aria-label={`Nova Unidade — ${MOTIVO_NOVA}`}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Nova Unidade
        </button>
      </div>

      {aviso && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</p>}
      {erro && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" /> {erro}
        </p>
      )}

      {carregando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
      ) : clinica && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              <div className="p-3 rounded-lg bg-green-100">
                <Building2 className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="text-gray-800">{clinica.nome}</h3>
                  <span
                    title={MOTIVO_STATUS}
                    className={`px-2 py-1 rounded-full text-xs ${clinica.ativa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {clinica.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                  <span title={MOTIVO_TIPO} className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">Clínica</span>
                  <span className="text-xs text-gray-400">tenant {clinica.slug}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span>{clinica.endereco || <span className="text-gray-400">Endereço não informado</span>}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>{clinica.telefone || <span className="text-gray-400">Telefone não informado</span>}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span>{clinica.email || <span className="text-gray-400">E-mail não informado</span>}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  CNPJ {clinica.cnpj ? formatarCnpj(clinica.cnpj) : 'não informado'} · alteração de CNPJ só pelo suporte
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditando(true)}
                disabled={!podeEditar}
                title={podeEditar ? 'Editar' : 'Seu perfil não permite editar o cadastro'}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Edit className="w-4 h-4 text-gray-600" />
              </button>
              <button
                type="button"
                disabled
                title={MOTIVO_EXCLUIR}
                aria-label={`Excluir — ${MOTIVO_EXCLUIR}`}
                className="p-2 rounded-lg cursor-not-allowed opacity-40"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && clinica && (
        <ModalClinica
          clinica={clinica}
          aoFechar={() => setEditando(false)}
          aoSalvar={(atualizada) => {
            setClinica(atualizada);
            setEditando(false);
            setAviso('Cadastro da clínica atualizado.');
          }}
        />
      )}
    </div>
  );
}

function formatarCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function ModalClinica({
  clinica, aoFechar, aoSalvar,
}: {
  clinica: ClinicaResumo; aoFechar: () => void; aoSalvar: (c: ClinicaResumo) => void;
}) {
  const { tenantId } = useAuth();
  const [nome, setNome] = useState(clinica.nome);
  const [endereco, setEndereco] = useState(clinica.endereco ?? '');
  const [telefone, setTelefone] = useState(clinica.telefone ?? '');
  const [email, setEmail] = useState(clinica.email ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 3) return setErro('Informe o nome da clínica.');
    if (email.trim() && !email.includes('@')) return setErro('E-mail inválido.');
    setSalvando(true);
    setErro(null);
    try {
      aoSalvar(await editarClinica({
        tenantId: tenantId!,
        nome: nome.trim(),
        endereco: endereco.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
      }));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
      setSalvando(false);
    }
  };

  const campo = 'w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-marca-viva';
  const travado = 'w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <form onSubmit={enviar} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="bg-gradient-to-r from-marca to-marca-hover px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 className="text-white text-lg">Editar clínica</h3>
          <button type="button" onClick={aoFechar} disabled={salvando} className="text-white hover:bg-white/20 rounded-lg p-1 text-2xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label htmlFor="abaclinica-nome-da-unidade" className="block text-sm text-gray-700 mb-2">Nome da Unidade *</label>
              <input id="abaclinica-nome-da-unidade" type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className={campo} />
            </div>
            <div>
              <label htmlFor="abaclinica-tipo" className="block text-sm text-gray-700 mb-2">Tipo *</label>
              <select id="abaclinica-tipo" disabled title={MOTIVO_TIPO} value="clinica" className={travado}>
                <option value="clinica">Clínica</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">{MOTIVO_TIPO}</p>
            </div>
            <div>
              <label htmlFor="abaclinica-status" className="block text-sm text-gray-700 mb-2">Status</label>
              <select id="abaclinica-status" disabled title={MOTIVO_STATUS} value={clinica.ativa ? 'ativa' : 'inativa'} className={travado}>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">{MOTIVO_STATUS}</p>
            </div>
            <div className="col-span-2">
              <label htmlFor="abaclinica-endereco" className="block text-sm text-gray-700 mb-2">Endereço</label>
              <input id="abaclinica-endereco" type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={300} placeholder="Rua, número - Bairro" className={campo} />
            </div>
            <div>
              <label htmlFor="abaclinica-telefone" className="block text-sm text-gray-700 mb-2">Telefone</label>
              <input id="abaclinica-telefone" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} placeholder="(47) 3000-0000" className={campo} />
            </div>
            <div>
              <label htmlFor="abaclinica-e-mail" className="block text-sm text-gray-700 mb-2">E-mail</label>
              <input id="abaclinica-e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="contato@clinica.com.br" className={campo} />
            </div>
          </div>
          {erro && (
            <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4" /> {erro}
            </p>
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button type="button" onClick={aoFechar} disabled={salvando} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 px-4 py-2 bg-marca text-white rounded-lg text-sm hover:bg-marca-hover transition-colors disabled:opacity-60">
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
