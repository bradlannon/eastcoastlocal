import type { EventWithVenue } from '@/types/index';

/**
 * Represents an event after series collapsing.
 * Non-series events have occurrenceCount=1.
 * Series representatives have occurrenceCount = number of future occurrences in the input.
 */
export interface CollapsedEvent {
  event: EventWithVenue;
  occurrenceCount: number;
}

/**
 * Collapse recurring series events to their next (earliest) occurrence.
 *
 * Events are expected to arrive pre-sorted by date ascending.
 * For each series_id, only the first-encountered event is kept as a representative,
 * and occurrenceCount is set to the total number of events in that series group.
 * Non-series events (series_id null/undefined) pass through with occurrenceCount=1.
 *
 * Sort order is preserved: each series representative appears at the position
 * of its first group member in the input array.
 *
 * Pure function — no side effects, no DB calls.
 */
export function collapseSeriesEvents(events: EventWithVenue[]): CollapsedEvent[] {
  // First pass: count occurrences per series_id
  const countMap = new Map<number, number>();
  for (const ev of events) {
    const sid = ev.events.series_id;
    if (sid != null) {
      countMap.set(sid, (countMap.get(sid) ?? 0) + 1);
    }
  }

  // Second pass: iterate original array in order, emitting each event once
  const seen = new Set<number>();
  const result: CollapsedEvent[] = [];

  for (const ev of events) {
    const sid = ev.events.series_id;

    if (sid == null) {
      // Non-series event — always emit
      result.push({ event: ev, occurrenceCount: 1 });
    } else if (!seen.has(sid)) {
      // First occurrence of this series — emit as representative
      seen.add(sid);
      result.push({ event: ev, occurrenceCount: countMap.get(sid) ?? 1 });
    }
    // Subsequent occurrences of an already-seen series — skip
  }

  return result;
}
