# Feature Research

**Domain:** Event discovery platform — deduplication, venue merge, map UX polish (v1.5 milestone)
**Researched:** 2026-03-15
**Confidence:** HIGH overall (all four features are well-understood patterns; implementation complexity is domain-specific but the approaches are standard)

---

## Context: What Already Exists (Must Preserve)

This is the v1.5 milestone. The following are already built and must be integrated with, not replaced:

- **Composite key dedup:** `upsertEvent` already deduplicates on `(venue_id, event_date, normalized_performer)` — prevents same-scrape-source duplicates
- **Ticketmaster integration (v1.4):** TM creates new venue rows when ingesting events; these may duplicate existing manually-configured venues
- **Event schema:** `events` table with `venue_id` FK, `event_date`, `performer`, `source_url`, `source_type`
- **Venues table:** `venues` with `name`, `lat`, `lng`, `city`, `province` — geocoordinated on save
- **Interactive map:** react-leaflet 5.x with pin clusters (default) and heatmap timelapse mode; sidebar shows event list
- **Category filtering:** 8-value enum chip UI, currently only shown in pin/cluster mode (not visible during timelapse)
- **Timelapse mode:** 30-day sliding window, 6-hour blocks, play/pause, timeline scrubber; category filter silently applies but chips are hidden
- **Vercel Hobby:** 60s function timeout; dedup logic runs server-side in cron, not on-request

The v1.5 features either run in the scrape/ingest pipeline (dedup, venue merge) or are pure frontend changes (zoom-to-location, timelapse category chips).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume work. Missing these = platform feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Cross-source event deduplication | Users expect to see each event once. A show listed on Ticketmaster AND the venue's own website appearing twice destroys trust in the data. Every event aggregator (Google Events, Songkick, Eventbrite) deduplicates silently. | MEDIUM | Existing composite key `(venue_id, event_date, normalized_performer)` already handles same-source dedup. Cross-source case requires the same composite key to match even when `venue_id` differs (TM-created venue vs. existing venue for same physical location). Solution: resolve venue first, then the existing upsert handles the rest. |
| Venue deduplication (TM-created vs. existing) | Ticketmaster creates venue rows with its own names (e.g., "Scotiabank Centre" vs. "Scotiabank Centre Halifax"). Admin and users will see double pins for the same physical venue. | MEDIUM | Two-signal match: name similarity (Jaro-Winkler or token-sort ratio ≥ 0.85) AND geocoordinate proximity (Haversine distance < 100m). Both signals together = high-confidence match; name alone or geo alone can be ambiguous. Admin review for borderline cases. Merge preserves the canonical (existing) venue row; reassigns events from the TM-created duplicate. |
| Category chips visible in timelapse mode | Users select a category chip (e.g., "Live Music"), switch to timelapse, and the chip disappears. Category filter still silently applies — user has no visible confirmation of that. This is a broken UX state. | LOW | CSS/layout fix — the category chip bar is conditionally rendered only in pin mode. Remove the conditional; render chips in both modes. The filter logic already works in timelapse; only visibility is missing. |
| Zoom-to-location on event cards | On any map-based event platform (Google Maps, Eventbrite map view, Airbnb), clicking a list item pans/zooms the map to that item. Users expect this interaction. Current sidebar shows event details but clicking does nothing to the map. | LOW-MEDIUM | Call Leaflet's `map.flyTo([lat, lng], zoomLevel)` when user clicks a "Show on map" / location button on an event card. Requires passing a map ref or event bus from the map component to the sidebar. `flyTo` animates smoothly. zoom level 15–16 appropriate for city-block venue resolution. |

### Differentiators (Competitive Advantage)

