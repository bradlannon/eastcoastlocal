# Phase 33: Admin Manual Triggers - Research

**Researched:** 2026-03-16
**Domain:** Next.js admin UI — client component with fetch, admin API routes, cron function invocation
**Confidence:** HIGH

## Summary

Phase 33 adds manual trigger buttons to the admin dashboard so any cron job can be invoked on demand. The implementation is small in scope: a new client component renders the "Actions" section, calls new admin API routes via `fetch`, and shows inline spinner + result toast feedback. Dashboard stats refresh via `router.refresh()` on success — the same pattern used by the existing `RefreshButton` component.

The auth question (locked as "Claude's Discretion") resolves cleanly to a new admin API route at `/api/admin/trigger/[job]/route.ts` that verifies the admin session cookie (via `verifyToken` from `src/lib/auth.ts`) rather than re-using the cron `CRON_SECRET` path. This keeps the cron endpoints as cron-only and gives the admin trigger its own authentication story matching every other admin API route.

The cron functions themselves (`runScrapeJob`, `archivePastEvents`, `runDiscoveryJob`, `runPlacesDiscovery`, `runRedditDiscovery`) are imported directly — the admin API route calls them the same way the cron routes do. No new logic, no new pipelines.

**Primary recommendation:** One admin API route file with a dynamic `[job]` segment handles all triggers. A single `TriggerActions` client component encapsulates all button/dropdown/toast logic and is embedded in `admin/page.tsx` between stat cards and Source Health table.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Buttons live on the admin dashboard page (/admin)
- New "Actions" section below the stat cards, above the Source Health table
- 3 button groups: "Run Scrape", "Run Discovery" (dropdown for sub-types), "Run Archive"
- Discovery dropdown options: Gemini Search, Reddit, Places NS, Places NB, Places PEI, Places NL
- Inline spinner on the clicked button while running
- Result toast/banner showing outcome (e.g., "Scrape complete — 142 events processed" or "Failed: timeout")
- Dashboard stats refresh automatically after a successful trigger
- If request takes >30s, show subtle warning: "Still running... (Vercel timeout at 60s)"
- If timeout occurs, show "Job may still be running on the server" rather than a hard error
- No server-side locking — allow parallel runs (endpoints are idempotent)
- Client-side disable: button disabled with spinner while awaiting response (prevents double-click)
- No guard against cron+manual overlap — upsert dedup and archive idempotency handle it

### Claude's Discretion
- Auth path implementation (admin API proxy vs direct cron endpoint call)
- Exact button styling and dropdown component choice
- Toast/banner implementation details
- Dashboard auto-refresh mechanism after trigger completes

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.1.6 (in use) | API routes + server/client components | Already in project |
| React `useState` / `useRouter` | 19.2.3 (in use) | Client-side state for spinner/toast, router.refresh() | Established pattern (RefreshButton) |
| `jose` | ^6.2.1 (in use) | JWT verification for admin session | Used in `src/lib/auth.ts` |
| Tailwind CSS | v4 (in use) | Button, spinner, toast styling | Existing admin UI uses Tailwind throughout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new needed | — | No additional libraries required | All needs met by existing stack |

