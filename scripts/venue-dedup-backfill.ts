import 'dotenv/config';

/**
 * One-time backfill script: scans existing venues for duplicates and merges them.
 *
 * Usage:
 *   npx tsx scripts/venue-dedup-backfill.ts              # dry-run (default)
 *   npx tsx scripts/venue-dedup-backfill.ts --execute     # actually merge
 *
 * Algorithm:
 *   1. Load all venues grouped by city
 *   2. For each city group with 2+ venues, compare every pair using scoreVenueCandidate
 *   3. Dry-run: print summary table and totals
 *   4. Execute: merge duplicates, reassign events/scrape_sources, delete duplicates, log merges
 */

import { db } from '@/lib/db/client';
import { venues, events, scrape_sources, venueMergeLog, venueMergeCandidates } from '@/lib/db/schema';
import { scoreVenueCandidate, venueNameRatio } from '@/lib/scraper/venue-dedup';
import { eq, sql } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────

interface VenueRow {
  id: number;
  name: string;
  city: string;
  province: string;
  lat: number | null;
  lng: number | null;
  address: string;
}

interface MergeCandidate {
  type: 'merge';
  venueA: VenueRow; // incoming (will be removed)
  venueB: VenueRow; // canonical (kept)
  nameScore: number;
  distanceM: number | null;
}

interface ReviewCandidate {
  type: 'review';
  venueA: VenueRow;
  venueB: VenueRow;
  nameScore: number;
  distanceM: number | null;
  reason: string;
}

