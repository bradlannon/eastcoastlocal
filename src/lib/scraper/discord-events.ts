/**
 * Discord Scheduled Events scraper.
 *
 * Two modes:
 * 1. Bot token (DISCORD_BOT_TOKEN) — for servers the bot has been invited to
 * 2. User token (DISCORD_USER_TOKEN) — for community servers you've joined
 *    (reads scheduled events from any server you're a member of)
 *
 * The user token approach auto-discovers all guilds and their events.
 * The bot token approach uses a hardcoded guild list.
 */
import { findOrCreateVenue } from './ticketmaster';
import { upsertEvent } from './normalizer';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

const DISCORD_API = 'https://discord.com/api/v10';

// ─── Atlantic Canada guild mapping ───────────────────────────────────────

/** Province/city mapping for known Atlantic Canada Discord servers. */
const GUILD_METADATA: Record<string, { province: string; defaultCity: string }> = {
  '111208661371592704': { province: 'NS', defaultCity: 'Halifax' },         // Halifax
  '411241752398266368': { province: 'NS', defaultCity: 'Halifax' },         // /r/Halifax
  '478720986561380352': { province: 'NB', defaultCity: 'Fredericton' },     // New Brunswick
  '504331737912836097': { province: 'NL', defaultCity: "St. John's" },      // Newfoundland & Labrador
  '798005281257685003': { province: 'PEI', defaultCity: 'Charlottetown' },  // r/PEI
  '1483615762706075731': { province: 'NS', defaultCity: 'Halifax' },        // ECL Atlantic Events
};

/** Guild IDs to skip (not Atlantic Canada related). */
const GUILD_SKIP = new Set([
  '695978311121240134', // The RPM Challenge
  '883941461400387615', // turkish
  '892217445304131615', // Wilder World
  '920588441064996964', // TheNovatar's server
]);

// ─── Discord API types ───────────────────────────────────────────────────

interface DiscordGuildBasic {
  id: string;
  name: string;
}

interface DiscordScheduledEvent {
  id: string;
  guild_id: string;
  name: string;
  description?: string | null;
  scheduled_start_time: string;
  scheduled_end_time?: string | null;
  entity_type: 1 | 2 | 3;
  entity_metadata?: { location?: string } | null;
  status: 1 | 2 | 3 | 4;
  image?: string | null;
  user_count?: number;
}

// ─── Result types ────────────────────────────────────────────────────────

export interface DiscordFeedResult {
  guildId: string;
  guildName: string;
  eventsFound: number;
  eventsUpserted: number;
  errors: number;
}

// ─── Core event processor ────────────────────────────────────────────────

async function processGuildEvents(
  guildId: string,
  guildName: string,
  events: DiscordScheduledEvent[],
): Promise<DiscordFeedResult> {
  const result: DiscordFeedResult = {
    guildId,
    guildName,
    eventsFound: events.length,
    eventsUpserted: 0,
    errors: 0,
  };

  const meta = GUILD_METADATA[guildId] ?? { province: 'NS', defaultCity: '' };
  const now = new Date();

  for (const event of events) {
    try {
      if (event.status !== 1 && event.status !== 2) continue;

      const startDate = new Date(event.scheduled_start_time);
      if (startDate < now) continue;

      const eventDate = startDate.toISOString().slice(0, 10);
      const eventTime = startDate.toISOString().slice(11, 16);

      const location = event.entity_metadata?.location ?? '';
      const venueName = location.split(',')[0]?.trim() || guildName;
      const city = meta.defaultCity;

      const venueId = await findOrCreateVenue(venueName, city, meta.province, location || city);

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

      await upsertEvent(venueId, extracted, `discord:guild:${guildId}`, null, 'scrape');
      result.eventsUpserted++;
    } catch (err) {
      console.error(`  [discord:${guildId}] Event "${event.name}" error:`, err instanceof Error ? err.message : err);
      result.errors++;
    }
  }

  return result;
}

// ─── User token mode: auto-discover all joined guilds ────────────────────

