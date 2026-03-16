import { runPlacesDiscovery, PLACES_CITIES } from '@/lib/scraper/places-discoverer';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPlacesDiscovery(PLACES_CITIES.PEI);
    return Response.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Places discovery PEI failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