**Installation:**
No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── admin/
│   │   ├── page.tsx                        # Add <TriggerActions /> between stat cards and Source Health
│   │   └── _components/
│   │       └── TriggerActions.tsx          # New: 'use client' — all trigger UI
│   └── api/
│       └── admin/
│           └── trigger/
│               └── [job]/
│                   └── route.ts            # New: POST handler, session auth, dispatch to cron fn
```

### Pattern 1: Admin API Route with Session Auth

**What:** POST to `/api/admin/trigger/[job]` where `job` is one of `scrape | archive | discover | discover-reddit | discover-places-ns | discover-places-nb | discover-places-pei | discover-places-nl`. Route reads session cookie, calls `verifyToken`, then imports and calls the appropriate cron function directly.

**When to use:** When the caller is an authenticated admin browser session (not Vercel cron scheduler). Keeps cron secret out of browser, reuses existing session auth.

**Why not call cron routes directly:** Cron routes require `CRON_SECRET` in an auth header — exposing that value to browser fetch is a security anti-pattern. The cron secret is for Vercel's scheduler, not browser clients.

**Example:**
```typescript
// Source: src/app/api/admin/trigger/[job]/route.ts
import { cookies } from 'next/headers';
import { verifyToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ job: string }> }
): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { job } = await params;

  switch (job) {
    case 'scrape': {
      const { runScrapeJob } = await import('@/lib/scraper/orchestrator');
      await runScrapeJob();
      return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
    }
    case 'archive': {
      const { archivePastEvents } = await import('@/lib/archiver');
      const result = await archivePastEvents();
      return NextResponse.json({ success: true, archived: result.total, timestamp: new Date().toISOString() });
    }
    // ... discover variants
    default:
      return NextResponse.json({ success: false, error: 'Unknown job' }, { status: 400 });
  }
}
```

### Pattern 2: TriggerActions Client Component

**What:** Single `'use client'` component with per-button `isRunning` boolean state and a shared `result` state for the toast. Calls `/api/admin/trigger/[job]` via `fetch`. On success calls `router.refresh()`. Discovery group uses an HTML `<select>` or equivalent for the sub-type.

**When to use:** Any admin dashboard needs inline async action feedback.

**Example:**
```typescript
// Source: Based on RefreshButton.tsx pattern (src/app/admin/_components/RefreshButton.tsx)
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type JobResult = { success: boolean; message: string } | null;

