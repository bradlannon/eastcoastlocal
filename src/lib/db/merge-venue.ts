import { db } from '@/lib/db/client';
import {
  events,
  event_sources,
  scrape_sources,
  venues,
  venueMergeLog,
  venueMergeCandidates,
} from '@/lib/db/schema';
import { eq, and, or, ne, sql } from 'drizzle-orm';

export interface PerformVenueMergeOpts {
  canonicalId: number;
  duplicateId: number;
  candidateId: number;
  nameScore: number;
  distanceMeters: number | null;
  duplicateName: string;
  duplicateCity: string;
}

export interface PerformVenueMergeResult {
  eventsReassigned: number;
  eventsDropped: number;
}

/**
 * Merge a duplicate venue into a canonical venue.
 *
 * Steps:
 * 1. Reassign all events from duplicate → canonical (on unique conflict: clean up
 *    event_sources first, then delete the conflicting event)
 * 2. Bulk reassign scrape_sources from duplicate → canonical
 * 3. Delete the duplicate venue row
 * 4. Insert audit row into venue_merge_log
 * 5. Update venue_merge_candidates: status = 'merged', reviewed_at = now
 */
export async function performVenueMerge(
  opts: PerformVenueMergeOpts
): Promise<PerformVenueMergeResult> {
  const {
    canonicalId,
    duplicateId,
    candidateId,
    nameScore,
    distanceMeters,
    duplicateName,
    duplicateCity,
  } = opts;

  // Step 1: Reassign events from duplicate to canonical
  const dupeEvents = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.venue_id, duplicateId));

  let eventsReassigned = 0;
  let eventsDropped = 0;

  for (const evt of dupeEvents) {
    try {
      await db
        .update(events)
        .set({ venue_id: canonicalId })
        .where(eq(events.id, evt.id));
      eventsReassigned++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('unique') || errMsg.includes('duplicate')) {
        // FK RESTRICT: delete event_sources rows first, then delete the event
        await db
          .delete(event_sources)
          .where(eq(event_sources.event_id, evt.id));
        await db
          .delete(events)
          .where(eq(events.id, evt.id));
        eventsDropped++;
      } else {
        throw err;
      }
    }
  }

  // Step 2: Bulk reassign scrape_sources from duplicate to canonical
  await db
    .update(scrape_sources)
    .set({ venue_id: canonicalId })
    .where(eq(scrape_sources.venue_id, duplicateId));

  // Step 3: Remove any other merge candidates referencing the duplicate venue
  // (they'd break after the venue row is deleted)
  await db
    .delete(venueMergeCandidates)
    .where(
      and(
        or(
          eq(venueMergeCandidates.venue_a_id, duplicateId),
          eq(venueMergeCandidates.venue_b_id, duplicateId)
        ),
        ne(venueMergeCandidates.id, candidateId)
      )
    );

  // Step 4: Delete the duplicate venue row
  await db.delete(venues).where(eq(venues.id, duplicateId));

  // Step 5: Insert audit row into venue_merge_log
  await db.insert(venueMergeLog).values({
    canonical_venue_id: canonicalId,
    merged_venue_name: duplicateName,
    merged_venue_city: duplicateCity,
    name_score: nameScore,
    distance_meters: distanceMeters,
  });

  // Step 6: Update venue_merge_candidates status
  await db
    .update(venueMergeCandidates)
    .set({ status: 'merged', reviewed_at: new Date() })
    .where(eq(venueMergeCandidates.id, candidateId));

  return { eventsReassigned, eventsDropped };
}
