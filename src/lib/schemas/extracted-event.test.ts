import { z } from 'zod';
import { ExtractedEventSchema } from './extracted-event';

// Extract the inner event schema for direct testing
const EventSchema = ExtractedEventSchema.shape.events.element;

// Minimal valid event object (without event_category to test default)
const baseEvent = {
  performer: 'Test Band',
  event_date: '2026-04-01',
  event_time: '8:00 PM',
  price: '$20',
  ticket_link: null,
  description: null,
  cover_image_url: null,
  confidence: 0.9,
};

describe('ExtractedEventSchema - recurrence_pattern field', () => {
  test('Test 1: Parsing an event with recurrence_pattern present succeeds and returns the string value', () => {
    const result = EventSchema.parse({ ...baseEvent, recurrence_pattern: 'Every Thursday' });
    expect(result.recurrence_pattern).toBe('Every Thursday');
  });

  test('Test 2: Parsing an event without recurrence_pattern succeeds and returns undefined', () => {
    const result = EventSchema.parse({ ...baseEvent });
    expect(result.recurrence_pattern).toBeUndefined();
  });
});

describe('ExtractedEventSchema - event_category field', () => {
  test('Test 1: Parsing an event with event_category "live_music" succeeds and returns "live_music"', () => {
    const result = EventSchema.parse({ ...baseEvent, event_category: 'live_music' });
    expect(result.event_category).toBe('live_music');
  });

  test('Test 2: Parsing an event with event_category "invalid_value" throws a ZodError', () => {
    expect(() => {
      EventSchema.parse({ ...baseEvent, event_category: 'invalid_value' });
    }).toThrow(z.ZodError);
  });

  test('Test 3: Parsing an event with event_category omitted returns "other" (default)', () => {
    const result = EventSchema.parse({ ...baseEvent });
    expect(result.event_category).toBe('other');
  });

  test('Test 4: All 8 taxonomy values parse successfully', () => {
    const categories = ['live_music', 'comedy', 'theatre', 'arts', 'sports', 'festival', 'community', 'other'] as const;
    for (const category of categories) {
      const result = EventSchema.parse({ ...baseEvent, event_category: category });
      expect(result.event_category).toBe(category);
    }
  });
});
