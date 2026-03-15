'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { discovered_sources, scrape_sources } from '@/lib/db/schema';
import { promoteSource } from '@/lib/scraper/promote-source';

export async function approveCandidate(formData: FormData): Promise<void> {
  const raw = formData.get('id');
  const id = parseInt(String(raw ?? ''), 10);
  if (isNaN(id)) return;

  try {
    await promoteSource(id);
  } catch (err) {
    console.error('[approveCandidate] promoteSource failed:', err);
  }

  revalidatePath('/admin/discovery');
  redirect('/admin/discovery');
}

export async function rejectCandidate(
  prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const raw = formData.get('id');
  const id = parseInt(String(raw ?? ''), 10);
  if (isNaN(id)) return { error: 'Invalid ID' };

  const reasonRaw = formData.get('reason');
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';

  try {
    // Fetch existing raw_context so we can append the reason if provided
    const existing = await db.query.discovered_sources.findFirst({
      where: eq(discovered_sources.id, id),
      columns: { raw_context: true },
    });

    const updatedContext =
      reason && existing
        ? `${existing.raw_context ?? ''}\n\n--- Rejection Reason ---\n${reason}`.trimStart()
        : existing?.raw_context ?? null;

    await db
      .update(discovered_sources)
      .set({
        status: 'rejected',
        reviewed_at: new Date(),
        raw_context: updatedContext,
      })
      .where(eq(discovered_sources.id, id));

    if (reason) {
      console.log(`[rejectCandidate] Candidate ${id} rejected. Reason: ${reason}`);
    }
  } catch (err) {
    console.error('[rejectCandidate] DB update failed:', err);
    return { error: 'Failed to reject candidate. Please try again.' };
  }

  revalidatePath('/admin/discovery');
  redirect('/admin/discovery');
}

export async function revokeCandidate(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') ?? ''), 10);
  if (isNaN(id)) return;

  const staged = await db.query.discovered_sources.findFirst({
    where: eq(discovered_sources.id, id),
  });
  if (!staged || staged.status !== 'approved') return;

  // Disable scrape source first (non-destructive)
  await db
    .update(scrape_sources)
    .set({ enabled: false })
    .where(eq(scrape_sources.url, staged.url));

  // Reset discovery record to pending
  await db
    .update(discovered_sources)
    .set({ status: 'pending', reviewed_at: null, added_to_sources_at: null })
    .where(eq(discovered_sources.id, id));

  revalidatePath('/admin/discovery');
  redirect('/admin/discovery');
}