export default function TriggerActions() {
  const router = useRouter();
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult>(null);
  const [discoveryJob, setDiscoveryJob] = useState('discover');

  async function trigger(job: string) {
    setRunningJob(job);
    setResult(null);
    const startTime = Date.now();

    // Show "still running" warning after 30s
    const warningTimer = setTimeout(() => {
      setResult({ success: true, message: 'Still running... (Vercel timeout at 60s)' });
    }, 30_000);

    try {
      const res = await fetch(`/api/admin/trigger/${job}`, { method: 'POST' });
      clearTimeout(warningTimer);
      const body = await res.json();
      if (body.success) {
        const msg = formatSuccessMessage(job, body);
        setResult({ success: true, message: msg });
        router.refresh();
      } else {
        setResult({ success: false, message: `Failed: ${body.error}` });
      }
    } catch (err) {
      clearTimeout(warningTimer);
      const elapsed = Date.now() - startTime;
      if (elapsed >= 58_000) {
        setResult({ success: false, message: 'Job may still be running on the server' });
      } else {
        setResult({ success: false, message: `Failed: ${String(err)}` });
      }
    } finally {
      setRunningJob(null);
    }
  }

  // ...render buttons
}
```

### Pattern 3: Dashboard Auto-Refresh

**What:** After a successful trigger, call `router.refresh()` from `next/navigation`. This re-runs the server component data fetch on the admin dashboard page, updating stat cards without a full page reload.

**Why it works:** `router.refresh()` is already used by `RefreshButton.tsx` for exactly this purpose. No additional mechanism needed.

### Recommended Button Styling (matching existing admin UI)

```
Primary action button:  px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
Spinner (inline):       animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full
Toast (success):        bg-green-50 border border-green-200 text-green-800 text-sm rounded-md px-4 py-2
Toast (error):          bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-2
Toast (warning):        bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-md px-4 py-2
```

### Anti-Patterns to Avoid
- **Calling cron routes from browser:** Cron routes use `CRON_SECRET` auth — exposing the secret in browser fetch calls is wrong. Use an admin API route with session auth instead.
- **Server action for long-running jobs:** Next.js server actions have the same Vercel timeout ceiling as route handlers but add extra complexity. Use a POST route handler.
- **Global spinner state shared across all buttons:** Each button tracks its own `isRunning` state independently so multiple triggers can be conceptually distinguished in the UI.
- **No toast auto-dismiss:** Toasts should auto-clear after ~5 seconds or on next trigger to avoid stale result confusion.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Admin session verification | Custom cookie parser | `verifyToken` + `SESSION_COOKIE_NAME` from `@/lib/auth` | Already tested, used in middleware |
| Dashboard data refresh | Manual fetch to re-query DB | `router.refresh()` from `next/navigation` | Triggers server component re-render, identical to RefreshButton pattern |
| Spinner animation | Custom CSS keyframes | Tailwind `animate-spin` | Already in Tailwind config |
| Job dispatch logic | New orchestration layer | Direct import of existing cron functions | They're already exported and callable |

---

## Common Pitfalls

### Pitfall 1: Vercel 60s Timeout on Hobby Plan
**What goes wrong:** Scrape job (`maxDuration = 60`) or discovery jobs can approach or hit the 60-second Vercel function limit. `fetch` from the browser will see a network error when the function times out mid-execution.
**Why it happens:** Vercel terminates functions at `maxDuration`. The browser sees an aborted connection, not a 500 response.
**How to avoid:** The 30s warning timer + elapsed time check on catch correctly handles this. The admin trigger route should also set `export const maxDuration = 60`.
**Warning signs:** `fetch` catch block firing with TypeError/network error after ~60 seconds.

### Pitfall 2: `params` is a Promise in Next.js 15+
**What goes wrong:** Dynamic route segments (`[job]`) in Next.js App Router (v15+) have async `params`. Accessing `params.job` directly (without `await`) returns `undefined`.
**Why it happens:** Next.js 16 (in use here) requires `await params` before destructuring.
**How to avoid:** Use `const { job } = await params;` in the route handler signature.
**Warning signs:** `job` is `undefined`, switch falls to default, returns 400.

### Pitfall 3: `router.refresh()` Race Condition
**What goes wrong:** Calling `router.refresh()` immediately while the toast state is being set can cause the server component to re-render before the client has shown any feedback.
**Why it happens:** `router.refresh()` is non-blocking and triggers a background re-fetch.
**How to avoid:** Set `result` state before calling `router.refresh()` — React batches state updates so both apply before the next render, and `router.refresh()` is async enough that the toast always renders first in practice.
**Warning signs:** Toast flickers or disappears immediately after trigger.

### Pitfall 4: Discovery Sub-type Mapping
**What goes wrong:** The dropdown labels ("Gemini Search", "Reddit", "Places NS", etc.) must map to the correct job identifiers for the API route switch statement.
**Why it happens:** Mismatch between display names and route param values.
**How to avoid:** Define a typed constant map in the component:
```typescript
const DISCOVERY_OPTIONS = [
  { label: 'Gemini Search', job: 'discover' },
  { label: 'Reddit', job: 'discover-reddit' },
  { label: 'Places NS', job: 'discover-places-ns' },
  { label: 'Places NB', job: 'discover-places-nb' },
  { label: 'Places PEI', job: 'discover-places-pei' },
  { label: 'Places NL', job: 'discover-places-nl' },
] as const;
```
**Warning signs:** 400 response from the trigger route.

### Pitfall 5: Success Message Shapes Differ Per Job
**What goes wrong:** Scrape returns `{ success, timestamp }` (no count). Archive returns `{ success, archived, timestamp }`. Discovery routes return `{ success, candidatesFound, autoApproved, queuedPending, errors, timestamp }`.
**Why it happens:** Each cron function returns different data.
**How to avoid:** Write a `formatSuccessMessage(job, body)` helper that handles each shape:
- scrape: "Scrape complete"
- archive: `Archived ${body.archived} events`
- discover*: `Discovery complete — ${body.candidatesFound} found, ${body.autoApproved} approved`

---

## Code Examples

### Existing RefreshButton Pattern (router.refresh)
```typescript
// Source: src/app/admin/_components/RefreshButton.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  function handleRefresh() {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 1000);
  }
  // ...
}
```

### Existing Cron Auth Pattern
```typescript
// Source: src/app/api/cron/scrape/route.ts
const authHeader = request.headers.get('authorization');
const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
if (authHeader !== expectedToken) {
  return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}
```

### Admin Session Auth Pattern (for new trigger route)
```typescript
// Source: src/middleware.ts + src/lib/auth.ts patterns
import { cookies } from 'next/headers';
import { verifyToken, SESSION_COOKIE_NAME } from '@/lib/auth';

