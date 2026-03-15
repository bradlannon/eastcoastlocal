import { distance } from 'fastest-levenshtein';
import { haversineDistance } from '@/lib/timelapse-utils';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Proportional edit-distance threshold for name similarity auto-merge. */
export const MERGE_NAME_RATIO = 0.15;

/** Geocoordinate proximity threshold (meters) for auto-merge. */
export const MERGE_GEO_METERS = 100;

/** Geocoordinate proximity threshold (meters) for review (borderline case). */
export const REVIEW_GEO_METERS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VenueForDedup {
  name: string;
  lat: number | null;
  lng: number | null;
}

export type DedupeDecision =
  | { action: 'merge' }
  | {
      action: 'review';
      reason:
        | 'name_match_geo_distant'
        | 'name_match_geo_uncertain'
        | 'name_match_no_geo'
        | 'geo_close_name_differs';
    }
  | { action: 'keep_separate' };

// ---------------------------------------------------------------------------
// normalizeVenueName
// ---------------------------------------------------------------------------

/**
 * Normalises a venue name for fuzzy comparison:
 * - Trim leading/trailing whitespace
 * - Strip leading "The " (case-insensitive)
 * - Lowercase
 * - Collapse internal whitespace runs to a single space
 */
export function normalizeVenueName(name: string): string {
  let n = name.trim();
  // Strip leading "The " prefix (case-insensitive)
  n = n.replace(/^the\s+/i, '');
  n = n.toLowerCase();
  // Collapse multiple internal spaces
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// ---------------------------------------------------------------------------
// venueNameRatio
// ---------------------------------------------------------------------------

/**
 * Computes a proportional edit distance between two venue names in [0, 1].
 *
 * Returns `distance(a_norm, b_norm) / max(len_a, len_b)`.
 * 0.0 = identical; 1.0 = completely different.
 */
export function venueNameRatio(a: string, b: string): number {
  const na = normalizeVenueName(a);
  const nb = normalizeVenueName(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return distance(na, nb) / maxLen;
}

// ---------------------------------------------------------------------------
// scoreVenueCandidate
// ---------------------------------------------------------------------------

/**
 * Applies the two-signal gate to produce a deduplication decision for a
 * single (incoming, candidate) venue pair.
 *
 * Signal 1 — name:  venueNameRatio < MERGE_NAME_RATIO  (0.15)
 * Signal 2 — geo:   haversineDistance < MERGE_GEO_METERS (100 m)
 *
 * Decision matrix:
 *   name ✓ + geo ✓           → merge
 *   name ✓ + no geo on incoming → review (name_match_no_geo)
 *   name ✓ + geo > REVIEW (500m) → review (name_match_geo_distant)
 *   name ✓ + MERGE < geo ≤ REVIEW → review (name_match_geo_uncertain)
 *   geo ✓ + name ✗           → review (geo_close_name_differs)
 *   neither signal            → keep_separate
 */
export function scoreVenueCandidate(
  incoming: VenueForDedup,
  candidate: VenueForDedup
): DedupeDecision {
  const nameRatio = venueNameRatio(incoming.name, candidate.name);
  const nameMatches = nameRatio < MERGE_NAME_RATIO;

  // Geo is only available when incoming has valid coordinates
  const hasGeo =
    incoming.lat !== null &&
    incoming.lng !== null &&
    candidate.lat !== null &&
    candidate.lng !== null;

  const geoMeters = hasGeo
    ? haversineDistance(
        incoming.lat as number,
        incoming.lng as number,
        candidate.lat as number,
        candidate.lng as number
      )
    : null;

  const geoClose = geoMeters !== null && geoMeters < MERGE_GEO_METERS;
  const geoBorderline =
    geoMeters !== null && geoMeters >= MERGE_GEO_METERS && geoMeters <= REVIEW_GEO_METERS;
  const geoDistant = geoMeters !== null && geoMeters > REVIEW_GEO_METERS;

  // Auto-merge: both signals pass
  if (nameMatches && geoClose) {
    return { action: 'merge' };
  }

  // Name match, but geo unavailable
  if (nameMatches && !hasGeo) {
    return { action: 'review', reason: 'name_match_no_geo' };
  }

  // Name match, geo too distant to trust
  if (nameMatches && geoDistant) {
    return { action: 'review', reason: 'name_match_geo_distant' };
  }

  // Name match, geo borderline (100m–500m)
  if (nameMatches && geoBorderline) {
    return { action: 'review', reason: 'name_match_geo_uncertain' };
  }

  // Geo close, but name diverges
  if (geoClose && !nameMatches) {
    return { action: 'review', reason: 'geo_close_name_differs' };
  }

  // No signal matches
  return { action: 'keep_separate' };
}