type DedupeResult = MergeCandidate | ReviewCandidate | { type: 'keep_separate' };

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const isExecute = process.argv.includes('--execute');

  if (isExecute) {
    console.log('=== VENUE DEDUP BACKFILL — EXECUTE MODE ===');
    console.log('Will merge duplicates, reassign events, delete duplicate venue rows.\n');
  } else {
    console.log('=== VENUE DEDUP BACKFILL — DRY RUN ===');
    console.log('No database changes will be made. Use --execute to apply.\n');
  }

  // Step 1: Load all venues
  const allVenues = await db.select().from(venues);
  console.log(`Loaded ${allVenues.length} venues from database.\n`);

  // Step 2: Group by city (case-insensitive)
  const byCity = new Map<string, VenueRow[]>();
  for (const v of allVenues) {
    const cityKey = v.city.toLowerCase().trim();
    const group = byCity.get(cityKey) ?? [];
    group.push(v as VenueRow);
    byCity.set(cityKey, group);
  }

  const multiVenueCities = [...byCity.entries()].filter(([, group]) => group.length >= 2);
  console.log(`Cities with 2+ venues: ${multiVenueCities.length}\n`);

  // Step 3: Score all pairs
  const mergeList: MergeCandidate[] = [];
  const reviewList: ReviewCandidate[] = [];
  let keepSeparateCount = 0;

  // Track which venue IDs have already been flagged as duplicates to avoid double-processing
  const flaggedAsDuplicate = new Set<number>();

  for (const [cityKey, group] of multiVenueCities) {
    for (let i = 0; i < group.length; i++) {
      const venueA = group[i];
      if (flaggedAsDuplicate.has(venueA.id)) continue;

      for (let j = i + 1; j < group.length; j++) {
        const venueB = group[j];
        if (flaggedAsDuplicate.has(venueB.id)) continue;

        const decision = scoreVenueCandidate(
          { name: venueA.name, lat: venueA.lat, lng: venueA.lng },
          { name: venueB.name, lat: venueB.lat, lng: venueB.lng }
        );

        const nameScore = venueNameRatio(venueA.name, venueB.name);

        // Compute distance if both have geo
        let distanceM: number | null = null;
        if (venueA.lat !== null && venueA.lng !== null && venueB.lat !== null && venueB.lng !== null) {
          const { haversineDistance } = await import('@/lib/timelapse-utils');
          distanceM = haversineDistance(venueA.lat, venueA.lng, venueB.lat, venueB.lng);
        }

        if (decision.action === 'merge') {
          // venueB is canonical (has geo since merge requires both signals)
          // venueA is the duplicate that will be removed
          mergeList.push({ type: 'merge', venueA, venueB, nameScore, distanceM });
          flaggedAsDuplicate.add(venueA.id);
        } else if (decision.action === 'review') {
          reviewList.push({
            type: 'review',
            venueA,
            venueB,
            nameScore,
            distanceM,
            reason: decision.reason,
          });
        } else {
          keepSeparateCount++;
        }
      }

      void cityKey; // suppress unused variable warning
    }
  }

  // Step 4: Print summary table
  const colW = { name: 30, city: 16, score: 10, dist: 12, action: 24 };
  const header = [
    'Duplicate Venue'.padEnd(colW.name),
    'Canonical Venue'.padEnd(colW.name),
    'NameScore'.padEnd(colW.score),
    'Distance(m)'.padEnd(colW.dist),
    'Decision',
  ].join(' | ');
  const divider = '-'.repeat(header.length);

  console.log(header);
  console.log(divider);

  for (const m of mergeList) {
    console.log(
      [
        m.venueA.name.slice(0, colW.name - 1).padEnd(colW.name),
        m.venueB.name.slice(0, colW.name - 1).padEnd(colW.name),
        m.nameScore.toFixed(4).padEnd(colW.score),
        (m.distanceM !== null ? m.distanceM.toFixed(1) : 'n/a').padEnd(colW.dist),
        'MERGE',
      ].join(' | ')
    );
  }

  for (const r of reviewList) {
    console.log(
      [
        r.venueA.name.slice(0, colW.name - 1).padEnd(colW.name),
        r.venueB.name.slice(0, colW.name - 1).padEnd(colW.name),
        r.nameScore.toFixed(4).padEnd(colW.score),
        (r.distanceM !== null ? r.distanceM.toFixed(1) : 'n/a').padEnd(colW.dist),
        `REVIEW (${r.reason})`,
      ].join(' | ')
    );
  }

  console.log(divider);
  console.log(
    `\nTotals: ${mergeList.length} merge candidates, ${reviewList.length} review candidates, ${keepSeparateCount} kept separate`
  );

  if (!isExecute) {
    console.log('\nDry run complete. Run with --execute to apply merges.');
    await cleanupDb();
    return;
  }

  // Step 5: Execute merges
  console.log('\n--- Executing merges ---');

  let mergedCount = 0;
  let reviewLoggedCount = 0;

  for (const m of mergeList) {
    const duplicateId = m.venueA.id;
    const canonicalId = m.venueB.id;

    console.log(`  Merging venue ${duplicateId} ("${m.venueA.name}") → ${canonicalId} ("${m.venueB.name}")`);

    // 5a. Reassign events from duplicate to canonical (handle unique constraint violations)
    const dupeEvents = await db.select({ id: events.id }).from(events).where(eq(events.venue_id, duplicateId));

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
        // Unique constraint violation (event already exists on canonical) — delete orphan
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('unique') || errMsg.includes('duplicate')) {
          await db.delete(events).where(eq(events.id, evt.id));
          eventsDropped++;
        } else {
          throw err;
        }
      }
    }

    // 5b. Reassign scrape_sources from duplicate to canonical
    await db
      .update(scrape_sources)
      .set({ venue_id: canonicalId })
      .where(eq(scrape_sources.venue_id, duplicateId));

    // 5c. Delete the duplicate venue row
    await db.delete(venues).where(eq(venues.id, duplicateId));

    // 5d. Log to venue_merge_log
    await db.insert(venueMergeLog).values({
      canonical_venue_id: canonicalId,
      merged_venue_name: m.venueA.name,
      merged_venue_city: m.venueA.city,
      name_score: m.nameScore,
      distance_meters: m.distanceM,
    });

    console.log(`    Events reassigned: ${eventsReassigned}, dropped (conflict): ${eventsDropped}`);
    mergedCount++;
  }

  // Step 6: Log review candidates
  console.log('\n--- Logging review candidates ---');

  for (const r of reviewList) {
    // Insert only if not already present (check by venue pair)
    const existing = await db.query.venueMergeCandidates?.findFirst?.({
      where: (t, { and, eq: eqOp, or }) =>
        or(
          and(eqOp(t.venue_a_id, r.venueA.id), eqOp(t.venue_b_id, r.venueB.id)),
          and(eqOp(t.venue_a_id, r.venueB.id), eqOp(t.venue_b_id, r.venueA.id))
        ),
    });

    if (!existing) {
      await db.insert(venueMergeCandidates).values({
        venue_a_id: r.venueA.id,
        venue_b_id: r.venueB.id,
        name_score: r.nameScore,
        distance_meters: r.distanceM,
        reason: r.reason,
        status: 'pending',
      });
      reviewLoggedCount++;
      console.log(`  Logged review: "${r.venueA.name}" <-> "${r.venueB.name}" (${r.reason})`);
    } else {
      console.log(`  Skipped (already logged): "${r.venueA.name}" <-> "${r.venueB.name}"`);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`  Venues merged: ${mergedCount}`);
  console.log(`  Review candidates logged: ${reviewLoggedCount}`);

  await cleanupDb();
}

// ─── Cleanup ──────────────────────────────────────────────────────────────

async function cleanupDb() {
  // End the Neon serverless connection pool
  try {
    // @ts-expect-error — neon http driver may not expose end()
    await db.end?.();
  } catch {
    // noop
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
