import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/client';
import { venues, scrape_sources } from '@/lib/db/schema';
import VenueEditForm from './VenueEditForm';
import SourceManagement from './SourceManagement';

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

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <a href="/admin/venues" className="hover:text-gray-700 transition-colors">
          Venues
        </a>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{venue.name}</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{venue.name}</h1>

      {/* Edit form */}
      <VenueEditForm venue={venue} />

      {/* Scrape Sources section */}
      <SourceManagement venueId={id} sources={sources} />
    </div>
  );
}
