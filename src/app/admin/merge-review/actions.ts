'use server';

import { eq, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { events, venues, venueMergeCandidates } from '@/lib/db/schema';
import { performVenueMerge } from '@/lib/db/merge-venue';

/**
 * Merge the two venues in a candidate pair.
 *
 * Canonical venue is determined by event count (higher wins; tie breaks to venue_a).
 * Calls performVenueMerge which handles event reassignment, event_sources cleanup,
 * scrape_sources reassignment, audit logging, and candidate status update.
 */
export async function mergePair(formData: FormData): Promise<void> {
  const candidateIdStr = (formData.get('candidateId') as string | null) ?? '';
  const candidateId = parseInt(candidateIdStr, 10);

  if (isNaN(candidateId)) {
    throw new Error('Invalid candidateId');
  }

  try {
    // Load the candidate row
    const candidates = await db
      .select()
      .from(venueMergeCandidates)
      .where(eq(venueMergeCandidates.id, candidateId))
      .limit(1);

    if (candidates.length === 0) {
      console.error(`[mergePair] Candidate ${candidateId} not found`);
      revalidatePath('/admin/merge-review');
      redirect('/admin/merge-review');
    }

    const candidate = candidates[0];
    const { venue_a_id, venue_b_id, name_score, distance_meters } = candidate;

    // Determine canonical: higher event count wins; tie → venue_a
    const eventCounts = await db
      .select({ venue_id: events.venue_id, count: sql<number>`count(*)::int` })
      .from(events)
      .where(or(eq(events.venue_id, venue_a_id), eq(events.venue_id, venue_b_id)))
      .groupBy(events.venue_id);

    // Build a map of venue_id → count (default 0 if no rows for that venue)
    const countMap = new Map<number, number>(
      eventCounts.map((row) => [row.venue_id, row.count])
    );
    const countA = countMap.get(venue_a_id) ?? 0;
    const countB = countMap.get(venue_b_id) ?? 0;

    const canonicalId = countB > countA ? venue_b_id : venue_a_id;
    const duplicateId = canonicalId === venue_a_id ? venue_b_id : venue_a_id;

    // Load duplicate venue name and city for the audit log
    const duplicateVenues = await db
      .select({ name: venues.name, city: venues.city })
      .from(venues)
      .where(eq(venues.id, duplicateId))
      .limit(1);

    if (duplicateVenues.length === 0) {
      // Venue already deleted (e.g. by a prior merge) — just mark candidate as merged
      console.log(`[mergePair] Duplicate venue ${duplicateId} already deleted, marking candidate ${candidateId} as merged`);
      await db
        .update(venueMergeCandidates)
        .set({ status: 'merged', reviewed_at: new Date() })
        .where(eq(venueMergeCandidates.id, candidateId));
      revalidatePath('/admin/merge-review');
      redirect('/admin/merge-review');
    }

    const { name: duplicateName, city: duplicateCity } = duplicateVenues[0];

    await performVenueMerge({
      canonicalId,
      duplicateId,
      candidateId,
      nameScore: name_score,
      distanceMeters: distance_meters ?? null,
      duplicateName,
      duplicateCity,
    });
  } catch (err) {
    // Re-throw Next.js redirect errors (they use throw internally)
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    // Re-throw the digest-based redirect object
    if (typeof err === 'object' && err !== null && 'digest' in err) throw err;
    console.error('[mergePair] Failed:', err);
    throw err;
  }

  revalidatePath('/admin/merge-review');
  redirect('/admin/merge-review');
}

/**
 * Mark a candidate pair as kept_separate (no merge needed).
 */
export async function keepSeparate(formData: FormData): Promise<void> {
  const candidateIdStr = (formData.get('candidateId') as string | null) ?? '';
  const candidateId = parseInt(candidateIdStr, 10);

  if (isNaN(candidateId)) {
    throw new Error('Invalid candidateId');
  }

  await db
    .update(venueMergeCandidates)
    .set({ status: 'kept_separate', reviewed_at: new Date() })
    .where(eq(venueMergeCandidates.id, candidateId));

  revalidatePath('/admin/merge-review');
  redirect('/admin/merge-review');
}
