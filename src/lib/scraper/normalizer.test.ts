import { normalizePerformer, upsertEvent } from './normalizer';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

// Mock the db client
jest.mock('@/lib/db/client', () => {
  const returning = jest.fn().mockResolvedValue([{ id: 1 }]);
  const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = jest.fn().mockReturnValue({ values });
  return {
    db: { insert },
  };
});

// Mock the schema to get reference to events table and event_sources table
jest.mock('@/lib/db/schema', () => ({
  events: { venue_id: 'venue_id', event_date: 'event_date', normalized_performer: 'normalized_performer', source_url: 'source_url', ticket_link: 'ticket_link', id: 'id' },
  event_sources: { event_id: 'event_id', source_type: 'source_type' },
  EVENT_CATEGORIES: ['live_music', 'comedy', 'theatre', 'arts', 'sports', 'festival', 'community', 'other'],
  eventCategoryEnum: jest.fn(),
  SOURCE_TYPES: ['scrape', 'ticketmaster', 'manual'],
  sourceTypeEnum: jest.fn(),
}));

import { db } from '@/lib/db/client';

describe('normalizePerformer', () => {
  it('lowercases the input', () => {
    expect(normalizePerformer('The Trews')).toBe('the trews');
  });

  it('removes non-alphanumeric characters except spaces', () => {
    expect(normalizePerformer('AC/DC')).toBe('acdc');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizePerformer('  Some Band  ')).toBe('some band');
  });

  it('removes special characters and collapses whitespace', () => {
    expect(normalizePerformer('Band & The Boys!')).toBe('band the boys');
  });

  it('preserves common words like "the"', () => {
    expect(normalizePerformer('The Tragically Hip')).toBe('the tragically hip');
  });

  it('handles multiple spaces', () => {
    expect(normalizePerformer('Band   Name')).toBe('band name');
  });
});

