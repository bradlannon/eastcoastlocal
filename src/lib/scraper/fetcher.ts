import * as cheerio from 'cheerio';
import { scrapeMarkdown } from './firecrawl';

// When FIRECRAWL_FALLBACK=1 is set, a failed or suspiciously-small primary fetch
// is retried via Firecrawl (opt-in to preserve cost control — default off).
const FIRECRAWL_FALLBACK_ENABLED = () => process.env.FIRECRAWL_FALLBACK === '1';

// Minimum HTML body length below which we consider the response suspicious
// (likely a JS shell or anti-bot redirect) and trigger Firecrawl fallback.
const FIRECRAWL_FALLBACK_MIN_CHARS = 500;

// Module-level per-domain rate limiting state
const domainLastRequest = new Map<string, number>();
const DOMAIN_MIN_GAP_MS = 2000; // 2s base + up to 500ms jitter

// Realistic Chrome UA for fallback fetch
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function applyDomainRateLimit(url: string): Promise<void> {
  const domain = new URL(url).hostname;
  const last = domainLastRequest.get(domain) ?? 0;
  const elapsed = Date.now() - last;
  const gap = DOMAIN_MIN_GAP_MS + Math.random() * 500; // 2000–2500ms
  if (elapsed < gap) {
    await delay(gap - elapsed);
  }
  domainLastRequest.set(domain, Date.now());
}

// ─── got-scraping with fallback ──────────────────────────────────────────

let _gotScraping: typeof import('got-scraping').gotScraping | null = null;
let _gotLoaded = false;

async function getGotScraping() {
  if (_gotLoaded) return _gotScraping;
  _gotLoaded = true;
  try {
    const mod = await import('got-scraping');
    _gotScraping = mod.gotScraping;
  } catch {
    // got-scraping unavailable (e.g. Vercel serverless) — will use fetch fallback
    _gotScraping = null;
  }
  return _gotScraping;
}

/**
 * Fetch with got-scraping if available, otherwise fall back to native fetch
 * with realistic Chrome headers. Retries transient errors with backoff.
 */
async function fetchWithRetry(url: string, retries = 2): Promise<{ body: string; statusCode: number }> {
  let lastErr: Error | null = null;
  const gotScraping = await getGotScraping();

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoffMs = 1000 * Math.pow(2, attempt - 1);
      await delay(backoffMs);
    }
    try {
      let body: string;
      let statusCode: number;

      if (gotScraping) {
        // got-scraping: browser-like TLS fingerprint + auto-generated headers
        const resp = await gotScraping({
          url,
          timeout: { request: 15_000 },
          headerGeneratorOptions: {
            browsers: ['chrome'],
            operatingSystems: ['macos', 'windows'],
            locales: ['en-US', 'en-CA'],
          },
        });
        body = resp.body;
        statusCode = resp.statusCode;
      } else {
        // Fallback: native fetch with realistic Chrome headers
        const resp = await fetch(url, {
          headers: {
            'User-Agent': CHROME_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          },
          signal: AbortSignal.timeout(15_000),
        });
        body = await resp.text();
        statusCode = resp.status;
      }

      if (statusCode === 429 || statusCode === 503) {
        if (attempt < retries) {
          lastErr = new Error(`HTTP error: ${statusCode} for ${url}`);
          continue;
        }
      }
      return { body, statusCode };
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}

function detectNextPageUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const nextLink = $(
    'a[rel="next"], ' +
    'a[aria-label*="next" i], ' +
    'a.pagination-next, ' +
    'li.next > a'
  ).first();
  const href = nextLink.attr('href');
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<{ html: string; text: string }> {
  await applyDomainRateLimit(url);

  const result = await fetchWithRetry(url);

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`HTTP error: ${result.statusCode} for ${url}`);
  }

  const html = result.body;

  if (html.length < 5000) {
    throw new Error(`Page too short (${html.length} chars) — likely bot-blocked: ${url}`);
  }

  if (html.includes('Just a moment') || html.includes('Checking your browser')) {
    throw new Error(`Bot-blocked (Cloudflare challenge detected): ${url}`);
  }

  if (html.includes('Enable JavaScript') && html.length < 10000) {
    throw new Error(`JS-gated page detected: ${url}`);
  }

  const $ = cheerio.load(html);

  // Remove noise elements
  $('script, style, nav, footer, header, aside, [class*="ad"], [id*="ad"]').remove();

  // Extract main content
  let text: string;
  const mainEl = $('main, article, [role="main"]');
  if (mainEl.length > 0) {
    text = mainEl.text();
  } else {
    text = $('body').text();
  }

  // Collapse whitespace and trim
  text = text.replace(/\s+/g, ' ').trim();

  return { html, text };
}

/**
 * Try primary fetch; if it fails (non-2xx, network error, or suspiciously small body)
 * AND FIRECRAWL_FALLBACK=1 is set, fall back to Firecrawl scrapeMarkdown.
 * Returns the same { text, rawHtml } shape as the primary path.
 */
async function fetchPageWithFirecrawlFallback(
  url: string
): Promise<{ html: string; text: string }> {
  // First, attempt a raw fetch without the full fetchPage validation pipeline
  // so we can inspect the status and body size before deciding to fall back.
  if (FIRECRAWL_FALLBACK_ENABLED()) {
    await applyDomainRateLimit(url);
    let rawResult: { body: string; statusCode: number } | null = null;
    try {
      rawResult = await fetchWithRetry(url);
    } catch {
      // Network error — fall through to Firecrawl below
    }

    const needsFallback =
      !rawResult ||
      rawResult.statusCode < 200 ||
      rawResult.statusCode >= 300 ||
      rawResult.body.length < FIRECRAWL_FALLBACK_MIN_CHARS;

    if (needsFallback) {
      // Firecrawl fallback — throws if Firecrawl itself fails
      const { markdown } = await scrapeMarkdown(url);
      return { html: markdown, text: markdown };
    }

    // Primary succeeded — run the normal validation/parsing on the body
    // rawResult is guaranteed non-null here: needsFallback would have been true otherwise
    const html = rawResult!.body;

    if (html.length < 5000) {
      throw new Error(`Page too short (${html.length} chars) — likely bot-blocked: ${url}`);
    }
    if (html.includes('Just a moment') || html.includes('Checking your browser')) {
      throw new Error(`Bot-blocked (Cloudflare challenge detected): ${url}`);
    }
    if (html.includes('Enable JavaScript') && html.length < 10000) {
      throw new Error(`JS-gated page detected: ${url}`);
    }

    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, aside, [class*="ad"], [id*="ad"]').remove();
    let text: string;
    const mainEl = $('main, article, [role="main"]');
    text = mainEl.length > 0 ? mainEl.text() : $('body').text();
    text = text.replace(/\s+/g, ' ').trim();
    return { html, text };
  }

  // Fallback disabled — use standard path (preserves all existing behaviour)
  return fetchPage(url);
}

export async function fetchAndPreprocess(
  url: string,
  options?: { maxPages?: number }
): Promise<{ text: string; rawHtml: string }> {
  const maxPages = Math.min(options?.maxPages ?? 1, 3); // hard cap at 3 — Vercel timeout constraint
  let allText = '';
  let firstHtml = '';
  let currentUrl: string | null = url;
  let pageCount = 0;

  while (currentUrl && pageCount < maxPages) {
    if (pageCount > 0) await delay(500); // 500ms between pages within same source
    const { html, text } = await fetchPageWithFirecrawlFallback(currentUrl);
    if (pageCount === 0) firstHtml = html;
    allText += text;
    currentUrl = detectNextPageUrl(html, currentUrl);
    pageCount++;
  }

  return {
    text: allText.slice(0, 15_000),
    rawHtml: firstHtml,
  };
}
