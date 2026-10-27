import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronRight, LogOut, Menu, Moon, Settings, Smartphone, Sun, User } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { SeletorDeTema } from './SeletorDeTema';
import type { SecaoConfiguracao } from './settings/secoes';

interface HeaderProps {
  title: string;
  /** Grupo do menu onde a tela mora; vira a trilha "Grupo › Tela". */
  grupo?: string | null;
  unreadNotifications?: number;
  onNotificationClick?: () => void;
  onAbrirConfiguracoes?: (secao: SecaoConfiguracao) => void;
  onAbrirMenu?: () => void;
  onAbrirAppMobile?: () => void;
}

/**
 * Cabeçalho de todas as telas.
 *
 * Mostra onde se está (trilha) e não repete o título grande: cada tela já
 * tem o próprio, logo abaixo. Os botões são os que fazem algo — o de ajuda e
 * a "Central de Ajuda" do menu não levavam a lugar nenhum e saíram. As cores
 * vêm dos tokens do tema, então o mesmo código serve aos seis temas.
 */
export function Header({
  title, grupo, unreadNotifications = 0, onNotificationClick, onAbrirConfiguracoes, onAbrirMenu, onAbrirAppMobile,
}: HeaderProps) {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { user, logout } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuAberto(false); botaoMenu.current?.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [menuAberto]);

  const abrir = (secao: SecaoConfiguracao) => {
    setMenuAberto(false);
    onAbrirConfiguracoes?.(secao);
  };

  const iniciais = user?.avatar || user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  const botao = 'relative flex h-10 w-10 items-center justify-center rounded-lg text-marca-texto transition-colors bg-marca-suave hover:bg-marca-suave-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva';
  const itemMenu = 'flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none';

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {onAbrirMenu && (
            <button type="button" onClick={onAbrirMenu} className={`${botao} lg:hidden`} aria-label="Abrir menu">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <nav aria-label="Você está em" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              {grupo && (
                <li className="hidden shrink-0 items-center gap-1.5 text-gray-600 sm:flex">
                  {grupo}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </li>
              )}
              <li aria-current="page" className="truncate font-medium text-gray-900">{title}</li>
            </ol>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onAbrirAppMobile && (
            <button type="button" onClick={onAbrirAppMobile} className={`${botao} hidden sm:flex`} title="Ver o app mobile da enfermagem" aria-label="Ver o app mobile da enfermagem">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={toggleDarkMode} className={botao} title={isDarkMode ? 'Usar tema claro' : 'Usar tema escuro'} aria-label={isDarkMode ? 'Usar tema claro' : 'Usar tema escuro'}>
            {isDarkMode ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={onNotificationClick}
            className={botao}
            title="Notificações"
            aria-label={unreadNotifications ? `Notificações: ${unreadNotifications} nova(s)` : 'Notificações'}
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unreadNotifications > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs text-white" aria-hidden="true">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              ref={botaoMenu}
              type="button"
              onClick={() => setMenuAberto((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuAberto}
              aria-label={`Menu de ${user?.name ?? 'usuário'}`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-marca to-marca-hover text-sm font-medium text-white transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-viva focus-visible:ring-offset-2"
            >
              {iniciais}
            </button>

            {menuAberto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuAberto(false)} aria-hidden="true" />
                <div role="menu" className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="truncate font-medium text-gray-900">{user?.name || 'Usuário'}</p>
                    <p className="truncate text-xs text-gray-600">{user?.roleLabel || user?.role || 'Perfil não definido'} · {user?.login}</p>
                  </div>
                  <div className="py-1.5">
                    <button type="button" role="menuitem" onClick={() => abrir('conta')} className={itemMenu}><User className="h-4 w-4" aria-hidden="true" /> Minha conta</button>
                    <button type="button" role="menuitem" onClick={() => abrir('notificacoes')} className={itemMenu}><Bell className="h-4 w-4" aria-hidden="true" /> Notificações</button>
                    <button type="button" role="menuitem" onClick={() => abrir('aparencia')} className={itemMenu}><Settings className="h-4 w-4" aria-hidden="true" /> Preferências</button>
                  </div>
                  <div className="border-t border-gray-200 px-4 py-3">
                    <p className="mb-2 text-xs text-gray-600">Tema</p>
                    <SeletorDeTema />
                  </div>
                  <div className="border-t border-gray-200">
                    <button type="button" role="menuitem" onClick={() => { setMenuAberto(false); logout(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-700 transition-colors hover:bg-red-50">
                      <LogOut className="h-4 w-4" aria-hidden="true" /> Sair da conta
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

