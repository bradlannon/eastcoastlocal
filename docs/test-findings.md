# Test Findings

Characterization-test mismatches logged during the full-coverage pass.
Each entry: date · test file · test name · expected · actual · suspected cause.

| Date | Test | Name | Expected | Actual | Cause |
|------|------|------|----------|--------|-------|
| 2026-04-14 | e2e/api/* | all Phase 4 specs | passing suite | not executed | Requires .env.test with dedicated test DB; specs validated via --list only. Run once test DB is provisioned. |
| 2026-04-14 | src/lib/scraper/geocoder.test.ts | returns null when API returns APPROXIMATE precision | null | `{lat, lng}` | Src returns coords as fallback for APPROXIMATE; test expected null but actual behavior is to use the result |
| 2026-04-14 | src/lib/scraper/wordpress-events.test.ts | every feed has required fields | type in `['tribe','wp-event','drupal-json','livewhale','rss']` | `'25live'` type encountered | `25live` feed type added to src after test was written; test's allowed-types list not updated |
| 2026-04-14 | src/app/api/cron/discover-reddit/route.test.ts | returns 200 with success:true when auth valid | status 200 | status 500 | Route calls `db.insert(discovery_runs)` after handler; test mocks `reddit-discoverer` but not `@/lib/db/client` |
| 2026-04-14 | src/app/api/cron/discover/route.test.ts | calls runDiscoveryJob and returns 200 | status 200 | status 500 | Route calls `db.insert(discovery_runs)` after `runDiscoveryJob`; test mocks orchestrator but not `@/lib/db/client` |
| 2026-04-14 | src/lib/scraper/places-discoverer.test.ts | VENUE_PLACE_TYPES contains exactly 7 allowed types | 7 | 18 | Src expanded VENUE_PLACE_TYPES; test expectations written against old count |
| 2026-04-14 | src/lib/scraper/places-discoverer.test.ts | CORE_VENUE_TYPES contains 5 core types | 5 | 7 | Src expanded CORE_VENUE_TYPES; test expectation stale |
| 2026-04-14 | src/lib/scraper/places-discoverer.test.ts | SECONDARY_VENUE_TYPES contains 2 secondary types | 2 | 11 | Src expanded SECONDARY_VENUE_TYPES; test expectation stale |
| 2026-04-14 | src/lib/scraper/places-discoverer.test.ts | filters out non-venue types (restaurant, grocery_store) | length 2 | length 3 (restaurant included) | Src's `isVenueRelevant` or filter logic changed to allow restaurant; test expects old stricter filter |
| 2026-04-14 | src/lib/scraper/places-discoverer.test.ts | isVenueRelevant returns false for restaurant | false | true | `restaurant` added to venue types in src since test was written |
| 2026-04-14 | src/lib/scraper/places-discoverer.test.ts | scorePlacesCandidate returns 0 for irrelevant types | 0 | 0.7 | Scoring changed; restaurant/food types now score > 0 |
| 2026-04-14 | src/lib/scraper/extractor.test.ts | filters out events with confidence below 0.5 | length 1 (only high-confidence) | length 2 (both returned) | Confidence threshold filter removed or threshold changed in src extractor |
| 2026-04-14 | src/lib/scraper/promote-source.test.ts | Test 1–14 (suite) | venue/scrape_source inserts via mocked db | `TypeError: Cannot read properties of undefined (reading 'findFirst')` | Mock for `db.query.scrape_sources` is undefined; test mock doesn't configure `.query` property on mock db object |
| 2026-04-14 | src/lib/scraper/discovery-orchestrator.test.ts | Test 1: fetches existing domains — generateText called 2× | 2 calls | 138 calls | ATLANTIC_CITIES expanded from 6 to 69 cities; test expects old count-based call assertions |
| 2026-04-14 | src/lib/scraper/discovery-orchestrator.test.ts | Test 5: valid new candidates inserted | db.insert called | 0 calls | Mock chain mismatch — db mock doesn't match new conditional insert flow |
| 2026-04-14 | src/lib/scraper/discovery-orchestrator.test.ts | Test 6: malformed URLs skipped | resolves undefined | resolves with result object | Return type changed — orchestrator now returns result object instead of void |
| 2026-04-14 | src/lib/scraper/discovery-orchestrator.test.ts | Test 7: generateText called 6× (one per city) | 6 calls | 69 calls | ATLANTIC_CITIES expanded from 6 to 69; per-city call count reflects real expansion |
| 2026-04-14 | src/lib/scraper/discovery-orchestrator.test.ts | Test 8: promoteSource called when score >= 0.9 | promoteSource(42) called | 0 calls | Mock chain/auto-approve flow changed; high-score candidate no longer triggers call in mock setup |
| 2026-04-14 | src/lib/scraper/discovery-orchestrator.test.ts | Test 10: discovery_score written for all candidates | db.update called | 0 calls | Insert/update flow changed; mock doesn't return values that trigger update path |
