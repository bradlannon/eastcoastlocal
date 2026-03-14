'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import type { EventWithVenue } from '@/types/index';

interface EventCardProps {
  event: EventWithVenue;
  onHover?: (venueId: number | null) => void;
  onClickVenue?: (venueId: number, lat: number, lng: number) => void;
}

export default function EventCard({ event, onHover, onClickVenue }: EventCardProps) {
  const ev = event.events;
  const venue = event.venues;

  function handleCardClick() {
    if (onClickVenue && venue.lat !== null && venue.lat !== undefined && venue.lng !== null && venue.lng !== undefined) {
      onClickVenue(venue.id, venue.lat, venue.lng);
    }
  }

  return (
    <div
      className="group"
      data-venue-id={venue.id}
      onMouseEnter={() => onHover?.(venue.id)}
      onMouseLeave={() => onHover?.(null)}
      onClick={handleCardClick}
    >
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-150 cursor-pointer">
        {/* Performer name — links to event detail page */}
        <Link
          href={`/event/${ev.id}`}
          className="block font-bold text-gray-900 text-sm leading-tight mb-1 group-hover:text-orange-600 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {ev.performer}
        </Link>

        {/* Venue + city */}
        <div className="text-xs text-gray-500 mb-1.5">
          {venue.name}, {venue.city}
        </div>

        {/* Date + time */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">
            {format(new Date(ev.event_date), 'EEE, MMM d')}
            {ev.event_time ? ` · ${ev.event_time}` : ''}
          </span>

          {/* Price badge */}
          {ev.price && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
              {ev.price}
            </span>
          )}
        </div>

        {/* View details link (secondary action) */}
        <div className="mt-1.5">
          <Link
            href={`/event/${ev.id}`}
            className="text-xs text-[#E85D26] hover:text-orange-700 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}
