import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'critical';
}

export function StatCard({ title, value, subtitle, icon, variant = 'default' }: StatCardProps) {
  const variantStyles = {
    default: 'border-gray-200',
    warning: 'border-yellow-200 bg-yellow-50',
    critical: 'border-red-200 bg-red-50'
  };

  return (
    <div className={`bg-white rounded-lg border ${variantStyles[variant]} p-5 shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <p className="text-3xl text-gray-800">{value}</p>
          <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div className="w-12 h-12 bg-marca-suave rounded-lg flex items-center justify-center text-marca-texto">
          {icon}
        </div>
      </div>
    </div>
  );
}
