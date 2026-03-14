import * as cheerio from 'cheerio';

export async function fetchAndPreprocess(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EastCoastLocal/1.0)',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} for ${url}`);
  }

  const html = await response.text();

  if (html.length < 5000) {
    throw new Error(`Page too short (${html.length} chars) — likely bot-blocked: ${url}`);
  }

  if (html.includes('Just a moment') || html.includes('Enable JavaScript')) {
    throw new Error(`Bot-blocked or JS-gated page detected (Cloudflare challenge): ${url}`);
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

  // Limit to 15,000 chars
  return text.slice(0, 15_000);
}
