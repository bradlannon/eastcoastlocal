# Stack Research

**Domain:** Local events discovery app with AI-powered web scraping and interactive map
**Researched:** 2026-03-13 (v1.0 baseline) | Updated: 2026-03-14 (v1.1 heatmap timelapse additions)
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

---

## v1.1 Additions: Heatmap Timelapse Mode

*Added: 2026-03-14. These libraries extend the existing stack for the time-dimension heatmap feature.*

### New Libraries for Heatmap Timelapse

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| leaflet.heat | 0.2.0 | Canvas-based heatmap layer for Leaflet | The official Leaflet-org heatmap plugin. Uses `simpleheat` (canvas 2D) under the hood. Zero dependencies beyond Leaflet itself. Exposes `L.heatLayer(points)` with `setLatLngs()` for dynamic updates — exactly the method needed to swap point sets as the timeline scrubs. Well-understood API; no third-party wrapper needed for react-leaflet 5.x. |
| @types/leaflet.heat | 0.2.5 | TypeScript types for leaflet.heat | Published September 2025 — actively maintained. Required because leaflet.heat ships no native types. |

**No wrapper library needed.** All react-leaflet heatmap wrapper packages (`react-leaflet-heatmap-layer-v3`, `react-leaflet-heat-layer`, `react-leaflet-heatmap-layer`) either target react-leaflet v3 (published 2022, peer dep `react-leaflet@^3.0.0`) or have minimal update history. The correct approach for react-leaflet 5.x is a custom component using the `useMap` hook directly — this is the pattern react-leaflet's own docs recommend for any Leaflet plugin that isn't wrapped yet.

**No new library for the scrubber UI.** The timeline scrubber is a styled `<input type="range">` with Tailwind CSS. Available scrubber packages (`react-scrubber`, `react-timeline-animation`, `react-chrono`) add dependency weight, opinionated markup, and styles to fight. A native range input handles touch, keyboard, and pointer drag without libraries. The animation loop is a `useRef`/`requestAnimationFrame` hook — no animation library needed.

**No new library for data processing.** Time-windowed filtering is a client-side `Array.filter()` over pre-fetched events. At Atlantic Canada scale (hundreds to low thousands of events over 30 days), this is instant. `date-fns` (already in stack) handles all timestamp comparison and formatting.

### Integration Pattern: Custom Heatmap Layer for react-leaflet 5.x

The react-leaflet 5.x `useMap` hook provides the Leaflet map instance inside any MapContainer descendant. The pattern:

```typescript
// components/HeatmapLayer.tsx
'use client'
import { useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.heat'

interface HeatmapLayerProps {
  points: [number, number, number][] // [lat, lng, intensity]
}

export function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap()
  const heatRef = useRef<L.HeatLayer | null>(null)

  useEffect(() => {
    if (!heatRef.current) {
      heatRef.current = (L as any).heatLayer(points, { radius: 25 }).addTo(map)
    } else {
      heatRef.current.setLatLngs(points) // no full re-render on scrub
    }
    return () => {
      heatRef.current?.remove()
      heatRef.current = null
    }
  }, [map, points])

  return null
}
```

Key detail: `setLatLngs()` on the existing layer avoids destroying and re-creating the canvas element on every timeline tick. This keeps animation smooth. Only re-mount the layer when switching modes (pin cluster ↔ heatmap).

### Installation: v1.1 Additions Only

```bash
npm install leaflet.heat
npm install -D @types/leaflet.heat
```

No other new packages required.

### Alternatives Considered for Heatmap

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| leaflet.heat (direct, no wrapper) | `react-leaflet-heat-layer@1.1.1` | Peer dep `react-leaflet>=4.0.0` is compatible with 5.x, but the wrapper adds a file indirection for a 10-line integration. Last published July 2024 — not likely to track react-leaflet 5.x API changes. Build it directly. |
| leaflet.heat (canvas) | `leaflet-webgl-heatmap` | WebGL adds a GPU dependency with no measurable benefit at Atlantic Canada data scale (hundreds of points). Canvas 2D is sufficient and universally compatible. |
| leaflet.heat (canvas) | heatmap.js + Leaflet plugin | heatmap.js is heavier (separate Leaflet plugin layer), less actively maintained as of 2025. leaflet.heat is lighter and the Leaflet-official choice. |
| Native `<input type="range">` | `react-scrubber` / `react-range` | These add dependencies, CSS fights, and bundle weight for a UI element that ships natively in every browser. A styled range input with Tailwind is 15 lines of code. |
| `requestAnimationFrame` hook | GSAP / Framer Motion | The animation is a counter incrementing a date index — this is not a spring or keyframe animation. `requestAnimationFrame` + `useRef` is the correct primitive. Zero bundle cost. |

