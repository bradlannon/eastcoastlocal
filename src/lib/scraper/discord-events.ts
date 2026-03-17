/**
 * Discord Scheduled Events scraper.
 *
 * Fetches scheduled events from configured Discord guilds via the REST API.
 * Requires a bot token with VIEW_CHANNEL permission in each guild.
 *
 * Env: DISCORD_BOT_TOKEN — create at https://discord.com/developers/applications
 * Invite URL: https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=1024&scope=bot
 */
import { findOrCreateVenue } from './ticketmaster';
import { upsertEvent } from './normalizer';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

const DISCORD_API = 'https://discord.com/api/v10';

// ─── Guild registry ──────────────────────────────────────────────────────

export interface DiscordGuild {
  id: string;
  name: string;
  province: string;
  defaultCity: string;
}

/**
 * Atlantic Canada Discord servers to monitor for scheduled events.
 * Add guild IDs here after inviting the bot to each server.
 */
export const DISCORD_GUILDS: DiscordGuild[] = [
  // Uncomment and add guild IDs after creating the bot and joining servers:
  // { id: '123456789012345678', name: 'r/Halifax', province: 'NS', defaultCity: 'Halifax' },
  // { id: '234567890123456789', name: 'Nova Scotia Community', province: 'NS', defaultCity: 'Halifax' },
  // { id: '345678901234567890', name: 'Fredericton Events', province: 'NB', defaultCity: 'Fredericton' },
];

// ─── Discord API types ───────────────────────────────────────────────────

interface DiscordScheduledEvent {
  id: string;
  guild_id: string;
  name: string;
  description?: string | null;
  scheduled_start_time: string; // ISO8601
  scheduled_end_time?: string | null;
  entity_type: 1 | 2 | 3; // STAGE_INSTANCE | VOICE | EXTERNAL
  entity_metadata?: { location?: string } | null;
  status: 1 | 2 | 3 | 4; // SCHEDULED | ACTIVE | COMPLETED | CANCELED
  image?: string | null;
  user_count?: number;
}

// ─── Fetcher ─────────────────────────────────────────────────────────────

export interface DiscordFeedResult {
  guildId: string;
  guildName: string;
  eventsFound: number;
  eventsUpserted: number;
  errors: number;
}

async function fetchGuildEvents(guild: DiscordGuild, token: string): Promise<DiscordFeedResult> {
  const result: DiscordFeedResult = {
    guildId: guild.id,
    guildName: guild.name,
    eventsFound: 0,
    eventsUpserted: 0,
    errors: 0,
  };

  const resp = await fetch(`${DISCORD_API}/guilds/${guild.id}/scheduled-events?with_user_count=true`, {
    headers: { Authorization: `Bot ${token}` },
  });

  if (!resp.ok) {
    throw new Error(`Discord API error: ${resp.status} for guild ${guild.name} (${guild.id})`);
  }

  const events = (await resp.json()) as DiscordScheduledEvent[];
  result.eventsFound = events.length;

  const now = new Date();

  for (const event of events) {
    try {
      // Only process SCHEDULED or ACTIVE events
      if (event.status !== 1 && event.status !== 2) continue;

      const startDate = new Date(event.scheduled_start_time);
      if (startDate < now) continue;

      const eventDate = startDate.toISOString().slice(0, 10);
      const eventTime = startDate.toISOString().slice(11, 16);

      // Determine venue from event location or guild default
      const location = event.entity_metadata?.location ?? '';
      const venueName = location.split(',')[0]?.trim() || guild.name;
      const city = guild.defaultCity;

      const venueId = await findOrCreateVenue(venueName, city, guild.province, location || city);

      // Build cover image URL if available
      const coverUrl = event.image
        ? `https://cdn.discordapp.com/guild-events/${event.id}/${event.image}.png`
        : null;

      const extracted: ExtractedEvent = {
        performer: event.name,
        event_date: eventDate,
        event_time: eventTime !== '00:00' ? eventTime : null,
        price: null,
        ticket_link: `https://discord.com/events/${event.guild_id}/${event.id}`,
        description: event.description?.slice(0, 500) ?? null,
        cover_image_url: coverUrl,
        confidence: 1.0,
        event_category: guessCategoryFromEvent(event.name, event.description ?? ''),
      };

      await upsertEvent(venueId, extracted, `discord:guild:${guild.id}`, null, 'scrape');
      result.eventsUpserted++;
    } catch (err) {
      console.error(`  [discord:${guild.id}] Event "${event.name}" error:`, err instanceof Error ? err.message : err);
      result.errors++;
    }
  }

  return result;
}

// ─── Orchestrator ────────────────────────────────────────────────────────

export async function fetchAllDiscordEvents(guildIds?: string[]): Promise<DiscordFeedResult[]> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log('DISCORD_BOT_TOKEN not set — skipping Discord events');
    return [];
  }

  const guilds = guildIds
    ? DISCORD_GUILDS.filter((g) => guildIds.includes(g.id))
    : DISCORD_GUILDS;

  if (guilds.length === 0) {
    console.log('No Discord guilds configured — skipping');
    return [];
  }

  console.log(`Fetching scheduled events from ${guilds.length} Discord guilds...`);

  const results: DiscordFeedResult[] = [];

  for (const guild of guilds) {
    try {
      console.log(`  ◆ ${guild.name}...`);
      const result = await fetchGuildEvents(guild, token);
      console.log(`  ✓ ${guild.name}: ${result.eventsUpserted}/${result.eventsFound} events upserted`);
      results.push(result);
    } catch (err) {
      console.error(`  ✗ ${guild.name}: ${err instanceof Error ? err.message : err}`);
      results.push({
        guildId: guild.id,
        guildName: guild.name,
        eventsFound: 0,
        eventsUpserted: 0,
        errors: 1,
      });
    }
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function guessCategoryFromEvent(name: string, description: string): ExtractedEvent['event_category'] {
  const text = (name + ' ' + description).toLowerCase();
  if (text.includes('concert') || text.includes('music') || text.includes('band') || text.includes('jam')) return 'live_music';
  if (text.includes('comedy') || text.includes('standup') || text.includes('improv')) return 'comedy';
  if (text.includes('theatre') || text.includes('theater') || text.includes('play')) return 'theatre';
  if (text.includes('art') || text.includes('gallery') || text.includes('exhibit')) return 'arts';
  if (text.includes('sport') || text.includes('game') || text.includes('hockey') || text.includes('soccer')) return 'sports';
  if (text.includes('festival') || text.includes('fest')) return 'festival';
  if (text.includes('market') || text.includes('community') || text.includes('workshop') || text.includes('meetup')) return 'community';
  return 'other';
}
