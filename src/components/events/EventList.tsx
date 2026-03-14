import EventCard from './EventCard';
import type { EventWithVenue } from '@/types/index';

interface EventListProps {
  events: EventWithVenue[];
  emptyMessage?: string;
}

export default function EventList({ events, emptyMessage }: EventListProps) {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.events.event_date).getTime() -
      new Date(b.events.event_date).getTime()
  );

  return (
    <div className="flex flex-col h-full">
      {/* Count header */}
      <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
        <span className="text-xs text-gray-500 font-medium">
          {sorted.length} event{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List or empty state */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-full p-6 text-center">
            <p className="text-sm text-gray-400">
              {emptyMessage ?? 'No events in this area. Zoom out to see more.'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {sorted.map((event) => (
              <EventCard key={event.events.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
