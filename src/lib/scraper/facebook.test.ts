/**
 * Characterization tests for src/lib/scraper/facebook.ts
 *
 * Tests:
 * - scrapeFacebookEvents() normalizes URL to /events/
 * - throws on non-ok HTTP response
 * - throws when login wall detected
 * - throws when page content is insufficient
 * - parses HTML content via AI extractor (mocked)
 * - returns empty array when extractor returns nothing
 */

const mockExtractEvents = jest.fn().mockResolvedValue([]);

jest.mock('@/lib/scraper/extractor', () => ({
  extractEvents: (...args: unknown[]) => mockExtractEvents(...args),
}));

// Cheerio is real — we test actual HTML parsing

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { scrapeFacebookEvents } from './facebook';

beforeEach(() => {
  mockFetch.mockReset();
  mockExtractEvents.mockClear();
});

describe('scrapeFacebookEvents()', () => {
  it('appends /events/ to URL if missing', async () => {
    const html = '<html><body><div>some event content that is long enough for testing purposes yes</div></body></html>';
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => html,
    } as Response);
    mockExtractEvents.mockResolvedValue([]);

    await scrapeFacebookEvents('https://www.facebook.com/myvenue');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.facebook.com/myvenue/events/',
      expect.any(Object)
    );
  });

  it('does not double-append /events/ if already present', async () => {
    const html = '<html><body><div>some event content that is long enough for testing purposes yes</div></body></html>';
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => html,
    } as Response);
    mockExtractEvents.mockResolvedValue([]);

    await scrapeFacebookEvents('https://www.facebook.com/myvenue/events');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.facebook.com/myvenue/events/',
      expect.any(Object)
    );
  });

  it('throws on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '',
    } as Response);

    await expect(scrapeFacebookEvents('https://www.facebook.com/venue')).rejects.toThrow(
      'Facebook fetch failed: 403 Forbidden'
    );
  });

  it('throws when login wall is detected (has login_form, no upcoming_events)', async () => {
    // The check: html.includes('login_form') && !html.includes('upcoming_events')
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html><body>login_form here but no calendar content present at all</body></html>',
    } as Response);

    await expect(scrapeFacebookEvents('https://www.facebook.com/venue')).rejects.toThrow(
      /Facebook login wall/
    );
  });

  it('throws when page content is insufficient (< 50 chars)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html><body><p>hi</p></body></html>',
    } as Response);

    await expect(scrapeFacebookEvents('https://www.facebook.com/venue')).rejects.toThrow(
      /Facebook page returned insufficient content/
    );
  });

  it('returns empty array when extractor returns no events', async () => {
    const html = '<html><body><div>' + 'Event content '.repeat(10) + '</div></body></html>';
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => html,
    } as Response);
    mockExtractEvents.mockResolvedValue([]);

    const result = await scrapeFacebookEvents('https://www.facebook.com/venue');
    expect(result).toEqual([]);
  });

  it('returns extracted events from the AI extractor', async () => {
    const html = '<html><body><div>' + 'Event content '.repeat(10) + '</div></body></html>';
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => html,
    } as Response);

    const fakeEvents = [
      {
        performer: 'Jazz Band',
        event_date: '2026-05-01',
        event_time: '20:00',
        price: null,
        ticket_link: null,
        description: null,
        cover_image_url: null,
        confidence: 0.9,
        event_category: 'live_music' as const,
      },
    ];
    mockExtractEvents.mockResolvedValue(fakeEvents);

    const result = await scrapeFacebookEvents('https://www.facebook.com/venue');
    expect(result).toHaveLength(1);
    expect(result[0].performer).toBe('Jazz Band');
  });

  it('passes the events URL and options to extractEvents', async () => {
    const html = '<html><body><div>' + 'Event content '.repeat(10) + '</div></body></html>';
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => html,
    } as Response);
    mockExtractEvents.mockResolvedValue([]);

    await scrapeFacebookEvents('https://www.facebook.com/myvenue', { venueId: 7, scrapeSourceId: 99 });

    expect(mockExtractEvents).toHaveBeenCalledWith(
      expect.any(String),
      'https://www.facebook.com/myvenue/events/',
      { venueId: 7, scrapeSourceId: 99 }
    );
  });

  it('sends realistic browser headers', async () => {
    const html = '<html><body><div>' + 'Event content '.repeat(10) + '</div></body></html>';
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => html,
    } as Response);
    mockExtractEvents.mockResolvedValue([]);

    await scrapeFacebookEvents('https://www.facebook.com/venue');

    const callArgs = mockFetch.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    expect((options.headers as Record<string, string>)['User-Agent']).toContain('Mozilla');
  });
});
