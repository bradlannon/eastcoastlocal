import { verifyCronSecret } from '@/lib/cron-auth';
import { parseNewsletters } from '@/lib/scraper/newsletter-parser';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await parseNewsletters();
    return Response.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Cron parse-newsletters failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