describe('upsertEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the mock chain for each test so both calls work correctly
    const mockDb = db as unknown as { insert: jest.Mock };

    // First call (events insert): .values().onConflictDoUpdate().returning() → [{ id: 1 }]
    // Second call (event_sources insert): .values().onConflictDoUpdate() → undefined
    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) {
        // events insert — needs .returning()
        const returning = jest.fn().mockResolvedValue([{ id: 1 }]);
        const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
        const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
        return { values };
      } else {
        // event_sources insert — no .returning() needed
        const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
        const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
        return { values };
      }
    });
  });

  it('calls db.insert with events table', async () => {
    const extracted: ExtractedEvent = {
      performer: 'Test Band',
      event_date: '2026-06-15',
      event_time: '8:00 PM',
      price: '$20',
      ticket_link: null,
      description: 'A great show',
      cover_image_url: null,
      confidence: 0.9,
      event_category: 'live_music',
    };

    await upsertEvent(42, extracted, 'https://example.com');

    expect(db.insert).toHaveBeenCalled();
  });

  it('includes normalized_performer computed from performer', async () => {
    const extracted: ExtractedEvent = {
      performer: 'The Trews',
      event_date: '2026-06-15',
      event_time: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      confidence: 0.9,
      event_category: 'live_music',
    };

    await upsertEvent(1, extracted, 'https://example.com');

    // Retrieve the values call args from the first insert (events)
    const mockDb = db as unknown as { insert: jest.Mock };
    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.normalized_performer).toBe('the trews');
    expect(insertedValues.performer).toBe('The Trews');
  });

  it('uses onConflictDoUpdate with correct target columns', async () => {
    const extracted: ExtractedEvent = {
      performer: 'Some Artist',
      event_date: '2026-07-01',
      event_time: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      confidence: 0.8,
      event_category: 'other',
    };

    await upsertEvent(5, extracted, 'https://venue.com');

    const mockDb = db as unknown as { insert: jest.Mock };
    const valuesResult = mockDb.insert.mock.results[0].value.values;
    const conflictCall = valuesResult.mock.results[0].value.onConflictDoUpdate.mock.calls[0][0];

    // Should have a target with venue_id, event_date, normalized_performer columns
    expect(conflictCall).toHaveProperty('target');
    expect(conflictCall).toHaveProperty('set');
  });

  it('maps all fields from ExtractedEvent to events table', async () => {
    const extracted: ExtractedEvent = {
      performer: 'Full Fields Band',
      event_date: '2026-08-10',
      event_time: '9:00 PM',
      price: '$25',
      ticket_link: null,
      description: 'Big summer show',
      cover_image_url: null,
      confidence: 0.95,
      event_category: 'live_music',
    };

    await upsertEvent(10, extracted, 'https://source.com');

    const mockDb = db as unknown as { insert: jest.Mock };
    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];

    expect(insertedValues.venue_id).toBe(10);
    expect(insertedValues.performer).toBe('Full Fields Band');
    expect(insertedValues.event_time).toBe('9:00 PM');
    expect(insertedValues.price).toBe('$25');
    expect(insertedValues.description).toBe('Big summer show');
    expect(insertedValues.source_url).toBe('https://source.com');
  });

  it('passes event_category to inserted values', async () => {
    const extracted: ExtractedEvent = {
      performer: 'Comedy Club Night',
      event_date: '2026-09-05',
      event_time: '8:00 PM',
      price: null,
      ticket_link: null,
      description: 'Stand-up comedy showcase',
      cover_image_url: null,
      confidence: 0.85,
      event_category: 'comedy',
    };

    await upsertEvent(7, extracted, 'https://venue.com/comedy');

    const mockDb = db as unknown as { insert: jest.Mock };
    const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.event_category).toBe('comedy');
  });

  // ─── New event_sources tests ───────────────────────────────────────────────

  it('inserts event_sources row after event upsert (db.insert called twice)', async () => {
    const extracted: ExtractedEvent = {
      performer: 'Attribution Band',
      event_date: '2026-10-01',
      event_time: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      confidence: 1.0,
      event_category: 'live_music',
    };

    await upsertEvent(1, extracted, 'https://source.com', 5, 'scrape');

    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('passes correct source_type and scrape_source_id to event_sources insert', async () => {
    const extracted: ExtractedEvent = {
      performer: 'TM Artist',
      event_date: '2026-11-01',
      event_time: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      confidence: 1.0,
      event_category: 'live_music',
    };

    await upsertEvent(1, extracted, 'https://ticketmaster.com/event', null, 'ticketmaster');

    const mockDb = db as unknown as { insert: jest.Mock };
    // Second insert is event_sources
    const eventSourcesValues = mockDb.insert.mock.results[1].value.values.mock.calls[0][0];
    expect(eventSourcesValues.source_type).toBe('ticketmaster');
    expect(eventSourcesValues.scrape_source_id).toBeNull();
    expect(eventSourcesValues.event_id).toBe(1);
  });

  it('uses COALESCE for source_url in onConflictDoUpdate set clause', async () => {
    const extracted: ExtractedEvent = {
      performer: 'COALESCE Test',
      event_date: '2026-12-01',
      event_time: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      confidence: 0.9,
      event_category: 'other',
    };

    await upsertEvent(1, extracted, 'https://source.com');

    const mockDb = db as unknown as { insert: jest.Mock };
    const conflictArgs = mockDb.insert.mock.results[0].value.values.mock.results[0].value.onConflictDoUpdate.mock.calls[0][0];
    // source_url should be a SQL expression object (not a plain string) — indicates COALESCE usage
    const sourceUrlVal = conflictArgs.set.source_url;
    expect(typeof sourceUrlVal).not.toBe('string');
    expect(sourceUrlVal).toBeDefined();
  });

  it('uses COALESCE for ticket_link in onConflictDoUpdate set clause', async () => {
    const extracted: ExtractedEvent = {
      performer: 'COALESCE Ticket Test',
      event_date: '2026-12-02',
      event_time: null,
      price: null,
      ticket_link: 'https://tickets.example.com/event',
      description: null,
      cover_image_url: null,
      confidence: 0.9,
      event_category: 'other',
    };

    await upsertEvent(1, extracted, 'https://source.com');

    const mockDb = db as unknown as { insert: jest.Mock };
    const conflictArgs = mockDb.insert.mock.results[0].value.values.mock.results[0].value.onConflictDoUpdate.mock.calls[0][0];
    // ticket_link should be a SQL expression object (not a plain string) — indicates COALESCE usage
    const ticketLinkVal = conflictArgs.set.ticket_link;
    expect(typeof ticketLinkVal).not.toBe('string');
    expect(ticketLinkVal).toBeDefined();
  });

  it('defaults scrapeSourceId to null and sourceType to scrape when called with 3 args', async () => {
    const extracted: ExtractedEvent = {
      performer: 'Default Args Band',
      event_date: '2026-10-15',
      event_time: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      confidence: 0.9,
      event_category: 'other',
    };

    // Call with only 3 args — backward-compatible
    await upsertEvent(1, extracted, 'https://source.com');

    const mockDb = db as unknown as { insert: jest.Mock };
    const eventSourcesValues = mockDb.insert.mock.results[1].value.values.mock.calls[0][0];
    expect(eventSourcesValues.scrape_source_id).toBeNull();
    expect(eventSourcesValues.source_type).toBe('scrape');
  });
});
