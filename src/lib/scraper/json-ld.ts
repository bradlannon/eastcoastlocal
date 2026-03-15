import * as cheerio from 'cheerio';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

function extractName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value || null;
  if (Array.isArray(value)) {
    const first = value[0];
    if (!first) return null;
    if (typeof first === 'string') return first;
    if (typeof first === 'object' && first !== null) {
      return (first as Record<string, unknown>).name as string ?? null;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    return (value as Record<string, unknown>).name as string ?? null;
  }
  return null;
}

function extractPrice(offers: unknown): string | null {
  if (!offers) return null;
  if (Array.isArray(offers)) {
    const first = offers[0];
    if (!first) return null;
    return String((first as Record<string, unknown>).price ?? '') || null;
  }
  if (typeof offers === 'object' && offers !== null) {
    const price = (offers as Record<string, unknown>).price;
    return price != null ? String(price) || null : null;
  }
  return null;
}

function extractTicketLink(offers: unknown, fallbackUrl: unknown): string | null {
  let url: unknown = null;

  if (offers && typeof offers === 'object' && !Array.isArray(offers)) {
    url = (offers as Record<string, unknown>).url;
  } else if (Array.isArray(offers) && offers.length > 0) {
    url = (offers[0] as Record<string, unknown>).url;
  }

  if (!url && fallbackUrl) {
    url = fallbackUrl;
  }

  if (typeof url === 'string' && url) {
    try {
      new URL(url); // validate URL
      return url;
    } catch {
      return null;
    }
  }
  return null;
}

function extractImageUrl(image: unknown): string | null {
  if (!image) return null;
  let url: string | null = null;
  if (typeof image === 'string') {
    url = image;
  } else if (Array.isArray(image) && image.length > 0) {
    const first = image[0];
    if (typeof first === 'string') url = first;
    else if (typeof first === 'object' && first !== null) url = (first as Record<string, unknown>).url as string ?? null;
  } else if (typeof image === 'object' && image !== null) {
    url = (image as Record<string, unknown>).url as string ?? null;
  }
  if (!url) return null;
  try {
    new URL(url); // validate URL
    return url;
  } catch {
    return null;
  }
}

function mapSchemaOrgEvent(item: Record<string, unknown>): ExtractedEvent {
  const startDate = String(item.startDate ?? '');
  const hasTime = startDate.length > 10;

  let event_time: string | null = null;
  if (hasTime) {
    try {
      event_time = new Date(startDate).toLocaleTimeString('en-CA', {
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      event_time = null;
    }
  }

  const performer = extractName(item.performer) ?? extractName(item.name);

  return {
    performer,
    event_date: startDate.slice(0, 10) || null,
    event_time,
    price: extractPrice(item.offers),
    ticket_link: extractTicketLink(item.offers, item.url),
    description: String(item.description ?? '').slice(0, 500) || null,
    cover_image_url: extractImageUrl(item.image),
    confidence: 1.0,
    event_category: 'other',
  };
}

export function extractJsonLdEvents(html: string): ExtractedEvent[] {
  const $ = cheerio.load(html);
  const events: ExtractedEvent[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue;

        // Handle @graph containers
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          for (const graphItem of item['@graph']) {
            if (typeof graphItem === 'object' && graphItem !== null && graphItem['@type'] === 'Event') {
              events.push(mapSchemaOrgEvent(graphItem as Record<string, unknown>));
            }
          }
          continue;
        }

        if (item['@type'] === 'Event') {
          events.push(mapSchemaOrgEvent(item as Record<string, unknown>));
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  });

  return events;
}