Features beyond the baseline that improve data quality and UX.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Admin-reviewable merge candidates | Surface near-match venue pairs in admin UI before auto-merging, instead of silently auto-merging. Gives admin control over venue identity. | MEDIUM | Auto-merge only on very high confidence (both signals ≥ threshold). Queue borderline cases (e.g., name match ≥ 0.7 but < 0.85, or geo within 500m) to an admin review table. Admin sees side-by-side venue details and clicks "Merge" or "Keep separate." |
| Source attribution on merged events | After dedup, record which sources each event was seen on (e.g., "Seen on Ticketmaster + The Marquee Club website"). Provides data provenance. | MEDIUM | Add a `event_sources` join table (event_id, source_url, source_type, first_seen_at). Current upsert ignores the secondary source. On conflict, append new source to join table rather than discarding. Useful for admin debugging and future "buy tickets" link selection (prefer TM link over venue link). |
| Canonical ticket link preference | When the same event is found on TM (has direct buy link) AND the venue site (may have no direct ticket link), prefer the TM ticket URL. | LOW | Extend upsert logic: on cross-source conflict, if existing row has no `ticket_link` and incoming row does, update `ticket_link`. Non-destructive enhancement to dedup. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fully automated venue merging with no admin review | "Just merge everything automatically, no manual review" | Venue names are ambiguous at scale — "The Marquee" could be two different bars in two cities; proximity alone fails when geocoding has meter-level error on TM-sourced venue coordinates; auto-merging wrong venues corrupts data permanently and is hard to undo | Auto-merge only at very high confidence (both name ≥ 0.85 AND geo < 100m); queue borderline cases for admin review. One-click merge in admin is low friction and prevents bad data. |
| Fuzzy event matching independent of venue | "What if TM lists a different venue name for the same show?" | Without a resolved venue_id, a pure title+date fuzzy match will produce false positives — "Jazz Night at The Marquee" and "Jazz Night at The Casino" look similar but are different events. Title similarity alone is unreliable for event dedup. | Anchor dedup to venue resolution first. Once both sources resolve to the same venue_id, the existing composite key (venue_id + date + normalized_performer) handles event dedup correctly and safely. |
| Real-time venue merge during user-facing requests | "Check for duplicate venues every time an event is viewed" | Fuzzy string matching across all venue pairs is O(n²); at 50+ venues this is trivially fast, but running it on every request is unnecessary work and adds latency | Run venue deduplication as part of the post-ingest pipeline step in the daily cron job. No user-facing request should trigger dedup logic. |
| Animated flyTo on every list scroll event | "Highlight the map pin as user scrolls the event list" | Constant `flyTo` calls during scroll are visually jarring and fight the user's manual map panning; mobile scroll becomes unusable | `flyTo` only on explicit user intent: a dedicated "Show on map" button or icon click. Do not bind to scroll or hover. Let user control when the map moves. |
| Zoom level 18+ on venue flyTo | "Get really close to show the exact building" | At zoom 18, the base tiles (CartoDB Positron) lose legibility; venue pins overlap the map context users need to understand location within the city | Zoom 15–16 places the venue pin centered with 2–3 surrounding city blocks visible. Sufficient for "where is this place" without losing map context. |

---

## Feature Dependencies

```
[Cross-source Event Dedup]
    └──requires──> [Venue Dedup / Merge] (events can only match cross-source if both
                                          point to the same venue_id)
    └──uses existing──> [Composite key upsert] (venue_id + event_date + normalized_performer)
    └──does NOT require──> [New DB schema] if venue merge runs before event upsert

[Venue Dedup / Merge]
    └──requires──> [Geocoordinates on all venues] (already: Google Maps geocoding on save)
    └──requires──> [Name normalization] (strip punctuation, lowercase, common suffixes)
    └──requires──> [Haversine distance calc] (already exists in codebase from map click handler)
    └──optionally requires──> [Admin merge review UI] if queuing borderline cases
    └──runs before──> [Cross-source Event Dedup] (must resolve canonical venue_id first)

[Zoom-to-location Button]
    └──requires──> [Map ref accessible from sidebar] (useMap() hook or forwarded ref)
    └──requires──> [Venue lat/lng on event card data] (already: events join venues)
    └──does NOT require──> [DB schema change]
    └──does NOT conflict with──> [Timelapse mode] (flyTo works in both map modes)

[Category Chips in Timelapse Mode]
    └──requires──> [Remove conditional rendering] (chip bar hidden when timelapse=true)
    └──does NOT require──> [Filter logic change] (category filter already applied in timelapse)
    └──does NOT require──> [DB schema change]
    └──enhances──> [Timelapse mode] (makes active filter visible and editable in timelapse)

[Source Attribution on Merged Events] (differentiator)
    └──requires──> [event_sources join table] (new schema: event_id, source_url, source_type)
    └──requires──> [Cross-source Event Dedup] (only meaningful once dedup is running)
    └──enhances──> [Canonical ticket link preference]
```

### Dependency Notes

- **Venue dedup must precede event dedup:** The cross-source event dedup problem is fully solved once venue resolution is correct. If TM-created venues are merged to canonical venue rows before event upsert, the existing `(venue_id, event_date, normalized_performer)` composite key handles dedup automatically. No separate event-level fuzzy match is needed.
- **Category chips and zoom-to-location are independent:** Both are frontend-only changes with no backend or schema dependencies. They can be built in any order or in parallel.
- **Source attribution is optional for v1.5 MVP:** It adds schema complexity (new join table). Defer unless time allows. The core dedup works without it.
- **Admin merge review UI is optional for v1.5 MVP:** Auto-merge at high confidence + log borderline cases is acceptable for launch. Admin UI can be added incrementally.

