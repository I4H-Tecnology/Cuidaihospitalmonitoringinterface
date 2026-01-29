import React from 'react';

interface EventCardProps {
  event: {
    id: number;
    type: 'critical' | 'warning' | 'info';
    title: string;
    location: string;
    time: string;
    patient: string;
  };
}

export function EventCard({ event }: EventCardProps) {
  const typeStyles = {
    critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    warning: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
    info: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' }
  };

  const style = typeStyles[event.type];

  return (
    <div className={`${style.bg} rounded-lg p-3 mb-3 border-l-4 border-l-${event.type === 'critical' ? 'red' : event.type === 'warning' ? 'yellow' : 'blue'}-500`}>
      <div className="flex items-start gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${style.dot} mt-1.5`}></span>
        <div className="flex-1">
          <p className={`text-sm ${style.text} mb-1`}>{event.title}</p>
          <p className="text-xs text-gray-600 mb-1">👤 {event.patient}</p>
          <p className="text-xs text-gray-500">{event.location}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 text-right">{event.time}</p>
    </div>
  );
}