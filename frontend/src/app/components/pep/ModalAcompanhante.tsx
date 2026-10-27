import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy, Info, Loader2, QrCode, ShieldAlert, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError, criarAcompanhante } from '../../data/api';
import type { AcompanhanteCriado, PacienteResumo } from '../../data/api';
import { urlDoPortalDaFamilia } from '../../data/familia';

/**
 * Cadastro de acompanhante (RF25, RF26, RN05).
 *
 * Dois momentos: o formulário e, depois de criar, o QR Code. O QR aparece
 * uma vez só: o backend guarda o hash do token e não tem como mostrá-lo de
 * novo. É a mesma UX de "copie a senha agora" que qualquer sistema usa para
 * segredo de curta duração, e a tela diz isso antes de o usuário fechar.
 */

interface Props {
  paciente: PacienteResumo;
  aoFechar: () => void;
  aoCriar: (criado: AcompanhanteCriado) => void;
}

const VALIDADES = [
  { horas: 24, rotulo: '24 horas' },
  { horas: 72, rotulo: '3 dias' },
  { horas: 168, rotulo: '7 dias' },
  { horas: 720, rotulo: '30 dias (máximo)' },
];

export function ModalAcompanhante({ paciente, aoFechar, aoCriar }: Props) {
  const { tenantId } = useAuth();
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [validadeHoras, setValidadeHoras] = useState(72);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<AcompanhanteCriado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const primeiro = useRef<HTMLInputElement>(null);

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
    if (nome.trim().length < 3) return setErro('Informe o nome do acompanhante.');
    if (documento.trim().length < 5) return setErro('Informe o documento (CPF ou RG).');

    setSalvando(true);
    try {
      const resultado = await criarAcompanhante({
        tenantId: tenantId!,
        pacienteId: paciente.id,
        nome: nome.trim(),
        documento: documento.trim(),
        validadeHoras,
      });
      setCriado(resultado);
      aoCriar(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível criar o acesso.');
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async () => {
    if (!criado) return;
    try {
      await navigator.clipboard.writeText(criado.tokenQrcode);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !salvando && !criado) aoFechar();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-acompanhante"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-marca-suave">
              <QrCode className="h-5 w-5 text-marca-texto" />
            </div>
            <div>
              <h2 id="titulo-acompanhante" className="text-gray-800">
                {criado ? 'Acesso criado' : 'Novo acompanhante'}
              </h2>
              <p className="text-sm text-gray-500">
                {criado ? `${criado.nome} · paciente ${paciente.nome}` : `Acesso à câmera de ${paciente.nome}`}
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

        {criado ? (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p className="text-sm text-amber-900">
                <strong>Este QR Code aparece uma única vez.</strong> O sistema guarda só uma
                assinatura dele; depois de fechar esta janela não há como recuperá-lo. Se o
                acompanhante perder, revogue este acesso e crie outro.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
              <QRCodeSVG value={urlDoPortalDaFamilia(criado.tokenQrcode)} size={192} level="M" includeMargin />
              <p className="text-xs text-gray-500 text-center">
                Aponte a câmera do celular: abre o portal da família já com o acesso. Válido até {new Date(criado.expiraEm).toLocaleString('pt-BR')}, só para a câmera do quarto deste paciente.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-sm text-gray-700">Código do acesso</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  {criado.tokenQrcode}
                </code>
                <button
                  type="button"
                  onClick={copiar}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <p className="text-xs text-gray-600">
                O aplicativo do acompanhante, que lê este código e mostra a câmera, ainda não
                existe nesta versão. O acesso já fica registrado, com prazo e revogação, para
                quando ele existir.
              </p>
            </div>

            {erro && (
              <p role="alert" className="text-sm text-red-700">{erro}</p>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={aoFechar}
                className="rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover"
              >
                Já salvei o código, fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={enviar} className="px-6 py-5 space-y-4">
            <div>
              <label htmlFor="nome-acompanhante" className="mb-1.5 block text-sm text-gray-700">
                Nome completo <span className="text-red-500">*</span>
              </label>
              <input
                id="nome-acompanhante"
                ref={primeiro}
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={120}
                placeholder="Nome do familiar ou responsável"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
              />
            </div>

            <div>
              <label htmlFor="documento-acompanhante" className="mb-1.5 block text-sm text-gray-700">
                Documento (CPF ou RG) <span className="text-red-500">*</span>
              </label>
              <input
                id="documento-acompanhante"
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                maxLength={20}
                placeholder="Somente números"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
              />
            </div>

            <div>
              <label htmlFor="validade-acompanhante" className="mb-1.5 block text-sm text-gray-700">
                Validade do acesso
              </label>
              <select
                id="validade-acompanhante"
                value={validadeHoras}
                onChange={(e) => setValidadeHoras(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
              >
                {VALIDADES.map((v) => (
                  <option key={v.horas} value={v.horas}>{v.rotulo}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-gray-500">
                Expira sozinho no prazo e é cancelado na alta do paciente. Pode ser revogado antes.
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
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white hover:bg-marca-hover disabled:opacity-60"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Gerar QR Code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
