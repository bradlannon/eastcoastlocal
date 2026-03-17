jest.mock('./ticketmaster', () => ({
  findOrCreateVenue: jest.fn(),
}));

jest.mock('./normalizer', () => ({
  upsertEvent: jest.fn(),
}));

jest.mock('@/lib/ai/model', () => ({
  getExtractionModel: jest.fn(),
}));

jest.mock('ai', () => ({
  generateText: jest.fn(),
  Output: { object: jest.fn(({ schema }) => schema) },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { findOrCreateVenue } from './ticketmaster';
import { upsertEvent } from './normalizer';
import { generateText } from 'ai';
import { parseNewsletters } from './newsletter-parser';

const mockFindOrCreateVenue = findOrCreateVenue as jest.MockedFunction<typeof findOrCreateVenue>;
const mockUpsertEvent = upsertEvent as jest.MockedFunction<typeof upsertEvent>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

// Save/restore env
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GMAIL_CLIENT_ID = 'test-client-id';
  process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
  process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
  process.env.GMAIL_LABEL = 'ECL/events';
  mockFindOrCreateVenue.mockResolvedValue(42);
  mockUpsertEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// Helper to set up Gmail API mocks
function setupGmailMocks(messages: Array<{ id: string; subject: string; body: string }>) {
  mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : String(url);

    // Token refresh
    if (urlStr.includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 'test-access-token' }) };
    }

    // Labels list
    if (urlStr.includes('/labels') && !urlStr.includes('/modify')) {
      return {
        ok: true,
        json: async () => ({
          labels: [
            { id: 'Label_1', name: 'ECL/events' },
            { id: 'INBOX', name: 'INBOX' },
          ],
        }),
      };
    }

    // Message list
    if (urlStr.includes('/messages?')) {
      return {
        ok: true,
        json: async () => ({
          messages: messages.map((m) => ({ id: m.id })),
        }),
      };
    }

    // Individual message fetch
    const msgMatch = urlStr.match(/\/messages\/([^?]+)\?format=full/);
    if (msgMatch) {
      const msg = messages.find((m) => m.id === msgMatch[1]);
      if (!msg) return { ok: false, status: 404 };
      return {
        ok: true,
        json: async () => ({
          id: msg.id,
          payload: {
            headers: [
              { name: 'Subject', value: msg.subject },
              { name: 'From', value: 'test@example.com' },
              { name: 'Date', value: 'Mon, 15 Jun 2027 10:00:00 GMT' },
            ],
            parts: [
              {
                mimeType: 'text/html',
                body: { data: Buffer.from(msg.body).toString('base64url') },
              },
            ],
          },
        }),
      };
    }

    // Mark as read
    if (urlStr.includes('/modify') && opts?.method === 'POST') {
      return { ok: true, json: async () => ({}) };
    }

    return { ok: false, status: 404 };
  });
}

describe('parseNewsletters', () => {
  it('extracts events from newsletters and upserts them', async () => {
    setupGmailMocks([
      {
        id: 'msg-1',
        subject: 'Halifax Events This Week',
        body: '<h1>Jazz at The Carleton</h1><p>Friday June 20, 2027 at 9pm</p>',
      },
    ]);

    mockGenerateText.mockResolvedValue({
      experimental_output: {
        events: [
          {
            performer: 'Jazz Night',
            event_date: '2026-04-15',
            event_time: '9:00 PM',
            venue_name: 'The Carleton',
            city: 'Halifax',
            province: 'NS',
            price: null,
            ticket_link: null,
            description: 'Live jazz at The Carleton',
            confidence: 0.9,
            event_category: 'live_music',
          },
        ],
      },
    } as never);

    const result = await parseNewsletters();

    expect(result.emailsProcessed).toBe(1);
    expect(result.eventsFound).toBe(1);
    expect(result.eventsUpserted).toBe(1);
    expect(mockFindOrCreateVenue).toHaveBeenCalledWith('The Carleton', 'Halifax', 'NS', 'Halifax, NS');
    expect(mockUpsertEvent).toHaveBeenCalledTimes(1);
  });

  it('skips past events from Gemini output', async () => {
    setupGmailMocks([{ id: 'msg-2', subject: 'Old Newsletter', body: '<p>event</p>' }]);

    mockGenerateText.mockResolvedValue({
      experimental_output: {
        events: [
          {
            performer: 'Old Band',
            event_date: '2020-01-01',
            event_time: null,
            venue_name: 'Venue',
            city: 'Halifax',
            province: 'NS',
            price: null,
            ticket_link: null,
            description: null,
            confidence: 0.9,
            event_category: 'live_music',
          },
        ],
      },
    } as never);

    const result = await parseNewsletters();

    expect(result.eventsFound).toBe(0); // filtered out
    expect(result.eventsUpserted).toBe(0);
  });

  it('handles no unread messages gracefully', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
      if (urlStr.includes('/labels')) return { ok: true, json: async () => ({ labels: [{ id: 'L1', name: 'ECL/events' }] }) };
      if (urlStr.includes('/messages?')) return { ok: true, json: async () => ({ messages: [] }) };
      return { ok: false, status: 404 };
    });

    const result = await parseNewsletters();

    expect(result.emailsProcessed).toBe(0);
    expect(result.eventsFound).toBe(0);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('throws if Gmail credentials are missing', async () => {
    delete process.env.GMAIL_CLIENT_ID;

    await expect(parseNewsletters()).rejects.toThrow('Missing GMAIL_CLIENT_ID');
  });

  it('marks emails as read after processing', async () => {
    setupGmailMocks([{ id: 'msg-3', subject: 'Test', body: '<p>test</p>' }]);
    mockGenerateText.mockResolvedValue({ experimental_output: { events: [] } } as never);

    await parseNewsletters();

    // Find the modify call
    const modifyCalls = mockFetch.mock.calls.filter(
      (call) => String(call[0]).includes('/modify')
    );
    expect(modifyCalls).toHaveLength(1);
    expect(String(modifyCalls[0][0])).toContain('msg-3');
  });
});
