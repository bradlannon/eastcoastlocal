# Stack Research

**Domain:** Local events discovery app with AI-powered web scraping and interactive map
**Researched:** 2026-03-13
**Confidence:** HIGH (core framework/DB/UI), MEDIUM (AI scraping approach), MEDIUM (mapping)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.x | Full-stack React framework | The natural fit for Vercel deployment — zero-config CI/CD, ISR for map data freshness, App Router Server Components reduce client JS. Turbopack is now the stable default bundler. Vercel-made, so cron jobs, edge functions, and serverless all wire up natively. |
| React | 19.2 | UI rendering | Bundled with Next.js 16. Server Components matter here: map data fetches can run server-side, keeping client bundle lean. |
| TypeScript | 5.x | Type safety | Required for Zod schema integration with AI SDK structured output. Drizzle ORM is TypeScript-first and its type inference breaks without it. Not optional. |
| Neon Postgres | latest | Persistent event storage | Vercel's official Postgres integration partner (Vercel migrated all Vercel Postgres stores to Neon in Q4 2024). Serverless-native: scale-to-zero when idle, per-millisecond billing. PostGIS extension available for geospatial queries if needed later. Database branching pairs with Vercel preview deployments. |
| Drizzle ORM | 0.39.x | Database access layer | ~7.4KB bundle vs Prisma's ~40KB. No separate query engine binary — critical for Vercel serverless cold starts (sub-500ms vs 1–3s with Prisma). SQL-like query API keeps venue/event queries readable. Neon has a first-class Drizzle integration guide. |
| Vercel AI SDK | 5.x | LLM-powered event extraction | Official Vercel library for AI integration. `generateObject()` with Zod schemas produces typed, validated JSON from raw HTML — exactly the extraction pattern needed. Provider-agnostic: swap OpenAI for Anthropic or local models without refactoring. |
| OpenAI GPT-4o mini | latest API | LLM inference for extraction | $0.15/1M input tokens, $0.60/1M output tokens. Supports structured outputs. Sufficient for extracting band name, venue, date, time from venue website HTML. Fall back to GPT-4o for complex layouts (tables, nested structures). Batch-process scraped HTML, not real-time per user request. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-leaflet | 5.0.x | Interactive map component | Wraps Leaflet as React components. 1.4M+ npm downloads/month. Lightweight raster tile approach is right for this use case — no need for WebGL vector tiles (MapLibre) when showing static venue pins. |
| react-leaflet-cluster | 2.x | Pin clustering | Wrapper around Leaflet.markercluster. Handles cluster → individual pin expansion on zoom. Supports 10k–50k markers in Chrome. Required CSS imports must be manually added for Next.js builds. |
| Leaflet | 1.9.x | Map engine (peer dep) | Peer dependency of react-leaflet. Do not upgrade to 2.x until react-leaflet supports it. |
| Zod | 3.x | Schema validation | Define event data shape once; used by both Drizzle (table schema inference) and AI SDK (structured output schema). Single source of truth for what an "event" looks like. |
| cheerio | 1.x | HTML parsing (static pages) | jQuery-like DOM parsing for venues with plain HTML pages. Lightweight, no browser engine. Use for venues that render content server-side. Falls back to raw fetch + cheerio before sending to LLM. |
| Tailwind CSS | 4.x | Styling | shadcn/ui now ships Tailwind v4-ready components. CSS-in-file theme variables (`@theme`) replace JS config. No-config setup in Next.js 16. |
| shadcn/ui | latest | UI component primitives | Copy-paste components (not a bundled library). Event cards, filter sidebar, date pickers all available. Pairs with Tailwind v4 and React 19. Zero runtime overhead. |
| date-fns | 4.x | Date formatting/parsing | Lightweight, tree-shakable. Critical for normalizing event dates extracted from heterogeneous venue formats. Timezone-aware formatting for Atlantic time (AST/ADT). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Drizzle Kit | Schema migrations | `drizzle-kit push` for dev, `drizzle-kit generate` + `drizzle-kit migrate` for production. Use `drizzle-kit studio` for a local Neon table viewer. |
| Vercel CLI | Local dev + deployment | `vercel dev` runs cron jobs locally via direct HTTP calls to `/api/cron/*` routes. Cron jobs don't auto-fire locally — call the endpoint manually during dev. |
| ESLint + Prettier | Code quality | Next.js 16 ships with ESLint config by default. Add `eslint-plugin-drizzle` to catch common ORM misuse. |

