'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { community_submissions, events, venues } from '@/lib/db/schema';

export async function approveSubmission(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') ?? ''), 10);
  if (isNaN(id)) return;

  const submission = await db.query.community_submissions.findFirst({
    where: eq(community_submissions.id, id),
  });
  if (!submission || submission.status !== 'pending') return;

  // Find or create venue
  const existingVenues = await db
    .select()
    .from(venues)
    .where(eq(venues.name, submission.venue_name))
    .limit(1);

  let venueId: number;
  if (existingVenues.length > 0) {
    venueId = existingVenues[0].id;
  } else {
    const [newVenue] = await db
      .insert(venues)
      .values({
        name: submission.venue_name,
        address: submission.city, // minimal — admin can update later
        city: submission.city,
        province: submission.province,
      })
      .returning({ id: venues.id });
    venueId = newVenue.id;
  }

  // Create event
  await db.insert(events).values({
    venue_id: venueId,
    performer: submission.performer,
    normalized_performer: submission.performer.toLowerCase().trim(),
    event_date: submission.event_date,
    event_time: submission.event_time,
    event_category: submission.event_category,
    price: submission.price,
    ticket_link: submission.link,
    description: submission.description,
    source_url: submission.link,
  });

  // Mark as approved
  await db
    .update(community_submissions)
    .set({ status: 'approved', reviewed_at: new Date() })
    .where(eq(community_submissions.id, id));

  revalidatePath('/admin/submissions');
  redirect('/admin/submissions');
}

export async function rejectSubmission(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') ?? ''), 10);
  if (isNaN(id)) return;

  await db
    .update(community_submissions)
    .set({ status: 'rejected', reviewed_at: new Date() })
    .where(eq(community_submissions.id, id));

  revalidatePath('/admin/submissions');
  redirect('/admin/submissions');
}
