/**
 * Characterization tests for src/lib/scraper/feed-discovery.ts
 *
 * Tests:
 * - discoverFeedsFromHtml: extracts <link rel="alternate"> tags, dedupes, prioritizes
 * - parseRssFeed: parses RSS XML into ExtractedEvents
 * - parseAtomFeed: parses Atom XML into ExtractedEvents
 * - parseIcalFeed: parses iCal .ics into ExtractedEvents
 * - parseFeed: routes to correct parser by type
 */

import {
  discoverFeedsFromHtml,
  parseRssFeed,
  parseAtomFeed,
  parseIcalFeed,
  parseFeed,
} from './feed-discovery';

// Use a far-future date so items don't get filtered by "must be future event"
const FAR_FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
const FAR_FUTURE_DATE = FAR_FUTURE.slice(0, 10);
const FAR_FUTURE_ICAL = FAR_FUTURE_DATE.replace(/-/g, '') + 'T190000Z';
const FAR_FUTURE_ICAL_DATE = FAR_FUTURE_DATE.replace(/-/g, '');

describe('discoverFeedsFromHtml()', () => {
  it('returns empty array when no alternate links present', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const feeds = discoverFeedsFromHtml(html, 'https://example.com');
    expect(feeds).toEqual([]);
  });

  it('extracts RSS feed from <link rel="alternate" type="application/rss+xml">', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="My RSS Feed"/>
    </head></html>`;
    const feeds = discoverFeedsFromHtml(html, 'https://example.com');
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      url: 'https://example.com/feed.xml',
      type: 'rss',
      title: 'My RSS Feed',
    });
  });

  it('extracts feed from <link rel="alternate" type="application/atom+xml"> — classified as rss (xml match takes priority)', () => {
    // Note: the source checks type.includes('xml') before type.includes('atom')
    // so application/atom+xml is classified as 'rss' (xml match)
    const html = `<html><head>
      <link rel="alternate" type="application/atom+xml" href="/atom.xml"/>
    </head></html>`;
    const feeds = discoverFeedsFromHtml(html, 'https://example.com');
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      url: 'https://example.com/atom.xml',
      type: 'rss', // actual behavior: xml check precedes atom check
    });
  });

  it('extracts iCal feed from <link rel="alternate" type="text/calendar">', () => {
    const html = `<html><head>
      <link rel="alternate" type="text/calendar" href="/events.ics"/>
    </head></html>`;
    const feeds = discoverFeedsFromHtml(html, 'https://example.com');
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      url: 'https://example.com/events.ics',
      type: 'ical',
    });
  });

  it('extracts multiple feeds of different types', () => {
    // Note: application/atom+xml matches 'xml' before 'atom' so it comes out as 'rss'
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml"/>
      <link rel="alternate" type="application/atom+xml" href="/atom.xml"/>
      <link rel="alternate" type="text/calendar" href="/cal.ics"/>
    </head></html>`;
    const feeds = discoverFeedsFromHtml(html, 'https://example.com');
    expect(feeds).toHaveLength(3);
    const types = feeds.map((f) => f.type).sort();
    expect(types).toEqual(['ical', 'rss', 'rss']); // actual behavior: atom+xml classified as rss
  });

  it('resolves relative URLs against baseUrl', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/path/feed"/>
    </head></html>`;
    const feeds = discoverFeedsFromHtml(html, 'https://mysite.org/page');
    expect(feeds[0].url).toBe('https://mysite.org/path/feed');
  });

  it('handles absolute URLs in href', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="https://other.com/feed.xml"/>
    </head></html>`;
    const feeds = discoverFeedsFromHtml(html, 'https://example.com');
    expect(feeds[0].url).toBe('https://other.com/feed.xml');
  });

  it('ignores links without href', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml"/>
    </head></html>`;
    const feeds = discoverFeedsFromHtml(html, 'https://example.com');
    expect(feeds).toHaveLength(0);
  });

  it('ignores non-feed alternate types (e.g. text/html)', () => {
    const html = `<html><head>
      <link rel="alternate" type="text/html" href="/page" hreflang="fr"/>
    </head></html>`;
    const feeds = discoverFeedsFromHtml(html, 'https://example.com');
    expect(feeds).toHaveLength(0);
  });
});

describe('parseRssFeed()', () => {
  it('returns empty array for empty RSS', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`;
    expect(parseRssFeed(xml)).toEqual([]);
  });

  it('parses a future RSS item into an ExtractedEvent', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
<channel>
<item>
  <title>Jazz Festival</title>
  <description>A great jazz festival</description>
  <pubDate>${new Date(FAR_FUTURE).toUTCString()}</pubDate>
  <link>https://example.com/jazz</link>
</item>
</channel>
</rss>`;
    const events = parseRssFeed(xml);
    expect(events).toHaveLength(1);
    expect(events[0].performer).toBe('Jazz Festival');
    expect(events[0].ticket_link).toBe('https://example.com/jazz');
    expect(events[0].event_date).toBe(FAR_FUTURE_DATE);
    expect(events[0].confidence).toBe(0.85);
  });

  it('skips past RSS items', () => {
    const pastDate = new Date(Date.now() - 86400000).toUTCString();
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
  <title>Past Event</title>
  <pubDate>${pastDate}</pubDate>
</item>
</channel></rss>`;
    expect(parseRssFeed(xml)).toHaveLength(0);
  });

  it('strips HTML from title and description', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
  <title><![CDATA[<b>Jazz &amp; Blues</b>]]></title>
  <description><![CDATA[<p>Great show &lt;here&gt;</p>]]></description>
  <pubDate>${new Date(FAR_FUTURE).toUTCString()}</pubDate>
</item>
</channel></rss>`;
    const events = parseRssFeed(xml);
    expect(events[0].performer).toBe('Jazz & Blues');
    expect(events[0].description).toBe('Great show <here>');
  });

  it('categorizes events based on keywords in title', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
  <title>Live Music Concert Night</title>
  <pubDate>${new Date(FAR_FUTURE).toUTCString()}</pubDate>
</item>
</channel></rss>`;
    const events = parseRssFeed(xml);
    expect(events[0].event_category).toBe('live_music');
  });
});