## Installation

```bash
# Scaffold
npx create-next-app@latest eastcoastlocal --typescript --tailwind --app

# Core
npm install ai @ai-sdk/openai zod

# Database
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Map
npm install leaflet react-leaflet react-leaflet-cluster
npm install -D @types/leaflet

# HTML parsing
npm install cheerio

# Utilities
npm install date-fns

# UI (shadcn — run after tailwind setup)
npx shadcn@latest init
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Neon Postgres | Supabase | If you need built-in auth, realtime subscriptions, or edge functions. For this app (no auth, no realtime), Neon's pure Postgres + serverless scaling is simpler and cheaper. |
| Drizzle ORM | Prisma | If team is unfamiliar with SQL and prefers a fully abstracted query API. Prisma's 1–3s cold start penalty is acceptable on Pro plan with warm functions, but Drizzle is the better default for serverless. |
| react-leaflet | MapLibre GL / react-map-gl | If you need vector tiles, 3D terrain, GPU-accelerated rendering, or custom map styles. Overkill for event pins on a regional map. MapLibre also has a steeper setup cost (tile provider required). |
| react-leaflet | Mapbox GL | If you need Mapbox-specific styles or commercial tile CDN. Mapbox changed to proprietary license in 2021. MapLibre is the open-source fork if you go WebGL. |
| cheerio + fetch | Playwright / Puppeteer | If venues render event listings entirely via JavaScript (SPA). Playwright on Vercel requires `@sparticuz/chromium` to stay under the 50MB function limit; cold starts add 10–50s latency. Use only when cheerio + static fetch fails. |
| Vercel AI SDK | LangChain | LangChain adds abstraction weight and has a history of breaking API changes. For a focused extraction task (fetch HTML → extract event fields), AI SDK's `generateObject()` is simpler, better maintained, and Vercel-native. |
| OpenAI GPT-4o mini | Claude Haiku / Gemini Flash | Both are cost-competitive alternatives. AI SDK is provider-agnostic, so switching is a one-line provider import change. Start with GPT-4o mini; switch if quality or cost requires it. |
| Vercel Cron Jobs | External cron (GitHub Actions, Inngest) | Use Inngest or Trigger.dev if you need reliable retries, job queuing, or per-venue parallelism. Vercel crons have no retry on failure and ±59 min precision on Hobby. Acceptable for a daily rescan; upgrade to Pro for hourly. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `create-react-app` / Vite SPA | No server-side routes for cron endpoints or API handlers. Can't run scraping jobs. | Next.js App Router |
| Prisma on Vercel serverless | Prisma spawns a query engine binary — cold starts of 1–3s per invocation, 40KB+ bundle bloat. Incompatible with Vercel Edge Runtime. | Drizzle ORM |
| MongoDB / DynamoDB | Event data is naturally relational (venue → events → performers). JSON documents add complexity for date-range queries and location joins. | Neon Postgres |
| Google Maps API | $7/1000 map loads after free tier. For a public app with no auth, anonymous users burn the free tier fast. | Leaflet + OpenStreetMap tiles (free) |
| Playwright/Puppeteer as default scraper | 280MB+ Chromium binary exceeds Vercel's 50MB function limit without hacks. 10–50s cold starts. Use only for JS-heavy venues that cheerio can't handle. | cheerio + fetch for static HTML |
| Moment.js | 67KB minified, deprecated. | date-fns (tree-shakable, ~13KB for used functions) |
| `react-leaflet-markercluster` (old) | Unmaintained, incompatible with react-leaflet v4+. | `react-leaflet-cluster` (active fork, supports react-leaflet 5.x) |

## Stack Patterns by Variant

**If a venue uses JavaScript-rendered content (SPA/React/Vue frontend):**
- Fetch the page with Playwright + `@sparticuz/chromium` (Vercel-compatible slim Chromium)
- Run this in a separate, longer-timeout function (max 300s on Pro)
- Flag these venues in the DB so they use the headless scraper path

**If scraping Eventbrite or Bandsintown:**
- Prefer their official APIs over HTML scraping
- Eventbrite: REST API with venue + event endpoints, no LLM needed for structured data
- Bandsintown: Artist API returns structured JSON
- Use LLM extraction only for independent venues with no API

**If event volume grows beyond ~10,000 events:**
- Add PostGIS extension to Neon for `ST_DWithin` proximity queries
- Switch map tile provider from default OSM to a CDN-hosted tile service (Stadia Maps free tier: 200k tiles/month)

**If Vercel Hobby plan cron limits are too restrictive (once/day only):**
- Upgrade to Vercel Pro for per-minute cron granularity
- Or use GitHub Actions scheduled workflows as a free cron trigger that calls your `/api/cron` endpoint

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| react-leaflet@5.x | leaflet@1.9.x, React 19.x | Do NOT use leaflet@2.x — react-leaflet 5.x is not compatible yet |
| react-leaflet-cluster@2.x | react-leaflet@5.x, @react-leaflet/core@3.x | Must import cluster CSS manually in Next.js: `import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'` |
| drizzle-orm@0.39.x | @neondatabase/serverless@latest | Use Neon's serverless driver, not `pg` — avoids WebSocket issues in Vercel edge environments |
| Next.js@16.x | React@19.2, Turbopack (default) | Turbopack is now stable and default; Webpack still available via `--no-turbo` flag if needed |
| ai@5.x | @ai-sdk/openai@latest, zod@3.x | AI SDK 5 has breaking changes from v4 — do not mix versions. Check ai-sdk.dev migration guide if upgrading. |

