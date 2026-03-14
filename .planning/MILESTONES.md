# Milestones

## v1.1 Heatmap Timelapse (Shipped: 2026-03-14)

**Phases completed:** 2 phases, 6 plans
**Timeline:** 1 day (2026-03-14)
**Stats:** 5,108 LOC TypeScript, 48 tests, 10 new/modified files, 1,179 lines added

**Key accomplishments:**
- Pure timelapse utility functions with 48 unit tests (time windowing, venue heat points, 6-hour block naming, Haversine spatial proximity)
- HeatmapLayer component with leaflet.heat integration, dynamic intensity scaling for sparse data, and blue-to-red gradient
- TimelineBar scrubber with frosted glass overlay, play/pause animation at ~1s/step, 24-hour rolling window across 30 days
- Mode toggle between pin clusters and heatmap timelapse with viewport preservation and province filter support
- Click-through from heatmap hotspots with multi-venue grouped popups filtered to current time window
- Toggleable venue pins in heatmap mode synced to current 24-hour time window

---

## v1.0 MVP (Shipped: 2026-03-14)

**Phases completed:** 3 phases, 8 plans
**Timeline:** 2 days (2026-03-13 → 2026-03-14)
**Stats:** 3,521 LOC TypeScript, 77 tests, 105 files

**Key accomplishments:**
- Next.js 16 project on Vercel with Neon Postgres, Drizzle ORM, and 5 seeded Atlantic Canada venues
- AI-powered scraping pipeline using Gemini LLM with confidence scoring, geocoding, and composite key deduplication
- Eventbrite and Bandsintown API integrations with Atlantic Canada region filtering
- Daily automated cron scraping with per-source error isolation
- Interactive Leaflet map with clustered venue pins, split-screen layout, and real-time viewport-synced event list
- Date/province filters with URL persistence, geolocation, cross-highlight, and shareable event detail pages

---

