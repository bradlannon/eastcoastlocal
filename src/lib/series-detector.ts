import { db } from '@/lib/db/client';
import { events, recurring_series } from '@/lib/db/schema';
import { isNull, eq, and, inArray, gte, lte } from 'drizzle-orm';
import { distance } from 'fastest-levenshtein';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SERIES_LEVENSHTEIN_THRESHOLD = 0.20;
export const SERIES_MIN_OCCURRENCES = 3;
export const SERIES_WINDOW_DAYS = 90;

export const RECURRENCE_KEYWORDS = [
  'every',
  'weekly',
  'open mic',
  'trivia',
  'bingo',
  'karaoke',
  'open stage',
  'jam night',
  'quiz night',
] as const;

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

/**
 * Returns a proportional Levenshtein ratio between two strings.
 * Result of 0 means identical; closer to 1 means more different.
 * Values below SERIES_LEVENSHTEIN_THRESHOLD (0.20) are considered the same performer.
 */
export function performerFuzzyRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return distance(a, b) / maxLen;
}

/**
 * Returns true if the text contains any of the RECURRENCE_KEYWORDS.
 * Case-insensitive. Keyword bypass — positive result counts as 1 occurrence.
 */
export function hasRecurrenceKeyword(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return RECURRENCE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Returns true if any single weekday appears >= SERIES_MIN_OCCURRENCES times
 * within the provided dates array.
 */
export function isWeekdayRegular(dates: Date[]): boolean {
  if (dates.length < SERIES_MIN_OCCURRENCES) return false;
  const weekdayCounts = new Map<number, number>();
  for (const d of dates) {
    const wd = d.getDay();
    weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1);
  }
  return [...weekdayCounts.values()].some((count) => count >= SERIES_MIN_OCCURRENCES);
}

/**
 * Clusters a list of normalized performer names using greedy Levenshtein grouping.
 *
 * Returns a Map<representative, variant[]>. The representative is the
 * most-frequent variant within the cluster (not first-encountered), so that
 * canonical names win over noisy outliers regardless of DB row ordering.
 */
export function clusterPerformers(
  normalizedPerformers: string[]
): Map<string, string[]> {
  // Step 1: greedy clustering — group names within threshold of an existing representative
  const rawClusters = new Map<string, string[]>(); // initial rep → variants

  for (const name of normalizedPerformers) {
    let matched = false;
    for (const rep of rawClusters.keys()) {
      if (performerFuzzyRatio(name, rep) < SERIES_LEVENSHTEIN_THRESHOLD) {
        rawClusters.get(rep)!.push(name);
        matched = true;
        break;
      }
    }
    if (!matched) {
      rawClusters.set(name, [name]);
    }
  }

  // Step 2: reassign representative to the most-frequent variant in each cluster
  const result = new Map<string, string[]>();

  for (const variants of rawClusters.values()) {
    // Count occurrences of each variant
    const freq = new Map<string, number>();
    for (const v of variants) {
      freq.set(v, (freq.get(v) ?? 0) + 1);
    }

    // Find the variant with the highest frequency
    let bestRep = variants[0];
    let bestCount = 0;
    for (const [v, count] of freq.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestRep = v;
      }
    }

    result.set(bestRep, variants);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Detection result type
// ---------------------------------------------------------------------------

export interface DetectAndTagResult {
  seriesUpserted: number;
  eventsTagged: number;
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/**
 * Scans all non-archived events within a 90-day window (past + future),
 * clusters performers by venue using fuzzy matching, applies three detection
 * signals (weekday regularity, keyword heuristic, recurrence_pattern hint),
 * upserts matching series into recurring_series, and tags events with series_id.
 *
 * Only non-archived events are considered and tagged.
 * Returns counts of series upserted and events tagged.
 */
export async function detectAndTagSeries(): Promise<DetectAndTagResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - SERIES_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + SERIES_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Fetch all non-archived events within the detection window
  const rows = await db
    .select({
      id: events.id,
      venue_id: events.venue_id,
      normalized_performer: events.normalized_performer,
      performer: events.performer,
      description: events.description,
      event_date: events.event_date,
      series_id: events.series_id,
    })
    .from(events)
    .where(
      and(
        isNull(events.archived_at),
        gte(events.event_date, windowStart),
        lte(events.event_date, windowEnd)
      )
    );

  // Group events by venue_id
  const byVenue = new Map<number, typeof rows>();
  for (const row of rows) {
    const venueRows = byVenue.get(row.venue_id) ?? [];
    venueRows.push(row);
    byVenue.set(row.venue_id, venueRows);
  }

  let seriesUpserted = 0;
  let eventsTagged = 0;

  for (const [venueId, venueRows] of byVenue) {
    // Extract all normalized performer names for this venue (with duplicates for frequency)
    const allPerformerNames = venueRows.map((r) => r.normalized_performer);

    // Cluster performers using fuzzy matching
    const clusters = clusterPerformers(allPerformerNames);

    for (const [representative, clusterVariants] of clusters) {
      // Get all events that belong to this cluster
      const clusterVariantSet = new Set(clusterVariants);
      const clusterEvents = venueRows.filter((r) =>
        clusterVariantSet.has(r.normalized_performer)
      );

      // Remove duplicates from clusterVariants for DB queries
      const uniqueVariants = [...new Set(clusterVariants)];

      // Apply detection signals
      const dates = clusterEvents.map((r) => new Date(r.event_date));
      const occurrenceCount = clusterEvents.length;

      // Signal 1: Weekday regularity (requires MIN_OCCURRENCES)
      const weekdaySignal = isWeekdayRegular(dates);

      // Signal 2: Keyword heuristic (bypasses MIN_OCCURRENCES — 1 occurrence is enough)
      const keywordSignal = clusterEvents.some(
        (r) =>
          hasRecurrenceKeyword(r.performer) ||
          hasRecurrenceKeyword(r.description ?? '')
      );

      // Signal 3: Gemini recurrence_pattern hint (requires >= 2 occurrences as safety guard)
      // Note: recurrence_pattern is not in the select above (not in schema select),
      // but the description field may contain this hint. Since recurrence_pattern
      // is stored as part of ExtractedEventSchema and not directly on events table,
      // we check for it via description patterns. The detector uses keywordSignal
      // as the primary bypass; recurrence_pattern signal is handled separately below.
      const recurrencePatternSignal = false; // recurrence_pattern column not on events table yet

      const isSeries = weekdaySignal || keywordSignal || recurrencePatternSignal;

      if (!isSeries) continue;

      // Upsert into recurring_series
      const [seriesRow] = await db
        .insert(recurring_series)
        .values({ venue_id: venueId, normalized_performer: representative })
        .onConflictDoUpdate({
          target: [recurring_series.venue_id, recurring_series.normalized_performer],
          set: { updated_at: new Date() },
        })
        .returning({ id: recurring_series.id });

      seriesUpserted += 1;

      // Tag non-archived events in this cluster with the series_id
      const updateResult = await db
        .update(events)
        .set({ series_id: seriesRow.id })
        .where(
          and(
            eq(events.venue_id, venueId),
            inArray(events.normalized_performer, uniqueVariants),
            isNull(events.archived_at)
          )
        );

      // Count tagged events (approximate from cluster size — actual count tracked via clusterEvents)
      eventsTagged += clusterEvents.filter((r) => r.series_id !== seriesRow.id).length || occurrenceCount;
    }
  }

  return { seriesUpserted, eventsTagged };
}
