import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getExtractionModel } from '@/lib/ai/model';
import { findOrCreateVenue } from './ticketmaster';
import { upsertEvent } from './normalizer';
import { EVENT_CATEGORIES } from '@/lib/db/schema';

// ─── Gmail API helpers ────────────────────────────────────────────────────

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail token refresh failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  htmlBody: string;
  receivedAt: string;
}

async function fetchUnreadNewsletters(accessToken: string, label: string): Promise<GmailMessage[]> {
  // Find the label ID
  const labelsRes = await fetch(`${GMAIL_API}/labels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!labelsRes.ok) throw new Error(`Gmail labels fetch failed: ${labelsRes.status}`);

  const labelsData = (await labelsRes.json()) as { labels: Array<{ id: string; name: string }> };
  const targetLabel = labelsData.labels.find((l) => l.name === label);
  if (!targetLabel) throw new Error(`Gmail label "${label}" not found`);

  // List unread messages in that label
  const listRes = await fetch(
    `${GMAIL_API}/messages?labelIds=${targetLabel.id}&q=is:unread&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);

  const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
  if (!listData.messages?.length) return [];

  // Fetch each message
  const messages: GmailMessage[] = [];
  for (const msg of listData.messages) {
    const msgRes = await fetch(`${GMAIL_API}/messages/${msg.id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) continue;

    const msgData = (await msgRes.json()) as {
      id: string;
      payload: {
        headers: Array<{ name: string; value: string }>;
        body?: { data?: string };
        parts?: Array<{ mimeType: string; body?: { data?: string } }>;
      };
    };

    const headers = msgData.payload.headers;
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
    const date = headers.find((h) => h.name.toLowerCase() === 'date')?.value ?? '';

    // Extract HTML body from parts or direct body
    let htmlBody = '';
    const htmlPart = msgData.payload.parts?.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      htmlBody = base64UrlDecode(htmlPart.body.data);
    } else if (msgData.payload.body?.data) {
      htmlBody = base64UrlDecode(msgData.payload.body.data);
    }

    // Fallback to text/plain if no HTML
    if (!htmlBody) {
      const textPart = msgData.payload.parts?.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        htmlBody = base64UrlDecode(textPart.body.data);
      }
    }

    if (htmlBody) {
      messages.push({ id: msg.id, subject, from, htmlBody, receivedAt: date });
    }
  }

  return messages;
}

async function markAsRead(accessToken: string, messageId: string): Promise<void> {
  await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
}

function base64UrlDecode(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

// ─── Gemini extraction ────────────────────────────────────────────────────

const NewsletterEventSchema = z.object({
  events: z.array(
    z.object({
      performer: z.string().nullable(),
      event_date: z.string().nullable(),
      event_time: z.string().nullable(),
      venue_name: z.string().nullable(),
      city: z.string().nullable(),
      province: z.string().nullable(),
      price: z.string().nullable(),
      ticket_link: z.string().url().nullable(),
      description: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      event_category: z.enum(EVENT_CATEGORIES).default('other'),
    })
  ),
});

type NewsletterEvent = z.infer<typeof NewsletterEventSchema>['events'][number];

async function extractEventsFromNewsletter(
  htmlBody: string,
  subject: string,
  from: string
): Promise<NewsletterEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const model = await getExtractionModel();

  // Strip HTML to reduce token usage but keep structure for context
  const text = htmlBody
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15000); // Cap at ~15k chars to stay within token limits

  const { experimental_output } = await generateText({
    model,
    output: Output.object({ schema: NewsletterEventSchema }),
    prompt: `Today's date is ${today}.

You are extracting upcoming events from an email newsletter. The newsletter is from Atlantic Canada (Nova Scotia, New Brunswick, PEI, Newfoundland & Labrador).

Newsletter subject: "${subject}"
Newsletter sender: "${from}"

Extract ALL upcoming events mentioned (after today: ${today}). For each event return:
- performer: the main act, performer, event name, or title
- event_date: date in YYYY-MM-DD format (null if unclear — NEVER guess)
- event_time: time like "8:00 PM" or null
- venue_name: the venue, theatre, bar, or location name (null if not mentioned)
- city: city name (e.g. "Halifax", "Moncton", "St. John's") — infer from context if possible
- province: two-letter code: NS, NB, PEI, or NL (infer from city if possible)
- price: ticket price or null
- ticket_link: URL to tickets or event page, or null
- description: brief description or null
- confidence: 0.0–1.0 that this is a real upcoming public event
- event_category: one of live_music | comedy | theatre | arts | sports | festival | community | other

Rules:
- Include ALL event types — concerts, shows, markets, festivals, lectures, sports
- Skip events before ${today}
- If a newsletter mentions a venue in Atlantic Canada, extract events there even if the newsletter is regional
- Set confidence low (< 0.5) for vague mentions without dates
- Province codes: Nova Scotia=NS, New Brunswick=NB, Prince Edward Island=PEI, Newfoundland & Labrador=NL

Newsletter content:
${text}`,
  });

  const raw = experimental_output?.events ?? [];

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 90); // Newsletters often mention events further out

  return raw.filter((event) => {
    if (!event.performer) return false;
    if (!event.event_date) return false;
    if (event.confidence < 0.5) return false;
    const eventDate = new Date(event.event_date);
    if (isNaN(eventDate.getTime())) return false;
    if (eventDate < now) return false;
    if (eventDate > maxDate) return false;
    return true;
  });
}

// ─── Province normalization ───────────────────────────────────────────────

const PROVINCE_ALIASES: Record<string, string> = {
  'Nova Scotia': 'NS', NS: 'NS',
  'New Brunswick': 'NB', NB: 'NB',
  'Prince Edward Island': 'PEI', PEI: 'PEI', PE: 'PEI',
  'Newfoundland and Labrador': 'NL', 'Newfoundland': 'NL', NL: 'NL',
};

function normalizeProvince(raw: string | null): string | null {
  if (!raw) return null;
  return PROVINCE_ALIASES[raw.trim()] ?? null;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

export interface NewsletterResult {
  emailsProcessed: number;
  eventsFound: number;
  eventsUpserted: number;
  errors: number;
  details: Array<{
    subject: string;
    from: string;
    eventsFound: number;
    eventsUpserted: number;
  }>;
}

export async function parseNewsletters(): Promise<NewsletterResult> {
  const label = process.env.GMAIL_LABEL ?? 'ECL/events';
  const accessToken = await getAccessToken();

  console.log(`Fetching unread newsletters from label "${label}"...`);
  const messages = await fetchUnreadNewsletters(accessToken, label);
  console.log(`Found ${messages.length} unread newsletters`);

  const result: NewsletterResult = {
    emailsProcessed: 0,
    eventsFound: 0,
    eventsUpserted: 0,
    errors: 0,
    details: [],
  };

  for (const msg of messages) {
    const detail = { subject: msg.subject, from: msg.from, eventsFound: 0, eventsUpserted: 0 };

    try {
      console.log(`  Processing: "${msg.subject}" from ${msg.from}`);
      const events = await extractEventsFromNewsletter(msg.htmlBody, msg.subject, msg.from);
      detail.eventsFound = events.length;
      result.eventsFound += events.length;

      for (const event of events) {
        try {
          const province = normalizeProvince(event.province) ?? 'NS';
          const city = event.city ?? '';
          const venueName = event.venue_name ?? 'TBA';
          const address = `${city}, ${province}`;

          const venueId = await findOrCreateVenue(venueName, city, province, address);

          await upsertEvent(
            venueId,
            {
              performer: event.performer!,
              event_date: event.event_date!,
              event_time: event.event_time,
              price: event.price,
              ticket_link: event.ticket_link,
              description: event.description,
              cover_image_url: null,
              confidence: event.confidence,
              event_category: event.event_category,
            },
            event.ticket_link ?? `newsletter:${msg.id}`,
            null,
            'scrape'
          );
          detail.eventsUpserted++;
          result.eventsUpserted++;
        } catch (err) {
          console.error(`    Event upsert error:`, err instanceof Error ? err.message : err);
          result.errors++;
        }
      }

      // Mark as read after successful processing
      await markAsRead(accessToken, msg.id);
      result.emailsProcessed++;
    } catch (err) {
      console.error(`  Failed to parse "${msg.subject}":`, err instanceof Error ? err.message : err);
      result.errors++;
    }

    result.details.push(detail);
  }

  console.log(`Newsletters complete: ${result.emailsProcessed} emails, ${result.eventsUpserted}/${result.eventsFound} events upserted`);
  return result;
}
