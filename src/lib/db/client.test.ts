/**
 * Characterization tests for src/lib/db/client.ts
 * Tests singleton export, DATABASE_URL requirement, proxy behavior.
 * Mocks @neondatabase/serverless and drizzle-orm/neon-http.
 */

const mockDrizzleInstance = {
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  execute: jest.fn(),
};

const mockNeon = jest.fn(() => ({ sql: 'mock-sql-client' }));
const mockDrizzle = jest.fn(() => mockDrizzleInstance);

jest.mock('@neondatabase/serverless', () => ({
  neon: (...args: unknown[]) => mockNeon(...args),
}));

jest.mock('drizzle-orm/neon-http', () => ({
  drizzle: (...args: unknown[]) => mockDrizzle(...args),
}));

// Import after mocks are set up — module is loaded once per test file
// We test via the proxy, so we import at module scope
describe('lib/db/client', () => {
  const ORIGINAL_URL = process.env.DATABASE_URL;

  afterAll(() => {
    if (ORIGINAL_URL !== undefined) {
      process.env.DATABASE_URL = ORIGINAL_URL;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  describe('getDb()', () => {
    it('throws if DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;
      // Re-require with resetModules to get fresh singleton
      jest.resetModules();
      jest.mock('@neondatabase/serverless', () => ({
        neon: (...args: unknown[]) => mockNeon(...args),
      }));
      jest.mock('drizzle-orm/neon-http', () => ({
        drizzle: (...args: unknown[]) => mockDrizzle(...args),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDb } = require('./client') as typeof import('./client');
      expect(() => getDb()).toThrow('DATABASE_URL environment variable is not set');
    });

    it('creates db when DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      jest.resetModules();
      jest.mock('@neondatabase/serverless', () => ({
        neon: (...args: unknown[]) => mockNeon(...args),
      }));
      jest.mock('drizzle-orm/neon-http', () => ({
        drizzle: (...args: unknown[]) => mockDrizzle(...args),
      }));
      mockNeon.mockClear();
      mockDrizzle.mockClear();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDb } = require('./client') as typeof import('./client');
      const db = getDb();
      expect(db).toBeDefined();
      expect(mockNeon).toHaveBeenCalledWith('postgresql://localhost/test');
      expect(mockDrizzle).toHaveBeenCalledTimes(1);
    });

    it('returns singleton: repeated getDb() calls do not re-initialize', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      jest.resetModules();
      jest.mock('@neondatabase/serverless', () => ({
        neon: (...args: unknown[]) => mockNeon(...args),
      }));
      jest.mock('drizzle-orm/neon-http', () => ({
        drizzle: (...args: unknown[]) => mockDrizzle(...args),
      }));
      mockNeon.mockClear();
      mockDrizzle.mockClear();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDb } = require('./client') as typeof import('./client');
      const db1 = getDb();
      const db2 = getDb();
      expect(db1).toBe(db2);
      // drizzle called only once despite two getDb() calls
      expect(mockDrizzle).toHaveBeenCalledTimes(1);
    });
  });

  describe('db proxy export', () => {
    it('exports a db object (proxy) that is defined', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      jest.resetModules();
      jest.mock('@neondatabase/serverless', () => ({
        neon: (...args: unknown[]) => mockNeon(...args),
      }));
      jest.mock('drizzle-orm/neon-http', () => ({
        drizzle: (...args: unknown[]) => mockDrizzle(...args),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { db } = require('./client') as typeof import('./client');
      expect(db).toBeDefined();
      expect(typeof db).toBe('object');
    });

    it('accessing a property on the proxy triggers lazy initialization', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      jest.resetModules();
      jest.mock('@neondatabase/serverless', () => ({
        neon: (...args: unknown[]) => mockNeon(...args),
      }));
      jest.mock('drizzle-orm/neon-http', () => ({
        drizzle: (...args: unknown[]) => mockDrizzle(...args),
      }));
      mockNeon.mockClear();
      mockDrizzle.mockClear();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { db } = require('./client') as typeof import('./client');
      // Access a property — should trigger the proxy getter
      void (db as unknown as Record<string, unknown>).select;
      expect(mockDrizzle).toHaveBeenCalledTimes(1);
      expect(mockNeon).toHaveBeenCalledWith('postgresql://localhost/test');
    });

    it('proxy throws if DATABASE_URL missing on property access', () => {
      delete process.env.DATABASE_URL;
      jest.resetModules();
      jest.mock('@neondatabase/serverless', () => ({
        neon: (...args: unknown[]) => mockNeon(...args),
      }));
      jest.mock('drizzle-orm/neon-http', () => ({
        drizzle: (...args: unknown[]) => mockDrizzle(...args),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { db } = require('./client') as typeof import('./client');
      expect(() => {
        void (db as unknown as Record<string, unknown>).select;
      }).toThrow('DATABASE_URL environment variable is not set');
    });
  });
});
