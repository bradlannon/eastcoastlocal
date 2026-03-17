# New Event Sources Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 9 new free event feeds, OpenStreetMap venue discovery, Wikidata festival seeding, and scrape 9 community event websites to maximize Atlantic Canada event coverage.

**Architecture:** Three workstreams: (1) Add new feeds to the existing `WP_EVENT_FEEDS` registry with a new `25live` feed type, (2) Create two new discovery scripts (Overpass API, Wikidata SPARQL) as one-time/periodic scripts, (3) Add scrapeable community sites as venue_website sources via a seed script.

**Tech Stack:** Node.js/TypeScript, cheerio, got-scraping, existing feed infrastructure (`wordpress-events.ts`), existing `findOrCreateVenue` + `upsertEvent` pipeline.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/scraper/wordpress-events.ts` | Modify | Add `25live` feed type + 7 new feed entries |
| `src/lib/scraper/wordpress-events.test.ts` | Create | Unit tests for 25live parser |
| `scripts/seed-community-sites.ts` | Create | One-time script to insert 9 community sites as scrape sources |
| `scripts/discover-overpass.ts` | Create | OSM Overpass venue discovery script |
| `scripts/seed-wikidata-festivals.ts` | Create | Wikidata SPARQL festival seeding script |

---

## Task 1: Add 25Live Feed Parser + Mount Allison Feed

**Files:**
- Modify: `src/lib/scraper/wordpress-events.ts:59-132` (feed type + registry)
- Modify: `src/lib/scraper/wordpress-events.ts` (new fetcher function)

The 25Live (CollegeNET) JSON API returns events at `https://25livepub.collegenet.com/calendars/<calendar>.json` with this shape:
```json
[{
  "eventID": 123,
  "title": "...",
  "description": "...",
  "location": "...",
  "startDateTime": "2026-04-15T19:00:00-03:00",
  "endDateTime": "2026-04-15T21:00:00-03:00",
  "permaLinkUrl": "https://...",
  "customFields": {}
}]
```

- [ ] **Step 1: Add `25live` to the WpEventFeed type union**

In `src/lib/scraper/wordpress-events.ts`, change line 63:

```typescript
type: 'tribe' | 'wp-event' | 'drupal-json' | 'livewhale' | 'rss' | '25live';
```

- [ ] **Step 2: Add Mount Allison feed entry to WP_EVENT_FEEDS array**

After the UNB entry (line 131), add:

```typescript
  {
    id: 'mount-allison',
    name: 'Mount Allison University',
    url: 'https://25livepub.collegenet.com/calendars/mta_events.json',
    type: '25live',
    province: 'NB',
    defaultCity: 'Sackville',
    defaultVenue: 'Mount Allison University',
  },
```

- [ ] **Step 3: Write the `fetch25LiveFeed` function**

Add before the `fetchRssFeed` function (~line 444):

```typescript
async function fetch25LiveFeed(feed: WpEventFeed): Promise<FeedResult> {
  const result: FeedResult = { feedId: feed.id, feedName: feed.name, eventsFound: 0, eventsUpserted: 0, errors: 0 };
  const now = new Date();

  const response = await fetch(feed.url, {
    headers: { 'User-Agent': 'EastCoastLocal/1.0 (events aggregator)' },
  });

  if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);

  const events = (await response.json()) as Array<{
    eventID?: number;
    title?: string;
    description?: string;
    location?: string;
    startDateTime?: string;
    endDateTime?: string;
    permaLinkUrl?: string;
    customFields?: Record<string, string>;
  }>;

  result.eventsFound = events.length;

  for (const event of events) {
    try {
      if (!event.title || !event.startDateTime) continue;

      const start = new Date(event.startDateTime);
      if (isNaN(start.getTime()) || start < now) continue;

      const eventDate = start.toISOString().slice(0, 10);
      const eventTime = start.toISOString().slice(11, 16);

      const venueName = event.location?.split(',')[0]?.trim() || feed.defaultVenue || feed.name;
      const city = feed.defaultCity || '';

      const venueId = await findOrCreateVenue(venueName, city, feed.province, event.location || city);

      const extracted: ExtractedEvent = {
        performer: stripHtml(event.title),
        event_date: eventDate,
        event_time: eventTime !== '00:00' ? eventTime : null,
        price: null,
        ticket_link: event.permaLinkUrl || null,
        description: stripHtml(event.description ?? '').slice(0, 500) || null,
        cover_image_url: null,
        confidence: 0.95,
        event_category: guessCategoryFromString(event.title + ' ' + (event.description ?? '')),
      };

      await upsertEvent(venueId, extracted, event.permaLinkUrl ?? feed.url, null, 'scrape');
      result.eventsUpserted++;
    } catch (err) {
      console.error(`  [${feed.id}] Event ${event.eventID} error:`, err instanceof Error ? err.message : err);
      result.errors++;
    }
  }

  return result;
}
```

