import { generateText, Output } from 'ai';
import { ExtractedEventSchema, type ExtractedEvent } from '@/lib/schemas/extracted-event';
import { getExtractionModel } from '@/lib/ai/model';
import { db } from '@/lib/db/client';
import { rejected_events } from '@/lib/db/schema';

interface ExtractOptions {
  venueId?: number;
  scrapeSourceId?: number | null;
}

export async function extractEvents(
  pageText: string,
  sourceUrl: string,
  options?: ExtractOptions
): Promise<ExtractedEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const model = await getExtractionModel();

  const { experimental_output } = await generateText({
    model,
    output: Output.object({ schema: ExtractedEventSchema }),
    prompt: `Today's date is ${today}.

You are extracting upcoming public events from the following web page content scraped from: ${sourceUrl}

Extract all UPCOMING events (after today: ${today}). For each event return:
- performer: the main act, performer, team, troupe, organizer, or event title (null if unclear)
- event_date: the date in YYYY-MM-DD format (null if unclear — NEVER guess)
- event_time: the time (e.g. "8:00 PM") or null if not mentioned
- price: ticket price or null if not mentioned
- ticket_link: URL to buy tickets or null if not mentioned
- description: brief description of the event or null
- cover_image_url: URL of event image or null
- confidence: your confidence 0.0–1.0 that this is a real upcoming public event
- event_category: one of live_music | comedy | theatre | arts | sports | festival | community | other
- recurrence_pattern: if the page indicates this event repeats on a schedule (e.g., "every Tuesday", "weekly open mic", "first Friday of each month"), capture that pattern as a short string. Omit if no recurrence is indicated.

Category guidance:
- live_music: concerts, bands, solo artists performing live
- comedy: stand-up, improv, open mic comedy nights
- theatre: plays, musicals, dramatic productions
- arts: art shows, gallery openings, craft fairs, exhibitions
- sports: athletic events, games, races, tournaments
- festival: multi-day or multi-act events celebrating food, culture, music, etc.
- community: farmers markets, fundraisers, town halls, charity events, meetups
- other: anything that does not fit the above

Rules:
- Include ALL event types — not just live music
- If you cannot determine the date with certainty, set event_date to null
- Skip events that have already passed (before ${today})
- Set confidence to 0 if you are unsure the event is real

Page content:
${pageText}`,
  });

  const raw = experimental_output?.events ?? [];

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Accept events up to 90 days out (relaxed from 30)
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 90);

  const accepted: ExtractedEvent[] = [];

  for (const event of raw) {
    let reason: string | null = null;

    if (!event.performer) {
      reason = 'missing_performer';
    } else if (!event.event_date) {
      reason = 'missing_date';
    } else if (event.confidence < 0.3) {
      // Relaxed from 0.5 to 0.3
      reason = `low_confidence (${event.confidence})`;
    } else {
      const eventDate = new Date(event.event_date);
      if (isNaN(eventDate.getTime())) {
        reason = `invalid_date (${event.event_date})`;
      } else if (eventDate < now) {
        reason = `past_event (${event.event_date})`;
      } else if (eventDate > maxDate) {
        reason = `too_far_out (${event.event_date}, >90 days)`;
      }
    }

    if (reason) {
      // Log rejection — fire and forget, don't block scraping
      try {
        db.insert(rejected_events).values({
          venue_id: options?.venueId ?? null,
          scrape_source_id: options?.scrapeSourceId ?? null,
          performer: event.performer ?? null,
          event_date: event.event_date ?? null,
          event_time: event.event_time ?? null,
          confidence: event.confidence ?? null,
          event_category: event.event_category ?? null,
          source_url: sourceUrl,
          rejection_reason: reason,
          raw_data: JSON.stringify(event),
        }).then(() => {}).catch(() => {});
      } catch { /* ignore */ }
      continue;
    }

    accepted.push(event);
  }

  return accepted;
}