---

## MVP Definition

### Launch With (v1.5)

Minimum viable feature set for this milestone to be complete and valuable.

- [ ] Venue dedup: after Ticketmaster ingest, detect duplicate venue rows using name similarity + geocoordinate proximity; auto-merge at high confidence; log borderline cases
- [ ] Cross-source event dedup: resolved automatically once venue merge runs (no additional event-matching logic required if venue is resolved first)
- [ ] Category filter chips rendered in timelapse mode (remove conditional, chips always visible)
- [ ] Zoom-to-location button on event cards: "Show on map" button calls `map.flyTo()` to animate map to venue coordinates

### Add After Validation (v1.5.x)

- [ ] Admin UI for borderline venue merge candidates — surface near-match pairs with side-by-side comparison and one-click merge
- [ ] Source attribution — `event_sources` join table tracking which sources each event was seen on
- [ ] Canonical ticket link preference — on dedup conflict, prefer source that has a ticket link

### Future Consideration (v2+)

- [ ] Bulk venue merge audit — retrospective scan of all existing venue pairs for missed merges; run once after v1.5 ships and monitor for regressions
- [ ] Event title fuzzy match (secondary dedup signal) — for rare cases where same event has different performer spelling across sources (e.g., "Matt Minglewood" vs. "Matthew Minglewood")

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Cross-source event dedup | HIGH (eliminates duplicate event pins) | LOW (solved by venue merge + existing upsert) | P1 |
| Venue dedup / merge | HIGH (prerequisite for event dedup; eliminates duplicate venue pins) | MEDIUM (two-signal matching + merge logic) | P1 |
| Category chips in timelapse | MEDIUM (usability fix; filter already works, just invisible) | LOW (CSS/conditional rendering change) | P1 |
| Zoom-to-location button | MEDIUM (expected map UX; improves discoverability) | LOW-MEDIUM (map ref wiring + flyTo call) | P1 |
| Admin merge review UI | LOW-MEDIUM (operational quality; reduces risk of bad auto-merge) | MEDIUM (new admin page) | P2 |
| Source attribution | LOW (data provenance; no user-visible impact initially) | MEDIUM (new join table + upsert update) | P3 |

**Priority key:**
- P1: Must have for v1.5 launch
- P2: Should have; add when P1 features are stable
- P3: Nice to have; defer if time-constrained

---

## Implementation Detail Notes

### Venue Deduplication Algorithm

**Recommended approach: two-signal gating**

1. **Name normalization:** Lowercase, strip punctuation, strip common suffixes ("bar", "pub", "club", "lounge", "theatre", "theater", "centre", "center"). Normalize unicode. Compare normalized forms.
2. **Name similarity score:** Jaro-Winkler distance (or token-sort ratio from a library like `fastest-levenshtein`). Threshold: ≥ 0.85 = high confidence name match.
3. **Geocoordinate proximity:** Haversine distance between `venues.lat/lng` pairs. Threshold: < 100m = same physical location (city block precision). Note: the Haversine function already exists in the codebase from the map click handler spatial query.
4. **Decision matrix:**
   - Name ≥ 0.85 AND geo < 100m → auto-merge (high confidence)
   - Name ≥ 0.70 AND geo < 500m → queue for admin review
   - Name ≥ 0.85 but geo > 500m → log as suspicious, do NOT merge (same name, different city)
   - All other combinations → keep separate

**Merge operation:** Reassign all `events.venue_id` from the duplicate (TM-created) row to the canonical (existing) row. Delete or mark the duplicate venue as merged (add `merged_into_venue_id` FK column, or simply delete after reassignment).

**When to run:** As a post-ingest step at the end of the daily Ticketmaster cron. Run only on venues created since last cron run to avoid O(n²) full-scan every day.

### Cross-Source Event Deduplication

Once venue merge runs before event upsert, cross-source dedup is automatic:

- TM event for "Matt Minglewood at Scotiabank Centre, 2026-04-15" → venue resolved to canonical `venue_id: 12`
- Venue website event for "Matt Minglewood, 2026-04-15" → venue already has `venue_id: 12`
- Existing `upsertEvent` with composite key `(12, 2026-04-15, matt minglewood)` → conflict → no duplicate inserted

No additional event-level fuzzy matching required. The normalized_performer field already handles minor name variations if normalization is applied consistently.

### Zoom-to-Location Implementation

**Pattern:** "Show on map" icon button on event card in the sidebar → calls `map.flyTo([venue.lat, venue.lng], 15)`.

