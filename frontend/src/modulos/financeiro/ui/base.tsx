/**
 * Kit visual do módulo: só Tailwind e lucide-react, nada do sistema hospedeiro.
 *
 * A cor principal vem de uma variável CSS com padrão (`--fin-primaria`,
 * padrão #0A7EA4): o hospedeiro troca a marca sem tocar em componente.
 */

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { lerValorDigitado, paraEdicao, type Dinheiro } from '../util/dinheiro';

// --------------------------------------------------------------------------
// Classes compartilhadas
// --------------------------------------------------------------------------

export const cartao = 'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800';
export const texto = {
  titulo: 'text-gray-900 dark:text-gray-100',
  normal: 'text-gray-700 dark:text-gray-300',
  suave: 'text-gray-500 dark:text-gray-400',
};
export const entrada =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--fin-primaria,#0A7EA4)] ' +
  'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 ' +
  'dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800';
export const tabela = {
  base: 'w-full text-sm',
  cabeca: 'bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-900/40 dark:text-gray-400',
  celulaCabeca: 'px-4 py-2.5',
  linha: 'border-t border-gray-100 dark:border-gray-700',
  linhaClicavel: 'border-t border-gray-100 hover:bg-gray-50 cursor-pointer dark:border-gray-700 dark:hover:bg-gray-700/40',
  celula: 'px-4 py-2.5 align-middle text-gray-700 dark:text-gray-300',
  numero: 'px-4 py-2.5 text-right align-middle tabular-nums text-gray-800 dark:text-gray-200',
};

// --------------------------------------------------------------------------
// Botões
// --------------------------------------------------------------------------

type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'fantasma';

const VARIANTES: Record<VarianteBotao, string> = {
  primario:
    'bg-[var(--fin-primaria,#0A7EA4)] text-white hover:bg-[var(--fin-primaria-forte,#086887)] shadow-sm',
  secundario:
    'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
  perigo: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  fantasma: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
};

