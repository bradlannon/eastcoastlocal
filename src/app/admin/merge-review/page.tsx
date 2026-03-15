import { count, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db/client';
import { events, scrape_sources, venues, venueMergeCandidates } from '@/lib/db/schema';
import MergeReviewList from './_components/MergeReviewList';

export const dynamic = 'force-dynamic';

type Status = 'pending' | 'merged' | 'kept_separate';

const VALID_STATUSES: Status[] = ['pending', 'merged', 'kept_separate'];

function isValidStatus(s: string): s is Status {
  return VALID_STATUSES.includes(s as Status);
}

export type MergeCandidate = {
  id: number;
  name_score: number;
  distance_meters: number | null;
  reason: string;
  status: string;
  created_at: Date;
  reviewed_at: Date | null;
  venue_a: {
    id: number;
    name: string;
    city: string;
    province: string;
    lat: number | null;
    lng: number | null;
    event_count: number;
    source_count: number;
  };
  venue_b: {
    id: number;
    name: string;
    city: string;
    province: string;
    lat: number | null;
    lng: number | null;
    event_count: number;
    source_count: number;
  };
};

export default async function MergeReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const rawStatus = params.status ?? 'pending';
  const status: Status = isValidStatus(rawStatus) ? rawStatus : 'pending';

  const venueA = alias(venues, 'venue_a');
  const venueB = alias(venues, 'venue_b');

  const [rows, pendingResult, mergedResult, keptSeparateResult] =
    await Promise.all([
      db
        .select({
          id: venueMergeCandidates.id,
          name_score: venueMergeCandidates.name_score,
          distance_meters: venueMergeCandidates.distance_meters,
          reason: venueMergeCandidates.reason,
          status: venueMergeCandidates.status,
          created_at: venueMergeCandidates.created_at,
          reviewed_at: venueMergeCandidates.reviewed_at,
          venue_a_id: venueA.id,
          venue_a_name: venueA.name,
          venue_a_city: venueA.city,
          venue_a_province: venueA.province,
          venue_a_lat: venueA.lat,
          venue_a_lng: venueA.lng,
          venue_b_id: venueB.id,
          venue_b_name: venueB.name,
          venue_b_city: venueB.city,
          venue_b_province: venueB.province,
          venue_b_lat: venueB.lat,
          venue_b_lng: venueB.lng,
        })
        .from(venueMergeCandidates)
        .innerJoin(venueA, eq(venueMergeCandidates.venue_a_id, venueA.id))
        .innerJoin(venueB, eq(venueMergeCandidates.venue_b_id, venueB.id))
        .where(eq(venueMergeCandidates.status, status))
        .orderBy(desc(venueMergeCandidates.created_at)),
      db
        .select({ count: count() })
        .from(venueMergeCandidates)
        .where(eq(venueMergeCandidates.status, 'pending')),
      db
        .select({ count: count() })
        .from(venueMergeCandidates)
        .where(eq(venueMergeCandidates.status, 'merged')),
      db
        .select({ count: count() })
        .from(venueMergeCandidates)
        .where(eq(venueMergeCandidates.status, 'kept_separate')),
    ]);

  const counts = {
    pending: pendingResult[0]?.count ?? 0,
    merged: mergedResult[0]?.count ?? 0,
    kept_separate: keptSeparateResult[0]?.count ?? 0,
  };

  // Collect all unique venue IDs from result set
  const venueIds = new Set<number>();
  for (const row of rows) {
    venueIds.add(row.venue_a_id);
    venueIds.add(row.venue_b_id);
  }

  let eventCountMap = new Map<number, number>();
  let sourceCountMap = new Map<number, number>();

  if (venueIds.size > 0) {
    const idArray = Array.from(venueIds);

    const [eventCounts, sourceCounts] = await Promise.all([
      db
        .select({
          venue_id: events.venue_id,
          cnt: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(inArray(events.venue_id, idArray))
        .groupBy(events.venue_id),
      db
        .select({
          venue_id: scrape_sources.venue_id,
          cnt: sql<number>`count(*)::int`,
        })
        .from(scrape_sources)
        .where(inArray(scrape_sources.venue_id, idArray))
        .groupBy(scrape_sources.venue_id),
    ]);

    eventCountMap = new Map(eventCounts.map((r) => [r.venue_id, r.cnt]));
    sourceCountMap = new Map(sourceCounts.map((r) => [r.venue_id, r.cnt]));
  }

  const candidates: MergeCandidate[] = rows.map((row) => ({
    id: row.id,
    name_score: row.name_score,
    distance_meters: row.distance_meters,
    reason: row.reason,
    status: row.status,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    venue_a: {
      id: row.venue_a_id,
      name: row.venue_a_name,
      city: row.venue_a_city,
      province: row.venue_a_province,
      lat: row.venue_a_lat,
      lng: row.venue_a_lng,
      event_count: eventCountMap.get(row.venue_a_id) ?? 0,
      source_count: sourceCountMap.get(row.venue_a_id) ?? 0,
    },
    venue_b: {
      id: row.venue_b_id,
      name: row.venue_b_name,
      city: row.venue_b_city,
      province: row.venue_b_province,
      lat: row.venue_b_lat,
      lng: row.venue_b_lng,
      event_count: eventCountMap.get(row.venue_b_id) ?? 0,
      source_count: sourceCountMap.get(row.venue_b_id) ?? 0,
    },
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Merge Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review and resolve borderline venue merge candidates.
        </p>
      </div>

      <MergeReviewList
        candidates={candidates}
        counts={counts}
        activeStatus={status}
      />
    </div>
  );
}
