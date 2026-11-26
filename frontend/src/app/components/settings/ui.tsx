import React, { useId } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, RefreshCw, Search } from 'lucide-react';

/**
 * Peças comuns das seções de Configurações: cabeçalho, cartão, linha de
 * ajuste (rótulo e explicação à esquerda, controle à direita), interruptor e
 * avisos. Uma seção nova monta a tela com elas e fica com a mesma cara.
 */

export function CabecalhoSecao({ titulo, descricao, acao }: { titulo: string; descricao: string; acao?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-gray-900">{titulo}</h2>
        <p className="mt-1 text-sm text-gray-600">{descricao}</p>
      </div>
      {acao}
    </div>
  );
}

export function Cartao({ titulo, descricao, children, rodape }: {
  titulo?: string; descricao?: string; children: React.ReactNode; rodape?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      {titulo && (
        <header className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-base text-gray-900">{titulo}</h3>
          {descricao && <p className="mt-0.5 text-sm text-gray-600">{descricao}</p>}
        </header>
      )}
      <div className="px-5">{children}</div>
      {rodape && <footer className="flex flex-wrap items-center justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-5 py-3">{rodape}</footer>}
    </section>
  );
}

/** Uma linha de ajuste. `idControle` liga o rótulo ao campo para leitor de tela e clique. */
export function LinhaAjuste({ rotulo, descricao, idControle, children }: {
  rotulo: string; descricao?: React.ReactNode; idControle?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-100 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:max-w-xl">
        {idControle
          ? <label htmlFor={idControle} className="text-sm font-medium text-gray-900">{rotulo}</label>
          : <p className="text-sm font-medium text-gray-900">{rotulo}</p>}
        {descricao && <p className="mt-0.5 text-sm text-gray-600">{descricao}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Interruptor liga/desliga, com `role="switch"` e foco visível. */
export function Interruptor({ ligado, aoMudar, rotulo, desabilitado = false, id }: {
  ligado: boolean; aoMudar: (ligado: boolean) => void; rotulo: string; desabilitado?: boolean; id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => aoMudar(!ligado)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        ligado ? 'bg-marca' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

/** Grupo de opções exclusivas em forma de botões (ex.: tamanho do texto). */
export function Segmentado<T extends string>({ valor, opcoes, aoMudar, rotulo }: {
  valor: T; opcoes: { valor: NoInfer<T>; rotulo: string }[]; aoMudar: (v: NoInfer<T>) => void; rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => aoMudar(o.valor)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva ${
              ativo ? 'bg-white text-marca-texto font-medium shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

type TomAviso = 'info' | 'sucesso' | 'erro';

const TONS: Record<TomAviso, { caixa: string; Icone: typeof Info }> = {
  info: { caixa: 'border-blue-200 bg-blue-50 text-blue-800', Icone: Info },
  sucesso: { caixa: 'border-green-200 bg-green-50 text-green-800', Icone: CheckCircle2 },
  erro: { caixa: 'border-red-200 bg-red-50 text-red-800', Icone: AlertCircle },
};

export function Aviso({ tom = 'info', children }: { tom?: TomAviso; children: React.ReactNode }) {
  const { caixa, Icone } = TONS[tom];
  return (
    <div role={tom === 'erro' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${caixa}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-gray-600">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {texto}
    </p>
  );
}

/** Par rótulo/valor de leitura, para dados que a tela mostra mas não edita. */
export function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{rotulo}</dt>
      <dd className="mt-1 break-words text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/** Campo de texto com rótulo, ajuda e erro ligados por id. */
export function Campo({ rotulo, ajuda, erro, ...props }: React.InputHTMLAttributes<HTMLInputElement> & {
  rotulo: string; ajuda?: React.ReactNode; erro?: string | null;
}) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-800">{rotulo}</label>
      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={ajuda || erro ? idAjuda : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva ${
          erro ? 'border-red-300' : 'border-gray-300'
        }`}
        {...props}
      />
      {(erro || ajuda) && (
        <p id={idAjuda} className={`mt-1 text-xs ${erro ? 'text-red-700' : 'text-gray-600'}`}>{erro ?? ajuda}</p>
      )}
    </div>
  );
}

export const BOTAO_PRIMARIO = 'inline-flex items-center justify-center gap-2 rounded-lg bg-marca px-4 py-2 text-sm text-white transition-colors hover:bg-marca-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
export const BOTAO_SECUNDARIO = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva disabled:cursor-not-allowed disabled:opacity-60';
export const BOTAO_PERIGO = 'inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
export const CAMPO = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva';
export const ROTULO = 'mb-1.5 block text-sm font-medium text-gray-800';

/**
 * Janela modal: Esc fecha, o foco entra no primeiro campo e não escapa para
 * a tela de trás com Tab, e volta para quem abriu ao fechar.
 */
export function Janela({ titulo, descricao, aoFechar, children, rodape, largura = 'max-w-lg', bloqueada = false }: {
  titulo: string; descricao?: string; aoFechar: () => void; children: React.ReactNode;
  rodape?: React.ReactNode; largura?: string; bloqueada?: boolean;
}) {
  const caixa = React.useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  // Lidos dentro do listener por ref: o efeito monta uma vez só, e reexecutar
  // a cada render roubaria o foco do campo que está sendo digitado.
  const fechar = React.useRef(aoFechar);
  const travada = React.useRef(bloqueada);
  fechar.current = aoFechar;
  travada.current = bloqueada;

  React.useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const focaveis = () => caixa.current
      ? [...caixa.current.querySelectorAll<HTMLElement>('input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])')]
          .filter((e) => !e.hasAttribute('disabled'))
      : [];
    (focaveis().find((e) => e.matches('input, select, textarea')) ?? focaveis()[0])?.focus();

    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !travada.current) fechar.current();
      if (e.key !== 'Tab') return;
      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      anterior?.focus?.();
    };
  }, []);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !bloqueada) aoFechar(); }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={`flex max-h-[92vh] w-full ${largura} flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h2 id={idTitulo} className="text-lg text-gray-900">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-gray-600">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={bloqueada}
            aria-label="Fechar"
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
          >
            <span aria-hidden="true" className="block text-2xl leading-none">×</span>
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {rodape && <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">{rodape}</footer>}
      </div>
    </div>
  );
}

/** Número de destaque no topo de uma tela (ativos, pendentes, total do mês). */
export function Indicador({ rotulo, valor, detalhe, tom = 'neutro' }: {
  rotulo: string; valor: React.ReactNode; detalhe?: string; tom?: 'neutro' | 'atencao' | 'critico';
}) {
  const borda = tom === 'critico' ? 'border-red-200' : tom === 'atencao' ? 'border-amber-200' : 'border-gray-200';
  const cor = tom === 'critico' ? 'text-red-700' : tom === 'atencao' ? 'text-amber-800' : 'text-gray-900';
  return (
    <div className={`rounded-xl border bg-white p-4 ${borda}`}>
      <dt className="text-sm text-gray-600">{rotulo}</dt>
      <dd className={`mt-1 text-2xl ${cor}`}>{valor}</dd>
      {detalhe && <dd className="mt-0.5 text-xs text-gray-600">{detalhe}</dd>}
    </div>
  );
}

/** Abas de filtro com contagem ("Ativos 4"). */
export function AbasDeFiltro<T extends string>({ valor, opcoes, aoMudar, rotulo }: {
  valor: T; opcoes: { valor: NoInfer<T>; rotulo: string; contagem?: number }[]; aoMudar: (v: NoInfer<T>) => void; rotulo: string;
}) {
  return (
    <div role="tablist" aria-label={rotulo} className="flex gap-1 overflow-x-auto">
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => aoMudar(o.valor)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva ${
              ativa ? 'bg-marca-suave font-medium text-marca-texto' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {o.rotulo}
            {o.contagem !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${ativa ? 'bg-marca text-white' : 'bg-gray-100 text-gray-700'}`}>{o.contagem}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Campo de busca com lupa, para o topo de listas. */
export function Busca({ valor, aoMudar, placeholder }: { valor: string; aoMudar: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-marca-viva"
      />
    </label>
  );
}

/** Cabeçalho de tela: título, uma linha do que ela responde e as ações à direita. */
export function CabecalhoTela({ titulo, descricao, acoes }: { titulo: string; descricao: string; acoes?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-gray-900">{titulo}</h1>
        <p className="mt-1 text-sm text-gray-600">{descricao}</p>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** Estado vazio que explica o porquê e, quando dá, oferece o próximo passo. */
export function Vazio({ icone: Icone, titulo, texto, acao }: {
  icone: React.ComponentType<{ className?: string }>; titulo: string; texto?: string; acao?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <Icone className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-gray-900">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{texto}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function Etiqueta({ classe, children }: { classe: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${classe}`}>{children}</span>;
}

/** Botão "Atualizar" com o giro enquanto carrega. */
export function BotaoAtualizar({ carregando, aoClicar }: { carregando: boolean; aoClicar: () => void }) {
  return (
    <button type="button" onClick={aoClicar} disabled={carregando} className={BOTAO_SECUNDARIO}>
      <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" /> Atualizar
    </button>
  );
}

/** Seletor de janela de tempo (7, 30, 90 dias…). */
export function SeletorDias({ valor, aoMudar, opcoes = [7, 30, 90] }: { valor: number; aoMudar: (d: number) => void; opcoes?: number[] }) {
  return (
    <Segmentado
      rotulo="Período"
      valor={String(valor)}
      aoMudar={(v) => aoMudar(Number(v))}
      opcoes={opcoes.map((d) => ({ valor: String(d), rotulo: d === 365 ? '1 ano' : `${d} dias` }))}
    />
  );
}

/** Tela padrão: espaçamento e largura iguais em todas. */
export function Tela({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 space-y-6 px-4 py-6 sm:px-8">{children}</main>;
}

/** Bloco de conteúdo com título opcional e ações no cabeçalho (lista, gráfico). */
export function Painel({ titulo, descricao, acoes, children, semPadding = false }: {
  titulo?: string; descricao?: string; acoes?: React.ReactNode; children: React.ReactNode; semPadding?: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            {titulo && <h2 className="text-base text-gray-900">{titulo}</h2>}
            {descricao && <p className="mt-0.5 text-sm text-gray-600">{descricao}</p>}
          </div>
          {acoes}
        </header>
      )}
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}
