'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { rejected_events, events } from '@/lib/db/schema';
import { normalizePerformer } from '@/lib/scraper/normalizer';
import {
  addDays,
  startOfDay,
  nextMonday,
  nextTuesday,
  nextWednesday,
  nextThursday,
  nextFriday,
  nextSaturday,
  nextSunday,
  isBefore,
  isMonday,
  isTuesday,
  isWednesday,
  isThursday,
  isFriday,
  isSaturday,
  isSunday,
} from 'date-fns';

const WEEKDAY_MAP: Record<string, {
  next: (d: Date) => Date;
  is: (d: Date) => boolean;
}> = {
  monday:    { next: nextMonday,    is: isMonday },
  mondays:   { next: nextMonday,    is: isMonday },
  tuesday:   { next: nextTuesday,   is: isTuesday },
  tuesdays:  { next: nextTuesday,   is: isTuesday },
  wednesday: { next: nextWednesday, is: isWednesday },
  wednesdays:{ next: nextWednesday, is: isWednesday },
  thursday:  { next: nextThursday,  is: isThursday },
  thursdays: { next: nextThursday,  is: isThursday },
  friday:    { next: nextFriday,    is: isFriday },
  fridays:   { next: nextFriday,    is: isFriday },
  saturday:  { next: nextSaturday,  is: isSaturday },
  saturdays: { next: nextSaturday,  is: isSaturday },
  sunday:    { next: nextSunday,    is: isSunday },
  sundays:   { next: nextSunday,    is: isSunday },
};

/**
 * Detect a weekday name in the performer/event name.
 */
function detectWeekday(text: string): string | null {
  const lower = text.toLowerCase();
  for (const day of Object.keys(WEEKDAY_MAP)) {
    if (lower.includes(day)) return day;
  }
  return null;
}

/**
 * Generate all dates for a given weekday within the next N days.
 */
function generateRecurringDates(weekday: string, maxDays: number = 90): Date[] {
  const entry = WEEKDAY_MAP[weekday];
  if (!entry) return [];

  const now = new Date();
  const today = startOfDay(now);
  const cutoff = addDays(today, maxDays);
  const dates: Date[] = [];

  // Start from today if it's the right day, otherwise next occurrence
  let current = entry.is(today) ? today : entry.next(today);

  while (isBefore(current, cutoff)) {
    dates.push(new Date(current));
    current = addDays(current, 7);
  }

  return dates;
}

/**
 * Approve a single rejected event — creates one event.
 */
export async function approveRejectedEvent(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') ?? ''), 10);
  if (isNaN(id)) return;

  const rejected = await db.query.rejected_events.findFirst({
    where: eq(rejected_events.id, id),
  });
  if (!rejected || !rejected.venue_id) return;

  // Parse raw_data for full event details
  let rawData: Record<string, string | number | null> = {};
  try {
    rawData = JSON.parse(rejected.raw_data ?? '{}');
  } catch { /* ignore */ }

  const performer = rejected.performer ?? String(rawData.performer ?? 'Unknown');
  const eventDate = rejected.event_date
    ? new Date(rejected.event_date)
    : new Date(); // fallback to today

  if (isNaN(eventDate.getTime())) return;

  await db
    .insert(events)
    .values({
      venue_id: rejected.venue_id,
      performer,
      normalized_performer: normalizePerformer(performer),
      event_date: eventDate,
      event_time: rejected.event_time ?? null,
      event_category: (rejected.event_category as 'live_music' | 'comedy' | 'theatre' | 'arts' | 'sports' | 'festival' | 'community' | 'other') ?? 'other',
      source_url: rejected.source_url ?? null,
      description: String(rawData.description ?? ''),
      price: String(rawData.price ?? '') || null,
    })
    .onConflictDoNothing();

  // Remove from rejected
  await db.delete(rejected_events).where(eq(rejected_events.id, id));

  revalidatePath('/admin/rejected');
  redirect('/admin/rejected');
}

/**
 * Approve a rejected event as recurring — detects weekday from name,
 * generates events for every occurrence within 90 days.
 */
export async function approveAsRecurring(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') ?? ''), 10);
  if (isNaN(id)) return;

  const rejected = await db.query.rejected_events.findFirst({
    where: eq(rejected_events.id, id),
  });
  if (!rejected || !rejected.venue_id) return;

  const performer = rejected.performer ?? 'Unknown';
  const weekday = detectWeekday(performer);
  if (!weekday) return;

  let rawData: Record<string, string | number | null> = {};
  try {
    rawData = JSON.parse(rejected.raw_data ?? '{}');
  } catch { /* ignore */ }

  const dates = generateRecurringDates(weekday, 90);

  let created = 0;
  for (const date of dates) {
    try {
      await db
        .insert(events)
        .values({
          venue_id: rejected.venue_id,
          performer,
          normalized_performer: normalizePerformer(performer),
          event_date: date,
          event_time: rejected.event_time ?? null,
          event_category: (rejected.event_category as 'live_music' | 'comedy' | 'theatre' | 'arts' | 'sports' | 'festival' | 'community' | 'other') ?? 'other',
          source_url: rejected.source_url ?? null,
          description: String(rawData.description ?? ''),
          price: String(rawData.price ?? '') || null,
        })
        .onConflictDoNothing();
      created++;
    } catch { /* skip duplicates */ }
  }

  console.log(`[approveAsRecurring] Created ${created} recurring ${weekday} events for "${performer}"`);

  // Remove from rejected
  await db.delete(rejected_events).where(eq(rejected_events.id, id));

  revalidatePath('/admin/rejected');
  redirect('/admin/rejected');
}

/**
 * Dismiss a rejected event (remove from list without creating an event).
 */
export async function dismissRejectedEvent(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') ?? ''), 10);
  if (isNaN(id)) return;

  await db.delete(rejected_events).where(eq(rejected_events.id, id));

  revalidatePath('/admin/rejected');
  redirect('/admin/rejected');
}