const cookieStore = await cookies();
const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
if (!token || !(await verifyToken(token))) {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}
```

### Archive Result Shape
```typescript
// Source: src/app/api/cron/archive/route.ts
const result = await archivePastEvents();
// result.total — number of events archived
```

### Discovery Result Shape (discover route)
```typescript
// Source: src/app/api/cron/discover/route.ts
const result = await runDiscoveryJob();
// result.candidatesFound, result.autoApproved, result.queuedPending, result.errors
```

### Places Discovery Result Shape
```typescript
// Source: src/app/api/cron/discover-places-ns/route.ts
const result = await runPlacesDiscovery(PLACES_CITIES.NS);
// result.candidatesFound, result.autoApproved, result.stagedPending, result.enriched, result.errors
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router API routes (`pages/api/`) | App Router route handlers (`app/api/`) | Next.js 13 | Route handlers use `Request`/`Response` web APIs |
| Static `params` in route handlers | Async `params` (Promise) | Next.js 15 | Must `await params` before destructuring |
| `getServerSideProps` for admin pages | Server components query DB directly | Phase 30 decision | Admin pages fetch from DB, not internal API |

---

## Open Questions

1. **Does `runScrapeJob` return a result with event counts?**
   - What we know: The scrape cron route calls `await runScrapeJob()` and ignores the return value — it returns `undefined` in tests.
   - What's unclear: Whether `runScrapeJob` returns any structured result (events processed count) that could enrich the success toast.
   - Recommendation: Inspect `src/lib/scraper/orchestrator.ts` before implementing the toast message. If no count is returned, the scrape toast reads "Scrape complete" (no number). Low-risk either way.

2. **Does Places discovery use the same result shape for all provinces?**
   - What we know: NS route uses `result.stagedPending` (not `queuedPending`). The field name differs from the `discover` route.
   - What's unclear: Whether NB/PEI/NL routes use the same shape (likely yes — they call the same `runPlacesDiscovery` function).
   - Recommendation: Verify the other three places routes before writing the formatSuccessMessage helper. Likely all use `stagedPending`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest |
| Config file | `jest.config.ts` |
| Quick run command | `npx jest src/app/api/admin/trigger --testPathPattern trigger` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map

No formal requirement IDs for this phase. Mapping by behavior:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Trigger route returns 401 without session | unit | `npx jest src/app/api/admin/trigger` | ❌ Wave 0 |
| Trigger route dispatches to correct cron function | unit | `npx jest src/app/api/admin/trigger` | ❌ Wave 0 |
| Trigger route returns correct response shape per job | unit | `npx jest src/app/api/admin/trigger` | ❌ Wave 0 |
| Trigger route returns 400 for unknown job | unit | `npx jest src/app/api/admin/trigger` | ❌ Wave 0 |
| Trigger route returns 500 when cron function throws | unit | `npx jest src/app/api/admin/trigger` | ❌ Wave 0 |
| TriggerActions component renders buttons | manual/visual | — | manual only |
| Dashboard stats refresh after success | manual/visual | — | manual only |
| 30s warning banner appears | manual/visual | — | manual only |

### Sampling Rate
- **Per task commit:** `npx jest src/app/api/admin/trigger`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/app/api/admin/trigger/[job]/route.test.ts` — covers auth, dispatch, response shapes, error paths

*(No framework install needed — Jest already configured)*

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/app/api/cron/scrape/route.ts`, `archive/route.ts`, `discover/route.ts`, `discover-places-ns/route.ts`, `discover-reddit/route.ts`
- Direct code inspection: `src/app/admin/page.tsx`, `src/app/admin/_components/RefreshButton.tsx`
- Direct code inspection: `src/lib/auth.ts`, `src/middleware.ts`
- Direct code inspection: `package.json`, `jest.config.ts`

### Secondary (MEDIUM confidence)
- Next.js 15 async params pattern — from known breaking change in Next.js 15 release (project uses Next.js 16.1.6)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — patterns directly observed in existing codebase
- Pitfalls: HIGH — verified from actual code shapes (params async, result shape differences)
- Validation: HIGH — Jest already configured; test file gap clearly identified

**Research date:** 2026-03-16
**Valid until:** 2026-06-16 (stable stack)
