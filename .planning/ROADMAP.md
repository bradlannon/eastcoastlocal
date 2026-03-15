# Roadmap: East Coast Local

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-14)
- ✅ **v1.1 Heatmap Timelapse** — Phases 4-5 (shipped 2026-03-14)
- ✅ **v1.2 Event Discovery** — Phases 6-9 (shipped 2026-03-15)
- 🚧 **v1.3 Admin Tools** — Phases 10-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-3) — SHIPPED 2026-03-14</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-03-14
- [x] Phase 2: Data Pipeline (3/3 plans) — completed 2026-03-14
- [x] Phase 3: Public Frontend (3/3 plans) — completed 2026-03-14

</details>

<details>
<summary>✅ v1.1 Heatmap Timelapse (Phases 4-5) — SHIPPED 2026-03-14</summary>

- [x] Phase 4: Timelapse Core (4 plans) — completed 2026-03-14
- [x] Phase 5: Click-Through (2 plans) — completed 2026-03-14

</details>

<details>
<summary>✅ v1.2 Event Discovery (Phases 6-9) — SHIPPED 2026-03-15</summary>

- [x] Phase 6: Category Schema (1/1 plans) — completed 2026-03-14
- [x] Phase 7: AI Categorization (2/2 plans) — completed 2026-03-14
- [x] Phase 8: Category Filter UI (1/1 plans) — completed 2026-03-14
- [x] Phase 9: Source Discovery (2/2 plans) — completed 2026-03-15

</details>

### v1.3 Admin Tools (In Progress)

**Milestone Goal:** Give operators a protected web UI to manage venues, scrape sources, and review discovered candidates — replacing CLI and direct DB access

- [x] **Phase 10: Admin Auth** - Protect /admin routes behind a login gate (completed 2026-03-15)
- [x] **Phase 11: Admin Dashboard** - Operator landing page with system health at a glance (completed 2026-03-15)
- [x] **Phase 12: Venue & Source Management** - Full CRUD for venues and their scrape sources (completed 2026-03-15)
- [ ] **Phase 13: Discovery Review** - UI workflow to approve or reject discovered source candidates

## Phase Details

### Phase 10: Admin Auth
**Goal**: Admin routes are secured — only authenticated operators can access /admin pages
**Depends on**: Phase 9
**Requirements**: AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. Visiting any /admin URL without being logged in redirects to a login page
  2. Admin can enter a configured email/password and gain access to /admin
  3. An authenticated session persists across page navigation within the admin area
  4. Logging out returns the operator to the login page and blocks re-access without credentials
**Plans:** 1/1 plans complete

Plans:
- [ ] 10-01-PLAN.md — JWT auth with middleware, login page, and session management

### Phase 11: Admin Dashboard
**Goal**: Operators land on a dashboard that immediately shows system health and key counts
**Depends on**: Phase 10
**Requirements**: DASH-01, DASH-02
**Success Criteria** (what must be TRUE):
  1. Dashboard shows total venue count, active source count, pending discovery count, and last scrape time
  2. Admin can see per-source scrape status including last success timestamp, last error, and enabled/disabled state
  3. All dashboard data reflects the current database state without requiring a page refresh or manual query
**Plans:** 1/1 plans complete

Plans:
- [ ] 11-01-PLAN.md — Dashboard page with stat cards, source health table, nav links, and loading skeleton

### Phase 12: Venue & Source Management
**Goal**: Operators can view, add, and edit venues and their scrape sources through a web UI — no direct DB access needed
**Depends on**: Phase 11
**Requirements**: VENUE-01, VENUE-02, VENUE-03, VENUE-04, VENUE-05
**Success Criteria** (what must be TRUE):
  1. Admin can view a paginated list of all venues showing name, province, and number of attached sources
  2. Admin can create a new venue by entering name, address, city, and province
  3. Admin can edit an existing venue's name, address, city, or province and save changes
  4. Admin can add a scrape source URL to any venue, creating a new scrape_sources row
  5. Admin can toggle a scrape source enabled or disabled without deleting it
**Plans:** 2/2 plans complete

Plans:
- [ ] 12-01-PLAN.md — Venue list page, venue detail/edit form, update action with geocoding, active nav
- [ ] 12-02-PLAN.md — Add venue form, scrape source add/toggle on venue detail page

### Phase 13: Discovery Review
**Goal**: Operators can review, approve, and reject discovered source candidates through a web UI — replacing the CLI promotion workflow
**Depends on**: Phase 12
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04
**Success Criteria** (what must be TRUE):
  1. Admin can view discovered sources filtered by status (pending, approved, rejected)
  2. Admin can see the raw_context and discovery_method for each candidate before making a decision
  3. Admin can approve a candidate, which promotes it to a venue and active scrape source (equivalent to the current CLI workflow)
  4. Admin can reject a candidate with an optional reason recorded in the database
**Plans:** 1/2 plans executed

Plans:
- [ ] 13-01-PLAN.md — Discovery list page with status tab filtering, expandable detail rows, and loading skeleton
- [ ] 13-02-PLAN.md — Approve and reject server actions wired to DiscoveryList with inline reject reason input

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-14 |
| 2. Data Pipeline | v1.0 | 3/3 | Complete | 2026-03-14 |
| 3. Public Frontend | v1.0 | 3/3 | Complete | 2026-03-14 |
| 4. Timelapse Core | v1.1 | 4/4 | Complete | 2026-03-14 |
| 5. Click-Through | v1.1 | 2/2 | Complete | 2026-03-14 |
| 6. Category Schema | v1.2 | 1/1 | Complete | 2026-03-14 |
| 7. AI Categorization | v1.2 | 2/2 | Complete | 2026-03-14 |
| 8. Category Filter UI | v1.2 | 1/1 | Complete | 2026-03-14 |
| 9. Source Discovery | v1.2 | 2/2 | Complete | 2026-03-15 |
| 10. Admin Auth | 1/1 | Complete    | 2026-03-15 | - |
| 11. Admin Dashboard | 1/1 | Complete    | 2026-03-15 | - |
| 12. Venue & Source Management | 2/2 | Complete    | 2026-03-15 | - |
| 13. Discovery Review | 1/2 | In Progress|  | - |
