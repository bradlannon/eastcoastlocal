# Feature Research

**Domain:** Local events discovery / live music finder (Atlantic Canada)
**Researched:** 2026-03-13
**Confidence:** MEDIUM-HIGH (informed by competitor analysis and UX research; Atlantic Canada specifics are LOW confidence due to limited regional data)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Event list / browse view | Primary mode of discovery for most users; maps alone are not enough | LOW | Sorted by date by default; card format showing band, venue, date, time |
| Event detail page | Users need full info before committing to attend | LOW | Band/performer, venue name, address, date, time, link to source/tickets |
| Interactive map view | The core differentiator of this app — users expect it to work | MEDIUM | Leaflet or Mapbox; clustering required for usability at province scale |
| Pin clustering | Without clustering, a map with hundreds of events is unusable | MEDIUM | Supercluster or Leaflet.markercluster; count badge on cluster |
| Date filtering | "What's on this weekend?" is the #1 user question | LOW | Quick filters: Today, This Weekend, This Week, + date range picker |
| Location / city filtering | Atlantic Canada spans 4 provinces; users want nearby events | LOW | Filter by province, city, or radius from current location |
| Mobile-responsive UI | Most event discovery happens on phones; this is not optional | LOW | Responsive layout; map and list both usable on small screens |
| Fast initial load | Maps with slow load lose users immediately | MEDIUM | Lazy load map tiles; paginate or limit event list; preload critical data |
| Source link / ticket link | Users want to buy tickets or get full details from source | LOW | Link out to venue site or Eventbrite; no in-app purchase needed |
| Venue name + location display | Core data — users won't attend if they don't know where | LOW | Display on card and map pin tooltip |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-powered scraping (LLM extraction) | Resilient to site redesigns; covers venues that don't publish structured data; far lower maintenance than CSS-selector scrapers | HIGH | Use LLM (GPT-4o, Claude) to extract structured event data from arbitrary HTML; output: band, venue, date, time, location; falls back gracefully on parse failure |
| Atlantic Canada geographic focus | National platforms (Bandsintown, Songkick) have poor coverage of NB/NS/PEI/NL small venues; a hyper-local product fills a real gap | LOW | Focused coverage is the value prop — don't dilute it with national content |
| Hands-off operation (scheduled rescanning) | Competitors require manual artist/venue registration; this scrapes automatically | MEDIUM | Cron jobs or scheduled functions rescanning configured URLs; no manual re-entry |
| Configurable source list | Allows expanding coverage without code changes; admin can add new venues | LOW | Config file or admin UI listing scrape targets; not AI-discovered (out of scope v1) |
| Multi-province map view | No existing product shows all 4 Atlantic provinces on one live music map | LOW | Default map extent covers NB, NS, PEI, NL; provinces visually distinct |
| Accurate geocoding of regional venues | National geocoders sometimes miss or misplace Atlantic Canada addresses | MEDIUM | Use Google Maps Geocoding API or Nominatim; store coordinates at import time; manually correct notable misses |
| "What's on near me" via geolocation | Browser geolocation to center map and filter list | LOW | navigator.geolocation; fallback to province-level default |
| Stale data indicator | Shows when an event listing was last verified; builds trust | LOW | Display "last checked" timestamp; flag events not re-confirmed in 7+ days |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| User accounts / login | Allows saves, preferences, notifications | Adds auth infrastructure, GDPR/privacy obligations, support burden; core value is public discovery with no friction | Keep app fully public; no login needed for v1 |
| Event submission by venues | More data, crowd-sourced accuracy | Creates moderation burden; inconsistent data quality; venues will spam or submit duplicates | Scraping-only; if a venue isn't scraped, add it to the config list |
| Ticket purchasing in-app | Revenue opportunity, convenience | Payment PCI compliance, liability, relationship with ticket agencies; not your core competency | Link out to source; let venue/Eventbrite handle transactions |
| AI-powered source discovery (finding new venues automatically) | Expand coverage without manual config | Unpredictable crawl scope; can hit unintended sites; scraping ethics risk; high cost | Manually curate source list; community can suggest venues via a simple form |
| Real-time event updates / push notifications | Users want to know immediately | Requires WebSockets or push infrastructure, device permissions UX, user accounts; adds significant complexity | Periodic rescan (nightly/hourly) is sufficient for event discovery |
| User reviews / ratings | Social proof, engagement | Moderation needed; venue relationships damaged; content quality degrades; no-login app can't support this | Let source link carry review context (Yelp, Google) |
| Non-music events (festivals, markets, community) | More content = more users | Dilutes value prop; complicates data model; increases scrape targets and maintenance | Strict live music focus for v1; expand scope only after validating core |
| Native mobile app (iOS/Android) | Better mobile experience | Doubles maintenance; app store approval friction; update delays; responsive web is sufficient | Responsive web app with PWA if needed later |
| Heat map instead of pin clusters | "Cool" visualization | Hides individual event info; harder to interact with; poor for sparse data (rural NL) | Pin clusters: count visible, expandable on zoom, standard UX pattern |
| Genre filtering | Useful for power users | Requires genre tagging; LLM extraction of genre is unreliable; sparse data in small regions makes genre lists feel empty | Defer until corpus is large enough to make genre browsing meaningful |
| Artist profiles / artist pages | Discovery by artist name | Requires deduplication across scrape sources ("Matt Mays" vs "Matt Mays & El Torpedo"); significant data cleaning work | Show artist name on event card; search by artist name if added later |

