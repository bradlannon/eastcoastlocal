'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';

export async function updateEventCategory(formData: FormData): Promise<{ error?: string }> {
  const eventId = parseInt(String(formData.get('eventId') ?? ''), 10);
  const category = String(formData.get('category') ?? '');

  if (isNaN(eventId)) return { error: 'Invalid event ID' };

  try {
    await db
      .update(events)
      .set({
        event_category: category as 'live_music' | 'comedy' | 'theatre' | 'arts' | 'sports' | 'festival' | 'community' | 'other',
        updated_at: new Date(),
      })
      .where(eq(events.id, eventId));
  } catch (err) {
    return { error: String(err) };
  }

  revalidatePath('/admin/events');
  return {};
}
