/**
 * Timing-safe CRON_SECRET validation for cron/webhook endpoints.
 */

export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron-auth] CRON_SECRET environment variable is not set');
    return false;
  }

  const expected = `Bearer ${secret}`;
  if (!authHeader || authHeader.length !== expected.length) {
    return false;
  }

  // Timing-safe comparison
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= authHeader.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
