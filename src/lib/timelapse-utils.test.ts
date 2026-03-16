import {
  TOTAL_DAYS,
  BLOCKS_PER_DAY,
  TOTAL_STEPS,
  STEP_SIZE,
  WINDOW_HOURS,
  CLICK_RADIUS_METERS,
  positionToTimestamp,
  positionToBlockName,
  filterByTimeWindow,
  computeVenueHeatPoints,
  haversineDistance,
  findNearbyVenues,
} from './timelapse-utils';
import type { EventWithVenue } from '@/types/index';
import type { VenueGroup } from './timelapse-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  id: number,
  venueId: number,
  overrides: Partial<{
    event_date: Date;
    lat: number | null;
    lng: number | null;
  }> = {}
): EventWithVenue {
  return {
    events: {
      id,
      venue_id: venueId,
      performer: `Band ${id}`,
      normalized_performer: `band${id}`,
      event_date: overrides.event_date ?? new Date(),
      event_time: null,
      source_url: null,
      scrape_timestamp: null,
      raw_extracted_text: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      event_category: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    venues: {
      id: venueId,
      name: `Venue ${venueId}`,
      address: '123 Main St',
      city: 'Halifax',
      province: 'NS',
      lat: overrides.lat !== undefined ? overrides.lat : 44.65,
      lng: overrides.lng !== undefined ? overrides.lng : -63.57,
      website: null,
      venue_type: null,
      google_place_id: null,
      created_at: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('TOTAL_DAYS = 30', () => {
    expect(TOTAL_DAYS).toBe(30);
  });

  it('BLOCKS_PER_DAY = 4', () => {
    expect(BLOCKS_PER_DAY).toBe(4);
  });

  it('TOTAL_STEPS = 120', () => {
    expect(TOTAL_STEPS).toBe(120);
  });

  it('STEP_SIZE = 1/120', () => {
    expect(STEP_SIZE).toBeCloseTo(1 / 120);
  });

  it('WINDOW_HOURS = 24', () => {
    expect(WINDOW_HOURS).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// positionToTimestamp
// ---------------------------------------------------------------------------

describe('positionToTimestamp', () => {
  const ref = new Date('2026-01-01T00:00:00.000Z');

  it('position=0 returns referenceDate exactly', () => {
    const result = positionToTimestamp(0, ref);
    expect(result.getTime()).toBe(ref.getTime());
  });

  it('position=1 returns referenceDate + 30 days', () => {
    const result = positionToTimestamp(1, ref);
    const expected = new Date(ref.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('position=0.5 returns referenceDate + 15 days', () => {
    const result = positionToTimestamp(0.5, ref);
    const expected = new Date(ref.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('returns a Date instance', () => {
    const result = positionToTimestamp(0.25, ref);
    expect(result).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// positionToBlockName
// ---------------------------------------------------------------------------

describe('positionToBlockName', () => {
  it('step 0 (position ~0) returns "Morning"', () => {
    expect(positionToBlockName(0)).toBe('Morning');
  });

  it('step 1 (position 1/120) returns "Afternoon"', () => {
    expect(positionToBlockName(1 / 120)).toBe('Afternoon');
  });

  it('step 2 (position 2/120) returns "Evening"', () => {
    expect(positionToBlockName(2 / 120)).toBe('Evening');
  });

  it('step 3 (position 3/120) returns "Night"', () => {
    expect(positionToBlockName(3 / 120)).toBe('Night');
  });

  it('step 4 (position 4/120) returns "Morning" (next day cycle)', () => {
    expect(positionToBlockName(4 / 120)).toBe('Morning');
  });

  it('step 5 (position 5/120) returns "Afternoon"', () => {
    expect(positionToBlockName(5 / 120)).toBe('Afternoon');
  });

  it('position 119/120 maps to stepIndex 118, which returns "Evening"', () => {
    // Math.round((119/120) * 119) = Math.round(118.008) = 118
    // 118 % 4 = 2 -> "Evening"
    expect(positionToBlockName(119 / 120)).toBe('Evening');
  });

  it('position=1 (end) returns correct block', () => {
    // position=1 -> stepIndex = round(1 * 119) = 119 -> 119 % 4 = 3 -> "Night"
    expect(positionToBlockName(1)).toBe('Night');
  });
});

// ---------------------------------------------------------------------------
// filterByTimeWindow
// ---------------------------------------------------------------------------

describe('filterByTimeWindow', () => {
  const center = new Date('2026-06-01T12:00:00.000Z');
  const centerMs = center.getTime();

  it('includes events within +12h of center', () => {
    const plusEleven = new Date(centerMs + 11 * 60 * 60 * 1000);
    const e = makeEvent(1, 1, { event_date: plusEleven });
    expect(filterByTimeWindow([e], centerMs)).toHaveLength(1);
  });

  it('includes events within -12h of center', () => {
    const minusEleven = new Date(centerMs - 11 * 60 * 60 * 1000);
    const e = makeEvent(1, 1, { event_date: minusEleven });
    expect(filterByTimeWindow([e], centerMs)).toHaveLength(1);
  });

  it('excludes events beyond +12h of center', () => {
    const plusThirteen = new Date(centerMs + 13 * 60 * 60 * 1000);
    const e = makeEvent(1, 1, { event_date: plusThirteen });
    expect(filterByTimeWindow([e], centerMs)).toHaveLength(0);
  });

  it('excludes events beyond -12h of center', () => {
    const minusThirteen = new Date(centerMs - 13 * 60 * 60 * 1000);
    const e = makeEvent(1, 1, { event_date: minusThirteen });
    expect(filterByTimeWindow([e], centerMs)).toHaveLength(0);
  });

  it('includes events exactly at the window boundary', () => {
    const atBoundary = new Date(centerMs + 12 * 60 * 60 * 1000);
    const e = makeEvent(1, 1, { event_date: atBoundary });
    expect(filterByTimeWindow([e], centerMs)).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(filterByTimeWindow([], centerMs)).toEqual([]);
  });

  it('windowHours=0 returns nothing (edge case)', () => {
    // halfMs = 0; t must satisfy t >= centerMs && t <= centerMs — only exact match
    // center date is exact but: t >= centerMs - 0 && t <= centerMs + 0, so t === centerMs
    // The event_date equals center so it passes (0 window still includes exact center)
    // Test an event 1ms away:
    const oneMs = new Date(centerMs + 1);
    const e = makeEvent(2, 1, { event_date: oneMs });
    expect(filterByTimeWindow([e], centerMs, 0)).toHaveLength(0);
  });

  it('uses custom windowHours when provided', () => {
    const plusFive = new Date(centerMs + 5 * 60 * 60 * 1000);
    const e = makeEvent(1, 1, { event_date: plusFive });
    // 6h window -> +-3h -> event at +5h should be excluded
    expect(filterByTimeWindow([e], centerMs, 6)).toHaveLength(0);
  });

  it('filters correctly across a mixed array', () => {
    const inside = makeEvent(1, 1, { event_date: new Date(centerMs + 1 * 60 * 60 * 1000) });
    const outside = makeEvent(2, 2, { event_date: new Date(centerMs + 13 * 60 * 60 * 1000) });
    const result = filterByTimeWindow([inside, outside], centerMs);
    expect(result).toHaveLength(1);
    expect(result[0].events.id).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeVenueHeatPoints
// ---------------------------------------------------------------------------

describe('computeVenueHeatPoints', () => {
  it('returns empty array for empty input', () => {
    expect(computeVenueHeatPoints([])).toEqual([]);
  });

  it('single event at single venue -> intensity=1.0 (min 0.15, max=1)', () => {
    const e = makeEvent(1, 1);
    const result = computeVenueHeatPoints([e]);
    expect(result).toHaveLength(1);
    expect(result[0].intensity).toBe(1.0); // 1/1 = 1.0, max(0.15, 1.0) = 1.0
  });

  it('skips events with null lat', () => {
    const e = makeEvent(1, 1, { lat: null });
    expect(computeVenueHeatPoints([e])).toEqual([]);
  });

  it('skips events with null lng', () => {
    const e = makeEvent(1, 1, { lng: null });
    expect(computeVenueHeatPoints([e])).toEqual([]);
  });

  it('3 events at venue A (id=1), 1 event at venue B (id=2) -> A intensity=1.0, B intensity >= 0.15', () => {
    const a1 = makeEvent(1, 1);
    const a2 = makeEvent(2, 1);
    const a3 = makeEvent(3, 1);
    const b1 = makeEvent(4, 2, { lat: 45.0, lng: -64.0 });

    const result = computeVenueHeatPoints([a1, a2, a3, b1]);
    expect(result).toHaveLength(2);

    const venueA = result.find((p) => p.lat === 44.65 && p.lng === -63.57);
    const venueB = result.find((p) => p.lat === 45.0 && p.lng === -64.0);

    expect(venueA).toBeDefined();
    expect(venueB).toBeDefined();
    expect(venueA!.intensity).toBe(1.0); // 3/3 = 1.0
    // venueB: 1/3 ≈ 0.333 > 0.15 so max(0.15, 1/3) ≈ 0.333
    expect(venueB!.intensity).toBeCloseTo(1 / 3);
  });

  it('single-event venues get minimum 0.15 intensity (visible warm spot)', () => {
    // Venue A has 100 events, venue B has 1 event -> B intensity = max(0.15, 1/100) = 0.15
    const eventsA = Array.from({ length: 100 }, (_, i) => makeEvent(i, 1));
    const eventB = makeEvent(200, 2, { lat: 45.0, lng: -64.0 });

    const result = computeVenueHeatPoints([...eventsA, eventB]);
    const venueB = result.find((p) => p.lat === 45.0 && p.lng === -64.0);
    expect(venueB).toBeDefined();
    expect(venueB!.intensity).toBe(0.15); // floor applied
  });

  it('multiple events at same venue are grouped into one HeatPoint', () => {
    const e1 = makeEvent(1, 1);
    const e2 = makeEvent(2, 1);
    const e3 = makeEvent(3, 1);
    const result = computeVenueHeatPoints([e1, e2, e3]);
    expect(result).toHaveLength(1);
  });

  it('returns correct lat/lng from venue', () => {
    const e = makeEvent(1, 1, { lat: 47.5, lng: -52.7 });
    const result = computeVenueHeatPoints([e]);
    expect(result[0].lat).toBe(47.5);
    expect(result[0].lng).toBe(-52.7);
  });

  it('intensity is always between 0.15 and 1.0 (inclusive)', () => {
    const e1 = makeEvent(1, 1);
    const e2 = makeEvent(2, 2, { lat: 45.0, lng: -64.0 });
    const e3 = makeEvent(3, 2, { lat: 45.0, lng: -64.0 });
    const result = computeVenueHeatPoints([e1, e2, e3]);
    for (const point of result) {
      expect(point.intensity).toBeGreaterThanOrEqual(0.15);
      expect(point.intensity).toBeLessThanOrEqual(1.0);
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers for findNearbyVenues tests
// ---------------------------------------------------------------------------

function makeVenueGroup(
  venueId: number,
  lat: number | null,
  lng: number | null
): VenueGroup {
  return {
    venue: {
      id: venueId,
      name: `Venue ${venueId}`,
      address: '123 Main St',
      city: 'Halifax',
      province: 'NS',
      lat,
      lng,
      website: null,
      venue_type: null,
      google_place_id: null,
      created_at: new Date(),
    },
    events: [],
  };
}

// ---------------------------------------------------------------------------
// CLICK_RADIUS_METERS
// ---------------------------------------------------------------------------

describe('CLICK_RADIUS_METERS', () => {
  it('equals 2000', () => {
    expect(CLICK_RADIUS_METERS).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// haversineDistance
// ---------------------------------------------------------------------------

describe('haversineDistance', () => {
  it('returns ~0 for same coordinates', () => {
    expect(haversineDistance(44.6488, -63.5752, 44.6488, -63.5752)).toBeCloseTo(0, 0);
  });

  it('returns ~180km between Halifax and Moncton', () => {
    // Halifax: 44.6488, -63.5752 / Moncton: 46.0878, -64.7782
    const dist = haversineDistance(44.6488, -63.5752, 46.0878, -64.7782);
    // Distance is approximately 180,000m
    expect(dist).toBeGreaterThan(170000);
    expect(dist).toBeLessThan(200000);
  });

  it('returns meters (Earth radius ~6371km)', () => {
    // Antipodal points should be ~20,015km = 20,015,000m
    const dist = haversineDistance(0, 0, 0, 180);
    expect(dist).toBeCloseTo(20015000, -5); // within 100km
  });
});

// ---------------------------------------------------------------------------
// findNearbyVenues
// ---------------------------------------------------------------------------

describe('findNearbyVenues', () => {
  // Halifax coordinates
  const HALIFAX_LAT = 44.6488;
  const HALIFAX_LNG = -63.5752;
  // Moncton coordinates (~180km from Halifax)
  const MONCTON_LAT = 46.0878;
  const MONCTON_LNG = -64.7782;

  it('returns venue when click is at the same location (distance ~0m)', () => {
    const groups = new Map<number, VenueGroup>();
    groups.set(1, makeVenueGroup(1, HALIFAX_LAT, HALIFAX_LNG));

    const result = findNearbyVenues(HALIFAX_LAT, HALIFAX_LNG, groups);
    expect(result).toHaveLength(1);
    expect(result[0].venue.id).toBe(1);
  });

  it('returns empty array when click is far from all venues (~180km)', () => {
    const groups = new Map<number, VenueGroup>();
    groups.set(1, makeVenueGroup(1, HALIFAX_LAT, HALIFAX_LNG));

    const result = findNearbyVenues(MONCTON_LAT, MONCTON_LNG, groups);
    expect(result).toHaveLength(0);
  });

  it('returns multiple venues when several are within radius', () => {
    const groups = new Map<number, VenueGroup>();
    // Two venues very close to Halifax — well within 2000m of Halifax click
    groups.set(1, makeVenueGroup(1, HALIFAX_LAT, HALIFAX_LNG));
    groups.set(2, makeVenueGroup(2, HALIFAX_LAT + 0.001, HALIFAX_LNG + 0.001)); // ~130m away

    const result = findNearbyVenues(HALIFAX_LAT, HALIFAX_LNG, groups);
    expect(result).toHaveLength(2);
  });

  it('skips venues with null lat', () => {
    const groups = new Map<number, VenueGroup>();
    groups.set(1, makeVenueGroup(1, null, HALIFAX_LNG));

    const result = findNearbyVenues(HALIFAX_LAT, HALIFAX_LNG, groups);
    expect(result).toHaveLength(0);
  });

  it('skips venues with null lng', () => {
    const groups = new Map<number, VenueGroup>();
    groups.set(1, makeVenueGroup(1, HALIFAX_LAT, null));

    const result = findNearbyVenues(HALIFAX_LAT, HALIFAX_LNG, groups);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty venue map', () => {
    const groups = new Map<number, VenueGroup>();
    const result = findNearbyVenues(HALIFAX_LAT, HALIFAX_LNG, groups);
    expect(result).toHaveLength(0);
  });

  it('respects custom radius: venue at ~1500m excluded with radius=1000', () => {
    // Offset ~0.0135 degrees lat ≈ 1500m
    const venueLat = HALIFAX_LAT + 0.0135;
    const groups = new Map<number, VenueGroup>();
    groups.set(1, makeVenueGroup(1, venueLat, HALIFAX_LNG));

    const result = findNearbyVenues(HALIFAX_LAT, HALIFAX_LNG, groups, 1000);
    expect(result).toHaveLength(0);
  });

  it('respects custom radius: venue at ~1500m included with radius=2000', () => {
    const venueLat = HALIFAX_LAT + 0.0135;
    const groups = new Map<number, VenueGroup>();
    groups.set(1, makeVenueGroup(1, venueLat, HALIFAX_LNG));

    const result = findNearbyVenues(HALIFAX_LAT, HALIFAX_LNG, groups, 2000);
    expect(result).toHaveLength(1);
  });

  it('uses CLICK_RADIUS_METERS as default radius', () => {
    // Venue at ~1800m (within default 2000m)
    const venueLat = HALIFAX_LAT + 0.0162; // ~1800m
    const groups = new Map<number, VenueGroup>();
    groups.set(1, makeVenueGroup(1, venueLat, HALIFAX_LNG));

    const result = findNearbyVenues(HALIFAX_LAT, HALIFAX_LNG, groups);
    expect(result).toHaveLength(1);
  });
});
