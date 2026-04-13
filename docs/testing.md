# Testing Guide

## Layers
- **Jest node** — `src/**/*.test.ts`: pure functions, API route handlers, server lib
- **Jest jsdom** — `src/**/*.test.tsx`: React components with RTL
- **Playwright** — `e2e/**/*.spec.ts`: API integration, admin flows, public flows

## Setup
1. Copy `.env.test.example` → `.env.test`, point `DATABASE_URL` to a dedicated test DB (Neon branch recommended).
2. `npm run db:migrate` with `DATABASE_URL` from `.env.test`.
3. `npm run test:all`.

## External APIs
Mocked in all tests. Never hits Anthropic/Gemini/Eventbrite/Ticketmaster/Reddit/Overpass.

## Red/Green Discipline
See `docs/superpowers/specs/2026-04-13-full-test-coverage-design.md`. Mismatches go to `docs/test-findings.md`; do not fix source in this pass.

## Adding a test
1. Colocate Jest tests next to the source file.
2. Playwright specs live in `e2e/{public,admin,api}/`.
3. Use helpers from `e2e/fixtures/{auth,db,mocks}.ts`.
