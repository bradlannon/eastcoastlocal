/**
 * Characterization tests for src/lib/province-bounds.ts
 *
 * The module exports constants — PROVINCE_BOUNDS, PROVINCE_LABELS,
 * ATLANTIC_CANADA_CENTER, INITIAL_ZOOM, MIN_ZOOM, ATLANTIC_CANADA_BOUNDS,
 * ATLANTIC_CANADA_MAX_BOUNDS. There is no runtime point-in-province helper.
 */

import {
  PROVINCE_BOUNDS,
  PROVINCE_LABELS,
  ATLANTIC_CANADA_CENTER,
  INITIAL_ZOOM,
  MIN_ZOOM,
  ATLANTIC_CANADA_BOUNDS,
  ATLANTIC_CANADA_MAX_BOUNDS,
} from './province-bounds';

const PROVINCES = ['NB', 'NS', 'PEI', 'NL'] as const;

describe('PROVINCE_BOUNDS', () => {
  it('contains an entry for all four Atlantic provinces', () => {
    for (const prov of PROVINCES) {
      expect(PROVINCE_BOUNDS).toHaveProperty(prov);
    }
  });

  it('each bbox is a [[lat,lng],[lat,lng]] tuple', () => {
    for (const prov of PROVINCES) {
      const bbox = PROVINCE_BOUNDS[prov];
      expect(bbox).toHaveLength(2);
      expect(bbox[0]).toHaveLength(2);
      expect(bbox[1]).toHaveLength(2);
    }
  });

  it('each bbox has sw corner south of ne corner (lat)', () => {
    for (const prov of PROVINCES) {
      const [[swLat], [neLat]] = PROVINCE_BOUNDS[prov];
      expect(swLat).toBeLessThan(neLat);
    }
  });

  it('each bbox has sw corner west of ne corner (lng)', () => {
    for (const prov of PROVINCES) {
      const [[, swLng], [, neLng]] = PROVINCE_BOUNDS[prov];
      expect(swLng).toBeLessThan(neLng);
    }
  });

  it('NB bbox contains known NB coordinate (Moncton ~46.1°N, 64.8°W)', () => {
    const [[swLat, swLng], [neLat, neLng]] = PROVINCE_BOUNDS['NB'];
    const lat = 46.1;
    const lng = -64.8;
    expect(lat).toBeGreaterThanOrEqual(swLat);
    expect(lat).toBeLessThanOrEqual(neLat);
    expect(lng).toBeGreaterThanOrEqual(swLng);
    expect(lng).toBeLessThanOrEqual(neLng);
  });

  it('NS bbox contains known NS coordinate (Halifax ~44.65°N, 63.58°W)', () => {
    const [[swLat, swLng], [neLat, neLng]] = PROVINCE_BOUNDS['NS'];
    const lat = 44.65;
    const lng = -63.58;
    expect(lat).toBeGreaterThanOrEqual(swLat);
    expect(lat).toBeLessThanOrEqual(neLat);
    expect(lng).toBeGreaterThanOrEqual(swLng);
    expect(lng).toBeLessThanOrEqual(neLng);
  });

  it('PEI bbox contains known PEI coordinate (Charlottetown ~46.24°N, 63.13°W)', () => {
    const [[swLat, swLng], [neLat, neLng]] = PROVINCE_BOUNDS['PEI'];
    const lat = 46.24;
    const lng = -63.13;
    expect(lat).toBeGreaterThanOrEqual(swLat);
    expect(lat).toBeLessThanOrEqual(neLat);
    expect(lng).toBeGreaterThanOrEqual(swLng);
    expect(lng).toBeLessThanOrEqual(neLng);
  });

  it('NL bbox contains known NL coordinate (St. Johns ~47.56°N, 52.71°W)', () => {
    const [[swLat, swLng], [neLat, neLng]] = PROVINCE_BOUNDS['NL'];
    const lat = 47.56;
    const lng = -52.71;
    expect(lat).toBeGreaterThanOrEqual(swLat);
    expect(lat).toBeLessThanOrEqual(neLat);
    expect(lng).toBeGreaterThanOrEqual(swLng);
    expect(lng).toBeLessThanOrEqual(neLng);
  });
});

describe('PROVINCE_LABELS', () => {
  it('has display names for all four provinces', () => {
    for (const prov of PROVINCES) {
      expect(PROVINCE_LABELS).toHaveProperty(prov);
      expect(typeof PROVINCE_LABELS[prov]).toBe('string');
    }
  });

  it('NB label is New Brunswick', () => {
    expect(PROVINCE_LABELS['NB']).toBe('New Brunswick');
  });

  it('NS label is Nova Scotia', () => {
    expect(PROVINCE_LABELS['NS']).toBe('Nova Scotia');
  });

  it('PEI label is Prince Edward Island', () => {
    expect(PROVINCE_LABELS['PEI']).toBe('Prince Edward Island');
  });

  it('NL label contains Newfoundland', () => {
    expect(PROVINCE_LABELS['NL']).toContain('Newfoundland');
  });
});

describe('ATLANTIC_CANADA_CENTER and zoom constants', () => {
  it('ATLANTIC_CANADA_CENTER is a [lat, lng] tuple', () => {
    expect(ATLANTIC_CANADA_CENTER).toHaveLength(2);
    const [lat, lng] = ATLANTIC_CANADA_CENTER;
    expect(lat).toBeGreaterThan(40);
    expect(lat).toBeLessThan(60);
    expect(lng).toBeLessThan(0); // Western hemisphere
  });

  it('INITIAL_ZOOM is a reasonable zoom level', () => {
    expect(INITIAL_ZOOM).toBeGreaterThanOrEqual(1);
    expect(INITIAL_ZOOM).toBeLessThanOrEqual(18);
  });

  it('MIN_ZOOM is less than or equal to INITIAL_ZOOM', () => {
    expect(MIN_ZOOM).toBeLessThanOrEqual(INITIAL_ZOOM);
  });
});

describe('ATLANTIC_CANADA_BOUNDS', () => {
  it('is a valid bbox', () => {
    expect(ATLANTIC_CANADA_BOUNDS).toHaveLength(2);
    const [[swLat, swLng], [neLat, neLng]] = ATLANTIC_CANADA_BOUNDS;
    expect(swLat).toBeLessThan(neLat);
    expect(swLng).toBeLessThan(neLng);
  });
});

describe('ATLANTIC_CANADA_MAX_BOUNDS', () => {
  it('is larger than ATLANTIC_CANADA_BOUNDS', () => {
    const [[swLat, swLng], [neLat, neLng]] = ATLANTIC_CANADA_BOUNDS;
    const [[mswLat, mswLng], [mneLat, mneLng]] = ATLANTIC_CANADA_MAX_BOUNDS;
    // Max bounds should extend further in all directions
    expect(mswLat).toBeLessThanOrEqual(swLat);
    expect(mswLng).toBeLessThanOrEqual(swLng);
    expect(mneLat).toBeGreaterThanOrEqual(neLat);
    expect(mneLng).toBeGreaterThanOrEqual(neLng);
  });
});
