import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

type ToastVariant = 'error' | 'success' | 'warning';

interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface SystemToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const SystemToastContext = createContext<SystemToastContextValue | undefined>(undefined);

const defaultDuration = 3000;

function SystemToastView({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  const iconMap = useMemo(
    () => ({
      error: AlertCircle,
      success: CheckCircle2,
      warning: AlertTriangle
    }),
    []
  );

  if (!toast) return null;

  const Icon = iconMap[toast.variant];
  const variantStyles = {
    error: 'bg-[#E06A6A] border-white/20',
    success: 'bg-[#5FBF8A] border-white/20',
    warning: 'bg-[#E3A857] border-white/20'
  } as const;

  return (
    <div className="fixed top-5 left-0 right-0 z-[100] flex justify-center px-6 pointer-events-none">
      <div
        className={`cuidai-toast pointer-events-auto w-full max-w-md rounded-2xl text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] border px-4 py-3 flex items-start gap-3 ${variantStyles[toast.variant]}`}
        role={toast.variant === 'error' ? 'alert' : 'status'}
        aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      >
        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm leading-relaxed flex-1">{toast.message}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors"
          aria-label="Fechar alerta"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}

export function SystemToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback(({ message, variant = 'error', duration = defaultDuration }: ToastOptions) => {
    setToast({
      id: Date.now() + Math.floor(Math.random() * 1000),
      message,
      variant,
      duration
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, toast.duration);
    return () => window.clearTimeout(timeoutId);
  }, [toast?.id]);

  return (
    <SystemToastContext.Provider value={{ showToast }}>
      {children}
      <SystemToastView toast={toast} onClose={() => setToast(null)} />
    </SystemToastContext.Provider>
  );
}

export function useSystemToast() {
  const context = useContext(SystemToastContext);
  if (!context) {
    throw new Error('useSystemToast must be used within SystemToastProvider');
  }
  return context;
}
