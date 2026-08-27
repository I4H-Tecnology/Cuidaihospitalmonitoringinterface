import React, { useState, useEffect } from 'react';
import { X, Bell, AlertCircle, CheckCircle, Info, TrendingUp, Clock, User, Activity } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface Notification {
  id: number;
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  source: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const mockNotifications: Notification[] = [
  {
    id: 1,
    type: 'critical',
    title: 'Alerta Crítico - Paciente UTI 301A',
    message: 'Queda detectada pela IA. Frequência cardíaca elevada (125 bpm).',
    timestamp: new Date(Date.now() - 2 * 60000),
    read: false,
    source: 'IA Monitoramento'
  },
  {
    id: 2,
    type: 'warning',
    title: 'Medicação Atrasada',
    message: 'Paciente João Pereira - Medicação das 14h não administrada.',
    timestamp: new Date(Date.now() - 15 * 60000),
    read: false,
    source: 'Sistema de Medicação'
  },
  {
    id: 3,
    type: 'info',
    title: 'Resultado de Exame Disponível',
    message: 'Hemograma completo - Ana Costa Lima está disponível.',
    timestamp: new Date(Date.now() - 30 * 60000),
    read: false,
    source: 'Laboratório'
  },
  {
    id: 4,
    type: 'success',
    title: 'Alta Médica Aprovada',
    message: 'Carlos Mendes - Alta programada para 26/12/2024.',
    timestamp: new Date(Date.now() - 45 * 60000),
    read: true,
    source: 'Gestão de Leitos'
  },
  {
    id: 5,
    type: 'warning',
    title: 'Capacidade UTI em 95%',
    message: 'Apenas 1 leito disponível. Considerar transferências.',
    timestamp: new Date(Date.now() - 60 * 60000),
    read: true,
    source: 'IA Preditiva'
  },
  {
    id: 6,
    type: 'info',
    title: 'Nova Mensagem - Dr. Roberto',
    message: 'Solicitação de parecer para paciente da Cardiologia.',
    timestamp: new Date(Date.now() - 90 * 60000),
    read: true,
    source: 'Sistema de Mensagens'
  },
  {
    id: 7,
    type: 'success',
    title: 'Estoque Reposto',
    message: 'Medicamentos da farmácia central foram reabastecidos.',
    timestamp: new Date(Date.now() - 120 * 60000),
    read: true,
    source: 'Gestão de Estoque'
  }
];

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const { isDarkMode } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // Simular notificações em tempo real
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      // 20% de chance de nova notificação a cada 10 segundos
      if (Math.random() < 0.2) {
        const newNotification: Notification = {
          id: Date.now(),
          type: ['critical', 'warning', 'info', 'success'][Math.floor(Math.random() * 4)] as any,
          title: 'Nova Notificação em Tempo Real',
          message: 'Esta é uma notificação simulada do sistema.',
          timestamp: new Date(),
          read: false,
          source: 'Sistema'
        };
        setNotifications(prev => [newNotification, ...prev]);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isOpen]);

  const markAsRead = (id: number) => {
    setNotifications(prev =>
      prev.map(notif => notif.id === id ? { ...notif, read: true } : notif)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
  };

  const deleteNotification = (id: number) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Agora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}min atrás`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h atrás`;
    const days = Math.floor(hours / 24);
    return `${days}d atrás`;
  };

  const typeConfig = {
    critical: { icon: AlertCircle, color: 'bg-red-100 text-red-700', iconColor: 'text-red-600', border: 'border-red-200' },
    warning: { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-700', iconColor: 'text-yellow-600', border: 'border-yellow-200' },
    info: { icon: Info, color: 'bg-blue-100 text-blue-700', iconColor: 'text-blue-600', border: 'border-blue-200' },
    success: { icon: CheckCircle, color: 'bg-green-100 text-green-700', iconColor: 'text-green-600', border: 'border-green-200' }
  };

  const typeConfigDark = {
    critical: { icon: AlertCircle, color: 'bg-red-900/30 text-red-400', iconColor: 'text-red-500', border: 'border-red-800' },
    warning: { icon: AlertCircle, color: 'bg-yellow-900/30 text-yellow-400', iconColor: 'text-yellow-500', border: 'border-yellow-800' },
    info: { icon: Info, color: 'bg-blue-900/30 text-blue-400', iconColor: 'text-blue-500', border: 'border-blue-800' },
    success: { icon: CheckCircle, color: 'bg-green-900/30 text-green-400', iconColor: 'text-green-500', border: 'border-green-800' }
  };

  const config = isDarkMode ? typeConfigDark : typeConfig;

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed right-0 top-0 h-full w-[450px] shadow-2xl z-50 ${
        isDarkMode ? 'bg-gray-900' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className={`w-5 h-5 ${isDarkMode ? 'text-cyan-400' : 'text-[#0EA5E9]'}`} />
              <h2 className={isDarkMode ? 'text-white' : 'text-gray-800'}>
                Notificações
              </h2>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className={`p-1 rounded-lg transition-colors ${
                isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'all'
                  ? isDarkMode
                    ? 'bg-cyan-600 text-white'
                    : 'bg-[#0EA5E9] text-white'
                  : isDarkMode
                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todas ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'unread'
                  ? isDarkMode
                    ? 'bg-cyan-600 text-white'
                    : 'bg-[#0EA5E9] text-white'
                  : isDarkMode
                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Não Lidas ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className={`mt-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                isDarkMode
                  ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto h-[calc(100vh-180px)]">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <CheckCircle className={`w-16 h-16 mb-4 ${isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {filter === 'unread' ? 'Nenhuma notificação não lida' : 'Nenhuma notificação'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {filteredNotifications.map(notification => {
                const TypeIcon = config[notification.type].icon;
                
                return (
                  <div
                    key={notification.id}
                    className={`px-6 py-4 transition-colors ${
                      !notification.read
                        ? isDarkMode
                          ? 'bg-gray-800/50'
                          : 'bg-blue-50/50'
                        : isDarkMode
                          ? 'hover:bg-gray-800/30'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${config[notification.type].color}`}>
                        <TypeIcon className={`w-5 h-5 ${config[notification.type].iconColor}`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                            {notification.title}
                          </h3>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>
                          )}
                        </div>
                        
                        <p className={`text-sm mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {notification.message}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs">
                            <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>
                              {notification.source}
                            </span>
                            <span className={`flex items-center gap-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              <Clock className="w-3 h-3" />
                              {getTimeAgo(notification.timestamp)}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {!notification.read && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className={`px-2 py-1 rounded text-xs transition-colors ${
                                  isDarkMode
                                    ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                Marcar como lida
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notification.id)}
                              className={`p-1 rounded transition-colors ${
                                isDarkMode
                                  ? 'hover:bg-gray-700 text-gray-500'
                                  : 'hover:bg-gray-200 text-gray-400'
                              }`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {notification.action && (
                          <button
                            onClick={notification.action.onClick}
                            className={`mt-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                              isDarkMode
                                ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                                : 'bg-[#0EA5E9] text-white hover:bg-[#0284C7]'
                            }`}
                          >
                            {notification.action.label}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
