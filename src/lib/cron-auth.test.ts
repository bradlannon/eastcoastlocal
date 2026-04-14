/**
 * Characterization tests for src/lib/cron-auth.ts
 */

import { verifyCronSecret } from './cron-auth';

const REAL_SECRET = 'supersecretcrontoken';

beforeEach(() => {
  process.env.CRON_SECRET = REAL_SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('verifyCronSecret', () => {
  it('accepts the correct Bearer token', () => {
    expect(verifyCronSecret(`Bearer ${REAL_SECRET}`)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyCronSecret('Bearer wrongsecret')).toBe(false);
  });

  it('rejects missing auth header (null)', () => {
    expect(verifyCronSecret(null)).toBe(false);
  });

  it('rejects an empty string header', () => {
    expect(verifyCronSecret('')).toBe(false);
  });

  it('rejects a token without the Bearer prefix', () => {
    expect(verifyCronSecret(REAL_SECRET)).toBe(false);
  });

  it('rejects when CRON_SECRET is not set', () => {
    delete process.env.CRON_SECRET;
    // Should return false regardless of what is passed
    expect(verifyCronSecret(`Bearer ${REAL_SECRET}`)).toBe(false);
  });

  it('rejects header with wrong length (timing-safe branch)', () => {
    // An auth header that does not match the expected length
    expect(verifyCronSecret('Bearer short')).toBe(false);
  });

  it('is timing-safe: returns false even when lengths match but content differs', () => {
    // Build a string with exact same length as the expected Bearer token
    const expected = `Bearer ${REAL_SECRET}`;
    const sameLength = 'X'.repeat(expected.length);
    expect(verifyCronSecret(sameLength)).toBe(false);
  });
});
