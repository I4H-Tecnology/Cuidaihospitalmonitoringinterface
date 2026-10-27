import { useSyncExternalStore } from 'react';

/**
 * Preferências pessoais deste navegador: tamanho do texto, movimento e como o
 * aviso de queda chama atenção. Ficam no localStorage, e não no servidor, de
 * propósito: o mesmo login usado no posto de enfermagem (tela grande, com
 * som) e no celular do plantonista (vibração, sem som) quer coisas diferentes.
 *
 * O aviso visual da queda (borda amarela e cartão) não está aqui: ele não pode
 * ser desligado.
 */

export type TamanhoTexto = 'padrao' | 'grande' | 'maior';

export interface Preferencias {
  tamanhoTexto: TamanhoTexto;
  reduzirMovimento: boolean;
  somDeQueda: boolean;
  notificacaoDoNavegador: boolean;
  vibrar: boolean;
  abrirMonitoramento: boolean;
}

export const PREFERENCIAS_PADRAO: Preferencias = {
  tamanhoTexto: 'padrao',
  reduzirMovimento: false,
  somDeQueda: true,
  notificacaoDoNavegador: false,
  vibrar: true,
  abrirMonitoramento: true,
};

/** Tamanho da fonte raiz; o Tailwind usa rem, então a tela inteira acompanha. */
export const FONTE_RAIZ: Record<TamanhoTexto, string> = {
  padrao: '16px',
  grande: '17.5px',
  maior: '19px',
};

export const CHAVE_PREFERENCIAS = 'cuidai-preferencias';

/** Lê o que estiver salvo, completando com o padrão o que faltar ou vier inválido. */
export function lerPreferencias(storage: Pick<Storage, 'getItem'>): Preferencias {
  try {
    const salvo = JSON.parse(storage.getItem(CHAVE_PREFERENCIAS) ?? '{}');
    if (!salvo || typeof salvo !== 'object') return { ...PREFERENCIAS_PADRAO };
    const resultado = { ...PREFERENCIAS_PADRAO };
    if (salvo.tamanhoTexto in FONTE_RAIZ) resultado.tamanhoTexto = salvo.tamanhoTexto;
    for (const chave of ['reduzirMovimento', 'somDeQueda', 'notificacaoDoNavegador', 'vibrar', 'abrirMonitoramento'] as const) {
      if (typeof salvo[chave] === 'boolean') resultado[chave] = salvo[chave];
    }
    return resultado;
  } catch {
    return { ...PREFERENCIAS_PADRAO };
  }
}

let atual: Preferencias = typeof localStorage === 'undefined' ? { ...PREFERENCIAS_PADRAO } : lerPreferencias(localStorage);
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((ouvinte) => ouvinte());
}

if (typeof window !== 'undefined') {
  // Outra aba mudou a preferência: esta acompanha sem recarregar.
  window.addEventListener('storage', (e) => {
    if (e.key !== CHAVE_PREFERENCIAS) return;
    atual = lerPreferencias(localStorage);
    avisar();
  });
}

export function obterPreferencias(): Preferencias {
  return atual;
}

export function salvarPreferencias(mudanca: Partial<Preferencias>): void {
  atual = { ...atual, ...mudanca };
  try {
    localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(atual));
  } catch {
    // sem storage a preferência vale até recarregar
  }
  avisar();
}

export function restaurarPreferencias(): void {
  salvarPreferencias({ ...PREFERENCIAS_PADRAO });
}

function inscrever(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function usePreferencias(): [Preferencias, (mudanca: Partial<Preferencias>) => void] {
  const valor = useSyncExternalStore(inscrever, obterPreferencias, obterPreferencias);
  return [valor, salvarPreferencias];
}
