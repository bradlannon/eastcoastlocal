# Requirements: East Coast Local

**Defined:** 2026-03-13
**Core Value:** Users can instantly see what live music is happening near them on a map — where, when, and who's playing

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Scraping & Data

- [ ] **SCRP-01**: System can fetch and parse HTML from configured venue website URLs
- [ ] **SCRP-02**: System uses LLM (GPT-4o mini) to extract structured event data (band, venue, date, time) from arbitrary page formats
- [ ] **SCRP-03**: System preprocesses HTML (strip scripts/styles/nav) before LLM extraction to minimize token costs
- [ ] **SCRP-04**: System rejects events with null/missing dates rather than accepting LLM-hallucinated values
- [ ] **SCRP-05**: Admin can configure a list of scrape target URLs (venue websites and event platform pages)
- [ ] **SCRP-06**: System stores events in Postgres with band/performer, venue, date, time, coordinates, and source URL
- [ ] **SCRP-07**: System deduplicates events using composite key (venue + date + normalized band name) to prevent duplicates across sources
- [ ] **SCRP-08**: System geocodes venue addresses at import time and caches coordinates on the venue record
- [ ] **SCRP-09**: System runs scheduled rescans via cron (daily minimum) without manual intervention
- [ ] **SCRP-10**: System integrates with Eventbrite/Bandsintown APIs (not scraping) for platform-sourced events

### Map & Discovery

- [ ] **MAP-01**: User can view an interactive map centered on Atlantic Canada (NB, NS, PEI, NL)
- [ ] **MAP-02**: Events display as pin clusters that show count when zoomed out and expand to individual pins when zoomed in
- [ ] **MAP-03**: User can click a map pin to see event summary (band, venue, date, time)
- [ ] **MAP-04**: User can browse events in a list view sorted by date
- [ ] **MAP-05**: User can filter events by date using quick filters (Today, This Weekend, This Week)
- [ ] **MAP-06**: User can filter events by province or city
- [ ] **MAP-07**: User can use browser geolocation to center the map on their current location ("Near me")
- [ ] **MAP-08**: User can view event detail page showing band, venue, date, time, address, and link to original source
- [ ] **MAP-09**: Map and list views are mobile-responsive and usable on phone screens

### Infrastructure

- [ ] **INFR-01**: App is deployed on Vercel with cloud-hosted Neon Postgres database
- [ ] **INFR-02**: App loads initial map view in under 3 seconds on broadband connection

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Discovery Enhancements

- **DISC-01**: User can search events by artist/band name
- **DISC-02**: Stale data indicator showing when event was last verified by rescan
- **DISC-03**: Genre filtering for events (requires reliable genre extraction)

### Operations

- **OPS-01**: Source health monitoring with alerts for scrape failures
- **OPS-02**: Admin dashboard showing scrape success rates and event counts per source
- **OPS-03**: PWA support for installable web app experience

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts / login | Public read-only app; no friction for discovery |
| Event submission by venues | Creates moderation burden; scraping-only for v1 |
| Ticket purchasing in-app | PCI compliance complexity; link out to source instead |
| AI-powered source discovery | Unpredictable crawl scope; manually curate source list |
| Non-music events | Dilutes value prop; live music focus for v1 |
| Native mobile app | Responsive web covers mobile; doubles maintenance |
| Real-time push notifications | Requires user accounts and push infrastructure |
| Artist profiles / deduplication | Significant data work; defer until proven engagement |
| Heat map visualization | Poor for sparse data (rural NL); pin clusters are better UX |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (Populated during roadmap creation) | | |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after initial definition*
