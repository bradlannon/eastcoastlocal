# Phase 8: Category Filter UI - Research

**Researched:** 2026-03-14
**Domain:** Next.js 16 / React 19 / Tailwind v4 / nuqs v2 URL state / filter utility pattern
**Confidence:** HIGH

## Summary

Phase 8 adds a single-select category chip row to the existing filter bar, wires it into the filter pipeline that already drives both the sidebar event list and heatmap points, persists selection as `?category=` via nuqs (already installed), and surfaces a category badge on event cards and the event detail page.

The codebase already has every foundation needed. `EVENT_CATEGORIES` is exported from `src/lib/db/schema.ts` as a typed const array. `nuqs` v2 (`useQueryState`) already manages `?when=` and `?province=` with the same pattern. The filter chain in `page.tsx` already composes `filterByDateRange → filterByProvince → filterByBounds`. Adding `filterByCategory` is a mechanical extension of an established pattern. The heatmap receives `heatPoints` computed from pre-filtered events, so filtering at the `useMemo` level automatically propagates to the heatmap without touching `HeatmapLayer` itself.

**Primary recommendation:** Add `filterByCategory` to `filter-utils.ts`, add `?category=` to `useQueryState` in both `EventFilters` and `page.tsx`, insert the chip row into `EventFilters`, and add category badge rendering to `EventCard` and the event detail page. No new libraries required.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILT-01 | User can filter events by category using horizontal chip buttons | Chip pattern already exists in `EventFilters.tsx` for date filtering; extend with category chips using `EVENT_CATEGORIES` array from schema |
| FILT-02 | Category filter applies to heatmap mode (heatmap only shows selected categories) | `heatPoints` is computed inside `useMemo` in `page.tsx` from `filterByTimeWindow → filterByProvince` chain; inserting `filterByCategory` before `computeVenueHeatPoints` propagates automatically |
| FILT-03 | Category filter selection is persisted in URL as `?category=` and is shareable | `nuqs` v2 `useQueryState('category')` follows the identical pattern already used for `?when=` and `?province=` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nuqs | ^2.8.9 (installed) | URL query state via `useQueryState` | Already used for `when` and `province` — established project pattern |
| React | 19.2.3 (installed) | UI components | Project standard |
| Tailwind v4 | ^4 (installed) | Styling | Project standard — all existing components use Tailwind utility classes |
| Next.js | 16.1.6 (installed) | Framework | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| EVENT_CATEGORIES | (from schema.ts) | Typed const array of all 8 categories | Source of truth for chip labels and filter validation |
| date-fns | ^4.1.0 (installed) | Date utilities | Already used; no new usage needed in this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nuqs `useQueryState` | React `useState` + manual URL sync | nuqs already installed; `useState` would lose URL persistence (fails FILT-03) |
| Inline chip row in `EventFilters` | Separate `CategoryChips` component | Inline is simpler; extract only if component grows unwieldy |

**Installation:** No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure

New files (minimal):
```
src/lib/filter-utils.ts          # add filterByCategory() function
src/lib/filter-utils.test.ts     # add filterByCategory tests
src/components/events/EventFilters.tsx   # add category chip row
src/components/events/EventCard.tsx      # add category badge
src/app/event/[id]/page.tsx              # add category badge
src/app/page.tsx                         # wire ?category= into filter chain
```

No new directories needed.

### Pattern 1: filterByCategory in filter-utils.ts
**What:** Pure function following the exact same contract as `filterByProvince` and `filterByBounds`.
**When to use:** Called in `page.tsx` useMemo filter chain, after province filter, before bounds filter.
**Example:**
```typescript
// Source: modelled on existing filterByProvince in src/lib/filter-utils.ts
export function filterByCategory(
  events: EventWithVenue[],
  category: string | null
): EventWithVenue[] {
  if (!category) return events;
  return events.filter((e) => e.events.event_category === category);
}
```

### Pattern 2: nuqs useQueryState for category
**What:** Add `?category=` URL param using `useQueryState` — identical to how `when` and `province` are managed.
**When to use:** In `EventFilters` component (write) and `page.tsx` (read).
**Example:**
```typescript
// Source: mirrors existing pattern in src/app/page.tsx and src/components/events/EventFilters.tsx
const [category, setCategory] = useQueryState('category');
```
Note: `useQueryState` returns `string | null`. When null, the filter is inactive ("All" is selected).

