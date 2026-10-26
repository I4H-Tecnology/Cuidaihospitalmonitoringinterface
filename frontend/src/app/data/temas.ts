/**
 * Temas de aparência.
 *
 * As cores de cada tema vivem em `styles/theme.css`, sob `data-tema`; aqui
 * fica só o que a interface precisa saber para listar e alternar: nome, se é
 * escuro (liga a classe `.dark`), qual é o "outro lado" dele no botão de
 * sol/lua do cabeçalho e as quatro cores da miniatura do seletor.
 */

export type TemaId = 'claro' | 'escuro' | 'areia' | 'cafe' | 'salvia' | 'alto-contraste';

export interface Tema {
  id: TemaId;
  nome: string;
  escuro: boolean;
  /** Para onde o botão de sol/lua leva a partir deste tema. */
  par: TemaId;
  /** Cores da miniatura: fundo da tela, cartão, cor da marca e texto. */
  amostra: { fundo: string; cartao: string; marca: string; texto: string };
}

export const TEMAS: readonly Tema[] = [
  { id: 'claro', nome: 'Claro', escuro: false, par: 'escuro',
    amostra: { fundo: '#f8fbfc', cartao: '#ffffff', marca: '#0a7ea4', texto: '#1e2939' } },
  { id: 'escuro', nome: 'Escuro', escuro: true, par: 'claro',
    amostra: { fundo: '#101828', cartao: '#151d29', marca: '#38bdf8', texto: '#e6ebf2' } },
  { id: 'areia', nome: 'Areia', escuro: false, par: 'cafe',
    amostra: { fundo: '#f2eadd', cartao: '#fffbf4', marca: '#8b5a2b', texto: '#30241b' } },
  { id: 'cafe', nome: 'Café', escuro: true, par: 'areia',
    amostra: { fundo: '#1c1510', cartao: '#2a211b', marca: '#d4964f', texto: '#f3eadf' } },
  { id: 'salvia', nome: 'Sálvia', escuro: false, par: 'escuro',
    amostra: { fundo: '#edf2ea', cartao: '#fbfcfa', marca: '#3d6b4b', texto: '#232b22' } },
  { id: 'alto-contraste', nome: 'Alto contraste', escuro: false, par: 'escuro',
    amostra: { fundo: '#f0f0f0', cartao: '#ffffff', marca: '#005478', texto: '#000000' } },
];

export const CHAVE_TEMA = 'cuidai-tema';
/** Chave antiga, do tempo em que só havia claro/escuro. */
const CHAVE_MODO_ESCURO_ANTIGA = 'cuidai-dark-mode';

export function temaPorId(id: TemaId): Tema {
  return TEMAS.find((t) => t.id === id) ?? TEMAS[0];
}

function ehTemaId(valor: unknown): valor is TemaId {
  return TEMAS.some((t) => t.id === valor);
}

/**
 * Tema salvo neste navegador. Quem só tinha a preferência antiga de modo
 * escuro continua no escuro; valor desconhecido (tema removido, storage
 * adulterado) cai no claro em vez de deixar a tela sem tema.
 */
export function lerTemaSalvo(storage: Pick<Storage, 'getItem'>): TemaId {
  try {
    const salvo = storage.getItem(CHAVE_TEMA);
    if (ehTemaId(salvo)) return salvo;
    if (storage.getItem(CHAVE_MODO_ESCURO_ANTIGA) === 'true') return 'escuro';
  } catch {
    // storage bloqueado (aba anônima, política do navegador): segue no padrão
  }
  return 'claro';
}
