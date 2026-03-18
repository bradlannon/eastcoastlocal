import {
  isToday,
  startOfDay,
  endOfDay,
  isWithinInterval,
  addDays,
  isFriday,
  isSaturday,
  isSunday,
  set,
  nextFriday,
} from 'date-fns';
import type { EventWithVenue } from '@/types/index';

export type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

/**
 * Filter events by date range.
 * @param events - Array of EventWithVenue objects
 * @param when - null (all), 'today', 'weekend', or 'week'
 */
export function filterByDateRange(
  events: EventWithVenue[],
  when: string | null
): EventWithVenue[] {
  if (!when) return events;

  const now = new Date();

  if (when === 'today') {
    return events.filter((e) => isToday(e.events.event_date));
  }

  if (when === 'week') {
    const start = startOfDay(now);
    const end = endOfDay(addDays(now, 7));
    return events.filter((e) =>
      isWithinInterval(e.events.event_date, { start, end })
    );
  }

  if (when === 'weekend') {
    // Weekend = upcoming Friday at 5:00 PM through end of Sunday
    // If today is already Fri/Sat/Sun, use start of today so remaining weekend is included.
    let weekendStart: Date;
    let weekendEnd: Date;

    if (isFriday(now)) {
      // Friday: start from Friday 5pm, end Sunday EOD
      weekendStart = set(now, { hours: 17, minutes: 0, seconds: 0, milliseconds: 0 });
      const sunday = addDays(now, 2);
      weekendEnd = endOfDay(sunday);
    } else if (isSaturday(now)) {
      // Saturday: weekend already started — show Sat + Sun
      weekendStart = startOfDay(now);
      const sunday = addDays(now, 1);
      weekendEnd = endOfDay(sunday);
    } else if (isSunday(now)) {
      // Sunday: last day of weekend
      weekendStart = startOfDay(now);
      weekendEnd = endOfDay(now);
    } else {
      // Mon–Thu: get the NEXT Friday at 5pm through that Sunday EOD
      const fri = nextFriday(now);
      weekendStart = set(fri, { hours: 17, minutes: 0, seconds: 0, milliseconds: 0 });
      const sunday = addDays(fri, 2);
      weekendEnd = endOfDay(sunday);
    }

    return events.filter((e) =>
      isWithinInterval(e.events.event_date, { start: weekendStart, end: weekendEnd })
    );
  }

  if (when === 'month') {
    const start = startOfDay(now);
    const end = endOfDay(addDays(now, 30));
    return events.filter((e) =>
      isWithinInterval(e.events.event_date, { start, end })
    );
  }

  return events;
}

/**
 * Filter events by search query (matches performer name or venue name).
 */
export function filterBySearch(
  events: EventWithVenue[],
  query: string | null
): EventWithVenue[] {
  if (!query || !query.trim()) return events;
  const q = query.toLowerCase().trim();
  return events.filter((e) => {
    const performer = e.events.performer?.toLowerCase() ?? '';
    const venue = e.venues.name?.toLowerCase() ?? '';
    return performer.includes(q) || venue.includes(q);
  });
}

/**
 * Filter events by province code.
 * @param events - Array of EventWithVenue objects
 * @param province - null (all) or a province code like 'NS', 'NB', 'PEI', 'NL'
 */
export function filterByProvince(
  events: EventWithVenue[],
  province: string | null
): EventWithVenue[] {
  if (!province) return events;
  return events.filter((e) => e.venues.province === province);
}

/**
 * Filter events by event category.
 * @param events - Array of EventWithVenue objects
 * @param category - null (all) or a category string like 'live_music', 'comedy', etc.
 */
// "Other" category on the public site also includes sports and festival
const OTHER_GROUP = new Set(['other', 'sports', 'festival']);

export function filterByCategory(
  events: EventWithVenue[],
  category: string | null
): EventWithVenue[] {
  if (!category) return events;
  if (category === 'other') {
    return events.filter((e) => OTHER_GROUP.has(e.events.event_category ?? 'other'));
  }
  return events.filter((e) => e.events.event_category === category);
}

/**
 * Filter events by visible map viewport bounds.
 * Uses a plain object (not Leaflet LatLngBounds) for testability without Leaflet.
 * @param events - Array of EventWithVenue objects
 * @param bounds - null (all) or { north, south, east, west }
 */
export function filterByBounds(
  events: EventWithVenue[],
  bounds: Bounds | null
): EventWithVenue[] {
  if (!bounds) return events;

  return events.filter((e) => {
    const { lat, lng } = e.venues;
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
      return false;
    }
    return (
      lat >= bounds.south &&
      lat <= bounds.north &&
      lng >= bounds.west &&
      lng <= bounds.east
    );
  });
}