### Pattern 3: Category chip row in EventFilters
**What:** Horizontal scrolling row of chip buttons, one per category plus an "All" chip, styled to match the existing date chips.
**When to use:** Render below the existing date chips in `EventFilters.tsx`.

The existing active chip style is: `bg-[#E85D26] text-white border-[#E85D26] shadow-sm`
The existing inactive chip style is: `bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50`

```typescript
// Source: src/components/events/EventFilters.tsx — extend DATE_CHIPS pattern
import { EVENT_CATEGORIES } from '@/lib/db/schema';

const CATEGORY_CHIPS = [
  { value: null, label: 'All' },
  ...EVENT_CATEGORIES.map((c) => ({ value: c, label: formatCategoryLabel(c) })),
] as const;
```

Label formatting: convert snake_case to Title Case (e.g., `live_music` → `Live Music`). A simple helper:
```typescript
function formatCategoryLabel(cat: string): string {
  return cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
```

### Pattern 4: Inserting category into the page.tsx filter chain
**What:** Read `category` from `useQueryState` in `HomeContent`, insert `filterByCategory` into both branches of the `useMemo` filter chain (cluster mode and timelapse mode).
**When to use:** In `page.tsx` `useMemo` that computes `sidebarEvents`, `heatPoints`, `timeFilteredEvents`.

```typescript
// Cluster mode branch:
const dateFiltered = filterByDateRange(allEvents, when);
const provinceFiltered = filterByProvince(dateFiltered, province);
const categoryFiltered = filterByCategory(provinceFiltered, category);  // NEW
return {
  sidebarEvents: filterByBounds(categoryFiltered, bounds),
  heatPoints: [],
  timeFilteredEvents: [],
};

// Timelapse mode branch:
const timeWindowed = filterByTimeWindow(allEvents, center.getTime(), 24);
const provinceFiltered = filterByProvince(timeWindowed, province);
const categoryFiltered = filterByCategory(provinceFiltered, category);  // NEW
return {
  sidebarEvents: filterByBounds(categoryFiltered, bounds),
  heatPoints: computeVenueHeatPoints(categoryFiltered),  // was provinceFiltered
  timeFilteredEvents: categoryFiltered,                  // was provinceFiltered
};
```

This single change satisfies both FILT-01 (sidebar) and FILT-02 (heatmap).

### Pattern 5: Category badge on EventCard
**What:** Small pill badge below the date/price row, using category label and a neutral or colored style.
**When to use:** In `EventCard.tsx`, render badge when `ev.event_category` is present (it always will be after Phase 7 backfill).

```typescript
// Source: modelled on price badge in src/components/events/EventCard.tsx
{ev.event_category && (
  <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded font-medium">
    {formatCategoryLabel(ev.event_category)}
  </span>
)}
```

### Pattern 6: Category badge on event detail page
**What:** Same badge rendering added to `src/app/event/[id]/page.tsx` near the price badge section.

```typescript
// Source: modelled on price badge block in event/[id]/page.tsx
{event.event_category && (
  <span className="inline-block bg-orange-50 text-orange-700 border border-orange-200 text-sm font-medium px-3 py-1 rounded-full mb-4">
    {formatCategoryLabel(event.event_category)}
  </span>
)}
```

### Pattern 7: Sharing formatCategoryLabel
**What:** The label formatter is needed in `EventFilters`, `EventCard`, and the event detail page. Extract to a utility.
**When to use:** Put in `src/lib/categories.ts` (file already exists — check its contents) or a new `src/lib/format-utils.ts`.

Check `src/lib/categories.ts` — if it's empty or minimal, add `formatCategoryLabel` there. This avoids duplication.

### Pattern 8: hasFilters includes category
**What:** The "Clear filters" button in `EventFilters` appears when `hasFilters` is true. Extend to include `category`.

```typescript
const hasFilters = !!(when || province || category);  // was: !!(when || province)

function handleClearFilters() {
  setWhen(null);
  setProvince(null);
  setCategory(null);  // NEW
  onProvinceChange?.(null);
}
```

