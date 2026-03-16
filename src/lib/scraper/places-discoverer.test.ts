import {
  PLACES_CITIES,
  VENUE_PLACE_TYPES,
  CORE_VENUE_TYPES,
  SECONDARY_VENUE_TYPES,
  PLACES_AUTO_APPROVE,
  GEMINI_AUTO_APPROVE,
  isVenueRelevant,
  scorePlacesCandidate,
} from './places-discoverer';

describe('PLACES_CITIES', () => {
  it('has all 4 Atlantic provinces as keys', () => {
    expect(PLACES_CITIES).toHaveProperty('NS');
    expect(PLACES_CITIES).toHaveProperty('NB');
    expect(PLACES_CITIES).toHaveProperty('PEI');
    expect(PLACES_CITIES).toHaveProperty('NL');
  });

  it('NS has ~15 entries all with province=NS', () => {
    expect(PLACES_CITIES.NS.length).toBeGreaterThanOrEqual(14);
    for (const entry of PLACES_CITIES.NS) {
      expect(entry.province).toBe('NS');
      expect(typeof entry.city).toBe('string');
    }
  });

  it('NB has ~12 entries all with province=NB', () => {
    expect(PLACES_CITIES.NB.length).toBeGreaterThanOrEqual(11);
    for (const entry of PLACES_CITIES.NB) {
      expect(entry.province).toBe('NB');
    }
  });

  it('PEI has ~4 entries all with province=PEI', () => {
    expect(PLACES_CITIES.PEI.length).toBeGreaterThanOrEqual(4);
    for (const entry of PLACES_CITIES.PEI) {
      expect(entry.province).toBe('PEI');
    }
  });

  it('NL has ~10 entries all with province=NL', () => {
    expect(PLACES_CITIES.NL.length).toBeGreaterThanOrEqual(9);
    for (const entry of PLACES_CITIES.NL) {
      expect(entry.province).toBe('NL');
    }
  });

  it('total entries >= 40', () => {
    const total =
      PLACES_CITIES.NS.length +
      PLACES_CITIES.NB.length +
      PLACES_CITIES.PEI.length +
      PLACES_CITIES.NL.length;
    expect(total).toBeGreaterThanOrEqual(40);
  });
});

describe('VENUE_PLACE_TYPES', () => {
  it('contains exactly 7 allowed types', () => {
    expect(VENUE_PLACE_TYPES.size).toBe(7);
  });

  it('contains bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium', () => {
    expect(VENUE_PLACE_TYPES.has('bar')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('night_club')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('concert_hall')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('performing_arts_theater')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('comedy_club')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('community_center')).toBe(true);
    expect(VENUE_PLACE_TYPES.has('stadium')).toBe(true);
  });
});

describe('CORE_VENUE_TYPES', () => {
  it('contains 5 core types', () => {
    expect(CORE_VENUE_TYPES.size).toBe(5);
    expect(CORE_VENUE_TYPES.has('bar')).toBe(true);
    expect(CORE_VENUE_TYPES.has('night_club')).toBe(true);
    expect(CORE_VENUE_TYPES.has('concert_hall')).toBe(true);
    expect(CORE_VENUE_TYPES.has('performing_arts_theater')).toBe(true);
    expect(CORE_VENUE_TYPES.has('comedy_club')).toBe(true);
  });
});

describe('SECONDARY_VENUE_TYPES', () => {
  it('contains 2 secondary types', () => {
    expect(SECONDARY_VENUE_TYPES.size).toBe(2);
    expect(SECONDARY_VENUE_TYPES.has('community_center')).toBe(true);
    expect(SECONDARY_VENUE_TYPES.has('stadium')).toBe(true);
  });
});

describe('threshold constants', () => {
  it('PLACES_AUTO_APPROVE equals 0.8', () => {
    expect(PLACES_AUTO_APPROVE).toBe(0.8);
  });

  it('GEMINI_AUTO_APPROVE equals 0.9', () => {
    expect(GEMINI_AUTO_APPROVE).toBe(0.9);
  });
});

describe('isVenueRelevant', () => {
  it('returns true for bar and restaurant (bar is in allowed types)', () => {
    expect(isVenueRelevant(['bar', 'restaurant'])).toBe(true);
  });

  it('returns false for restaurant and food only', () => {
    expect(isVenueRelevant(['restaurant', 'food'])).toBe(false);
  });

  it('returns true for community_center', () => {
    expect(isVenueRelevant(['community_center'])).toBe(true);
  });

  it('returns true for night_club', () => {
    expect(isVenueRelevant(['night_club'])).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(isVenueRelevant([])).toBe(false);
  });

  it('returns true for concert_hall mixed with other types', () => {
    expect(isVenueRelevant(['food', 'concert_hall', 'establishment'])).toBe(true);
  });
});

describe('scorePlacesCandidate', () => {
  it('returns 0.85 for bar', () => {
    expect(scorePlacesCandidate(['bar'])).toBe(0.85);
  });

  it('returns 0.85 for night_club and bar', () => {
    expect(scorePlacesCandidate(['night_club', 'bar'])).toBe(0.85);
  });

  it('returns 0.85 for concert_hall', () => {
    expect(scorePlacesCandidate(['concert_hall'])).toBe(0.85);
  });

  it('returns 0.85 for performing_arts_theater', () => {
    expect(scorePlacesCandidate(['performing_arts_theater'])).toBe(0.85);
  });

  it('returns 0.85 for comedy_club', () => {
    expect(scorePlacesCandidate(['comedy_club'])).toBe(0.85);
  });

  it('returns 0.70 for community_center', () => {
    expect(scorePlacesCandidate(['community_center'])).toBe(0.70);
  });

  it('returns 0.70 for stadium', () => {
    expect(scorePlacesCandidate(['stadium'])).toBe(0.70);
  });

  it('returns 0 for irrelevant types', () => {
    expect(scorePlacesCandidate(['restaurant', 'food'])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(scorePlacesCandidate([])).toBe(0);
  });

  it('prefers core (0.85) over secondary when both present', () => {
    expect(scorePlacesCandidate(['community_center', 'bar'])).toBe(0.85);
  });
});
