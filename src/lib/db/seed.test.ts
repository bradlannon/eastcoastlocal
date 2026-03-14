import { venueData, sourceData } from './seed-data';

describe('Seed Data Structure', () => {
  describe('venue data', () => {
    it('has at least 5 venues', () => {
      expect(venueData.length).toBeGreaterThanOrEqual(5);
    });

    it('covers all 4 Atlantic provinces', () => {
      const provinces = venueData.map((v) => v.province);
      expect(provinces).toContain('NB');
      expect(provinces).toContain('NS');
      expect(provinces).toContain('PEI');
      expect(provinces).toContain('NL');
    });

    it('each venue has required fields', () => {
      for (const venue of venueData) {
        expect(venue.name).toBeTruthy();
        expect(venue.address).toBeTruthy();
        expect(venue.city).toBeTruthy();
        expect(venue.province).toBeTruthy();
      }
    });
  });

  describe('source data', () => {
    it('has one source per venue', () => {
      expect(sourceData.length).toBe(venueData.length);
    });

    it('each source has required fields', () => {
      for (const source of sourceData) {
        expect(source.url).toBeTruthy();
        expect(source.source_type).toBeTruthy();
      }
    });

    it('Facebook-only venues have their sources disabled', () => {
      // Venues relying on Facebook for events should be disabled
      const shipPubIndex = venueData.findIndex(
        (v) => v.name === 'The Ship Pub & Kitchen'
      );
      expect(shipPubIndex).toBeGreaterThanOrEqual(0);
      expect(sourceData[shipPubIndex].enabled).toBe(false);
    });
  });
});
