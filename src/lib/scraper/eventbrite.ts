import type { ScrapeSource } from '@/types';
import { upsertEvent } from './normalizer';

interface EventbriteEvent {
  id: string;
  name: { text: string };
  start: {
    utc: string;
    local: string;
  };
  url: string;
  description: { text: string } | null;
  logo: { url: string } | null;
}

interface EventbriteResponse {
  events: EventbriteEvent[];
}

export async function scrapeEventbrite(source: ScrapeSource): Promise<void> {
  const orgId = source.url.replace('eventbrite:org:', '');

  const response = await fetch(
    `https://www.eventbriteapi.com/v3/organizations/${orgId}/events/?status=live&expand=venue`,
    {
      headers: {
        Authorization: `Bearer ${process.env.EVENTBRITE_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Eventbrite API error: ${response.status} ${response.statusText} for org ${orgId}`
    );
  }

  const data = (await response.json()) as EventbriteResponse;
  const now = new Date();

  for (const event of data.events) {
    // Skip past events
    if (new Date(event.start.utc) < now) {
      continue;
    }

    await upsertEvent(
      source.venue_id,
      {
        performer: event.name.text,
        event_date: event.start.utc.slice(0, 10),
        event_time: event.start.local.slice(11, 16),
        price: null,
        ticket_link: event.url,
        description: event.description?.text?.slice(0, 500) ?? null,
        cover_image_url: event.logo?.url ?? null,
        confidence: 1.0,
      },
      event.url
    );
  }
}