---

## Feature Dependencies

```
[Interactive Map View]
    └──requires──> [Event Data Storage with Coordinates]
                       └──requires──> [AI-Powered Scraping]
                                          └──requires──> [Configurable Source List]
                       └──requires──> [Geocoding of Venue Addresses]

[Event List / Browse View]
    └──requires──> [Event Data Storage]
    └──enhanced by──> [Date Filtering]
    └──enhanced by──> [Location / City Filtering]

[Pin Clustering]
    └──requires──> [Interactive Map View]
    └──requires──> [Multiple Events with Coordinates]

[Event Detail Page]
    └──requires──> [Event Data Storage]
    └──enhanced by──> [Source Link / Ticket Link]

[Hands-Off Operation]
    └──requires──> [Scheduled Rescan Jobs]
    └──requires──> [Configurable Source List]
    └──enhanced by──> [Stale Data Indicator]

["What's On Near Me"]
    └──requires──> [Location / City Filtering]
    └──enhanced by──> [Browser Geolocation]
    └──requires──> [Geocoded Venue Coordinates]
```

### Dependency Notes

- **AI-Powered Scraping requires Configurable Source List:** Without knowing where to scrape, the scraper has nothing to target. Source list is foundational.
- **Map requires Geocoded Coordinates:** Events must have lat/lng stored at import time. Geocoding at render time is too slow and too costly.
- **Pin Clustering requires enough data:** Clustering is only meaningful when multiple events exist in proximity. For sparse provinces (PEI, NL), individual pins may be the norm early on.
- **Hands-off operation depends on scheduled jobs:** Vercel cron jobs or a separate scheduler (e.g., GitHub Actions, Upstash) must be configured to trigger rescans.
- **Stale Data Indicator enhances trust:** Without it, users don't know if an event listing is current. Last-scraped timestamp is low effort, high trust value.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] AI-powered scraper that extracts event data from configured URLs — core value, nothing works without it
- [ ] Configurable source list (venue websites + Eventbrite/Bandsintown pages) — controls what gets scraped
- [ ] Event data storage (band, venue, date, time, coordinates) — feeds both map and list
- [ ] Interactive map with pin clustering across Atlantic Canada — the primary differentiator
- [ ] Event list / browse view with date filtering — required fallback for non-map users and mobile
- [ ] Event detail view (band, venue, date, time, source link) — users must be able to act on what they find
- [ ] Scheduled periodic rescan (nightly or 6-hourly) — makes the app hands-off after setup
- [ ] Mobile-responsive UI — most discovery happens on phones

### Add After Validation (v1.x)

Features to add once core is working and real usage patterns are visible.

