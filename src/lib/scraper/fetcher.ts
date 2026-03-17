import * as cheerio from 'cheerio';
import { gotScraping } from 'got-scraping';

// Module-level per-domain rate limiting state
const domainLastRequest = new Map<string, number>();
const DOMAIN_MIN_GAP_MS = 2000; // 2s base + up to 500ms jitter

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

/**
 * Fetch using got-scraping — browser-like TLS/JA3 fingerprint + auto-generated
 * realistic headers (User-Agent, Accept, sec-ch-ua, etc.).
 * Retries transient errors with exponential backoff.
 */
async function fetchWithRetry(url: string, retries = 2): Promise<{ body: string; statusCode: number }> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s
      await delay(backoffMs);
    }
    try {
      const resp = await gotScraping({
        url,
        timeout: { request: 15_000 },
        headerGeneratorOptions: {
          browsers: ['chrome'],
          operatingSystems: ['macos', 'windows'],
          locales: ['en-US', 'en-CA'],
        },
      });
      // Only retry on transient errors
      if (resp.statusCode === 429 || resp.statusCode === 503) {
        if (attempt < retries) {
          lastErr = new Error(`HTTP error: ${resp.statusCode} for ${url}`);
          continue;
        }
      }
      return { body: resp.body, statusCode: resp.statusCode };
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
    const { html, text } = await fetchPage(currentUrl);
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
