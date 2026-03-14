import { venues, events, scrape_sources } from './schema';

describe('Database Schema Structure', () => {
  describe('venues table', () => {
    it('has all expected columns', () => {
      const columns = Object.keys(venues);
      const expected = [
        'id',
        'name',
        'address',
        'city',
        'province',
        'lat',
        'lng',
        'website',
        'phone',
        'venue_type',
        'created_at',
      ];
      for (const col of expected) {
        expect(columns).toContain(col);
      }
    });
  });

  describe('events table', () => {
    it('has all expected columns', () => {
      const columns = Object.keys(events);
      const expected = [
        'id',
        'venue_id',
        'performer',
        'normalized_performer',
        'event_date',
        'event_time',
        'source_url',
        'scrape_timestamp',
        'raw_extracted_text',
        'price',
        'ticket_link',
        'description',
        'cover_image_url',
        'created_at',
        'updated_at',
      ];
      for (const col of expected) {
        expect(columns).toContain(col);
      }
    });
  });

  describe('scrape_sources table', () => {
    it('has all expected columns', () => {
      const columns = Object.keys(scrape_sources);
      const expected = [
        'id',
        'url',
        'venue_id',
        'scrape_frequency',
        'last_scraped_at',
        'last_scrape_status',
        'source_type',
        'enabled',
        'created_at',
      ];
      for (const col of expected) {
        expect(columns).toContain(col);
      }
    });
  });
});