### Pattern 9: Back-link preservation in event detail page
**What:** `event/[id]/page.tsx` already rebuilds the back-link with `?when=` and `?province=` from searchParams. Extend to include `?category=`.

```typescript
if (sp.category && typeof sp.category === 'string') backParams.set('category', sp.category);
```

### Anti-Patterns to Avoid
- **Filtering in the API route:** The `/api/events` endpoint fetches all events; filtering happens client-side in `useMemo`. Do NOT add category filtering to the API — the client already has all data and filters it reactively. Adding server-side filtering would require a separate fetch on every chip click.
- **Storing category in React state instead of URL:** This violates FILT-03. Always use `useQueryState`.
- **Re-declaring EVENT_CATEGORIES:** They are already exported from `src/lib/db/schema.ts` as `as const`. Import from there; never duplicate them.
- **Forgetting the timelapse branch:** The `useMemo` in `page.tsx` has two branches (cluster and timelapse). Both need `filterByCategory`. Missing the timelapse branch violates FILT-02.
- **Forgetting to add `category` to the `useMemo` dependency array:** `[mapMode, timePosition, allEvents, when, province, category, bounds]` — omitting `category` causes stale filter results.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL state sync | Custom `useEffect` + `window.history.pushState` | `nuqs` `useQueryState` | Already installed; handles SSR, Next.js router integration, and serialization |
| Category validation | Manual string comparison | `EVENT_CATEGORIES` const array from schema | Single source of truth; already typed |
| Label formatting | Elaborate i18n or lookup table | Simple snake_case → Title Case function | 8 fixed values, no localization needed |

**Key insight:** The hardest parts (URL sync, filter composition, heatmap data flow) are already built. This phase is pure composition and UI extension.

## Common Pitfalls

### Pitfall 1: nuqs requires Suspense boundary
**What goes wrong:** `useQueryState` calls inside a component that isn't wrapped in `<Suspense>` cause a hydration error in Next.js.
**Why it happens:** nuqs reads search params from the URL during SSR, which requires Suspense.
**How to avoid:** `EventFilters` is rendered inside `HomeContent` which is already wrapped in `<Suspense>` in `Home()`. No additional Suspense needed. Verify before adding any new `useQueryState` calls.
**Warning signs:** `useSearchParams()` error during build or hydration.

### Pitfall 2: Chip scroll overflow on mobile
**What goes wrong:** 8 category chips + "All" chip = 9 chips. On small screens, the filter bar wraps into multiple lines and pushes content down.
**Why it happens:** `flex-wrap` in the existing `EventFilters` container will wrap chips to new rows.
**How to avoid:** Use `overflow-x-auto` with `flex-nowrap` on the category chip row specifically, allowing horizontal scroll. Add `-webkit-overflow-scrolling: touch` via Tailwind `overflow-x-auto` class.

```typescript
<div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
  {/* chips */}
</div>
```

Consider hiding the scrollbar: `[&::-webkit-scrollbar]:hidden` in Tailwind v4.
**Warning signs:** Filter bar height increases significantly on mobile viewport.

### Pitfall 3: event_category type mismatch in filter
**What goes wrong:** `e.events.event_category` is typed as `'live_music' | 'comedy' | ... | null` (the pgEnum type). Comparing to a `string | null` from `useQueryState` may produce a TypeScript error.
**Why it happens:** nuqs returns `string | null`; the schema type is a union of literals or null.
**How to avoid:** Cast the comparison or use `EVENT_CATEGORIES.includes()` to narrow. Simpler: compare with `===` which TypeScript accepts since `string` contains the literal type values.

```typescript
// This is safe; TypeScript won't error on equality comparison
return events.filter((e) => e.events.event_category === category);
```

### Pitfall 4: Missing dependency in useMemo
**What goes wrong:** Category filter state changes but filtered events don't update.
**Why it happens:** `category` not added to the dependency array in the `useMemo` in `page.tsx`.
**How to avoid:** Add `category` to `[mapMode, timePosition, allEvents, when, province, category, bounds]`.
**Warning signs:** Chip UI updates visually but event list/map don't react.

