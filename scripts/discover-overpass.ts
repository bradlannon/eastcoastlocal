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
import { db } from '@/lib/db/client';
import { discovered_sources } from '@/lib/db/schema';

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

async function queryOverpassByType(amenityType: string): Promise<OverpassElement[]> {
  const query = `[out:json][timeout:30];(node["amenity"="${amenityType}"](${BBOX});way["amenity"="${amenityType}"](${BBOX}););out center tags;`;

  const resp = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!resp.ok) {
    console.warn(`  ⚠ Overpass query for "${amenityType}" failed: ${resp.status} — skipping`);
    return [];
  }
  const data = await resp.json() as { elements: OverpassElement[] };
  return data.elements;
}

async function queryOverpass(): Promise<OverpassElement[]> {
  const all: OverpassElement[] = [];
  for (const type of AMENITY_TYPES) {
    console.log(`  Querying amenity=${type}...`);
    const elements = await queryOverpassByType(type);
    console.log(`    → ${elements.length} results`);
    all.push(...elements);
    // 2s courtesy delay between queries
    await new Promise(r => setTimeout(r, 2000));
  }
  return all;
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
