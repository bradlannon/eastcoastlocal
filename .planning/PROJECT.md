# East Coast Local

## What This Is

A public-facing web app that helps people discover live music across Atlantic Canada (New Brunswick, Nova Scotia, PEI, and Newfoundland & Labrador). It uses AI-powered web scraping to automatically extract event data from venue websites and event platforms, then displays upcoming gigs on an interactive map with pin clusters that users can zoom into to find what's playing near them.

## Core Value

Users can instantly see what live music is happening near them on a map — where, when, and who's playing — without having to check dozens of individual venue websites.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] AI-powered web scraper that periodically extracts event data from configured URLs
- [ ] Configurable list of scraping targets (venue websites + event platforms like Eventbrite, Bandsintown)
- [ ] Event data storage with band/performer, venue, date, time, and location
- [ ] Interactive map (Leaflet/Mapbox) covering Atlantic Canada with pin clusters
- [ ] Pin clusters that expand into individual event pins when zoomed in
- [ ] Event detail view showing band, venue, date, time, and location
- [ ] Event listing/browse view with filtering by date and location
- [ ] Clean, intuitive public-facing UI for discovering upcoming live music
- [ ] Scheduled/periodic rescanning of sources (hands-off operation)
- [ ] Cloud deployment (Vercel or similar managed platform)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Non-music events (festivals, community events, markets) — focused on live music discovery only for v1
- AI-powered source discovery (finding new venues automatically) — too ambitious for v1, configure sources manually
- User accounts/authentication — public read-only app, no login needed
- Mobile native app — web-first, responsive design covers mobile
- Event submission by venues — scraping-only for v1
- Ticket purchasing/booking — link out to source if available

## Context

- Geographic scope: All four Atlantic Canadian provinces (NB, NS, PEI, NL)
- Event sources: Mix of individual venue websites and event platforms (Eventbrite, Bandsintown, etc.)
- Scraping approach: AI-powered extraction using LLM to parse event data from arbitrary page formats — no brittle CSS selectors
- The app should be hands-off once configured — periodic rescans happen automatically
- Public app accessible to anyone in the region
- Map uses pin clustering: pins cluster when zoomed out, expand to individual events when zoomed in

## Constraints

- **Hosting**: Cloud-hosted on Vercel or similar managed platform — no self-hosted infrastructure
- **Scraping**: Must respect robots.txt and rate limits on source websites
- **Cost**: AI extraction costs should be manageable — batch processing, not real-time per-request
- **Geography**: Must accurately geocode venues across all four Atlantic provinces

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AI-powered extraction over structured scrapers | Resilient to site redesigns, hands-off maintenance | — Pending |
| Pin clusters over heat map | More intuitive for finding specific events | — Pending |
| Live music only (no general events) | Focused scope, clear value prop for v1 | — Pending |
| No user accounts for v1 | Public read-only reduces complexity, faster to ship | — Pending |
| Cloud deployment (Vercel) | Managed platform, no infrastructure management | — Pending |

---
*Last updated: 2026-03-13 after initialization*
