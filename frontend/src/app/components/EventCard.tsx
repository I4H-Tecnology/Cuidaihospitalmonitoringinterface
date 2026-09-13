interface EventCardProps {
  event: {
    id: string | number;
    type: 'critical' | 'warning' | 'info';
    title: string;
    location: string;
    time: string;
    patient: string;
  };
}

const TYPE_STYLES = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-l-red-500' },
  warning: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500', border: 'border-l-yellow-500' },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-l-blue-500' },
} as const;

export function EventCard({ event }: EventCardProps) {
  const style = TYPE_STYLES[event.type];

  return (
    <div className={`${style.bg} ${style.border} rounded-lg p-3 mb-3 border-l-4`}>
      <div className="flex items-start gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${style.dot} mt-1.5`}></span>
        <div className="flex-1">
          <p className={`text-sm ${style.text} mb-1`}>{event.title}</p>
          <p className="text-xs text-gray-600 mb-1">{event.patient}</p>
          <p className="text-xs text-gray-500">{event.location}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 text-right">{event.time}</p>
    </div>
  );
}
