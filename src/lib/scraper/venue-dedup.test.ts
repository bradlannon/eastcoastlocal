import {
  normalizeVenueName,
  venueNameRatio,
  scoreVenueCandidate,
  MERGE_NAME_RATIO,
  MERGE_GEO_METERS,
  REVIEW_GEO_METERS,
} from './venue-dedup';
import type { DedupeDecision, VenueForDedup } from './venue-dedup';

// ---------------------------------------------------------------------------
// Helpers — venue fixture factory
// ---------------------------------------------------------------------------

function makeVenue(
  name: string,
  lat: number | null = null,
  lng: number | null = null
): VenueForDedup {
  return { name, lat, lng };
}

// ---------------------------------------------------------------------------
// describe('normalizeVenueName')
// ---------------------------------------------------------------------------

describe('normalizeVenueName', () => {
  it('lowercases the name', () => {
    expect(normalizeVenueName('Scotiabank Centre')).toBe('scotiabank centre');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeVenueName('  Avenir Centre  ')).toBe('avenir centre');
  });

  it('strips leading "The " (case-insensitive)', () => {
    expect(normalizeVenueName('The Marquee Ballroom')).toBe('marquee ballroom');
  });

  it('strips leading "The " from padded input', () => {
    expect(normalizeVenueName('  The Scotiabank Centre  ')).toBe('scotiabank centre');
  });

  it('does not strip "The" in the middle of a name', () => {
    expect(normalizeVenueName('Casino New Brunswick')).toBe('casino new brunswick');
  });

  it('collapses multiple internal spaces', () => {
    expect(normalizeVenueName('Harbour  Station')).toBe('harbour station');
  });

  it('handles already-normalized input', () => {
    expect(normalizeVenueName('scotiabank centre')).toBe('scotiabank centre');
  });
});

// ---------------------------------------------------------------------------
// describe('venueNameRatio')
// ---------------------------------------------------------------------------

describe('venueNameRatio', () => {
  it('returns 0.0 for identical names', () => {
    expect(venueNameRatio('Scotiabank Centre', 'Scotiabank Centre')).toBe(0);
  });

  it('returns a low ratio for very similar names', () => {
    // "The Marquee Ballroom" normalizes to "marquee ballroom" (16 chars)
    // "Marquee Ballroom" normalizes to "marquee ballroom" (16 chars)
    // distance = 0
    const ratio = venueNameRatio('The Marquee Ballroom', 'Marquee Ballroom');
    expect(ratio).toBe(0);
  });

  it('returns low ratio for name with minor suffix difference', () => {
    // "scotiabank centre" vs "scotiabank centre halifax"
    // distance = 8 (" halifax"), max length = 25
    const ratio = venueNameRatio('Scotiabank Centre', 'Scotiabank Centre Halifax');
    expect(ratio).toBeLessThan(0.35);
  });

  it('returns a high ratio for clearly different venue names', () => {
    // "harbour station" vs "saint john arena" — completely different
    const ratio = venueNameRatio('Harbour Station', 'Saint John Arena');
    expect(ratio).toBeGreaterThan(0.5);
  });

  it('respects the MERGE_NAME_RATIO constant (0.15)', () => {
    expect(MERGE_NAME_RATIO).toBe(0.15);
  });
});

// ---------------------------------------------------------------------------
// describe('scoreVenueCandidate')
// ---------------------------------------------------------------------------

// Real coordinates:
// Scotiabank Centre Halifax: 44.6488, -63.5752
// ~50m away:  44.6489, -63.5747
// ~600m away: 44.6542, -63.5752
// ~250m away: 44.6510, -63.5752

