import React from 'react';
import { Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Grade de temas com miniatura. A miniatura usa as cores do próprio tema
 * (estilo inline), e não as do tema atual: é o jeito de ver o Café estando no
 * Claro antes de trocar.
 */
export function SeletorDeTema() {
  const { tema, setTema, temas } = useTheme();

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
      {temas.map((t) => {
        const ativo = t.id === tema;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => setTema(t.id)}
            className={`flex flex-col items-center gap-1 rounded-lg p-1 text-xs leading-tight transition-colors ${
              ativo ? 'text-marca-texto font-semibold' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span
              className={`relative block h-11 w-full overflow-hidden rounded-md border-2 ${
                ativo ? 'border-marca' : 'border-gray-200'
              }`}
              style={{ backgroundColor: t.amostra.fundo }}
              aria-hidden="true"
            >
              <span
                className="absolute inset-x-1.5 top-1.5 h-5 rounded-sm px-1 pt-1"
                style={{ backgroundColor: t.amostra.cartao }}
              >
                <span className="block h-1 w-3/4 rounded-full" style={{ backgroundColor: t.amostra.texto }} />
              </span>
              <span
                className="absolute bottom-1.5 left-1.5 h-2 w-6 rounded-sm"
                style={{ backgroundColor: t.amostra.marca }}
              />
              {ativo && (
                <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-marca text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="text-center">{t.nome}</span>
          </button>
        );
      })}
    </div>
  );
}
