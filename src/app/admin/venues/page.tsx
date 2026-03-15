import Link from 'next/link';
import { count, eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { venues, scrape_sources } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export default async function VenuesPage() {
  let venueRows: Array<{
    id: number;
    name: string;
    city: string;
    province: string;
    sourceCount: number;
  }> = [];
  let loadError = false;

  try {
    const rows = await db
      .select({
        id: venues.id,
        name: venues.name,
        city: venues.city,
        province: venues.province,
        sourceCount: count(scrape_sources.id),
      })
      .from(venues)
      .leftJoin(scrape_sources, eq(scrape_sources.venue_id, venues.id))
      .groupBy(venues.id, venues.name, venues.city, venues.province)
      .orderBy(asc(venues.name));

    venueRows = rows.map((r) => ({
      ...r,
      sourceCount: Number(r.sourceCount),
    }));
  } catch {
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-red-700">
        Failed to load venues. Check your database connection.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Venues</h1>
        <Link
          href="/admin/venues/new"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Venue
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {venueRows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No venues found</div>
        ) : (
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  City
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Province
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sources
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {venueRows.map((venue) => (
                <tr
                  key={venue.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <Link
                      href={`/admin/venues/${venue.id}`}
                      className="block w-full h-full hover:text-blue-600"
                    >
                      {venue.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <Link
                      href={`/admin/venues/${venue.id}`}
                      className="block w-full h-full"
                    >
                      {venue.city}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <Link
                      href={`/admin/venues/${venue.id}`}
                      className="block w-full h-full"
                    >
                      {venue.province}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <Link
                      href={`/admin/venues/${venue.id}`}
                      className="block w-full h-full"
                    >
                      {venue.sourceCount}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
