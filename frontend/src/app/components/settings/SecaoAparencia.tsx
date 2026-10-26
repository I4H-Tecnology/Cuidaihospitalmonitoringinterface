import { Check, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { PREFERENCIAS_PADRAO, usePreferencias, type TamanhoTexto } from '../../data/preferencias';
import { TEMAS } from '../../data/temas';
import { BOTAO_SECUNDARIO, CabecalhoSecao, Cartao, Interruptor, LinhaAjuste, Segmentado } from './ui';

const TAMANHOS: { valor: TamanhoTexto; rotulo: string }[] = [
  { valor: 'padrao', rotulo: 'Padrão' },
  { valor: 'grande', rotulo: 'Grande' },
  { valor: 'maior', rotulo: 'Maior' },
];

/** Aparência: tudo aqui vale na hora e fica salvo só neste navegador. */
export function SecaoAparencia() {
  const { tema, setTema } = useTheme();
  const [prefs, salvar] = usePreferencias();
  const tudoPadrao = tema === 'claro'
    && prefs.tamanhoTexto === PREFERENCIAS_PADRAO.tamanhoTexto
    && prefs.reduzirMovimento === PREFERENCIAS_PADRAO.reduzirMovimento;

  return (
    <div className="space-y-6">
      <CabecalhoSecao
        titulo="Aparência"
        descricao="As mudanças valem na hora e ficam salvas neste navegador."
        acao={
          <button
            type="button"
            disabled={tudoPadrao}
            onClick={() => {
              setTema('claro');
              salvar({ tamanhoTexto: PREFERENCIAS_PADRAO.tamanhoTexto, reduzirMovimento: PREFERENCIAS_PADRAO.reduzirMovimento });
            }}
            className={BOTAO_SECUNDARIO}
          >
            Restaurar padrão
          </button>
        }
      />

      <Cartao titulo="Tema" descricao="Todos os temas seguem o contraste mínimo de leitura (WCAG AA). As cores de alerta não mudam.">
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-4 py-5 sm:grid-cols-3">
          {TEMAS.map((t) => {
            const ativo = t.id === tema;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setTema(t.id)}
                className={`group rounded-xl border-2 p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva focus-visible:ring-offset-2 ${
                  ativo ? 'border-marca' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Miniatura de uma tela: menu, cartão e botão, nas cores do tema. */}
                <span aria-hidden="true" className="flex h-20 overflow-hidden rounded-lg" style={{ backgroundColor: t.amostra.fundo }}>
                  <span className="flex w-1/4 flex-col gap-1.5 p-2" style={{ backgroundColor: t.amostra.cartao }}>
                    <span className="h-1.5 w-full rounded-full" style={{ backgroundColor: t.amostra.marca }} />
                    <span className="h-1 w-3/4 rounded-full opacity-40" style={{ backgroundColor: t.amostra.texto }} />
                    <span className="h-1 w-3/4 rounded-full opacity-40" style={{ backgroundColor: t.amostra.texto }} />
                  </span>
                  <span className="flex flex-1 flex-col gap-2 p-2">
                    <span className="flex-1 rounded p-1.5" style={{ backgroundColor: t.amostra.cartao }}>
                      <span className="block h-1.5 w-2/3 rounded-full" style={{ backgroundColor: t.amostra.texto }} />
                      <span className="mt-1 block h-1 w-1/2 rounded-full opacity-50" style={{ backgroundColor: t.amostra.texto }} />
                    </span>
                    <span className="h-2.5 w-10 rounded" style={{ backgroundColor: t.amostra.marca }} />
                  </span>
                </span>
                <span className="mt-2 flex items-center justify-between gap-2 px-1">
                  <span className={`flex items-center gap-1.5 text-sm ${ativo ? 'font-semibold text-marca-texto' : 'text-gray-800'}`}>
                    {t.escuro ? <Moon className="h-3.5 w-3.5" aria-hidden="true" /> : <Sun className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t.nome}
                  </span>
                  {ativo && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-marca text-white">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Cartao>

      <Cartao titulo="Leitura e movimento">
        <LinhaAjuste
          rotulo="Tamanho do texto"
          descricao="Aumenta texto, botões e espaçamentos da tela inteira, sem precisar do zoom do navegador."
        >
          <Segmentado rotulo="Tamanho do texto" valor={prefs.tamanhoTexto} opcoes={TAMANHOS} aoMudar={(v) => salvar({ tamanhoTexto: v })} />
        </LinhaAjuste>
        <LinhaAjuste
          rotulo="Reduzir animações"
          idControle="pref-movimento"
          descricao="Desliga transições e animações. A borda do aviso de queda continua acesa, só não pisca."
        >
          <Interruptor id="pref-movimento" rotulo="Reduzir animações" ligado={prefs.reduzirMovimento} aoMudar={(v) => salvar({ reduzirMovimento: v })} />
        </LinhaAjuste>
      </Cartao>
    </div>
  );
}