### Pitfall 5: categories.ts file contents
**What goes wrong:** `src/lib/categories.ts` might already contain something. Overwriting it loses existing content.
**Why it happens:** The file exists in the project (confirmed in directory listing) but wasn't read during research.
**How to avoid:** Read `src/lib/categories.ts` before writing to it. Add `formatCategoryLabel` export if the file is empty or compatible.

### Pitfall 6: Timelapse mode shows "All" chip but filter bar is hidden
**What goes wrong:** In timelapse mode, `EventFilters` is not rendered (`mapMode === 'cluster' ? <EventFilters ... /> : null`). The category chip sits inside `EventFilters`, so it disappears in timelapse mode — but timelapse still needs to honor the `?category=` URL param.
**Why it happens:** Filter bar is intentionally hidden during timelapse (TimelineBar replaces it). But the URL param persists.
**How to avoid:** The `useMemo` filter chain reads `category` from `useQueryState` in `HomeContent` regardless of whether `EventFilters` renders. As long as `filterByCategory` is applied in the timelapse branch of `useMemo`, the heatmap correctly honors the filter even when the chip UI is hidden. This is correct behavior — the URL-persisted filter still applies.

## Code Examples

Verified patterns from official sources:

### nuqs useQueryState — current usage (from src/app/page.tsx)
```typescript
// Source: src/app/page.tsx lines 65-66
const [when] = useQueryState('when');
const [province] = useQueryState('province');
// Extend with:
const [category] = useQueryState('category');
```

### nuqs useQueryState with setter (from src/components/events/EventFilters.tsx)
```typescript
// Source: src/components/events/EventFilters.tsx lines 19-20
const [when, setWhen] = useQueryState('when');
const [province, setProvince] = useQueryState('province');
// Extend with:
const [category, setCategory] = useQueryState('category');
```

### EVENT_CATEGORIES import (from src/lib/db/schema.ts)
```typescript
// Source: src/lib/db/schema.ts lines 14-16
export const EVENT_CATEGORIES = [
  'live_music', 'comedy', 'theatre', 'arts', 'sports', 'festival', 'community', 'other',
] as const;
```

### Existing chip button pattern (from EventFilters.tsx)
```typescript
// Source: src/components/events/EventFilters.tsx lines 50-65
<button
  key={chip.label}
  onClick={() => handleChipClick(chip.value)}
  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
    isActive
      ? 'bg-[#E85D26] text-white border-[#E85D26] shadow-sm'
      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
  }`}
>
  {chip.label}
</button>
```

### Existing useMemo filter chain (from src/app/page.tsx lines 81-99)
```typescript
const { sidebarEvents, heatPoints, timeFilteredEvents } = useMemo(() => {
  if (mapMode === 'timelapse') {
    const center = positionToTimestamp(timePosition, referenceDate.current);
    const timeWindowed = filterByTimeWindow(allEvents, center.getTime(), 24);
    const provinceFiltered = filterByProvince(timeWindowed, province);
    // INSERT: const categoryFiltered = filterByCategory(provinceFiltered, category);
    return {
      sidebarEvents: filterByBounds(provinceFiltered, bounds),        // → categoryFiltered
      heatPoints: computeVenueHeatPoints(provinceFiltered),           // → categoryFiltered
      timeFilteredEvents: provinceFiltered,                           // → categoryFiltered
    };
  }
  const dateFiltered = filterByDateRange(allEvents, when);
  const provinceFiltered = filterByProvince(dateFiltered, province);
  // INSERT: const categoryFiltered = filterByCategory(provinceFiltered, category);
  return {
    sidebarEvents: filterByBounds(provinceFiltered, bounds),          // → categoryFiltered
    heatPoints: [],
    timeFilteredEvents: [],
  };
}, [mapMode, timePosition, allEvents, when, province, bounds]);
// ADD: category to dep array
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual URL sync with `useEffect` | `nuqs` `useQueryState` | nuqs v2 adopted in v1.0 | URL params as first-class React state |
| Class components for map | `react-leaflet` hooks | Phase 1 | Functional components throughout |

