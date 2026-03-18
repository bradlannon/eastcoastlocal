import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { community_submissions } from '@/lib/db/schema';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Honeypot check — if the hidden field is filled, it's a bot
    if (body.website) {
      return NextResponse.json({ success: true }); // silent success for bots
    }

    const { performer, venue_name, city, province, event_date, event_time, event_category, price, link, description } = body;

    // Validate required fields
    if (!performer?.trim() || !venue_name?.trim() || !city?.trim() || !province?.trim() || !event_date) {
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

    await db.insert(community_submissions).values({
      performer: performer.trim(),
      venue_name: venue_name.trim(),
      city: city.trim(),
      province,
      event_date: parsedDate,
      event_time: event_time?.trim() || null,
      event_category: event_category || 'community',
      price: price?.trim() || null,
      link: link?.trim() || null,
      description: description?.trim() || null,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/submissions] Error:', err);
    return NextResponse.json({ error: 'Failed to submit event' }, { status: 500 });
  }
}
