/**
 * Characterization tests for src/lib/rate-limit.ts
 * Uses jest.useFakeTimers() to control window resets.
 */

// The module keeps an internal Map at module scope. To get clean state
// between describe blocks we re-require the module after flushing timers.
// The simplest approach: use unique keys per test to avoid cross-test leakage.

import { rateLimit, getClientIp } from './rate-limit';

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('rateLimit — under the limit', () => {
  it('allows the first request', () => {
    const result = rateLimit('key-under-1', { maxRequests: 5, windowMs: 3_600_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('allows requests up to maxRequests', () => {
    const key = 'key-up-to-max';
    for (let i = 0; i < 3; i++) {
      const r = rateLimit(key, { maxRequests: 3, windowMs: 3_600_000 });
      expect(r.allowed).toBe(true);
    }
  });

  it('remaining decrements with each request', () => {
    const key = 'key-remaining-dec';
    const r1 = rateLimit(key, { maxRequests: 5, windowMs: 3_600_000 });
    const r2 = rateLimit(key, { maxRequests: 5, windowMs: 3_600_000 });
    expect(r1.remaining).toBe(4);
    expect(r2.remaining).toBe(3);
  });

  it('resetAt is in the future', () => {
    const now = Date.now();
    const result = rateLimit('key-reset-future', { maxRequests: 5, windowMs: 3_600_000 });
    expect(result.resetAt).toBeGreaterThan(now);
  });
});

describe('rateLimit — over the limit', () => {
  it('blocks requests beyond maxRequests', () => {
    const key = 'key-block-over';
    for (let i = 0; i < 3; i++) rateLimit(key, { maxRequests: 3, windowMs: 3_600_000 });
    const blocked = rateLimit(key, { maxRequests: 3, windowMs: 3_600_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('remaining never goes below 0', () => {
    const key = 'key-remaining-floor';
    for (let i = 0; i < 10; i++) rateLimit(key, { maxRequests: 2, windowMs: 3_600_000 });
    const r = rateLimit(key, { maxRequests: 2, windowMs: 3_600_000 });
    expect(r.remaining).toBe(0);
  });
});

describe('rateLimit — window reset', () => {
  it('allows requests again after the window expires', () => {
    const key = 'key-window-reset';
    const windowMs = 60_000;
    // Exhaust the limit
    for (let i = 0; i < 2; i++) rateLimit(key, { maxRequests: 2, windowMs });
    const blocked = rateLimit(key, { maxRequests: 2, windowMs });
    expect(blocked.allowed).toBe(false);

    // Advance time past the window
    jest.advanceTimersByTime(windowMs + 1);

    const reset = rateLimit(key, { maxRequests: 2, windowMs });
    expect(reset.allowed).toBe(true);
    expect(reset.remaining).toBe(1);
  });
});

describe('rateLimit — distinct keys are isolated', () => {
  it('does not share state between different keys', () => {
    const keyA = 'isolated-key-A';
    const keyB = 'isolated-key-B';
    // Exhaust keyA
    for (let i = 0; i < 3; i++) rateLimit(keyA, { maxRequests: 3, windowMs: 3_600_000 });
    const blockedA = rateLimit(keyA, { maxRequests: 3, windowMs: 3_600_000 });
    expect(blockedA.allowed).toBe(false);

    // keyB should still be fresh
    const allowedB = rateLimit(keyB, { maxRequests: 3, windowMs: 3_600_000 });
    expect(allowedB.allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  it('returns the first IP from x-forwarded-for', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-real-ip': '9.9.9.9' },
    });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it("returns 'unknown' when no IP headers are present", () => {
    const req = new Request('http://localhost/');
    expect(getClientIp(req)).toBe('unknown');
  });
});
