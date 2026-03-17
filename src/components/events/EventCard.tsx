'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import type { EventWithVenue } from '@/types/index';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';

interface EventCardProps {
  event: EventWithVenue;
  occurrenceCount?: number;
  onHover?: (venueId: number | null) => void;
  onClickVenue?: (venueId: number, lat: number, lng: number) => void;
}

export default function EventCard({ event, occurrenceCount, onHover, onClickVenue }: EventCardProps) {
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
        {/* Performer name row — with optional map-pin affordance */}
        <div className="flex items-start gap-1 mb-1">
          <Link
            href={`/event/${ev.id}`}
            className="block font-bold text-gray-900 text-sm leading-tight group-hover:text-orange-600 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {ev.performer}
          </Link>
          {venue.lat !== null && venue.lat !== undefined && venue.lng !== null && venue.lng !== undefined && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="ml-auto mt-0.5 flex-shrink-0 text-gray-400 group-hover:text-[#E85D26] transition-colors"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          )}
        </div>

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

          {/* Category badge */}
          {ev.event_category && (
            <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded font-medium">
              {CATEGORY_META[ev.event_category as EventCategory]?.label ?? ev.event_category}
            </span>
          )}

          {/* Recurring badge */}
          {ev.series_id !== null && ev.series_id !== undefined && (
            <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded font-medium">
              Recurring
            </span>
          )}
        </div>

        {/* Ticketmaster attribution */}
        {event.source_types?.includes('ticketmaster') && (
          <div className="mt-1">
            <span className="text-xs text-blue-600">
              via Ticketmaster
            </span>
          </div>
        )}

        {/* Occurrence count for collapsed series */}
        {occurrenceCount !== undefined && occurrenceCount > 1 && (
          <div className="mt-0.5 text-xs text-teal-600 font-medium">
            +{occurrenceCount - 1} more upcoming
          </div>
        )}

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
