import type { EventWithVenue } from '@/types/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TOTAL_DAYS = 30;
export const BLOCKS_PER_DAY = 4; // Morning / Afternoon / Evening / Night
export const TOTAL_STEPS = TOTAL_DAYS * BLOCKS_PER_DAY; // 120
export const BLOCK_HOURS = 24 / BLOCKS_PER_DAY; // 6
export const STEP_SIZE = 1 / TOTAL_STEPS; // 1/120
export const WINDOW_HOURS = 24;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const BLOCK_NAMES = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

export interface HeatPoint {
  lat: number;
  lng: number;
  intensity: number; // 0–1; minimum 0.15 so single events are visible
}

// ---------------------------------------------------------------------------
// positionToTimestamp
// ---------------------------------------------------------------------------

/**
 * Maps a normalized position (0–1) to a Date within the 30-day timelapse window.
 *
 * position=0 -> referenceDate
 * position=1 -> referenceDate + 30 days
 * position=0.5 -> referenceDate + 15 days
 */
export function positionToTimestamp(position: number, referenceDate: Date): Date {
  const rangeMs = TOTAL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(referenceDate.getTime() + position * rangeMs);
}

// ---------------------------------------------------------------------------
// positionToBlockName
// ---------------------------------------------------------------------------

/**
 * Returns the 6-hour block name for a given scrubber position.
 *
 * Block cycle repeats every 4 steps (one day):
 *   step 0 -> "Morning", step 1 -> "Afternoon", step 2 -> "Evening", step 3 -> "Night"
 *   step 4 -> "Morning" (next day), etc.
 */
export function positionToBlockName(position: number): BlockName {
  const stepIndex = Math.round(position * (TOTAL_STEPS - 1));
  return BLOCK_NAMES[stepIndex % BLOCKS_PER_DAY];
}

// ---------------------------------------------------------------------------
// filterByTimeWindow
// ---------------------------------------------------------------------------

/**
 * Returns only the events whose event_date falls within ±(windowHours/2) of centerMs.
 *
 * Default window is 24 hours (±12h).
 */
export function filterByTimeWindow(
  events: EventWithVenue[],
  centerMs: number,
  windowHours: number = WINDOW_HOURS
): EventWithVenue[] {
  const halfMs = (windowHours / 2) * 60 * 60 * 1000;
  return events.filter((e) => {
    const t = new Date(e.events.event_date).getTime();
    return t >= centerMs - halfMs && t <= centerMs + halfMs;
  });
}

// ---------------------------------------------------------------------------
// computeVenueHeatPoints
// ---------------------------------------------------------------------------

/**
 * Groups events by venue and returns normalized heat points.
 *
 * - Events with null lat/lng are skipped.
 * - Intensity is normalized to 0–1 relative to the busiest venue.
 * - Minimum intensity of 0.15 ensures single-event venues are visible.
 */
export function computeVenueHeatPoints(events: EventWithVenue[]): HeatPoint[] {
  const venueCounts = new Map<number, { lat: number; lng: number; count: number }>();

  for (const e of events) {
    const { lat, lng, id } = e.venues;
    if (lat == null || lng == null) continue;

    const existing = venueCounts.get(id);
    if (existing) {
      existing.count++;
    } else {
      venueCounts.set(id, { lat: lat as number, lng: lng as number, count: 1 });
    }
  }

  const maxCount = Math.max(1, ...Array.from(venueCounts.values()).map((v) => v.count));

  return Array.from(venueCounts.values()).map(({ lat, lng, count }) => ({
    lat,
    lng,
    intensity: Math.max(0.15, count / maxCount),
  }));
}