- [ ] Location / city / province filter — add when enough events exist across multiple areas to make filtering valuable
- [ ] "What's on near me" geolocation — add when mobile usage is confirmed significant
- [ ] Stale data indicator — add when users start asking "is this current?"
- [ ] Search by artist name — add when users report frustration not finding specific artists

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Genre filtering — defer until event corpus is large enough and genre tagging is reliable
- [ ] Artist profiles / deduplication — significant data work; only worthwhile with proven engagement
- [ ] PWA / installable web app — defer until mobile usage justifies the effort
- [ ] Venue-suggested corrections — defer until data quality issues are documented at scale

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| AI-powered scraping | HIGH | HIGH | P1 |
| Configurable source list | HIGH | LOW | P1 |
| Event data storage | HIGH | LOW | P1 |
| Interactive map with clustering | HIGH | MEDIUM | P1 |
| Event list with date filter | HIGH | LOW | P1 |
| Event detail view | HIGH | LOW | P1 |
| Scheduled rescan | HIGH | MEDIUM | P1 |
| Mobile-responsive UI | HIGH | LOW | P1 |
| Location / city filter | MEDIUM | LOW | P2 |
| Geolocation "near me" | MEDIUM | LOW | P2 |
| Stale data indicator | MEDIUM | LOW | P2 |
| Artist name search | MEDIUM | MEDIUM | P2 |
| Genre filtering | LOW | HIGH | P3 |
| Artist profiles | LOW | HIGH | P3 |
| PWA / installable | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Bandsintown | Songkick | Eventbrite | East Coast Local (plan) |
|---------|-------------|----------|------------|------------------------|
| Atlantic Canada small venues | Poor — artist-driven, misses local bars | Poor — same limitation | Partial — venues must register | Full coverage via scraping |
| Map view | No | No | Basic | Primary interface, clustered |
| Data source | Artist self-registration | Tour announcements + indexing | Venue/promoter registration | AI scraping of venue sites |
| Hands-off operation | No — artists must post | Partial | No | Yes — periodic rescan |
| Login required | Yes | Yes | Optional | No — fully public |
| Mobile app | Yes (iOS/Android) | Yes | Yes | Web (responsive) |
| Date filtering | Yes | Yes | Yes | Yes |
| Ticket purchasing | Links out | Links out | In-app | Links out |
| Regional focus | Global | Global | Global | Atlantic Canada only |
| Update frequency | When artist posts | When announced | When organizer posts | Scheduled rescan |

---

## Sources

- [AllEvents 2026 Roadmap: Event Discovery and Personalization](https://allevents.in/blog/allevents-2026-event-discovery-roadmap/)
- [Improving Event Discovery on Gametime — UX Case Study](https://uxdesign.cc/improving-event-discovery-on-gametime-a-ux-case-study-93279873650b)
- [Clustering Millions of Points on a Map with Supercluster — Mapbox](https://blog.mapbox.com/clustering-millions-of-points-on-a-map-with-supercluster-272046ec5c97)
- [Leaflet or Mapbox? Choosing the Right Tool for Interactive Maps](https://medium.com/visarsoft-blog/leaflet-or-mapbox-choosing-the-right-tool-for-interactive-maps-53dea7cc3c40)
- [LLM Web Scraping: How AI Models Replace Scrapers — ScrapeGraphAI](https://scrapegraphai.com/blog/llm-web-scraping)
- [Top 7 AI-Powered Web Scraping Solutions in 2025 — Firecrawl](https://www.firecrawl.dev/blog/ai-powered-web-scraping-solutions-2025)
- [Best Live Music Discovery Platforms 2026 — OneToWatch](https://resources.onestowatch.com/best-live-music-discovery-platforms/)
- [Bandsintown Review — Music Gateway](https://www.musicgateway.com/blog/music-business/bandsintown-review-what-is-bandsintown-how-does-it-work)
- [Top Event Listing Platforms: Bandsintown, Spotify, Songkick](https://undergroundhiphopblog.com/news/maximizing-exposure-the-crucial-role-of-bandintown-spotify-and-songkick-for-artists-and-promoters/)
- [Build a Local Event App — Comprehensive Guide 2025](https://clockwise.software/blog/how-to-build-local-event-app-like-eventbrite/)
- [The Most Popular Date Filter UI Patterns](https://evolvingweb.com/blog/most-popular-date-filter-ui-patterns-and-how-decide-each-one)
- [Web Scraping Best Practices 2026 — ScrapingBee](https://www.scrapingbee.com/blog/web-scraping-best-practices/)
- [With a Redesigned Brand and App, Eventbrite is Aiming to be the Spotify of Events — Fast Company](https://www.fastcompany.com/91289655/eventbrite-app-redesign-event-discovery)

---
*Feature research for: Local events discovery / live music finder, Atlantic Canada*
*Researched: 2026-03-13*