- [ ] **Step 4: Register `25live` in the fetcher dispatch map**

In the `fetchAllWpEventFeeds` function (~line 521), add `'25live': fetch25LiveFeed` to the dispatch object:

```typescript
      const fetcher = {
        tribe: fetchTribeFeed,
        'wp-event': fetchWpEventFeed,
        'drupal-json': fetchDrupalJsonFeed,
        livewhale: fetchLiveWhaleFeed,
        rss: fetchRssFeed,
        '25live': fetch25LiveFeed,
      }[feed.type];
```

- [ ] **Step 5: Build and verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scraper/wordpress-events.ts
git commit -m "feat: add 25live feed parser and Mount Allison University feed"
```

---

## Task 2: Add Remaining Free RSS/iCal Feeds

**Files:**
- Modify: `src/lib/scraper/wordpress-events.ts:69-132` (WP_EVENT_FEEDS array)

Add 6 more feed entries. These all use existing parser types (rss, tribe).

- [ ] **Step 1: Add all new feed entries after the Mount Allison entry**

```typescript
  {
    id: 'upei',
    name: 'UPEI',
    url: 'https://www.upei.ca/export/rss/events/connector.rss',
    type: 'rss',
    province: 'PEI',
    defaultCity: 'Charlottetown',
    defaultVenue: 'University of Prince Edward Island',
  },
  {
    id: 'powwow-calendar',
    name: 'Pow Wow Calendar (Atlantic)',
    url: 'https://calendar.powwows.com/events/categories/pow-wows/pow-wows-in-nova-scotia/feed',
    type: 'rss',
    province: 'NS',
  },
  {
    id: 'halifax-chamber',
    name: 'Halifax Chamber of Commerce',
    url: 'https://halifaxchamberns.chambermaster.com/events/rss',
    type: 'rss',
    province: 'NS',
    defaultCity: 'Halifax',
    defaultVenue: 'Halifax Chamber of Commerce',
  },
  {
    id: 'fredericton-chamber',
    name: 'Fredericton Chamber of Commerce',
    url: 'https://frederictonchamber.chambermaster.com/events/rss',
    type: 'rss',
    province: 'NB',
    defaultCity: 'Fredericton',
    defaultVenue: 'Fredericton Chamber of Commerce',
  },
  {
    id: 'saintjohn-chamber',
    name: 'Saint John Region Chamber',
    url: 'https://sjboardoftrade.chambermaster.com/events/rss',
    type: 'rss',
    province: 'NB',
    defaultCity: 'Saint John',
    defaultVenue: 'Saint John Region Chamber of Commerce',
  },
  {
    id: 'charlottetown-chamber',
    name: 'Charlottetown Chamber of Commerce',
    url: 'https://charlottetownchamber.chambermaster.com/events/rss',
    type: 'rss',
    province: 'PEI',
    defaultCity: 'Charlottetown',
    defaultVenue: 'Charlottetown Chamber of Commerce',
  },
