import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { eq, and, gte, ne } from 'drizzle-orm';
import type { Metadata } from 'next';
import { db } from '@/lib/db/client';
import { events, venues } from '@/lib/db/schema';
import { MiniMapWrapper } from '@/components/map/MapWrapper';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';
import { toAffiliateUrl } from '@/lib/affiliate';

interface EventPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return { title: 'Event | East Coast Local' };

  const rows = await db
    .select()
    .from(events)
    .innerJoin(venues, eq(events.venue_id, venues.id))
    .where(eq(events.id, id))
    .limit(1);

  if (!rows.length) return { title: 'Event Not Found | East Coast Local' };

  const { events: event, venues: venue } = rows[0];
  const dateStr = format(event.event_date, 'MMMM d, yyyy');

  return {
    title: `${event.performer} at ${venue.name} | East Coast Local`,
    description: `${event.performer} performs at ${venue.name} in ${venue.city}, ${venue.province} on ${dateStr}.${event.description ? ' ' + event.description.slice(0, 120) : ''}`,
  };
}

export default async function EventPage({
  params,
  searchParams,
}: EventPageProps) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const rows = await db
    .select()
    .from(events)
    .innerJoin(venues, eq(events.venue_id, venues.id))
    .where(eq(events.id, id))
    .limit(1);

  if (!rows.length) notFound();

  const { events: event, venues: venue } = rows[0];

  // Fetch other upcoming events at the same venue (excluding current event)
  const moreAtVenue = await db
    .select()
    .from(events)
    .innerJoin(venues, eq(events.venue_id, venues.id))
    .where(
      and(
        eq(events.venue_id, venue.id),
        ne(events.id, event.id),
        gte(events.event_date, new Date())
      )
    )
    .orderBy(events.event_date)
    .limit(5);

  // Build back-link with preserved filter params
  const sp = searchParams ? await searchParams : {};
  const backParams = new URLSearchParams();
  if (sp.when && typeof sp.when === 'string') backParams.set('when', sp.when);
  if (sp.province && typeof sp.province === 'string')
    backParams.set('province', sp.province);
  if (sp.category && typeof sp.category === 'string')
    backParams.set('category', sp.category);
  const backHref = backParams.toString() ? `/?${backParams.toString()}` : '/';

  // Derive ticket/source URL and hostname (with affiliate tracking)
  const rawCtaUrl = event.ticket_link ?? event.source_url;
  const ctaUrl = rawCtaUrl ? toAffiliateUrl(rawCtaUrl) : null;
  let ctaHostname: string | null = null;
  if (rawCtaUrl) {
    try {
      ctaHostname = new URL(rawCtaUrl).hostname.replace(/^www\./, '');
    } catch {
      ctaHostname = rawCtaUrl;
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to map
        </Link>

        {/* Cover image */}
        {event.cover_image_url && (
          <div className="mb-6 rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.cover_image_url}
              alt={`${event.performer} at ${venue.name}`}
              className="w-full object-cover max-h-64"
            />
          </div>
        )}

        {/* Performer name */}
        <h1 className="text-3xl font-bold tracking-tight mb-1">
          {event.performer}
        </h1>

        {/* Venue name */}
        <p className="text-lg text-gray-600 mb-4">{venue.name}</p>

        {/* Divider */}
        <div className="border-t border-gray-100 mb-4" />

        {/* Date & time */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-semibold text-gray-800">
            {format(event.event_date, 'EEEE, MMMM d, yyyy')}
          </span>
          {event.event_time && (
            <span className="text-gray-500 text-sm">{event.event_time}</span>
          )}
        </div>

        {/* Address */}
        <p className="text-sm text-gray-500 mb-4">
          {venue.address}, {venue.city}, {venue.province}
        </p>

        {/* Price badge */}
        {event.price && (
          <span className="inline-block bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
            {event.price}
          </span>
        )}

        {/* Category badge */}
        {event.event_category && (
          <span className="inline-block bg-orange-50 text-orange-700 border border-orange-200 text-sm font-medium px-3 py-1 rounded-full mb-4">
            {CATEGORY_META[event.event_category as EventCategory]?.label ?? event.event_category}
          </span>
        )}

        {/* CTA button */}
        {ctaUrl && ctaHostname && (
          <div className="mb-6">
            <a
              href={ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#E85D26] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[#d04e1f] transition-colors"
            >
              View on {ctaHostname}
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </a>
          </div>
        )}

        {/* Ticketmaster attribution */}
        {event.source_url?.includes('ticketmaster.com') && (
          <p className="text-sm text-gray-500 mb-4">
            Event data{' '}
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              via Ticketmaster
            </a>
          </p>
        )}

        {/* Description */}
        {event.description && (
          <p className="text-gray-700 leading-relaxed mb-6">
            {event.description}
          </p>
        )}

        {/* Mini map */}
        {venue.lat != null && venue.lng != null && (
          <div className="mb-8" style={{ height: '200px' }}>
            <MiniMapWrapper
              lat={venue.lat}
              lng={venue.lng}
              venueName={venue.name}
            />
          </div>
        )}

        {/* More at venue */}
        {moreAtVenue.length > 0 && (
          <div>
            <div className="border-t border-gray-100 mb-4" />
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              More at {venue.name}
            </h2>
            <ul className="space-y-2">
              {moreAtVenue.map(({ events: e }) => (
                <li key={e.id}>
                  <Link
                    href={`/event/${e.id}`}
                    className="flex items-baseline justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <span className="font-medium text-gray-800 group-hover:text-[#E85D26] transition-colors">
                      {e.performer}
                    </span>
                    <span className="text-sm text-gray-400 ml-4 shrink-0">
                      {format(e.event_date, 'MMM d')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
