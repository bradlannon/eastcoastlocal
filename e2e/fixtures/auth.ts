import type { BrowserContext } from '@playwright/test';
import { SignJWT } from 'jose';

export async function signAdminJwt(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

export async function loginAsAdmin(context: BrowserContext) {
  const token = await signAdminJwt();
  await context.addCookies([
    { name: 'admin_session', value: token, domain: 'localhost', path: '/' },
  ]);
}
