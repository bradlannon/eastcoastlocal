import { generateText, Output } from 'ai';
import { ExtractedEventSchema, type ExtractedEvent } from '@/lib/schemas/extracted-event';
import { getExtractionModel } from '@/lib/ai/model';

export async function extractEvents(
  pageText: string,
  sourceUrl: string
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

  // Only keep events within the next 30 days — locals care about what's coming up soon
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 30);

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
