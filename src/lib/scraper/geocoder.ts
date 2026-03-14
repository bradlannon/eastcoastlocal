export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const encoded = encodeURIComponent(address);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encoded}` +
    `&key=${apiKey}` +
    `&region=ca` +
    `&components=${encodeURIComponent('country:CA')}`;

  const response = await fetch(url);

  if (!response.ok) {
    console.error(`Geocoding HTTP error: ${response.status} for address: ${address}`);
    return null;
  }

  const data = (await response.json()) as {
    status: string;
    results: Array<{
      geometry: {
        location: { lat: number; lng: number };
        location_type: string;
      };
    }>;
  };

  if (data.status !== 'OK' || data.results.length === 0) {
    console.warn(`Geocoding no results (${data.status}) for address: ${address}`);
    return null;
  }

  const { location, location_type } = data.results[0].geometry;

  if (location_type === 'APPROXIMATE') {
    console.warn(`Geocoding APPROXIMATE result rejected for address: ${address}`);
    return null;
  }

  return { lat: location.lat, lng: location.lng };
}
