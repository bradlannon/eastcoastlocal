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
    <div className="min-w-[180px] max-w-[220px]">
      <div className="font-bold text-gray-900 text-xs leading-tight">{venue.name}</div>
      <div className="text-[10px] text-gray-400 mb-1">
        {sortedEvents.length} event{sortedEvents.length !== 1 ? 's' : ''}
      </div>
      <div className="max-h-[140px] overflow-y-auto space-y-1">
        {sortedEvents.map((item) => {
          const ev = item.events;
          return (
            <div
              key={ev.id}
              className="border-t border-gray-100 pt-1 first:border-t-0 first:pt-0 -mx-1 px-1"
            >
              <div className="text-[11px] font-semibold text-gray-800 leading-tight truncate">{ev.performer}</div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 leading-tight">
                  {format(new Date(ev.event_date), 'EEE, MMM d')}
                  {ev.event_time ? ` · ${ev.event_time}` : ''}
                </span>
                <a
                  href={`/event/${ev.id}`}
                  className="text-[10px] font-medium text-[#2A9D8F] hover:text-[#237d72] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Details
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