export function Botao({
  variante = 'secundario',
  pequeno = false,
  carregando = false,
  icone,
  children,
  className = '',
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBotao;
  pequeno?: boolean;
  carregando?: boolean;
  icone?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled || carregando}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors
        disabled:cursor-not-allowed disabled:opacity-50 ${pequeno ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'}
        ${VARIANTES[variante]} ${className}`}
      {...resto}
    >
      {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : icone}
      {children}
    </button>
  );
}

// --------------------------------------------------------------------------
// Campos
// --------------------------------------------------------------------------

export function Rotulo({ htmlFor, children, dica }: { htmlFor?: string; children: ReactNode; dica?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
      {children}
      {dica && <span className="ml-1 font-normal text-gray-400">— {dica}</span>}
    </label>
  );
}

type PropsCampo = InputHTMLAttributes<HTMLInputElement> & { rotulo?: string; dica?: string; ajuda?: ReactNode };

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { rotulo, dica, ajuda, id, className = '', ...resto },
  ref,
) {
  const gerado = useId();
  const campoId = id ?? gerado;
  return (
    <div className={className}>
      {rotulo && <Rotulo htmlFor={campoId} dica={dica}>{rotulo}</Rotulo>}
      <input ref={ref} id={campoId} className={entrada} {...resto} />
      {ajuda && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{ajuda}</p>}
    </div>
  );
});

/**
 * Campo de dinheiro: a pessoa digita "1.234,56" e o valor sai no formato da
 * API ("1234.56"). O texto digitado só é normalizado ao sair do campo, para
 * não brigar com quem está digitando.
 */
export function CampoDinheiro({
  rotulo,
  valor,
  aoMudar,
  dica,
  ajuda,
  className = '',
  permitirNegativo = false,
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  rotulo?: string;
  valor: Dinheiro | null;
  aoMudar: (valor: Dinheiro | null) => void;
  dica?: string;
  ajuda?: ReactNode;
  permitirNegativo?: boolean;
}) {
  const id = useId();
  const [textoDigitado, setTexto] = useState(paraEdicao(valor));
  const focado = useRef(false);
  useEffect(() => {
    if (!focado.current) setTexto(paraEdicao(valor));
  }, [valor]);
  return (
    <div className={className}>
      {rotulo && <Rotulo htmlFor={id} dica={dica}>{rotulo}</Rotulo>}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className={`${entrada} pl-9 text-right tabular-nums`}
          value={textoDigitado}
          onFocus={() => (focado.current = true)}
          onChange={(e) => {
            setTexto(e.target.value);
            let lido = lerValorDigitado(e.target.value);
            if (lido && !permitirNegativo && lido.startsWith('-')) lido = lido.slice(1);
            aoMudar(lido);
          }}
          onBlur={() => {
            focado.current = false;
            setTexto(paraEdicao(valor));
          }}
          {...resto}
        />
      </div>
      {ajuda && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{ajuda}</p>}
    </div>
  );
}

export function Seletor({
  rotulo,
  dica,
  opcoes,
  vazio,
  className = '',
  id,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement> & {
  rotulo?: string;
  dica?: string;
  opcoes: Array<{ valor: string; rotulo: string; desabilitada?: boolean; grupo?: string }>;
  vazio?: string;
}) {
  const gerado = useId();
  const campoId = id ?? gerado;
  const grupos = [...new Set(opcoes.map((o) => o.grupo ?? ''))];
  const renderizar = (lista: typeof opcoes) =>
    lista.map((o) => (
      <option key={o.valor} value={o.valor} disabled={o.desabilitada}>
        {o.rotulo}
      </option>
    ));
  return (
    <div className={className}>
      {rotulo && <Rotulo htmlFor={campoId} dica={dica}>{rotulo}</Rotulo>}
      <select id={campoId} className={entrada} {...resto}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {grupos.length > 1 || grupos[0]
          ? grupos.map((g) => (
              <optgroup key={g} label={g}>
                {renderizar(opcoes.filter((o) => (o.grupo ?? '') === g))}
              </optgroup>
            ))
          : renderizar(opcoes)}
      </select>
    </div>
  );
}

export function AreaTexto({ rotulo, className = '', id, ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo?: string }) {
  const gerado = useId();
  const campoId = id ?? gerado;
  return (
    <div className={className}>
      {rotulo && <Rotulo htmlFor={campoId}>{rotulo}</Rotulo>}
      <textarea id={campoId} className={entrada} rows={3} {...resto} />
    </div>
  );
}

export function Marcador({ rotulo, className = '', ...resto }: InputHTMLAttributes<HTMLInputElement> & { rotulo: ReactNode }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 ${className}`}>
      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-[var(--fin-primaria,#0A7EA4)]" {...resto} />
      {rotulo}
    </label>
  );
}

// --------------------------------------------------------------------------
// Estrutura
// --------------------------------------------------------------------------

export function Secao({
  titulo,
  subtitulo,
  acoes,
  children,
  className = '',
  semPadding = false,
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  semPadding?: boolean;
}) {
  return (
    <section className={`${cartao} ${className}`}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-gray-700">
          <div>
            {titulo && <h2 className={`text-sm font-semibold ${texto.titulo}`}>{titulo}</h2>}
            {subtitulo && <p className={`mt-0.5 text-xs ${texto.suave}`}>{subtitulo}</p>}
          </div>
          {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        </header>
      )}
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/** Cabeçalho de cada área: título, explicação curta e as ações principais. */
export function CabecalhoDaArea({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className={`text-2xl ${texto.titulo}`}>{titulo}</h1>
        {descricao && <p className={`mt-1 max-w-3xl text-sm ${texto.suave}`}>{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function Abas<T extends string>({
  abas,
  atual,
  aoMudar,
}: {
  abas: Array<{ chave: NoInfer<T>; rotulo: string; oculta?: boolean }>;
  atual: T;
  aoMudar: (chave: NoInfer<T>) => void;
}) {
  return (
    <div role="tablist" className="mb-5 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
      {abas
        .filter((a) => !a.oculta)
        .map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={a.chave === atual}
            onClick={() => aoMudar(a.chave)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              a.chave === atual
                ? 'border-[var(--fin-primaria,#0A7EA4)] font-medium text-[var(--fin-primaria,#0A7EA4)] dark:text-sky-300'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {a.rotulo}
          </button>
        ))}
    </div>
  );
}

/** Cartão de número: rótulo, valor e uma linha que explica ou compara. */
export function Numero({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
  aoClicar,
  destaque = false,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  tom?: 'neutro' | 'bom' | 'atencao' | 'critico';
  aoClicar?: () => void;
  destaque?: boolean;
}) {
  const borda = {
    neutro: '',
    bom: 'border-l-4 border-l-emerald-500',
    atencao: 'border-l-4 border-l-amber-400',
    critico: 'border-l-4 border-l-red-500',
  }[tom];
  const Corpo = aoClicar ? 'button' : 'div';
  // O valor nunca quebra: o navegador quebraria logo depois do "-" de
  // "-R$ 3.400,00" e deixaria o sinal sozinho numa linha. Em troca, a fonte
  // acompanha a largura do cartão (container query), não a da tela: com o
  // menu lateral aberto, quatro cartões por linha ficam estreitos.
  const tamanho = destaque ? 'text-2xl @min-[15rem]:text-3xl' : 'text-lg @min-[12rem]:text-xl';
  return (
    <Corpo
      type={aoClicar ? 'button' : undefined}
      onClick={aoClicar}
      className={`@container ${cartao} ${borda} p-4 text-left ${aoClicar ? 'transition-shadow hover:shadow-md' : ''}`}
    >
      <p className={`text-xs font-medium ${texto.suave}`}>{rotulo}</p>
      <p className={`mt-1 whitespace-nowrap tabular-nums ${tamanho} font-semibold ${texto.titulo}`}>{valor}</p>
      {detalhe && <p className={`mt-1 text-xs ${texto.suave}`}>{detalhe}</p>}
    </Corpo>
  );
}

// --------------------------------------------------------------------------
// Estados
// --------------------------------------------------------------------------

export function Carregando({ texto: mensagem = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-10 text-sm text-gray-500 dark:text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {mensagem}
    </div>
  );
}

export function Vazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className={`text-sm font-medium ${texto.normal}`}>{titulo}</p>
      {children && <p className={`mx-auto mt-1 max-w-md text-sm ${texto.suave}`}>{children}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function Aviso({
  tipo = 'info',
  children,
  acao,
}: {
  tipo?: 'info' | 'atencao' | 'erro' | 'sucesso';
  children: ReactNode;
  acao?: ReactNode;
}) {
  const estilos = {
    info: ['border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200', Info],
    atencao: ['border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200', AlertTriangle],
    erro: ['border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200', AlertCircle],
    sucesso: ['border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200', CheckCircle2],
  } as const;
  const [classe, Icone] = estilos[tipo];
  return (
    <div role={tipo === 'erro' ? 'alert' : undefined} className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${classe}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {acao}
    </div>
  );
}

// --------------------------------------------------------------------------
// Etiquetas de estado — sempre com ícone e texto, nunca só cor
// --------------------------------------------------------------------------

const ETIQUETAS = {
  aberta: ['Em aberto', 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300', Info],
  vencida: ['Vencida', 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300', AlertCircle],
  parcial: ['Parcial', 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300', AlertTriangle],
  paga: ['Paga', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', CheckCircle2],
  recebida: ['Recebida', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', CheckCircle2],
  cancelada: ['Cancelada', 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', XCircle],
} as const;

export function EtiquetaParcela({ status, vencida, tipo }: { status: string; vencida?: boolean; tipo?: 'pagar' | 'receber' }) {
  let chave: keyof typeof ETIQUETAS = (status in ETIQUETAS ? status : 'aberta') as keyof typeof ETIQUETAS;
  if (vencida && (status === 'aberta' || status === 'parcial')) chave = 'vencida';
  if (status === 'paga' && tipo === 'receber') chave = 'recebida';
  const [rotulo, classe, Icone] = ETIQUETAS[chave];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${classe}`}>
      <Icone className="h-3 w-3" />
      {rotulo}
    </span>
  );
}

export function Etiqueta({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'info' | 'bom' | 'atencao' | 'critico' }) {
  const classe = {
    neutro: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    info: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    bom: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    atencao: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    critico: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  }[tom];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${classe}`}>{children}</span>;
}

// --------------------------------------------------------------------------
// Janela (modal)
// --------------------------------------------------------------------------

export function Janela({
  titulo,
  subtitulo,
  aoFechar,
  children,
  rodape,
  largura = 'max-w-2xl',
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('keydown', tecla);
      anterior?.focus?.();
    };
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onMouseDown={aoFechar}>
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        className={`${cartao} w-full ${largura} my-auto`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 className={`text-base font-semibold ${texto.titulo}`}>{titulo}</h2>
            {subtitulo && <p className={`mt-0.5 text-sm ${texto.suave}`}>{subtitulo}</p>}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-700">{rodape}</footer>}
      </div>
    </div>
  );
}

/** Confirmação que exige motivo — cancelar, estornar, reabrir. O motivo vai para a auditoria. */
export function ConfirmarComMotivo({
  titulo,
  mensagem,
  rotuloAcao,
  perigoso = true,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string;
  mensagem: ReactNode;
  rotuloAcao: string;
  perigoso?: boolean;
  aoConfirmar: (motivo: string) => Promise<unknown>;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <Janela
      titulo={titulo}
      aoFechar={aoFechar}
      largura="max-w-lg"
      rodape={
        <>
          <Botao onClick={aoFechar}>Voltar</Botao>
          <Botao
            variante={perigoso ? 'perigo' : 'primario'}
            disabled={motivo.trim().length < 3}
            title={motivo.trim().length < 3 ? 'Escreva o motivo (fica registrado na auditoria)' : undefined}
            carregando={enviando}
            onClick={async () => {
              setEnviando(true);
              try {
                await aoConfirmar(motivo.trim());
              } finally {
                setEnviando(false);
              }
            }}
          >
            {rotuloAcao}
          </Botao>
        </>
      }
    >
      <div className={`mb-4 text-sm ${texto.normal}`}>{mensagem}</div>
      <AreaTexto rotulo="Motivo (fica registrado na auditoria)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </Janela>
  );
}
