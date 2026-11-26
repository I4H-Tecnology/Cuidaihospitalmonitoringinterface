import { useEffect, useState } from 'react';
import { LogOut, Pencil, User, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { descreverAmbiente } from '../../data/api';
import type { AltaResultado, PacienteResumo } from '../../data/api';
import { ModalAlta } from '../pep/ModalAlta';
import { ModalPaciente } from '../pep/ModalPaciente';

/**
 * Ficha do paciente para quem não abre o prontuário, mas pode editar o
 * cadastro: o perfil da banca do TCC.
 *
 * Clicar no paciente leva ao prontuário, que está fora da RFC (seção 2.6) e
 * fora desse perfil. Sem esta ficha, o cartão ficava desativado, e editar,
 * mudar de ambiente (RF08) e dar alta (RF28) não tinham tela, embora a API
 * aceitasse (`patients:edit`). Aqui ficam só essas três ações: a edição
 * esconde o histórico médico e a saída oferece só a alta.
 */

interface Props {
  paciente: PacienteResumo;
  aoFechar: () => void;
  /** Chamado depois de salvar, com a frase que a tela mostra. */
  aoAtualizar: (mensagem: string) => void;
}

const data = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');

export function FichaPaciente({ paciente, aoFechar, aoAtualizar }: Props) {
  const { can } = useAuth();
  const [modo, setModo] = useState<'ficha' | 'editar' | 'saida'>('ficha');
  const podeEditar = can('patients', 'edit');
  const internado = paciente.status === 'internado';

  useEffect(() => {
    if (modo !== 'ficha') return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [modo, aoFechar]);

  if (modo === 'editar') {
    return (
      <ModalPaciente
        paciente={paciente}
        ocultarHistorico
        aoFechar={() => setModo('ficha')}
        aoSalvar={(salvo) => aoAtualizar(`Cadastro de ${salvo.nome} atualizado.`)}
      />
    );
  }

  if (modo === 'saida') {
    return (
      <ModalAlta
        paciente={paciente}
        somenteAlta
        aoFechar={() => setModo('ficha')}
        aoConcluir={(r: AltaResultado) =>
          aoAtualizar(
            `Saída de ${paciente.nome} registrada. ` +
              (r.acessosRevogados > 0
                ? `${r.acessosRevogados} acesso(s) de acompanhante revogado(s).`
                : 'Não havia acesso de acompanhante ativo.')
          )
        }
      />
    );
  }

  const linhas: [string, string][] = [
    ['Ambiente', descreverAmbiente(paciente.ambienteNome, paciente.ambienteTipo)],
    ['Idade', paciente.idade != null ? `${paciente.idade} anos` : '—'],
    ['Admissão', data(paciente.dataAdmissao)],
    ['Médico responsável', paciente.medicoResponsavel || '—'],
    ['Ocorrências em aberto', String(paciente.ocorrenciasAbertas)],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ficha"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-marca to-marca-hover text-white">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 id="titulo-ficha" className="text-gray-800">{paciente.nome}</h2>
              <p className="text-sm text-gray-500">{internado ? 'Internado' : 'Saída registrada'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <dl className="divide-y divide-gray-100 px-6 py-2">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-gray-500">{rotulo}</dt>
              <dd className="text-right text-gray-800">{valor}</dd>
            </div>
          ))}
        </dl>

        {podeEditar && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
            {internado && (
              <button
                type="button"
                onClick={() => setModo('saida')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Registrar saída
              </button>
            )}
            <button
              type="button"
              onClick={() => setModo('editar')}
              className="inline-flex items-center gap-2 rounded-lg bg-marca px-5 py-2.5 text-sm text-white hover:bg-marca-hover"
            >
              <Pencil className="h-4 w-4" />
              Editar cadastro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