## Cron Job Constraints (Critical for Scraping Architecture)

| Plan | Max Frequency | Timing Precision | Implication |
|------|--------------|-----------------|-------------|
| Hobby | Once per day | ±59 minutes | Sufficient for daily rescan of all venues. Cannot do hourly refreshes. |
| Pro | Once per minute | Per-minute | Enables staggered per-venue scraping jobs, retry logic. |

Design scrape jobs to be **idempotent** — Vercel may invoke a cron twice for a single scheduled execution. Upsert event records by a unique key (venue_id + event_date + performer) rather than inserting blindly.

## Sources

- [Next.js 16 blog post](https://nextjs.org/blog/next-16) — Version confirmed, Turbopack stable
- [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs) — Cron configuration
- [Vercel Cron Jobs usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby (daily) vs Pro (per-minute) limits confirmed
- [Neon for Vercel marketplace](https://vercel.com/marketplace/neon) — Official integration, confirmed Vercel Postgres migration to Neon
- [Drizzle vs Prisma 2026 comparison](https://www.bytebase.com/blog/drizzle-vs-prisma/) — Cold start benchmarks, bundle sizes
- [AI SDK Core: generateObject](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object) — Structured output API (MEDIUM confidence — AI SDK 5 just released, some docs in transition)
- [AI SDK 6 release notes](https://vercel.com/blog/ai-sdk-6) — Version and Output.object() API confirmed
- [react-leaflet-cluster npm](https://www.npmjs.com/package/react-leaflet-cluster) — React 19 / react-leaflet 5 compatibility confirmed
- [Leaflet vs MapLibre comparison](https://blog.jawg.io/maplibre-gl-vs-leaflet-choosing-the-right-tool-for-your-interactive-map/) — Raster vs vector tile tradeoffs
- [OpenAI pricing](https://openai.com/api/pricing/) — GPT-4o mini: $0.15/1M input, $0.60/1M output
- [Playwright on Vercel](https://www.zenrows.com/blog/playwright-vercel) — 50MB limit, @sparticuz/chromium workaround
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) — 1 req/sec public API limit (batch geocode at scrape time, not per user request)

---
*Stack research for: East Coast Local — local live music discovery app*
*Researched: 2026-03-13*
