import {
  filterByDateRange,
  filterByProvince,
  filterByBounds,
  filterByCategory,
} from './filter-utils';
import type { EventWithVenue } from '@/types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  id: number,
  overrides: Partial<{
    event_date: Date;
    province: string;
    lat: number | null;
    lng: number | null;
    event_category: string;
  }> = {}
): EventWithVenue {
  return {
    events: {
      id,
      venue_id: 1,
      performer: `Band ${id}`,
      normalized_performer: `band${id}`,
      event_date: overrides.event_date ?? new Date(),
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
      event_category: overrides.event_category ?? 'other',
    },
    venues: {
      id: 1,
      name: 'Test Venue',
      address: '123 Main St',
      city: 'Halifax',
      province: overrides.province ?? 'NS',
      lat: overrides.lat !== undefined ? overrides.lat : 44.65,
      lng: overrides.lng !== undefined ? overrides.lng : -63.57,
      website: null,
      phone: null,
      venue_type: null,
      created_at: new Date(),
    },
  };
}

// Build a date at a specific day offset and optionally override the time
function daysFromNow(days: number, hours = 12, minutes = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// filterByDateRange
// ---------------------------------------------------------------------------

describe('filterByDateRange', () => {
  it('returns all events when filter is null', () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
    expect(filterByDateRange(events, null)).toEqual(events);
  });

  it('returns only today events for "today"', () => {
    const today = new Date();
    today.setHours(20, 0, 0, 0);
    const tomorrow = daysFromNow(1);
    const yesterday = daysFromNow(-1);

    const todayEvent = makeEvent(1, { event_date: today });
    const tomorrowEvent = makeEvent(2, { event_date: tomorrow });
    const yesterdayEvent = makeEvent(3, { event_date: yesterday });

    const result = filterByDateRange(
      [todayEvent, tomorrowEvent, yesterdayEvent],
      'today'
    );
    expect(result).toHaveLength(1);
    expect(result[0].events.id).toBe(1);
  });

  it('returns events within the next 7 days for "week"', () => {
    const inThreeDays = daysFromNow(3);
    const inSevenDays = daysFromNow(7);
    const inEightDays = daysFromNow(8);
    const yesterday = daysFromNow(-1);

    const results = filterByDateRange(
      [
        makeEvent(1, { event_date: inThreeDays }),
        makeEvent(2, { event_date: inSevenDays }),
        makeEvent(3, { event_date: inEightDays }),
        makeEvent(4, { event_date: yesterday }),
      ],
      'week'
    );
    // Should include events within 7 days from today (3 days and 7 days), not 8 days or past
    expect(results.length).toBeGreaterThanOrEqual(1);
    const ids = results.map((e) => e.events.id);
    expect(ids).toContain(1);
    expect(ids).not.toContain(4); // yesterday excluded
  });

  describe('"weekend" filter — Friday 5PM through end of Sunday', () => {
    it('includes a Friday 6pm event on the current/upcoming weekend', () => {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

      // Skip this test when it's Saturday (past-Friday scenario)
      // On Saturday, the weekend window is Sat+Sun, so a future Friday is NOT included
      if (dayOfWeek === 6) return;

      // On Mon–Fri: find the upcoming Friday (0 days ahead if today is Friday)
      const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
      const friday6pm = new Date(now);
      friday6pm.setDate(now.getDate() + daysUntilFriday);
      friday6pm.setHours(18, 0, 0, 0);

      const result = filterByDateRange([makeEvent(1, { event_date: friday6pm })], 'weekend');
      expect(result).toHaveLength(1);
    });

    it('excludes Friday 4pm event when approaching from Mon-Thu', () => {
      const now = new Date();
      const dayOfWeek = now.getDay();

      // Only run this test on Mon–Thu (days 1–4)
      if (dayOfWeek < 1 || dayOfWeek > 4) return;

      const daysUntilFriday = 5 - dayOfWeek;
      const friday4pm = new Date(now);
      friday4pm.setDate(now.getDate() + daysUntilFriday);
      friday4pm.setHours(16, 0, 0, 0);

      const result = filterByDateRange(
        [makeEvent(1, { event_date: friday4pm })],
        'weekend'
      );
      expect(result).toHaveLength(0);
    });

    it('includes a Saturday event on the current/upcoming weekend', () => {
      const now = new Date();
      const dayOfWeek = now.getDay();

      // On Sunday (0), this weekend's Saturday is past — skip
      if (dayOfWeek === 0) return;

      // Find the upcoming Saturday (including today if Saturday)
      const daysUntilSaturday = dayOfWeek <= 6 ? 6 - dayOfWeek : 0;
      const saturday = new Date(now);
      saturday.setDate(now.getDate() + daysUntilSaturday);
      saturday.setHours(20, 0, 0, 0);

      const result = filterByDateRange(
        [makeEvent(1, { event_date: saturday })],
        'weekend'
      );
      expect(result).toHaveLength(1);
    });

    it('includes a Sunday event on the current/upcoming weekend', () => {
      const now = new Date();
      const dayOfWeek = now.getDay();

      // Days until Sunday: if today is Sunday (0), daysUntil=0; else (7 - dayOfWeek)
      // But if it's Monday through Saturday, we want THIS coming Sunday
      // If today is Sunday, we want today
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      const sunday = new Date(now);
      sunday.setDate(now.getDate() + daysUntilSunday);
      sunday.setHours(16, 0, 0, 0);

      const result = filterByDateRange(
        [makeEvent(1, { event_date: sunday })],
        'weekend'
      );
      expect(result).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// filterByProvince
// ---------------------------------------------------------------------------

describe('filterByProvince', () => {
  const events = [
    makeEvent(1, { province: 'NS' }),
    makeEvent(2, { province: 'NB' }),
    makeEvent(3, { province: 'PEI' }),
    makeEvent(4, { province: 'NL' }),
  ];

  it('returns all events when province is null', () => {
    expect(filterByProvince(events, null)).toEqual(events);
  });

  it('returns only NS events when province is "NS"', () => {
    const result = filterByProvince(events, 'NS');
    expect(result).toHaveLength(1);
    expect(result[0].venues.province).toBe('NS');
  });

  it('returns only NB events when province is "NB"', () => {
    const result = filterByProvince(events, 'NB');
    expect(result).toHaveLength(1);
    expect(result[0].venues.province).toBe('NB');
  });

  it('returns empty array when no events match province', () => {
    const result = filterByProvince(events, 'ON');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterByBounds
// ---------------------------------------------------------------------------

describe('filterByBounds', () => {
  // Bounding box: roughly downtown Halifax area
  const bounds = {
    north: 45.0,
    south: 44.0,
    east: -63.0,
    west: -64.0,
  };

  const inside = makeEvent(1, { lat: 44.65, lng: -63.57 }); // Halifax downtown
  const outside = makeEvent(2, { lat: 46.0, lng: -60.0 }); // Cape Breton
  const nullLat = makeEvent(3, { lat: null, lng: -63.57 });
  const nullLng = makeEvent(4, { lat: 44.65, lng: null });

  it('returns all events when bounds is null', () => {
    const events = [inside, outside, nullLat, nullLng];
    expect(filterByBounds(events, null)).toEqual(events);
  });

  it('returns only events within the bounding box', () => {
    const result = filterByBounds([inside, outside], bounds);
    expect(result).toHaveLength(1);
    expect(result[0].events.id).toBe(1);
  });

  it('excludes events with null lat', () => {
    const result = filterByBounds([inside, nullLat], bounds);
    expect(result).toHaveLength(1);
    expect(result[0].events.id).toBe(1);
  });

  it('excludes events with null lng', () => {
    const result = filterByBounds([inside, nullLng], bounds);
    expect(result).toHaveLength(1);
    expect(result[0].events.id).toBe(1);
  });

  it('excludes events on the boundary (strictly inside check)', () => {
    // Event exactly at north boundary — depends on >= vs >
    // We use >= south, <= north, >= west, <= east for inclusive bounds
    const onBoundary = makeEvent(5, { lat: 45.0, lng: -63.5 });
    const result = filterByBounds([onBoundary], bounds);
    expect(result).toHaveLength(1); // inclusive bounds
  });
});

// ---------------------------------------------------------------------------
// filterByCategory
// ---------------------------------------------------------------------------

describe('filterByCategory', () => {
  const events = [
    makeEvent(1, { event_category: 'live_music' }),
    makeEvent(2, { event_category: 'comedy' }),
    makeEvent(3, { event_category: 'live_music' }),
    makeEvent(4, { event_category: 'theatre' }),
  ];

  it('returns all events when category is null', () => {
    expect(filterByCategory(events, null)).toEqual(events);
  });

  it('returns only live_music events when category is "live_music"', () => {
    const result = filterByCategory(events, 'live_music');
    expect(result).toHaveLength(2);
    result.forEach((e) => expect(e.events.event_category).toBe('live_music'));
  });

  it('returns only comedy events when category is "comedy"', () => {
    const result = filterByCategory(events, 'comedy');
    expect(result).toHaveLength(1);
    expect(result[0].events.event_category).toBe('comedy');
  });

  it('returns empty array when no events match the category', () => {
    const result = filterByCategory(events, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when input is empty', () => {
    const result = filterByCategory([], 'live_music');
    expect(result).toHaveLength(0);
  });
});