describe('parseAtomFeed()', () => {
  it('returns empty array for feed with no entries', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>My Feed</title>
</feed>`;
    expect(parseAtomFeed(xml)).toHaveLength(0);
  });

  it('parses a future Atom entry', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>Comedy Show</title>
  <updated>${FAR_FUTURE}</updated>
  <summary>Stand-up night</summary>
  <link href="https://example.com/comedy" rel="alternate"/>
</entry>
</feed>`;
    const events = parseAtomFeed(xml);
    expect(events).toHaveLength(1);
    expect(events[0].performer).toBe('Comedy Show');
    expect(events[0].ticket_link).toBe('https://example.com/comedy');
    expect(events[0].event_date).toBe(FAR_FUTURE_DATE);
  });

  it('skips past Atom entries', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>Old Event</title>
  <updated>${new Date(Date.now() - 86400000).toISOString()}</updated>
</entry>
</feed>`;
    expect(parseAtomFeed(xml)).toHaveLength(0);
  });
});

describe('parseIcalFeed()', () => {
  it('returns empty array for empty iCal', () => {
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR`;
    expect(parseIcalFeed(ics)).toHaveLength(0);
  });

  it('parses a future VEVENT', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Art Exhibition
DTSTART:${FAR_FUTURE_ICAL}
URL:https://gallery.example.com/show
DESCRIPTION:Opening night of the annual exhibition
END:VEVENT
END:VCALENDAR`;
    const events = parseIcalFeed(ics);
    expect(events).toHaveLength(1);
    expect(events[0].performer).toBe('Art Exhibition');
    expect(events[0].ticket_link).toBe('https://gallery.example.com/show');
    expect(events[0].confidence).toBe(0.9);
  });

  it('skips past VEVENTs', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Old Event
DTSTART:${pastDate}
END:VEVENT
END:VCALENDAR`;
    expect(parseIcalFeed(ics)).toHaveLength(0);
  });

  it('handles date-only DTSTART (no time)', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:All Day Event
DTSTART:${FAR_FUTURE_ICAL_DATE}
END:VEVENT
END:VCALENDAR`;
    const events = parseIcalFeed(ics);
    expect(events).toHaveLength(1);
    expect(events[0].event_date).toBe(FAR_FUTURE_DATE);
  });

  it('unescapes iCal special characters in SUMMARY', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Music\\, Food & Fun
DTSTART:${FAR_FUTURE_ICAL}
END:VEVENT
END:VCALENDAR`;
    const events = parseIcalFeed(ics);
    expect(events[0].performer).toBe('Music, Food & Fun');
  });
});

describe('parseFeed()', () => {
  it('delegates to parseRssFeed for type rss', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`;
    const result = parseFeed(xml, 'rss');
    expect(Array.isArray(result)).toBe(true);
  });

  it('delegates to parseAtomFeed for type atom', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;
    const result = parseFeed(xml, 'atom');
    expect(Array.isArray(result)).toBe(true);
  });

  it('delegates to parseIcalFeed for type ical', () => {
    const ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR';
    const result = parseFeed(ics, 'ical');
    expect(Array.isArray(result)).toBe(true);
  });
});
