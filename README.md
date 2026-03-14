# East Coast Local

Discover live music across Atlantic Canada on an interactive map. AI-powered scraping automatically extracts event data from venue websites and event platforms so you don't have to check dozens of sites.

## Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) PostgreSQL database (or any PostgreSQL instance)
- [Google Gemini API key](https://aistudio.google.com/apikey) (for AI-powered event extraction)
- [Google Maps API key](https://console.cloud.google.com/apis/credentials) with Geocoding API enabled

Optional:
- [Eventbrite API token](https://www.eventbrite.com/platform/api) (for Eventbrite event sources)
- [Bandsintown App ID](https://www.artists.bandsintown.com/support/api-installation) (for Bandsintown event sources)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Neon provides this) |
| `CRON_SECRET` | Yes | Bearer token to authenticate cron scrape requests |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Gemini API key for AI event extraction |
| `GOOGLE_MAPS_API_KEY` | Yes | Google Maps Geocoding API key for venue coordinates |
| `EVENTBRITE_TOKEN` | No | Eventbrite API token for Eventbrite sources |
| `BANDSINTOWN_APP_ID` | No | Bandsintown app ID for Bandsintown sources |

### 3. Run database migrations

```bash
npm run db:migrate
```

### 4. Seed initial venues

Seeds 5 Atlantic Canada venues with their scrape source URLs:

```bash
npm run db:seed
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Fetching Event Data

Events are fetched by scraping venue websites and querying event platform APIs. The scraper uses Gemini AI to extract event details (performer, date, time, price) from arbitrary HTML — no brittle CSS selectors.

### Manual scrape (local development)

Trigger a scrape by hitting the cron endpoint:

```bash
curl http://localhost:3000/api/cron/scrape \
  -H "Authorization: Bearer $CRON_SECRET"
```

This will:
1. Fetch all enabled scrape sources from the database
2. For each venue website: fetch HTML, extract events with Gemini AI
3. For Eventbrite/Bandsintown sources: query their APIs
4. Geocode any venues missing coordinates (Google Maps API)
5. Upsert events to the database (deduped by venue + date + performer)

### Automated scraping (production)

On Vercel, a cron job runs daily at 6:00 AM UTC via `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/scrape",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Vercel automatically sends the `CRON_SECRET` as a bearer token. No manual setup needed after deployment.

### Adding new venues

New venues and scrape sources are added directly to the database. The seed data in `src/lib/db/seed-data.ts` shows the format:

- **Venue:** name, address, city, province, website, venue type
- **Scrape source:** URL to scrape, source type (`venue_website`, `eventbrite`, or `bandsintown`), frequency (`daily` or `weekly`)

Use Drizzle Studio to inspect or modify the database:

```bash
npm run db:studio
```

## Other Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build for production (runs migrations first) |
| `npm start` | Start production server |
| `npm test` | Run test suite |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate new migration after schema changes |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |

## Deployment

Deploy to Vercel:

1. Connect your GitHub repo to Vercel
2. Set all environment variables in Vercel project settings
3. Vercel auto-detects Next.js — builds and deploys on push
4. The cron job in `vercel.json` activates automatically

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Neon PostgreSQL + Drizzle ORM
- **AI Extraction:** Google Gemini 2.5 Flash via Vercel AI SDK
- **Geocoding:** Google Maps Geocoding API
- **Map:** Leaflet + react-leaflet with marker clustering
- **Styling:** Tailwind CSS 4
- **URL State:** nuqs for shareable filtered views
