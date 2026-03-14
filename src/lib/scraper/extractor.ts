import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { ExtractedEventSchema, type ExtractedEvent } from '@/lib/schemas/extracted-event';

export async function extractEvents(
  pageText: string,
  sourceUrl: string
): Promise<ExtractedEvent[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { experimental_output } = await generateText({
    model: google('gemini-2.5-flash'),
    output: Output.object({ schema: ExtractedEventSchema }),
    prompt: `Today's date is ${today}.

You are extracting live music events from the following web page content scraped from: ${sourceUrl}

Extract all UPCOMING live music events (after today: ${today}). For each event return:
- performer: the artist/band name (null if unclear)
- event_date: the date in YYYY-MM-DD format (null if unclear — NEVER guess)
- event_time: the time (e.g. "8:00 PM") or null if not mentioned
- price: ticket price or null if not mentioned
- ticket_link: URL to buy tickets or null if not mentioned
- description: brief description of the event or null
- cover_image_url: URL of event image or null
- confidence: your confidence 0.0–1.0 that this is a real upcoming live music event (set to 0 if unsure)

Rules:
- Only include LIVE music events (not DJ sets that aren't music events, trivia nights, etc.)
- If you cannot determine the date with certainty, set event_date to null
- Skip events that have already passed (before ${today})
- Set confidence to 0 if you're unsure the event is real

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
