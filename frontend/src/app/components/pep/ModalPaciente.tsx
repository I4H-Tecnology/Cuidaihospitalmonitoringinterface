import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Info, Loader2, UserPlus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, criarPaciente, editarPaciente, fetchAmbientes } from '../../data/api';
import type { AmbienteResumo, PacienteResumo } from '../../data/api';

/**
 * Cadastro e edicao de paciente (RF05, RF08).
 *
 * Faltava por inteiro no sistema: dava para listar e dar alta, mas nao havia
 * por onde admitir ninguem. Dar saida no ultimo paciente deixava a clinica sem
 * caminho de volta.
 *
 * Os campos sao os da entidade Paciente do DER, e nada alem: nome, data de
 * nascimento e o ambiente vinculado. Sexo, leito e convenio nao existem no
 * modelo, entao nao aparecem aqui.
 */

interface Props {
  /** Ausente = cadastro novo. Presente = edicao. */
  paciente?: PacienteResumo;
  aoFechar: () => void;
  aoSalvar: (paciente: PacienteResumo) => void;
}

export function ModalPaciente({ paciente, aoFechar, aoSalvar }: Props) {
  const { tenantId } = useAuth();
  const editando = Boolean(paciente);

  const [nome, setNome] = useState(paciente?.nome ?? '');
  const [nascimento, setNascimento] = useState(paciente?.dataNascimento ?? '');
  const [ambienteId, setAmbienteId] = useState(paciente?.ambienteId ?? '');
  const [ambientes, setAmbientes] = useState<AmbienteResumo[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    let vivo = true;
    fetchAmbientes(tenantId)
      .then((d) => vivo && setAmbientes(d))
      .catch(() => vivo && setErro('Não foi possível carregar os ambientes.'));
    return () => { vivo = false; };
  }, [tenantId]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvando) aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    primeiro.current?.focus();
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, salvando]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (nome.trim().length < 3) return setErro('Informe o nome do paciente.');

    setSalvando(true);
    try {
      const dados = {
        tenantId: tenantId!,
        nome: nome.trim(),
        dataNascimento: nascimento || null,
        ambienteId: ambienteId || null,
      };
      const salvo = paciente
        ? await editarPaciente(paciente.id, dados)
        : await criarPaciente(dados);
      aoSalvar(salvo);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar o paciente.');
      setSalvando(false);
    }
  };

  const escolhido = ambientes.find((a) => a.id === ambienteId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !salvando) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-paciente"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E8F4F8]">
              <UserPlus className="h-5 w-5 text-[#0A7EA4]" />
            </div>
            <div>
              <h2 id="titulo-paciente" className="text-gray-800">
                {editando ? 'Editar paciente' : 'Admitir paciente'}
              </h2>
              <p className="text-sm text-gray-500">
                {editando ? paciente!.nome : 'Cadastre e vincule a um ambiente monitorado'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={enviar} className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="nome-paciente" className="mb-1.5 block text-sm text-gray-700">
              Nome completo <span className="text-red-500">*</span>
            </label>
            <input
              id="nome-paciente"
              ref={primeiro}
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
              placeholder="Nome do paciente"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]"
            />
          </div>

          <div>
            <label htmlFor="nascimento" className="mb-1.5 block text-sm text-gray-700">
              Data de nascimento
            </label>
            <input
              id="nascimento"
              type="date"
              value={nascimento ?? ''}
              onChange={(e) => setNascimento(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Usada só para calcular a idade. Sem ela, a idade não aparece — em vez de virar
              um número estimado.
            </p>
          </div>

          <div>
            <label htmlFor="ambiente-paciente" className="mb-1.5 block text-sm text-gray-700">
              Ambiente monitorado
            </label>
            <select
              id="ambiente-paciente"
              value={ambienteId ?? ''}
              onChange={(e) => setAmbienteId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm
                         focus:border-[#0A7EA4] focus:outline-none focus:ring-1 focus:ring-[#0A7EA4]"
            >
              <option value="">Sem ambiente vinculado</option>
              {ambientes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {a.cameras > 0 ? ` · ${a.cameras} câmera(s)` : ' · sem câmera'}
                  {a.pacienteNome && a.id !== paciente?.ambienteId ? ` · ocupado por ${a.pacienteNome}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* O vinculo e o que faz a deteccao ter a quem atribuir. Sem ele a
              camera detecta a queda e a ocorrencia nasce sem paciente. */}
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-xs text-gray-600">
              {escolhido
                ? escolhido.cameras > 0
                  ? `As quedas detectadas em ${escolhido.nome} serão atribuídas a este paciente.`
                  : `${escolhido.nome} ainda não tem câmera. O vínculo funciona, mas nada será detectado até uma câmera ser cadastrada.`
                : 'Sem ambiente vinculado, as ocorrências detectadas não terão a quem ser atribuídas.'}
            </p>
          </div>

          {erro && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={aoFechar}
              disabled={salvando}
              className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0A7EA4] px-5 py-2.5 text-sm
                         text-white hover:bg-[#0EA5E9] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Admitir paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
