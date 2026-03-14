import { format } from 'date-fns';
import type { Venue, EventWithVenue } from '@/types/index';

interface VenuePopupProps {
  venue: Venue;
  events: EventWithVenue[];
}

export default function VenuePopup({ venue, events }: VenuePopupProps) {
  const sortedEvents = [...events].sort(
    (a, b) =>
      new Date(a.events.event_date).getTime() -
      new Date(b.events.event_date).getTime()
  );

  return (
    <div className="min-w-[200px] max-w-[260px]">
      <div className="font-bold text-gray-900 text-sm mb-1">{venue.name}</div>
      <div className="text-xs text-gray-500 mb-2">
        {sortedEvents.length} upcoming event{sortedEvents.length !== 1 ? 's' : ''}
      </div>
      <div className="max-h-[180px] overflow-y-auto space-y-2">
        {sortedEvents.map((item) => {
          const ev = item.events;
          return (
            <div key={ev.id} className="border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
              <div className="text-xs font-semibold text-gray-800">{ev.performer}</div>
              <div className="text-xs text-gray-500">
                {format(new Date(ev.event_date), 'EEE, MMM d')}
                {ev.event_time ? ` · ${ev.event_time}` : ''}
              </div>
              <a
                href={`/event/${ev.id}`}
                className="text-xs text-orange-600 hover:text-orange-700 font-medium"
              >
                View Details →
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
