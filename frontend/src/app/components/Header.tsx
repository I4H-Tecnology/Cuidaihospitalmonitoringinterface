import React, { useState } from 'react';
import { Bell, Moon, Sun, Settings, User, LogOut, HelpCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  title: string;
  subtitle: string;
  unreadNotifications?: number;
  onNotificationClick?: () => void;
}

export function Header({ title, subtitle, unreadNotifications = 0, onNotificationClick }: HeaderProps) {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
  };

  // Get user initials
  const userInitials = user?.avatar || user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AD';

  return (
    <header className={`border-b sticky top-0 z-50 shadow-sm ${
      isDarkMode 
        ? 'bg-gray-800 border-gray-700' 
        : 'bg-white border-gray-200'
    }`}>
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className={isDarkMode ? 'text-cyan-400' : 'text-[#0A7EA4]'}>{title}</h1>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{subtitle}</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                isDarkMode
                  ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400'
                  : 'bg-[#E8F4F8] hover:bg-[#D6EEF5] text-[#0A7EA4]'
              }`}
              title={isDarkMode ? 'Modo Claro' : 'Modo Escuro'}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Help */}
            <button
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                isDarkMode
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  : 'bg-[#E8F4F8] hover:bg-[#D6EEF5] text-[#0A7EA4]'
              }`}
              title="Ajuda"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={onNotificationClick}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-[#E8F4F8] hover:bg-[#D6EEF5] text-[#0A7EA4]'
                }`}
                title="Notificações"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>
            </div>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-10 h-10 bg-gradient-to-br from-[#7DD3FC] to-[#0EA5E9] rounded-full flex items-center justify-center hover:shadow-lg transition-shadow"
              >
                <span className="text-white text-sm font-medium">{userInitials}</span>
              </button>

              {showUserMenu && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowUserMenu(false)}
                  />
                  
                  {/* Menu */}
                  <div className={`absolute right-0 mt-2 w-64 rounded-lg shadow-xl z-50 overflow-hidden ${
                    isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                  }`}>
                    {/* User Info */}
                    <div className={`px-4 py-3 border-b ${
                      isDarkMode ? 'border-gray-700 bg-gray-750' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                        {user?.name || 'Usuário'}
                      </p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {user?.role || 'Perfil não definido'}
                      </p>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                      <button className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}>
                        <User className="w-4 h-4" />
                        Meu Perfil
                      </button>
                      <button className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}>
                        <Settings className="w-4 h-4" />
                        Preferências
                      </button>
                      <button className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}>
                        <HelpCircle className="w-4 h-4" />
                        Central de Ajuda
                      </button>
                    </div>

                    {/* Theme Switcher */}
                    <div className={`px-4 py-3 border-t ${
                      isDarkMode ? 'border-gray-700' : 'border-gray-200'
                    }`}>
                      <p className={`text-xs mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Aparência
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (isDarkMode) toggleDarkMode();
                            setShowUserMenu(false);
                          }}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors ${
                            !isDarkMode
                              ? 'bg-[#0EA5E9] text-white'
                              : isDarkMode 
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <Sun className="w-3 h-3" />
                          Claro
                        </button>
                        <button
                          onClick={() => {
                            if (!isDarkMode) toggleDarkMode();
                            setShowUserMenu(false);
                          }}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors ${
                            isDarkMode
                              ? 'bg-[#0EA5E9] text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <Moon className="w-3 h-3" />
                          Escuro
                        </button>
                      </div>
                    </div>

                    {/* Logout */}
                    <div className={`border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                      <button className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors ${
                        isDarkMode 
                          ? 'text-red-400 hover:bg-gray-700' 
                          : 'text-red-600 hover:bg-red-50'
                      }`} onClick={handleLogout}>
                        <LogOut className="w-4 h-4" />
                        Sair da Conta
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}