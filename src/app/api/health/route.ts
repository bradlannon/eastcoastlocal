import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ status: 'ok', db: 'connected' });
  } catch {
    return Response.json({ status: 'error', db: 'disconnected' }, { status: 500 });
  }
}
