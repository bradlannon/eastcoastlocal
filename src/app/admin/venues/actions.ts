'use server';

import { eq, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { venues, events, scrape_sources } from '@/lib/db/schema';
import { geocodeAddress } from '@/lib/scraper/geocoder';

const VALID_PROVINCES = ['NB', 'NS', 'PEI', 'NL'] as const;
type Province = typeof VALID_PROVINCES[number];

function isValidProvince(value: string): value is Province {
  return (VALID_PROVINCES as readonly string[]).includes(value);
}

export async function updateVenue(
  prevState: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const id = parseInt((formData.get('id') as string | null) ?? '', 10);
  const name = ((formData.get('name') as string | null) ?? '').trim();
  const address = ((formData.get('address') as string | null) ?? '').trim();
  const city = ((formData.get('city') as string | null) ?? '').trim();
  const province = ((formData.get('province') as string | null) ?? '').trim();

  // Validation
  if (!name || name.length > 100) {
    return { error: 'Name is required and must be 100 characters or fewer.' };
  }
  if (!address) {
    return { error: 'Address is required.' };
  }
  if (!city) {
    return { error: 'City is required.' };
  }
  if (!isValidProvince(province)) {
    return { error: 'Province must be one of: NB, NS, PEI, NL.' };
  }
  if (isNaN(id)) {
    return { error: 'Invalid venue ID.' };
  }

  // Geocode the address
  const fullAddress = `${address}, ${city}, ${province}, Canada`;
  let lat: number | null = null;
  let lng: number | null = null;

  try {
    const coords = await geocodeAddress(fullAddress);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    } else {
      console.warn(`[updateVenue] Geocoding returned null for: ${fullAddress}`);
    }
  } catch (err) {
    console.warn(`[updateVenue] Geocoding error for: ${fullAddress}`, err);
  }

  // Update the venue in DB
  await db
    .update(venues)
    .set({ name, address, city, province, lat, lng })
    .where(eq(venues.id, id));

  redirect('/admin/venues');
}

export async function createVenue(
  prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const name = ((formData.get('name') as string | null) ?? '').trim();
  const address = ((formData.get('address') as string | null) ?? '').trim();
  const city = ((formData.get('city') as string | null) ?? '').trim();
  const province = ((formData.get('province') as string | null) ?? '').trim();

  // Validation
  if (!name || name.length > 100) {
    return { error: 'Name is required and must be 100 characters or fewer.' };
  }
  if (!address) {
    return { error: 'Address is required.' };
  }
  if (!city) {
    return { error: 'City is required.' };
  }
  if (!isValidProvince(province)) {
    return { error: 'Province must be one of: NB, NS, PEI, NL.' };
  }

  // Geocode the address
  const fullAddress = `${address}, ${city}, ${province}, Canada`;
  let lat: number | null = null;
  let lng: number | null = null;

  try {
    const coords = await geocodeAddress(fullAddress);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    } else {
      console.warn(`[createVenue] Geocoding returned null for: ${fullAddress}`);
    }
  } catch (err) {
    console.warn(`[createVenue] Geocoding error for: ${fullAddress}`, err);
  }

  // Insert the new venue
  try {
    await db.insert(venues).values({ name, address, city, province, lat, lng });
  } catch (err) {
    console.error('[createVenue] DB insert error:', err);
    return { error: 'Failed to create venue.' };
  }

  redirect('/admin/venues');
}

export async function addSource(
  prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const url = ((formData.get('url') as string | null) ?? '').trim();
  const venueIdStr = (formData.get('venue_id') as string | null) ?? '';
  const venueId = parseInt(venueIdStr, 10);

  // Validation
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return { error: 'A valid URL starting with http:// or https:// is required.' };
  }
  if (isNaN(venueId)) {
    return { error: 'Invalid venue ID.' };
  }

  // Auto-detect source type from URL domain
  let sourceType: string = 'venue_website';
  if (url.includes('eventbrite')) {
    sourceType = 'eventbrite';
  } else if (url.includes('bandsintown')) {
    sourceType = 'bandsintown';
  } else if (url.includes('ticketmaster')) {
    sourceType = 'ticketmaster';
  } else if (url.includes('facebook.com')) {
    sourceType = 'facebook_page';
  }

  // Insert the new source
  try {
    await db.insert(scrape_sources).values({
      url,
      venue_id: venueId,
      source_type: sourceType,
      enabled: true,
      scrape_frequency: 'daily',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique') || message.includes('duplicate')) {
      return { error: 'This URL is already a scrape source.' };
    }
    console.error('[addSource] DB insert error:', err);
    return { error: 'Failed to add source.' };
  }

  revalidatePath(`/admin/venues/${venueId}`);
  redirect(`/admin/venues/${venueId}`);
}

export async function deleteVenue(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return { success: false, error: 'Invalid venue ID.' };
  }

  // Check venue exists
  const venueRows = await db.select().from(venues).where(eq(venues.id, numericId));
  if (venueRows.length === 0) {
    return { success: false, error: 'Venue not found.' };
  }

  // Count associated events
  const eventCountRows = await db
    .select({ count: count() })
    .from(events)
    .where(eq(events.venue_id, numericId));
  const eventCount = Number(eventCountRows[0]?.count ?? 0);

  // Count associated scrape_sources
  const sourceCountRows = await db
    .select({ count: count() })
    .from(scrape_sources)
    .where(eq(scrape_sources.venue_id, numericId));
  const sourceCount = Number(sourceCountRows[0]?.count ?? 0);

  // Guardrail: block if any events or sources exist
  if (eventCount > 0 || sourceCount > 0) {
    const parts: string[] = [];
    if (eventCount > 0) parts.push(`${eventCount} event${eventCount === 1 ? '' : 's'}`);
    if (sourceCount > 0) parts.push(`${sourceCount} source${sourceCount === 1 ? '' : 's'}`);
    return {
      success: false,
      error: `Venue has ${parts.join(' and ')} — detach or archive them first.`,
    };
  }

  // Safe to delete
  await db.delete(venues).where(eq(venues.id, numericId));
  revalidatePath('/admin/venues');
  return { success: true };
}

export async function toggleSource(formData: FormData): Promise<void> {
  const sourceIdStr = (formData.get('source_id') as string | null) ?? '';
  const venueIdStr = (formData.get('venue_id') as string | null) ?? '';
  const sourceId = parseInt(sourceIdStr, 10);
  const venueId = parseInt(venueIdStr, 10);

  if (isNaN(sourceId) || isNaN(venueId)) {
    return;
  }

  // Query current enabled state
  const rows = await db
    .select({ enabled: scrape_sources.enabled })
    .from(scrape_sources)
    .where(eq(scrape_sources.id, sourceId));

  if (rows.length === 0) {
    return;
  }

  const currentEnabled = rows[0].enabled;

  await db
    .update(scrape_sources)
    .set({ enabled: !currentEnabled })
    .where(eq(scrape_sources.id, sourceId));

  revalidatePath(`/admin/venues/${venueId}`);
  redirect(`/admin/venues/${venueId}`);
}
