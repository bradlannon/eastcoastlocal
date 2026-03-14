import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Lazy initialization: only connect when DATABASE_URL is available.
// During next build static analysis, DATABASE_URL may not be set.
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const sql = neon(url);
  return drizzle({ client: sql, schema });
}

let _db: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Proxy-based singleton that initializes on first property access.
// This allows `import { db } from './client'` to work without a DATABASE_URL
// at module load time (e.g. during Next.js build static analysis).
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof createDb>];
  },
});
