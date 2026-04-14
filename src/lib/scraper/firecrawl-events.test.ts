const mockExtractWithSchema = jest.fn();

jest.mock('./firecrawl', () => ({
  extractWithSchema: (...args: unknown[]) => mockExtractWithSchema(...args),
}));

import { scrapeEventsWithFirecrawl } from './firecrawl-events';

describe('scrapeEventsWithFirecrawl', () => {
  const url = 'https://example.com/events';

  beforeEach(() => {
    mockExtractWithSchema.mockReset();
  });

  it('calls extractWithSchema with the URL and an events-array schema', async () => {
    mockExtractWithSchema.mockResolvedValue({ events: [] });

    await scrapeEventsWithFirecrawl(url);

    expect(mockExtractWithSchema).toHaveBeenCalledTimes(1);
    // First arg is the URL
    expect(mockExtractWithSchema.mock.calls[0][0]).toBe(url);
    // Second arg is a Zod schema (has a .parse method)
    const schema = mockExtractWithSchema.mock.calls[0][1];
    expect(typeof schema.parse).toBe('function');
    // Schema must accept a valid { events: [...] } shape
    expect(() =>
      schema.parse({
        events: [
          {
            performer: 'Test Artist',
            event_date: '2026-05-01',
            event_time: '8:00 PM',
            price: '$20',
            ticket_link: null,
            description: null,
            cover_image_url: null,
            confidence: 0.9,
            event_category: 'music',
          },
        ],
      })
    ).not.toThrow();
  });

  it('returns a normalized array of events on success', async () => {
    mockExtractWithSchema.mockResolvedValue({
      events: [
        {
          performer: 'The Band',
          event_date: '2026-06-15',
          event_time: '9:00 PM',
          price: '$25',
          ticket_link: null,
          description: 'A great show',
          cover_image_url: null,
          confidence: 0.85,
          event_category: 'music',
        },
        {
          performer: null,
          event_date: '2026-06-20',
          event_time: null,
          price: null,
          ticket_link: null,
          description: 'Comedy Night',
          cover_image_url: null,
          confidence: 0.7,
          event_category: 'comedy',
        },
      ],
    });

    const events = await scrapeEventsWithFirecrawl(url);

    expect(events).toHaveLength(2);
    expect(events[0].performer).toBe('The Band');
    expect(events[1].event_category).toBe('comedy');
  });

  it('returns [] when firecrawl returns { events: [] }', async () => {
    mockExtractWithSchema.mockResolvedValue({ events: [] });

    const events = await scrapeEventsWithFirecrawl(url);

    expect(events).toEqual([]);
  });

  it('returns [] when firecrawl returns null', async () => {
    mockExtractWithSchema.mockResolvedValue(null);

    const events = await scrapeEventsWithFirecrawl(url);

    expect(events).toEqual([]);
  });

  it('returns [] when firecrawl returns an object without events array', async () => {
    mockExtractWithSchema.mockResolvedValue({});

    const events = await scrapeEventsWithFirecrawl(url);

    expect(events).toEqual([]);
  });

  it('propagates errors with the URL in the message', async () => {
    mockExtractWithSchema.mockRejectedValue(
      new Error('Firecrawl extract failed for https://example.com/events: timeout')
    );

    await expect(scrapeEventsWithFirecrawl(url)).rejects.toThrow(
      /https:\/\/example\.com\/events/
    );
  });
});
