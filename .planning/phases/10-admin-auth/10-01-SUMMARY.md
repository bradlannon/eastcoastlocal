---
phase: 10-admin-auth
plan: 01
subsystem: auth
tags: [jwt, jose, nextjs-middleware, server-actions, httponly-cookie, sha256, web-crypto]

# Dependency graph
requires: []
provides:
  - JWT session auth for /admin routes using jose library
  - Edge-compatible middleware protecting all /admin/* except /admin/login
  - SHA-256 password hashing via Web Crypto API (no bcrypt, Edge-safe)
  - httpOnly cookie session management with 8-hour expiry
  - Login page with useActionState error display
  - Admin layout with logout button
  - Logout API route clearing session cookie
affects: [11-venue-management, 12-source-management, 13-admin-health]

# Tech tracking
tech-stack:
  added: [jose@6.2.1]
  patterns:
    - Edge-compatible JWT auth using jose SignJWT/jwtVerify
    - Web Crypto SHA-256 hash for single admin credential (no bcrypt)
    - useActionState with (prevState, formData) signature for server action form binding
    - Next.js middleware.ts at src root with config.matcher for route protection

key-files:
  created:
    - src/lib/auth.ts
    - src/middleware.ts
    - src/app/admin/login/actions.ts
    - src/app/admin/login/page.tsx
    - src/app/admin/layout.tsx
    - src/app/admin/page.tsx
    - src/app/api/auth/logout/route.ts
  modified:
    - .env.example

key-decisions:
  - "SHA-256 via Web Crypto (not bcrypt) for single-admin credential — Edge-compatible, no native dependency"
  - "jose library for JWT (not jsonwebtoken) — ESM-native, Edge runtime compatible"
  - "useActionState hook binding requires (prevState, formData) action signature in React 19"

patterns-established:
  - "Admin route protection via middleware.ts verifyToken check with redirect to /admin/login"
  - "Server actions returning { error?: string } for form error display via useActionState"
  - "httpOnly cookie set on login, deleted on logout via API route"

requirements-completed: [AUTH-01, AUTH-02]

# Metrics
duration: 18min
completed: 2026-03-14
---

# Phase 10 Plan 01: Admin Auth Summary

**JWT session auth for /admin routes using jose and Web Crypto SHA-256, with httpOnly cookie management and login/logout UI**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-03-14T18:38:25Z
- **Completed:** 2026-03-14T18:56:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Edge-compatible JWT auth using jose library with HS256 signing and 8-hour expiry
- Next.js middleware protecting all /admin/* routes, redirecting unauthenticated requests to /admin/login
- SHA-256 password hashing via Web Crypto API — no bcrypt native dependency needed for single admin credential
- Login page with useActionState error display, admin layout with logout, and dashboard placeholder

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth library, middleware, and login API** - `48a54ce` (feat)
2. **Task 2: Login page and admin layout with logout** - `503d278` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/lib/auth.ts` - JWT sign/verify (jose), SHA-256 hash/verify (Web Crypto), session constants
- `src/middleware.ts` - Next.js middleware protecting /admin/* routes via verifyToken
- `src/app/admin/login/actions.ts` - Server action: credential validation, cookie set, redirect on success
- `src/app/admin/login/page.tsx` - Login form with useActionState for error display, Tailwind card layout
- `src/app/admin/layout.tsx` - Admin nav bar with title and logout form button
- `src/app/admin/page.tsx` - Dashboard placeholder ("Admin Dashboard / Coming soon")
- `src/app/api/auth/logout/route.ts` - POST handler: delete session cookie, redirect to /admin/login
- `.env.example` - Added ADMIN_EMAIL, ADMIN_PASSWORD_HASH, JWT_SECRET

## Decisions Made
- Used SHA-256 via Web Crypto API instead of bcrypt — single known credential hashed at setup, Edge runtime compatible, no native Node.js dependency
- Used jose library instead of jsonwebtoken — ESM-native, works in Edge/Node runtimes, required for Next.js middleware
- useActionState requires `(prevState, formData)` signature in React 19 — action updated to match

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed useActionState action signature mismatch**
- **Found during:** Task 2 (login page build)
- **Issue:** The plan's action signature was `(formData: FormData)` but `useActionState` requires `(prevState, payload)` overload — build failed with type error
- **Fix:** Added `_prevState: { error?: string }` as first parameter to the `login` action
- **Files modified:** src/app/admin/login/actions.ts
- **Verification:** `npm run build` succeeded after fix
- **Committed in:** `503d278` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 type error / signature mismatch)
**Impact on plan:** Required fix for build to succeed. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in test files (route.test.ts, seed.test.ts, etc.) from v1.2 work are unrelated to this plan and out of scope. Noted in deferred-items.md.

## User Setup Required

To use admin auth, configure these environment variables:

1. Generate a SHA-256 hex hash of your password:
   ```bash
   echo -n "your-password" | shasum -a 256
   ```
2. Set in `.env.local`:
   ```
   ADMIN_EMAIL=your@email.com
   ADMIN_PASSWORD_HASH=<hex-hash-from-above>
   JWT_SECRET=<random-32+-char-string>
   ```
3. Verify by visiting `/admin` — should redirect to `/admin/login`

## Next Phase Readiness
- Auth gate is complete — all /admin/* routes require authentication
- Phase 11 (venue management), 12 (source management), and 13 (health dashboard) can be built behind this gate
- No blockers

---
*Phase: 10-admin-auth*
*Completed: 2026-03-14*
