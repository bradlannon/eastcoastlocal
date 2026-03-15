'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { venues } from '@/lib/db/schema';
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