```

- [ ] **Step 2: Build and verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scraper/wordpress-events.ts
git commit -m "feat: add UPEI, Pow Wow Calendar, and 4 Chamber of Commerce feeds"
```

---

## Task 3: OpenStreetMap Overpass Venue Discovery Script

**Files:**
- Create: `scripts/discover-overpass.ts`

This script queries the Overpass API for bars, theatres, nightclubs, community centres, and event venues across Atlantic Canada, then inserts new venues into `discovered_sources` for review/promotion.

- [ ] **Step 1: Create the script**

```typescript
/**
 * OSM Overpass API venue discovery for Atlantic Canada.
 *
 * Queries OpenStreetMap for event-relevant venues (bars, theatres, nightclubs,
 * community centres) and inserts them into discovered_sources for review.
 *
 * Run: npx tsx scripts/discover-overpass.ts
 * Requires: DATABASE_URL in environment
 */
import 'dotenv/config';
import { db } from '../src/lib/db/client';
import { discovered_sources } from '../src/lib/db/schema';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Atlantic Canada bounding box: SW corner (43.4, -67.5) to NE corner (52.0, -52.5)
const BBOX = '43.4,-67.5,52.0,-52.5';

const AMENITY_TYPES = [
  'bar', 'nightclub', 'theatre', 'community_centre',
  'events_venue', 'arts_centre', 'pub', 'concert_hall',
];

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function queryOverpass(): Promise<OverpassElement[]> {
  const amenityFilter = AMENITY_TYPES.map(t => `["amenity"="${t}"]`).join('');
  // Query nodes and ways with these amenity types in the bounding box
  const query = `
    [out:json][timeout:60];
    (
      node${amenityFilter.split(']').map(f => f + ']').join('').replace(/\]\]/g, ']')}(${BBOX});
      ${AMENITY_TYPES.map(t => `node["amenity"="${t}"](${BBOX});`).join('\n      ')}
      ${AMENITY_TYPES.map(t => `way["amenity"="${t}"](${BBOX});`).join('\n      ')}
    );
    out center tags;
  `;

  console.log('Querying Overpass API for Atlantic Canada venues...');
  const resp = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!resp.ok) throw new Error(`Overpass API error: ${resp.status}`);
  const data = await resp.json() as { elements: OverpassElement[] };
  return data.elements;
}

// Province lookup by rough longitude/latitude
function guessProvince(lat: number, lon: number): string {
  if (lon < -57) return 'NL'; // Newfoundland
  if (lat > 46.5 && lon > -64.5 && lon < -62) return 'PEI';
  if (lon > -67 && lon < -63.5 && lat < 48) return 'NB';
  return 'NS'; // Default to Nova Scotia
}

async function main() {
  const elements = await queryOverpass();
  console.log(`Found ${elements.length} OSM elements`);

  let inserted = 0;
  let skipped = 0;

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name;
    const website = tags.website || tags['contact:website'] || tags.url;

    if (!name) { skipped++; continue; }

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon) { skipped++; continue; }

    const province = tags['addr:province'] || tags['addr:state'] || guessProvince(lat, lon);
    const city = tags['addr:city'] || '';
    const address = [tags['addr:housenumber'], tags['addr:street'], city, province]
      .filter(Boolean).join(', ');

    const url = website || `https://www.openstreetmap.org/${el.type}/${el.id}`;

    try {
      await db.insert(discovered_sources).values({
        url,
        domain: website ? new URL(website).hostname : 'openstreetmap.org',
        source_name: name,
        province,
        city,
        status: website ? 'pending' : 'rejected', // Only venues with websites are useful
        discovery_method: 'openstreetmap',
        raw_context: JSON.stringify({ amenity: tags.amenity, osm_id: `${el.type}/${el.id}` }),
        discovery_score: website ? 0.7 : 0.3,
        lat,
        lng: lon,
        address: address || null,
      }).onConflictDoNothing();
      inserted++;
    } catch (err) {
      // Duplicate URL — skip
      skipped++;
    }
  }

  console.log(`Done: ${inserted} inserted, ${skipped} skipped`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Build-check the script**

Run: `npx tsx --no-cache scripts/discover-overpass.ts --help 2>&1 | head -5` (just verify it compiles — don't run the full script without DATABASE_URL)

Actually, test with a type-check instead:
Run: `npx tsc --noEmit scripts/discover-overpass.ts --esModuleInterop --resolveJsonImports --moduleResolution node --module esnext --target esnext 2>&1 | head -10`

If path alias issues, just verify with: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add scripts/discover-overpass.ts
git commit -m "feat: add OpenStreetMap Overpass venue discovery script"
```

---

## Task 4: Wikidata Festival Seeding Script

**Files:**
- Create: `scripts/seed-wikidata-festivals.ts`

One-time SPARQL query to seed known recurring Atlantic Canada festivals with dates, locations, and website URLs.

- [ ] **Step 1: Create the script**

```typescript
/**
 * Wikidata SPARQL festival seeding for Atlantic Canada.
 *
 * Queries Wikidata for recurring festivals in NS, NB, PEI, NL and inserts
 * them into discovered_sources for review/promotion.
 *
 * Run: npx tsx scripts/seed-wikidata-festivals.ts
 * Requires: DATABASE_URL in environment
 */
import 'dotenv/config';
import { db } from '../src/lib/db/client';
import { discovered_sources } from '../src/lib/db/schema';

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

// Query for festivals located in Atlantic Canada provinces
const SPARQL_QUERY = `
SELECT DISTINCT ?festival ?festivalLabel ?website ?locationLabel ?coord ?inception WHERE {
  VALUES ?province {
    wd:Q1952   # Nova Scotia
    wd:Q1965   # New Brunswick
    wd:Q1979   # Prince Edward Island
    wd:Q2003   # Newfoundland and Labrador
  }
  ?festival wdt:P31/wdt:P279* wd:Q132241.  # instance of festival (including subclasses)
  ?festival wdt:P131* ?province.            # located in province (transitive)
  OPTIONAL { ?festival wdt:P856 ?website. }
  OPTIONAL { ?festival wdt:P276 ?location. }
  OPTIONAL { ?festival wdt:P625 ?coord. }
  OPTIONAL { ?festival wdt:P571 ?inception. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?festivalLabel
`;

interface WikidataResult {
  festival: { value: string };
  festivalLabel: { value: string };
  website?: { value: string };
  locationLabel?: { value: string };
  coord?: { value: string }; // "Point(-63.5 44.6)"
  inception?: { value: string };
}

function parseCoord(point: string): { lat: number; lng: number } | null {
  const match = point.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return null;
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

function guessProvince(location: string, lng?: number): string {
  const lower = location.toLowerCase();
  if (lower.includes('newfoundland') || lower.includes('labrador') || lower.includes("st. john's")) return 'NL';
  if (lower.includes('prince edward') || lower.includes('charlottetown') || lower.includes('pei')) return 'PEI';
  if (lower.includes('new brunswick') || lower.includes('fredericton') || lower.includes('moncton') || lower.includes('saint john')) return 'NB';
  if (lower.includes('nova scotia') || lower.includes('halifax')) return 'NS';
  // Fallback to longitude
  if (lng && lng < -57) return 'NL';
  if (lng && lng > -64.5 && lng < -62) return 'PEI';
  if (lng && lng > -67 && lng < -63.5) return 'NB';
  return 'NS';
}

async function main() {
  console.log('Querying Wikidata for Atlantic Canada festivals...');

  const resp = await fetch(WIKIDATA_SPARQL + '?query=' + encodeURIComponent(SPARQL_QUERY), {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'EastCoastLocal/1.0' },
  });

  if (!resp.ok) throw new Error(`Wikidata SPARQL error: ${resp.status}`);

  const data = await resp.json() as { results: { bindings: WikidataResult[] } };
  const festivals = data.results.bindings;

  console.log(`Found ${festivals.length} festival entries`);

  let inserted = 0;
  let skipped = 0;

  for (const f of festivals) {
    const name = f.festivalLabel.value;
    const website = f.website?.value;
    const location = f.locationLabel?.value ?? '';
    const coord = f.coord ? parseCoord(f.coord.value) : null;
    const province = guessProvince(location + ' ' + name, coord?.lng);

    if (!website) { skipped++; continue; } // No website = can't scrape

    try {
      await db.insert(discovered_sources).values({
        url: website,
        domain: new URL(website).hostname,
        source_name: name,
        province,
        city: location || null,
        status: 'pending',
        discovery_method: 'wikidata',
        raw_context: JSON.stringify({
          wikidata_id: f.festival.value.split('/').pop(),
          inception: f.inception?.value?.slice(0, 10),
        }),
        discovery_score: 0.8,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
      }).onConflictDoNothing();
      inserted++;
    } catch {
      skipped++;
    }
  }

  console.log(`Done: ${inserted} inserted, ${skipped} skipped (no website or duplicate)`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Build verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-wikidata-festivals.ts
git commit -m "feat: add Wikidata SPARQL festival seeding script"
```

---

## Task 5: Seed Community Scraping Sites

**Files:**
- Create: `scripts/seed-community-sites.ts`

Insert 9 community event websites as venue_website scrape sources. These will be scraped by the existing got-scraping + Gemini AI pipeline.

- [ ] **Step 1: Create the script**

```typescript
/**
 * Seed community event websites as scrape sources.
 *
 * These are high-value Atlantic Canada event listing pages that should be
 * scraped via the existing venue_website pipeline (got-scraping + Gemini AI).
 *
 * Run: npx tsx scripts/seed-community-sites.ts
 * Requires: DATABASE_URL in environment
 */
import 'dotenv/config';
import { db } from '../src/lib/db/client';
import { venues, scrape_sources } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

interface CommunitySite {
  name: string;
  url: string;
  province: string;
  city: string;
  maxPages: number;
}

const COMMUNITY_SITES: CommunitySite[] = [
  {
    name: 'The Coast Events (Halifax)',
    url: 'https://www.thecoast.ca/halifax/EventSearch',
    province: 'NS',
    city: 'Halifax',
    maxPages: 2,
  },
  {
    name: 'Halifax Municipal Events',
    url: 'https://www.halifax.ca/parks-recreation/events',
    province: 'NS',
    city: 'Halifax',
    maxPages: 1,
  },
  {
    name: 'Discover Halifax Events',
    url: 'https://discoverhalifaxns.com/events/',
    province: 'NS',
    city: 'Halifax',
    maxPages: 2,
  },
  {
    name: 'Downtown Halifax Events',
    url: 'https://downtownhalifax.ca/events',
    province: 'NS',
    city: 'Halifax',
    maxPages: 1,
  },
  {
    name: 'Digital Nova Scotia Events',
    url: 'https://digitalnovascotia.com/events/',
    province: 'NS',
    city: 'Halifax',
    maxPages: 1,
  },
  {
    name: 'East Coast Festivals',
    url: 'https://eastcoastfestivals.org',
    province: 'NS',
    city: '',
    maxPages: 2,
  },
  {
    name: 'Build Nova Scotia Events',
    url: 'https://buildns.ca/visit/halifax/halifax-events/',
    province: 'NS',
    city: 'Halifax',
    maxPages: 1,
  },
  {
    name: 'Confederation Centre of the Arts',
    url: 'https://confederationcentre.com/whats-on/',
    province: 'PEI',
    city: 'Charlottetown',
    maxPages: 1,
  },
  {
    name: 'Arts Culture New Brunswick',
    url: 'https://artsculturenb.ca/en/events/',
    province: 'NB',
    city: '',
    maxPages: 1,
  },
];

async function main() {
  console.log(`Seeding ${COMMUNITY_SITES.length} community event sites...`);

  let created = 0;
  let skipped = 0;

  for (const site of COMMUNITY_SITES) {
    // Check if source URL already exists
    const existing = await db.query.scrape_sources.findFirst({
      where: eq(scrape_sources.url, site.url),
    });
    if (existing) {
      console.log(`  ⊘ ${site.name}: already exists (source ${existing.id})`);
      skipped++;
      continue;
    }

    // Find or create a venue for this site
    let venue = await db.query.venues.findFirst({
      where: eq(venues.name, site.name),
    });

    if (!venue) {
      const [newVenue] = await db.insert(venues).values({
        name: site.name,
        address: site.city || site.province,
        city: site.city,
        province: site.province,
      }).returning();
      venue = newVenue;
    }

    // Insert scrape source
    await db.insert(scrape_sources).values({
      url: site.url,
      venue_id: venue.id,
      source_type: 'venue_website',
      enabled: true,
      max_pages: site.maxPages,
    });

    console.log(`  ✓ ${site.name}: created (venue ${venue.id})`);
    created++;
  }

  console.log(`Done: ${created} created, ${skipped} skipped`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Build verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-community-sites.ts
git commit -m "feat: add community event site seeding script (9 sites)"
```

---

## Task 6: Add npm scripts for new scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add convenience scripts to package.json**

Add to the `"scripts"` section:

```json
"discover:overpass": "tsx scripts/discover-overpass.ts",
"seed:community": "tsx scripts/seed-community-sites.ts",
"seed:festivals": "tsx scripts/seed-wikidata-festivals.ts"
```

- [ ] **Step 2: Build verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add npm scripts for overpass, community sites, and wikidata seeding"
```

---

## Task 7: Final Build + Integration Verification

- [ ] **Step 1: Full build**

Run: `npx next build 2>&1 | tail -10`
Expected: Clean build, all routes compiled.

- [ ] **Step 2: Verify feed count increased**

Run: `grep -c "id:" src/lib/scraper/wordpress-events.ts`
Expected: Should show 15 (was 8, added 7 new feeds).

- [ ] **Step 3: Verify scripts exist and are valid TypeScript**

Run: `ls -la scripts/discover-overpass.ts scripts/seed-community-sites.ts scripts/seed-wikidata-festivals.ts`
Expected: All 3 files present.

- [ ] **Step 4: Final commit (if any uncommitted changes)**

```bash
git status
# If clean, skip. Otherwise:
git add -A && git commit -m "chore: final cleanup for new event sources"
```

---

## Summary of What Gets Added

| Category | Source | Type | Province |
|----------|--------|------|----------|
| **Feed** | Mount Allison University (25Live) | 25live JSON | NB |
| **Feed** | UPEI | RSS | PEI |
| **Feed** | Pow Wow Calendar | RSS | NS |
| **Feed** | Halifax Chamber of Commerce | RSS | NS |
| **Feed** | Fredericton Chamber of Commerce | RSS | NB |
| **Feed** | Saint John Region Chamber | RSS | NB |
| **Feed** | Charlottetown Chamber of Commerce | RSS | PEI |
| **Discovery** | OpenStreetMap Overpass API | Script → discovered_sources | All |
| **Discovery** | Wikidata SPARQL festivals | Script → discovered_sources | All |
| **Scrape** | The Coast Events (Halifax) | venue_website | NS |
| **Scrape** | Halifax Municipal Events | venue_website | NS |
| **Scrape** | Discover Halifax Events | venue_website | NS |
| **Scrape** | Downtown Halifax Events | venue_website | NS |
| **Scrape** | Digital Nova Scotia Events | venue_website | NS |
| **Scrape** | East Coast Festivals | venue_website | NS |
| **Scrape** | Build Nova Scotia Events | venue_website | NS |
| **Scrape** | Confederation Centre of the Arts | venue_website | PEI |
| **Scrape** | Arts Culture New Brunswick | venue_website | NB |
