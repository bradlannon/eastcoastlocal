import { extractJsonLdEvents } from './json-ld';

// Helper to build an HTML document with one or more JSON-LD script tags
function makeHtmlWithJsonLd(...blocks: unknown[]): string {
  const scripts = blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n');
  return `<html><head>${scripts}</head><body><main>Event page content</main></body></html>`;
}

describe('extractJsonLdEvents', () => {
  // ---- Returns [] for non-Event pages ----

  it('no events — HTML with JSON-LD but no @type: Event returns []', () => {
    const html = makeHtmlWithJsonLd({ '@type': 'Organization', name: 'Test Org' });
    expect(extractJsonLdEvents(html)).toEqual([]);
  });

  it('no JSON-LD at all — plain HTML returns []', () => {
    const html = '<html><body><main>Just a plain page with no structured data</main></body></html>';
    expect(extractJsonLdEvents(html)).toEqual([]);
  });

  it('malformed JSON-LD — script tag with invalid JSON does not throw, returns []', () => {
    const html = `<html><head>
      <script type="application/ld+json">{ this is not valid JSON }</script>
    </head><body></body></html>`;
    expect(() => extractJsonLdEvents(html)).not.toThrow();
    expect(extractJsonLdEvents(html)).toEqual([]);
  });

  // ---- Single event ----

  it('single Event block — HTML with one script containing @type: Event returns 1 ExtractedEvent', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Test Concert',
      startDate: '2026-04-15T20:00:00',
    });
    const events = extractJsonLdEvents(html);
    expect(events).toHaveLength(1);
  });

  // ---- Multiple events ----

  it('multiple Event blocks — HTML with array of Events returns all of them', () => {
    const html = makeHtmlWithJsonLd(
      { '@type': 'Event', name: 'Show 1', startDate: '2026-04-15T20:00:00' },
      { '@type': 'Event', name: 'Show 2', startDate: '2026-04-16T21:00:00' }
    );
    const events = extractJsonLdEvents(html);
    expect(events).toHaveLength(2);
  });

  it('array of Events in single script block returns all of them', () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify([
        { '@type': 'Event', name: 'Show A', startDate: '2026-04-15T20:00:00' },
        { '@type': 'Event', name: 'Show B', startDate: '2026-04-16T21:00:00' },
      ])}</script>
    </head><body></body></html>`;
    const events = extractJsonLdEvents(html);
    expect(events).toHaveLength(2);
  });

  // ---- Confidence ----

  it('confidence = 1.0 — all returned events have confidence exactly 1.0', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Test Concert',
      startDate: '2026-04-15T20:00:00',
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].confidence).toBe(1.0);
  });

  // ---- Field mapping ----

  it('maps startDate to event_date (YYYY-MM-DD) and event_time (HH:MM)', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Dated Show',
      startDate: '2026-04-15T20:00:00',
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].event_date).toBe('2026-04-15');
    expect(events[0].event_time).not.toBeNull();
    // Should contain some time representation
    expect(events[0].event_time).toMatch(/\d{1,2}:\d{2}/);
  });

  it('maps date-only startDate to event_date, event_time = null', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Date-Only Show',
      startDate: '2026-04-15',
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].event_date).toBe('2026-04-15');
    expect(events[0].event_time).toBeNull();
  });

  it('maps name to performer field when no performer property', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'The Rolling Stones',
      startDate: '2026-04-15T20:00:00',
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].performer).toBe('The Rolling Stones');
  });

  it('maps performer.name to performer field when performer is an object', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Concert',
      startDate: '2026-04-15T20:00:00',
      performer: { '@type': 'MusicGroup', name: 'The Beatles' },
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].performer).toBe('The Beatles');
  });

  it('maps first performer name when performer is an array', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Concert',
      startDate: '2026-04-15T20:00:00',
      performer: [
        { '@type': 'MusicGroup', name: 'Headliner Band' },
        { '@type': 'MusicGroup', name: 'Opening Act' },
      ],
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].performer).toBe('Headliner Band');
  });

  it('maps offers.url to ticket_link', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Ticketed Show',
      startDate: '2026-04-15T20:00:00',
      offers: { '@type': 'Offer', url: 'https://tickets.example.com/show123', price: '25' },
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].ticket_link).toBe('https://tickets.example.com/show123');
  });

  it('maps offers.price to price field', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Priced Show',
      startDate: '2026-04-15T20:00:00',
      offers: { '@type': 'Offer', url: 'https://tickets.example.com/show456', price: '35' },
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].price).toBe('35');
  });

  // ---- @graph support ----

  it('nested @graph containing Event types are extracted', () => {
    const html = makeHtmlWithJsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Venue Site' },
        { '@type': 'Event', name: 'Graph Event', startDate: '2026-04-20T19:00:00' },
      ],
    });
    const events = extractJsonLdEvents(html);
    expect(events).toHaveLength(1);
    expect(events[0].performer).toBe('Graph Event');
  });

  // ---- Missing startDate ----

  it('missing startDate — event_date and event_time are null', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'No Date Show',
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].event_date).toBeNull();
    expect(events[0].event_time).toBeNull();
  });

  // ---- event_category default ----

  it('event_category defaults to "other"', () => {
    const html = makeHtmlWithJsonLd({
      '@type': 'Event',
      name: 'Category Test',
      startDate: '2026-04-15T20:00:00',
    });
    const events = extractJsonLdEvents(html);
    expect(events[0].event_category).toBe('other');
  });
});
