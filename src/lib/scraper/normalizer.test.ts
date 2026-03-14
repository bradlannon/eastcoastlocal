import { normalizePerformer, upsertEvent } from './normalizer';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

// Mock the db client
jest.mock('@/lib/db/client', () => {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = jest.fn().mockReturnValue({ values });
  return {
    db: { insert },
  };
});

// Mock the schema to get reference to events table
jest.mock('@/lib/db/schema', () => ({
  events: { venue_id: 'venue_id', event_date: 'event_date', normalized_performer: 'normalized_performer' },
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
    };

    await upsertEvent(1, extracted, 'https://example.com');

    // Retrieve the values call args
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
});
