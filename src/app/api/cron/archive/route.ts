import { archivePastEvents } from '@/lib/archiver';

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedToken) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await archivePastEvents();
    return Response.json({
      success: true,
      archived: result.total,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[archive-cron] Archive job failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
