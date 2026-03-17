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
import { db } from '@/lib/db/client';
import { discovered_sources } from '@/lib/db/schema';

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
