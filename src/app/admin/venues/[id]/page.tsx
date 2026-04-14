import { eq, count } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import { venues, events, scrape_sources } from '@/lib/db/schema';
import Link from 'next/link';
import VenueEditForm from './VenueEditForm';
import SourceManagement from './SourceManagement';
import DeleteVenueButton from './_components/DeleteVenueButton';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VenueDetailPage({ params }: PageProps) {
  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);

  if (isNaN(id)) {
    notFound();
  }

  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.id, id));

  if (rows.length === 0) {
    notFound();
  }

  const venue = rows[0];

  const sources = await db
    .select()
    .from(scrape_sources)
    .where(eq(scrape_sources.venue_id, id))
    .orderBy(scrape_sources.created_at);

  // Counts for delete guardrail
  const eventCountRows = await db
    .select({ count: count() })
    .from(events)
    .where(eq(events.venue_id, id));
  const eventCount = Number(eventCountRows[0]?.count ?? 0);
  const sourceCount = sources.length;

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/admin/venues" className="hover:text-gray-700 transition-colors">
          Venues
        </Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{venue.name}</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{venue.name}</h1>

      {/* Edit form */}
      <VenueEditForm venue={venue} />

      {/* Scrape Sources section */}
      <SourceManagement venueId={id} sources={sources} />

      {/* Delete venue */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Danger zone</h2>
        <p className="text-sm text-gray-500 mb-4">
          Permanently delete this venue. Only available when there are no associated events or scrape sources.
        </p>
        <DeleteVenueButton
          venueId={id}
          eventCount={eventCount}
          sourceCount={sourceCount}
        />
      </div>
    </div>
  );
}