async function fetchWithUserToken(token: string): Promise<DiscordFeedResult[]> {
  // Step 1: Get all guilds the user has joined
  const guildsResp = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: token },
  });

  if (!guildsResp.ok) {
    throw new Error(`Discord user guilds API error: ${guildsResp.status}`);
  }

  const allGuilds = (await guildsResp.json()) as DiscordGuildBasic[];

  // Filter to Atlantic Canada guilds (known + any with metadata)
  const targetGuilds = allGuilds.filter(
    (g) => GUILD_METADATA[g.id] || !GUILD_SKIP.has(g.id)
  );

  // Prefer only known Atlantic Canada guilds to avoid noise
  const knownGuilds = targetGuilds.filter((g) => GUILD_METADATA[g.id]);
  const guildsToScan = knownGuilds.length > 0 ? knownGuilds : targetGuilds;

  console.log(`[discord:user] Scanning ${guildsToScan.length} guilds for scheduled events...`);

  const results: DiscordFeedResult[] = [];

  for (const guild of guildsToScan) {
    try {
      const eventsResp = await fetch(
        `${DISCORD_API}/guilds/${guild.id}/scheduled-events?with_user_count=true`,
        { headers: { Authorization: token } },
      );

      if (!eventsResp.ok) {
        // 403 = bot/user doesn't have permission, skip silently
        if (eventsResp.status === 403) continue;
        throw new Error(`HTTP ${eventsResp.status}`);
      }

      const events = (await eventsResp.json()) as DiscordScheduledEvent[];
      if (events.length === 0) continue; // Skip guilds with no events

      console.log(`  ◆ ${guild.name}: ${events.length} scheduled events`);
      const result = await processGuildEvents(guild.id, guild.name, events);
      console.log(`  ✓ ${guild.name}: ${result.eventsUpserted}/${result.eventsFound} upserted`);
      results.push(result);

      // Courtesy delay between guilds
      await new Promise((r) => setTimeout(r, 500));
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

// ─── Bot token mode: hardcoded guild list ────────────────────────────────

async function fetchWithBotToken(token: string): Promise<DiscordFeedResult[]> {
  const guildIds = Object.keys(GUILD_METADATA);

  console.log(`[discord:bot] Scanning ${guildIds.length} guilds for scheduled events...`);

  const results: DiscordFeedResult[] = [];

  for (const guildId of guildIds) {
    const meta = GUILD_METADATA[guildId];
    try {
      const resp = await fetch(
        `${DISCORD_API}/guilds/${guildId}/scheduled-events?with_user_count=true`,
        { headers: { Authorization: `Bot ${token}` } },
      );

      if (!resp.ok) {
        if (resp.status === 403) continue; // Bot not in this guild
        throw new Error(`HTTP ${resp.status}`);
      }

      const events = (await resp.json()) as DiscordScheduledEvent[];
      if (events.length === 0) continue;

      const guildName = `Guild ${guildId}`;
      console.log(`  ◆ ${guildName}: ${events.length} scheduled events`);
      const result = await processGuildEvents(guildId, guildName, events);
      results.push(result);
    } catch (err) {
      console.error(`  ✗ Guild ${guildId}: ${err instanceof Error ? err.message : err}`);
      results.push({
        guildId,
        guildName: `Guild ${guildId}`,
        eventsFound: 0,
        eventsUpserted: 0,
        errors: 1,
      });
    }
  }

  return results;
}

// ─── Orchestrator ────────────────────────────────────────────────────────

export async function fetchAllDiscordEvents(): Promise<DiscordFeedResult[]> {
  const userToken = process.env.DISCORD_USER_TOKEN;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  // Prefer user token (can access all joined servers)
  if (userToken) {
    console.log('Using Discord user token (auto-discovery mode)');
    return fetchWithUserToken(userToken);
  }

  // Fall back to bot token (only servers bot is invited to)
  if (botToken) {
    console.log('Using Discord bot token (configured guilds only)');
    return fetchWithBotToken(botToken);
  }

  console.log('No DISCORD_USER_TOKEN or DISCORD_BOT_TOKEN set — skipping Discord events');
  return [];
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
