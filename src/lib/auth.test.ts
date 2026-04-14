/**
 * Characterization tests for src/lib/auth.ts
 *
 * jose is ESM-only; we fully mock it so ts-jest never parses jose's ESM source.
 * The mock implements just enough of SignJWT and jwtVerify to let the real auth
 * functions run through both valid and error paths.
 */

// ---- jose mock (must come before any imports that load auth.ts) ----
const SECRET_PLACEHOLDER = '__MOCK_SECRET__';

// Minimal JWT builder that produces a valid-looking token payload
function buildToken(payload: Record<string, unknown>, secret: Uint8Array, expireSecs?: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat, ...(expireSecs !== undefined ? { exp: iat + expireSecs } : {}) };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  // Fake "signature": base64(secret-hex + "." + header + "." + body)
  const sig = Buffer.from(Buffer.from(secret).toString('hex') + ':' + header + '.' + body).toString('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token: string, secret: Uint8Array): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [header, body, sig] = parts;
  const expectedSig = Buffer.from(Buffer.from(secret).toString('hex') + ':' + header + '.' + body).toString('base64url');
  if (sig !== expectedSig) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && payload.exp < now) throw new Error('Token expired');
  return payload;
}

jest.mock('jose', () => {
  return {
    SignJWT: class MockSignJWT {
      private _payload: Record<string, unknown>;
      private _header: Record<string, unknown> = {};
      private _exp?: number;
      private _iat?: boolean;
      constructor(payload: Record<string, unknown>) { this._payload = payload; }
      setProtectedHeader(h: Record<string, unknown>) { this._header = h; return this; }
      setIssuedAt() { this._iat = true; return this; }
      setExpirationTime(t: string) {
        if (t === '-1s') { this._exp = -1; }
        else if (t.endsWith('h')) { this._exp = parseInt(t) * 3600; }
        else if (t.endsWith('s')) { this._exp = parseInt(t); }
        else { this._exp = 3600; }
        return this;
      }
      async sign(secret: Uint8Array) {
        return buildToken(this._payload, secret, this._exp);
      }
    },
    jwtVerify: async (token: string, secret: Uint8Array) => {
      const payload = verifyToken(token, secret);
      return { payload };
    },
  };
});
// ---- end mock ----

import {
  signToken,
  verifyToken as authVerifyToken,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE_NAME,
  SESSION_DURATION,
  ADMIN_EMAIL,
  ADMIN_PASSWORD_HASH,
} from './auth';

const SECRET = 'x'.repeat(32);

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

describe('constants', () => {
  it('SESSION_COOKIE_NAME is admin_session', () => {
    expect(SESSION_COOKIE_NAME).toBe('admin_session');
  });

  it('SESSION_DURATION is 8 hours in seconds', () => {
    expect(SESSION_DURATION).toBe(8 * 60 * 60);
  });

  it('ADMIN_EMAIL is a string', () => {
    expect(typeof ADMIN_EMAIL).toBe('string');
  });

  it('ADMIN_PASSWORD_HASH is a string', () => {
    expect(typeof ADMIN_PASSWORD_HASH).toBe('string');
  });
});

describe('signToken / verifyToken', () => {
  it('produces a three-part JWT string', async () => {
    const token = await signToken();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  it('verifies a freshly-signed token as true', async () => {
    const token = await signToken();
    await expect(authVerifyToken(token)).resolves.toBe(true);
  });

  it('returns false for a tampered / invalid token', async () => {
    await expect(authVerifyToken('bad.jwt.here')).resolves.toBe(false);
  });

  it('returns false for an empty token', async () => {
    await expect(authVerifyToken('')).resolves.toBe(false);
  });

  it('returns false for an expired token', async () => {
    // Build a token with -1s expiry via the mock SignJWT
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(SECRET);
    const expired = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(secret);
    await expect(authVerifyToken(expired)).resolves.toBe(false);
  });

  it('throws when JWT_SECRET is not set', async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      await expect(signToken()).rejects.toThrow('JWT_SECRET');
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
});

describe('hashPassword / verifyPassword — PBKDF2 (salt:hash format)', () => {
  it('produces a salt:hash formatted string', async () => {
    const hashed = await hashPassword('mypassword');
    expect(hashed).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it('verifies the correct password', async () => {
    const hashed = await hashPassword('correct-horse');
    await expect(verifyPassword('correct-horse', hashed)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hashed = await hashPassword('correct');
    await expect(verifyPassword('wrong', hashed)).resolves.toBe(false);
  });

  it('produces different hashes for same password (random salt)', async () => {
    const h1 = await hashPassword('same');
    const h2 = await hashPassword('same');
    expect(h1).not.toBe(h2);
  });
});

describe('verifyPassword — legacy SHA-256 path (plain hex, no colon)', () => {
  async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  it('verifies correct password against legacy hash', async () => {
    const legacyHash = await sha256Hex('legacypass');
    await expect(verifyPassword('legacypass', legacyHash)).resolves.toBe(true);
  });

  it('rejects wrong password against legacy hash', async () => {
    const legacyHash = await sha256Hex('rightpass');
    await expect(verifyPassword('wrongpass', legacyHash)).resolves.toBe(false);
  });
});
