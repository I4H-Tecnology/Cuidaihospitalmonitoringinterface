import React from 'react';
import { Search, Bell, HeartPulse } from 'lucide-react';

interface MobileHeaderProps {
  userName: string;
  notificationCount?: number;
}

export function MobileHeader({ userName, notificationCount = 0 }: MobileHeaderProps) {
  return (
    <header className="bg-gradient-to-r from-marca to-marca-hover px-4 py-3 sticky top-0 z-50">
      {/* Logo and Icons Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
            <HeartPulse className="w-7 h-7 text-marca-texto" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="w-10 h-10 flex items-center justify-center" role="img" aria-label={notificationCount ? `${notificationCount} alerta(s) pendente(s)` : 'Sem alertas pendentes'}>
              <Bell className="w-5 h-5 text-white" aria-hidden="true" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">
                  {notificationCount}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
      
      {/* Greeting */}
      <div>
        <p className="text-white/90 text-sm">Olá,</p>
        <h1 className="text-white">{userName}</h1>
      </div>
    </header>
  );
}