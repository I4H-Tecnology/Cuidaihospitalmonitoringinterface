import React from 'react';
import { AlertCircle } from 'lucide-react';

interface AlertBannerProps {
  message: string;
  onClose?: () => void;
}

export function AlertBanner({ message, onClose }: AlertBannerProps) {
  return (
    <div className="absolute top-5 left-6 right-6 z-20 flex justify-center pointer-events-none">
      <div className="cuidai-toast pointer-events-auto w-full max-w-md rounded-2xl bg-[#E06A6A] text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] border border-white/20 px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
          <AlertCircle className="h-4 w-4" />
        </div>
        <span className="text-sm leading-relaxed flex-1">{message}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
            aria-label="Fechar alerta"
          >
            &#10005;
          </button>
        )}
      </div>
    </div>
  );
}