describe('scoreVenueCandidate', () => {
  // Lat/lng for Scotiabank Centre Halifax
  const CANONICAL_LAT = 44.6488;
  const CANONICAL_LNG = -63.5752;

  it('returns merge when name ratio < 0.15 AND geo < 100m', () => {
    // "Scotiabank Center" (US spelling) vs "Scotiabank Centre" — ratio 0.118
    const incoming = makeVenue('Scotiabank Center', 44.6489, -63.5747); // ~50m
    const candidate = makeVenue('Scotiabank Centre', CANONICAL_LAT, CANONICAL_LNG);
    const result = scoreVenueCandidate(incoming, candidate);
    expect(result.action).toBe('merge');
  });

  it('returns review:name_match_geo_distant when name matches but geo > 500m', () => {
    const incoming = makeVenue('Scotiabank Centre', 44.6542, -63.5752); // ~600m away
    const candidate = makeVenue('Scotiabank Centre', CANONICAL_LAT, CANONICAL_LNG);
    const result = scoreVenueCandidate(incoming, candidate);
    expect(result.action).toBe('review');
    expect((result as Extract<DedupeDecision, { action: 'review' }>).reason).toBe(
      'name_match_geo_distant'
    );
  });

  it('returns review:geo_close_name_differs when geo < 100m but name differs', () => {
    const incoming = makeVenue('Halifax Metro Centre', 44.6489, -63.5747); // ~50m, different name
    const candidate = makeVenue('Scotiabank Centre', CANONICAL_LAT, CANONICAL_LNG);
    const result = scoreVenueCandidate(incoming, candidate);
    expect(result.action).toBe('review');
    expect((result as Extract<DedupeDecision, { action: 'review' }>).reason).toBe(
      'geo_close_name_differs'
    );
  });

  it('returns review:name_match_no_geo when name matches but incoming has null lat', () => {
    const incoming = makeVenue('Scotiabank Centre', null, null);
    const candidate = makeVenue('Scotiabank Centre', CANONICAL_LAT, CANONICAL_LNG);
    const result = scoreVenueCandidate(incoming, candidate);
    expect(result.action).toBe('review');
    expect((result as Extract<DedupeDecision, { action: 'review' }>).reason).toBe(
      'name_match_no_geo'
    );
  });

  it('returns review:name_match_no_geo when name matches but incoming has null lng only', () => {
    const incoming = makeVenue('Scotiabank Centre', 44.6488, null);
    const candidate = makeVenue('Scotiabank Centre', CANONICAL_LAT, CANONICAL_LNG);
    const result = scoreVenueCandidate(incoming, candidate);
    expect(result.action).toBe('review');
    expect((result as Extract<DedupeDecision, { action: 'review' }>).reason).toBe(
      'name_match_no_geo'
    );
  });

  it('returns keep_separate when name ratio >= 0.15 AND geo > 500m', () => {
    const incoming = makeVenue('Harbour Station', 45.2667, -66.0723); // Saint John, NB
    const candidate = makeVenue('Avenir Centre', 46.0979, -64.7797); // Moncton, NB
    const result = scoreVenueCandidate(incoming, candidate);
    expect(result.action).toBe('keep_separate');
  });

  it('returns keep_separate when name ratio >= 0.15 AND geo between 100m and 500m', () => {
    const incoming = makeVenue('Halifax Metro Centre', 44.6510, -63.5752); // ~250m away, different name
    const candidate = makeVenue('Scotiabank Centre', CANONICAL_LAT, CANONICAL_LNG);
    const result = scoreVenueCandidate(incoming, candidate);
    expect(result.action).toBe('keep_separate');
  });

  it('returns review:name_match_geo_uncertain for borderline geo (100m-500m) with name match', () => {
    // ~250m away, name matches
    const incoming = makeVenue('Scotiabank Centre', 44.6510, -63.5752);
    const candidate = makeVenue('Scotiabank Centre', CANONICAL_LAT, CANONICAL_LNG);
    const result = scoreVenueCandidate(incoming, candidate);
    expect(result.action).toBe('review');
    expect((result as Extract<DedupeDecision, { action: 'review' }>).reason).toBe(
      'name_match_geo_uncertain'
    );
  });
});