**Implementation options:**
1. `useMap()` hook (react-leaflet) called from a child component of `<MapContainer>`. Sidebar must be rendered inside `<MapContainer>` or receive the map instance via context/ref.
2. Custom EventEmitter or React context that the sidebar writes to and the map component reads from — decouples sidebar from being a MapContainer child.

**Recommended:** Pass map ref via React context. The map component sets `mapRef.current = map` via `useMapEvents`. The sidebar reads `mapRef.current.flyTo(...)`. This avoids restructuring the existing component tree.

**Zoom level:** 15 (city-block resolution). Do NOT go above 16 on CartoDB Positron — tiles become sparse and the venue context is lost.

**Animation:** `flyTo` (animated pan+zoom) is preferable to `setView` (instant jump) for orientation — user can track the motion and understand where the map moved.

### Category Chips in Timelapse Mode

**Current state:** Category chip bar is rendered conditionally — hidden when `timelapse === true`.

**Fix:** Remove the `timelapse` condition from the chip bar render. The chips should render identically in both modes. The filter logic already applies in timelapse (verified in PROJECT.md: "Category filter applies to heatmap mode" shipped in v1.2).

**Expected behavior after fix:**
- User selects "Live Music" chip → switches to timelapse → chips remain visible and "Live Music" remains selected
- User is in timelapse → clicks a different chip → heatmap updates to reflect new category immediately
- Active chip state, URL persistence, and filter application all already work; only visibility was broken

---

## Competitor Feature Analysis

| Feature | Google Maps / Events | Eventbrite Map View | Songkick | Our Approach |
|---------|---------------------|---------------------|----------|--------------|
| Cross-source dedup | Google deduplicates internally across structured data sources | Single source (Eventbrite only) | Deduplicates across promoter sources | Venue-anchored composite key; resolve venue first |
| Venue merge | Google resolves venue identity via Place IDs | N/A — organizer-submitted venues are canonical | Platform-managed venues | Two-signal match (name + geo); auto-merge at high confidence |
| List-to-map zoom | Clicking a search result pans map to that location with smooth animation | Map pin highlights when list item hovered | Not a map product | `flyTo` on explicit button click; zoom 15 |
| Filter persistence across modes | N/A — no mode concept | Filter chips always visible in all states | N/A | Remove conditional rendering; chips always visible |

---

## Sources

- [Haversine formula — Movable Type Scripts](https://www.movable-type.co.uk/scripts/latlong.html) — distance calculation for geocoordinate proximity (HIGH confidence)
- [Preventing Duplicate Location Entries Using Haversine — DEV Community](https://dev.to/galisetty_priyatham_c1a49/preventing-duplicate-or-nearby-location-entries-using-the-haversine-formula-in-java-1g1p) — proximity-based dedup pattern (MEDIUM confidence)
- [Fuzzy Matching 101 — Data Ladder](https://dataladder.com/fuzzy-matching-101/) — algorithm comparison: Levenshtein, Jaro-Winkler, token-sort for name matching (MEDIUM confidence)
- [Streamline Data Deduplication: Advanced Matching Techniques — Capella Solutions](https://www.capellasolutions.com/blog/streamline-data-deduplication-advanced-matching-techniques) — multi-field matching strategies, threshold approaches (MEDIUM confidence)
- [List and Details — Map UI Patterns](https://mapuipatterns.com/list-details/) — expected behavior: selecting list item zooms map to item's extent (HIGH confidence from UX pattern documentation)
- [React Leaflet Events example](https://react-leaflet.js.org/docs/example-events/) — flyTo and map interaction patterns (HIGH confidence)
- [Leaflet map.flyTo documentation](https://leafletjs.com/reference.html) — animated pan+zoom API (HIGH confidence)
- [Filter UI Patterns — Arounda](https://arounda.agency/blog/filter-ui-examples) — chip filter visibility best practices; active filters should always be visible (MEDIUM confidence)
- [Chip UI Design — Mobbin](https://mobbin.com/glossary/chip) — chips provide immediate visual feedback on active filter state; should not be hidden in any app mode (MEDIUM confidence)
- [Handling Duplicated Event Imports — The Events Calendar](https://theeventscalendar.com/knowledgebase/troubleshooting-duplicate-imports/) — UID-based dedup across sources; confirms cross-source dedup is a solved pattern (MEDIUM confidence)
- [Bandsintown imported events — Bandsintown Help](https://help.artists.bandsintown.com/en/articles/7048779-imported-events) — platform automatically imports from TM/Eventbrite; deduplicates internally (MEDIUM confidence)

---

*Feature research for: East Coast Local v1.5 — Deduplication, Venue Merge, Map UX Polish*
*Researched: 2026-03-15*
