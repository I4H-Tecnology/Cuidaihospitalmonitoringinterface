import React, { createContext, useContext, useState, useEffect } from 'react';
import { CHAVE_TEMA, TEMAS, lerTemaSalvo, temaPorId, type Tema, type TemaId } from '../data/temas';
import { FONTE_RAIZ, usePreferencias } from '../data/preferencias';

interface ThemeContextType {
  tema: TemaId;
  setTema: (tema: TemaId) => void;
  temas: readonly Tema[];
  isDarkMode: boolean;
  /** Alterna para o par claro/escuro do tema atual (Areia ↔ Café, Claro ↔ Escuro). */
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<TemaId>(() => lerTemaSalvo(localStorage));

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_TEMA, tema);
    } catch {
      // sem storage o tema vale só até recarregar
    }
    const raiz = document.documentElement;
    raiz.dataset.tema = tema;
    raiz.classList.toggle('dark', temaPorId(tema).escuro);
  }, [tema]);

  // Tamanho do texto e movimento vêm das preferências (Configurações →
  // Aparência), mas mexem no mesmo <html> que o tema, então moram aqui.
  const [{ tamanhoTexto, reduzirMovimento }] = usePreferencias();
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty('--font-size', FONTE_RAIZ[tamanhoTexto]);
    raiz.classList.toggle('reduzir-movimento', reduzirMovimento);
  }, [tamanhoTexto, reduzirMovimento]);

  const isDarkMode = temaPorId(tema).escuro;
  const toggleDarkMode = () => setTema((atual) => temaPorId(atual).par);

  return (
    <ThemeContext.Provider value={{ tema, setTema, temas: TEMAS, isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
