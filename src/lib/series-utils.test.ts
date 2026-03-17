import { collapseSeriesEvents } from './series-utils';
import type { EventWithVenue } from '@/types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  id: number,
  overrides: Partial<{
    series_id: number | null;
    event_date: Date;
    archived_at: Date | null;
  }> = {}
): EventWithVenue {
  return {
    events: {
      id,
      venue_id: 1,
      performer: `Performer ${id}`,
      normalized_performer: `performer${id}`,
      event_date: overrides.event_date ?? new Date('2025-06-01'),
      event_time: null,
      source_url: null,
      scrape_timestamp: null,
      raw_extracted_text: null,
      price: null,
      ticket_link: null,
      description: null,
      cover_image_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      event_category: 'live_music',
      series_id: overrides.series_id !== undefined ? overrides.series_id : null,
      archived_at: overrides.archived_at !== undefined ? overrides.archived_at : null,
    },
    venues: {
      id: 1,
      name: 'Test Venue',
      address: '123 Main St',
      city: 'Halifax',
      province: 'NS',
      lat: 44.65,
      lng: -63.57,
      website: null,
      venue_type: null,
      google_place_id: null,
      created_at: new Date(),
    },
  } as EventWithVenue;
}

function daysFrom(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

const BASE = new Date('2025-06-01T12:00:00Z');

// ---------------------------------------------------------------------------
// collapseSeriesEvents
// ---------------------------------------------------------------------------

describe('collapseSeriesEvents', () => {
  it('returns empty array for empty input', () => {
    expect(collapseSeriesEvents([])).toEqual([]);
  });

  it('passes non-series events through with occurrenceCount=1', () => {
    const e1 = makeEvent(1, { series_id: null, event_date: BASE });
    const e2 = makeEvent(2, { series_id: null, event_date: daysFrom(BASE, 1) });

    const result = collapseSeriesEvents([e1, e2]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ event: e1, occurrenceCount: 1 });
    expect(result[1]).toEqual({ event: e2, occurrenceCount: 1 });
  });

  it('collapses events sharing a series_id to first occurrence with count', () => {
    const e1 = makeEvent(10, { series_id: 5, event_date: BASE });
    const e2 = makeEvent(11, { series_id: 5, event_date: daysFrom(BASE, 7) });
    const e3 = makeEvent(12, { series_id: 5, event_date: daysFrom(BASE, 14) });

    const result = collapseSeriesEvents([e1, e2, e3]);

    expect(result).toHaveLength(1);
    expect(result[0].event).toBe(e1);
    expect(result[0].occurrenceCount).toBe(3);
  });

  it('collapses multiple different series independently', () => {
    const s1e1 = makeEvent(20, { series_id: 1, event_date: BASE });
    const s1e2 = makeEvent(21, { series_id: 1, event_date: daysFrom(BASE, 7) });
    const s2e1 = makeEvent(30, { series_id: 2, event_date: daysFrom(BASE, 1) });
    const s2e2 = makeEvent(31, { series_id: 2, event_date: daysFrom(BASE, 8) });
    const s2e3 = makeEvent(32, { series_id: 2, event_date: daysFrom(BASE, 15) });

    const result = collapseSeriesEvents([s1e1, s2e1, s1e2, s2e2, s2e3]);

    expect(result).toHaveLength(2);
    // First in sort order is series 1 (BASE), second is series 2 (BASE+1)
    expect(result[0].event).toBe(s1e1);
    expect(result[0].occurrenceCount).toBe(2);
    expect(result[1].event).toBe(s2e1);
    expect(result[1].occurrenceCount).toBe(3);
  });

  it('preserves sort order for mixed series and non-series events', () => {
    const nonSeries = makeEvent(100, { series_id: null, event_date: daysFrom(BASE, 2) });
    const seriesFirst = makeEvent(200, { series_id: 9, event_date: BASE });
    const seriesSecond = makeEvent(201, { series_id: 9, event_date: daysFrom(BASE, 7) });

    // Input order: seriesFirst (BASE), nonSeries (BASE+2), seriesSecond (BASE+7)
    const result = collapseSeriesEvents([seriesFirst, nonSeries, seriesSecond]);

    expect(result).toHaveLength(2);
    // series rep at position 0 (earliest position in input), nonSeries at position 1
    expect(result[0].event).toBe(seriesFirst);
    expect(result[0].occurrenceCount).toBe(2);
    expect(result[1].event).toBe(nonSeries);
    expect(result[1].occurrenceCount).toBe(1);
  });

  it('passes through a single event with series_id with occurrenceCount=1', () => {
    const e = makeEvent(50, { series_id: 7, event_date: BASE });

    const result = collapseSeriesEvents([e]);

    expect(result).toHaveLength(1);
    expect(result[0].event).toBe(e);
    expect(result[0].occurrenceCount).toBe(1);
  });
});
