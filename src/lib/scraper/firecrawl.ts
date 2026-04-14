import Firecrawl from '@mendable/firecrawl-js';
import type { ZodSchema } from 'zod';

// Lazy singleton — one client instance per process
let client: Firecrawl | null = null;

function getClient(): Firecrawl {
  if (client) return client;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set');
  client = new Firecrawl({ apiKey });
  return client;
}

/**
 * Scrape a URL and return the page as Markdown + metadata.
 * Throws a descriptive error (including URL) if the SDK call fails.
 */
export async function scrapeMarkdown(url: string): Promise<{
  markdown: string;
  metadata: Record<string, unknown>;
}> {
  try {
    const doc = await getClient().scrape(url, { formats: ['markdown'] });
    return {
      markdown: doc.markdown ?? '',
      metadata: (doc.metadata as Record<string, unknown>) ?? {},
    };
  } catch (err) {
    throw new Error(`Firecrawl scrape failed for ${url}: ${(err as Error).message}`);
  }
}

/**
 * Scrape a URL and extract structured data matching the provided Zod schema.
 * Throws a descriptive error (including URL) if the SDK call fails.
 */
export async function extractWithSchema<T>(
  url: string,
  schema: ZodSchema<T>
): Promise<T> {
  try {
    const doc = await getClient().scrape(url, {
      formats: [{ type: 'json', schema }],
    });
    return doc.json as T;
  } catch (err) {
    throw new Error(`Firecrawl extract failed for ${url}: ${(err as Error).message}`);
  }
}

/** Reset the lazy singleton — for test isolation only. */
export function __resetForTests(): void {
  client = null;
}