### What NOT to Add for v1.1

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-leaflet-heatmap-layer-v3` | Published 2022, targets react-leaflet v3. Peer dep mismatch will produce warnings or silent failures in react-leaflet 5. | Custom `useMap`-based component (10 lines) |
| `react-leaflet-heat-layer` | July 2024 release, technically compatible peer deps, but thin wrapper over the same pattern. Adds an extra package to track for minimal gain. | Custom `useMap`-based component |
| `react-spring` / `framer-motion` | Overkill for a numeric counter driving a timeline position. | `requestAnimationFrame` in a `useEffect` |
| WebSocket / SSE for live updates | Heatmap is over historical event data (30-day window). No server push required — load once, filter client-side. | Static fetch on page load |
| D3.js | Only needed if building a custom SVG timeline axis with tick marks. A range input + formatted date label covers the UX need at zero cost. | Native range input + `date-fns` |

### Version Compatibility: v1.1 Additions

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| leaflet.heat@0.2.0 | leaflet@1.9.x | leaflet.heat mutates `L` as a side effect — import after leaflet. Must be a client-side import only (add `'use client'` or dynamic import with `ssr: false` in Next.js). |
| @types/leaflet.heat@0.2.5 | TypeScript 5.x, leaflet@1.9.x | Dev dependency only. Published Sept 2025 — current. Declares `L.HeatLayer` on the Leaflet namespace. |

### Data Shape for Time-Windowed Heatmap

No new server infrastructure needed. The existing events table has `event_date` and `venue_lat`/`venue_lng`. The API endpoint returns all events in the 30-day window as JSON. Client-side filtering:

```typescript
// Filter to a 24-hour window around the current timeline position
const windowedPoints = events
  .filter(e => {
    const diff = Math.abs(e.eventDate.getTime() - currentTime.getTime())
    return diff < 12 * 60 * 60 * 1000 // ±12 hours = 24h window
  })
  .map(e => [e.venueLat, e.venueLng, 1.0] as [number, number, number])
```

Atlantic Canada event volume (hundreds of events over 30 days) makes this filter instantaneous. No server-side time bucketing, no aggregation endpoint, no caching layer needed for v1.1.

---

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
- `npm info react-leaflet` — version 5.0.0 confirmed, published 2024-12-14 (HIGH confidence)
- `npm info leaflet.heat` — version 0.2.0, published 2015, zero dependencies (HIGH confidence — no newer version exists)
- `npm info @types/leaflet.heat` — version 0.2.5, published 2025-09-03 (HIGH confidence — actively maintained)
- `npm info react-leaflet-heatmap-layer-v3` — version 3.0.3-beta-1, published 2022-05-10, peer dep react-leaflet@^3.0.0 (HIGH confidence — confirmed incompatible with react-leaflet 5)
- `npm info react-leaflet-heat-layer` — version 1.1.1, published 2024-07-30, peer dep react-leaflet@>=4.0.0 (HIGH confidence — technically compatible but thin wrapper not worth the dependency)
- [react-leaflet Core Architecture docs](https://react-leaflet.js.org/docs/core-architecture/) — useMap hook pattern, createElementHook, useLayerLifecycle (HIGH confidence — official docs)
- [Leaflet.heat GitHub](https://github.com/Leaflet/Leaflet.heat) — setLatLngs() API for dynamic updates (HIGH confidence — official Leaflet org repo)

---
*Stack research for: East Coast Local — local live music discovery app*
*Researched: 2026-03-13 (baseline) | Updated: 2026-03-14 (v1.1 heatmap timelapse)*
