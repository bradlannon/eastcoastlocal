import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { community_submissions } from '@/lib/db/schema';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const MAX_LENGTHS = {
  performer: 200,
  venue_name: 200,
  city: 100,
  event_time: 50,
  price: 50,
  link: 500,
  description: 2000,
} as const;

function sanitize(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // Rate limit: 5 submissions per IP per hour
    const ip = getClientIp(request);
    const { allowed, remaining } = rateLimit(`submit:${ip}`, { maxRequests: 5, windowMs: 3600_000 });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429, headers: { 'X-RateLimit-Remaining': String(remaining) } }
      );
    }

    const body = await request.json();

    // Honeypot check — if the hidden field is filled, it's a bot
    if (body.website) {
      return NextResponse.json({ success: true }); // silent success for bots
    }

    // Sanitize and validate
    const performer = sanitize(body.performer, MAX_LENGTHS.performer);
    const venue_name = sanitize(body.venue_name, MAX_LENGTHS.venue_name);
    const city = sanitize(body.city, MAX_LENGTHS.city);
    const province = typeof body.province === 'string' ? body.province.trim() : '';
    const event_date = typeof body.event_date === 'string' ? body.event_date.trim() : '';
    const event_time = sanitize(body.event_time, MAX_LENGTHS.event_time);
    const event_category = typeof body.event_category === 'string' ? body.event_category.trim() : 'community';
    const price = sanitize(body.price, MAX_LENGTHS.price);
    const link = sanitize(body.link, MAX_LENGTHS.link);
    const description = sanitize(body.description, MAX_LENGTHS.description);

    // Validate required fields
    if (!performer || !venue_name || !city || !province || !event_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate province
    if (!['NS', 'NB', 'PEI', 'NL'].includes(province)) {
      return NextResponse.json({ error: 'Invalid province' }, { status: 400 });
    }

    // Validate date is in the future
    const parsedDate = new Date(event_date);
    if (isNaN(parsedDate.getTime()) || parsedDate < new Date()) {
      return NextResponse.json({ error: 'Event date must be in the future' }, { status: 400 });
    }

    // Validate link if provided
    if (link && !isValidUrl(link)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Validate category
    const validCategories = ['live_music', 'comedy', 'theatre', 'arts', 'sports', 'festival', 'community', 'other'];
    const safeCategory = validCategories.includes(event_category) ? event_category : 'community';

    await db.insert(community_submissions).values({
      performer,
      venue_name,
      city,
      province,
      event_date: parsedDate,
      event_time,
      event_category: safeCategory as 'live_music' | 'comedy' | 'theatre' | 'arts' | 'sports' | 'festival' | 'community' | 'other',
      price,
      link,
      description,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/submissions] Error:', err);
    return NextResponse.json({ error: 'Failed to submit event' }, { status: 500 });
  }
}