**Deprecated/outdated:**
- `next/router` useRouter for search params: Use `nuqs` `useQueryState` in this project — it's already the pattern.

## Open Questions

1. **Contents of src/lib/categories.ts**
   - What we know: The file exists (confirmed in directory listing).
   - What's unclear: Whether it already defines any exports that could conflict or be reused.
   - Recommendation: Planner should include a task step to read `src/lib/categories.ts` before writing to it. If empty, add `formatCategoryLabel` there. If it has content, extend carefully.

2. **FilterByCategory placement in out-of-scope multi-select future**
   - What we know: REQUIREMENTS.md explicitly marks multi-select as out of scope for v1.2. Single-select only.
   - What's unclear: None — confirmed single-select.
   - Recommendation: Design `filterByCategory(events, category: string | null)` with a single string param. No arrays. Do not over-engineer for future multi-select.

3. **Empty state message when category filter active**
   - What we know: `getEmptyMessage()` in `page.tsx` handles `when` and `province` cases.
   - What's unclear: Whether to add a category-specific empty message.
   - Recommendation: Add a category case: `No {category} events in this area. Try All categories.` — consistent with existing pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest |
| Config file | `jest.config.ts` (root) |
| Quick run command | `npm test -- --testPathPattern=filter-utils` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILT-01 | `filterByCategory` returns all events when null | unit | `npm test -- --testPathPattern=filter-utils` | ❌ Wave 0 — add to `filter-utils.test.ts` |
| FILT-01 | `filterByCategory` returns only matching category events | unit | `npm test -- --testPathPattern=filter-utils` | ❌ Wave 0 — add to `filter-utils.test.ts` |
| FILT-01 | `filterByCategory` returns empty array when no match | unit | `npm test -- --testPathPattern=filter-utils` | ❌ Wave 0 — add to `filter-utils.test.ts` |
| FILT-02 | Heatmap receives category-filtered events (tested via `filterByCategory` unit test + manual verification) | unit + manual | `npm test -- --testPathPattern=filter-utils` | ❌ Wave 0 |
| FILT-03 | URL param persists (nuqs integration — manual verification) | manual | n/a | manual only |

Note: `filter-utils.test.ts` already exists and has a pattern to follow. New `filterByCategory` tests go in the same file, following the `makeEvent` helper pattern. The `makeEvent` helper does not include `event_category` yet — it needs to be extended to support category override.

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=filter-utils`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add `filterByCategory` tests to `src/lib/filter-utils.test.ts` — covers FILT-01, FILT-02
- [ ] Extend `makeEvent` helper in `filter-utils.test.ts` to support `event_category` override — currently the helper does not include `event_category` in the events partial (the schema field was added in Phase 6/7 after the test was written)

*(No new test file needed — extend existing `filter-utils.test.ts`)*

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/lib/filter-utils.ts` — established filter function contract
- Direct code inspection: `src/lib/db/schema.ts` — `EVENT_CATEGORIES` const, `event_category` column definition
- Direct code inspection: `src/app/page.tsx` — full `useMemo` filter chain, `useQueryState` usage
- Direct code inspection: `src/components/events/EventFilters.tsx` — chip pattern, nuqs integration
- Direct code inspection: `src/components/events/EventCard.tsx` — badge pattern
- Direct code inspection: `src/app/event/[id]/page.tsx` — event detail page, back-link param preservation
- Direct code inspection: `src/components/map/MapClient.tsx` — how heatPoints flow into `HeatmapLayer`
- Direct code inspection: `package.json` — nuqs ^2.8.9 installed, no missing dependencies
- Direct code inspection: `jest.config.ts` — test environment and module resolution

### Secondary (MEDIUM confidence)
- nuqs v2 API: `useQueryState` returns `string | null`, setter accepts `string | null` — inferred from project's existing usage patterns (HIGH confidence within this codebase, MEDIUM without direct docs check)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use; no new dependencies
- Architecture: HIGH — all patterns are direct extensions of existing, verified code
- Pitfalls: HIGH — identified from direct code inspection of the integration points
- Test infrastructure: HIGH — jest.config.ts and filter-utils.test.ts directly inspected

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable Next.js/nuqs/Tailwind stack; 30-day window)
