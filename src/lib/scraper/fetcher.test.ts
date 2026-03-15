import { fetchAndPreprocess } from './fetcher';

// Helper to make HTML longer than 5000 chars
function makeLongHtml(body: string): string {
  const padding = 'x'.repeat(5500);
  return `<html><body>${body}<!-- ${padding} --></body></html>`;
}

// Helper that creates a mock Response-like object
function makeResponse(html: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (_: string) => null },
    text: async () => html,
  };
}

describe('fetchAndPreprocess', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  function mockFetch(html: string, ok = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 404,
      headers: { get: (_: string) => null },
      text: async () => html,
    });
  }

  // ---- Existing behavior tests (updated to destructure { text }) ----

  it('strips script tags from output', async () => {
    const html = makeLongHtml('<script>alert("x")</script><main>Hello world</main>');
    mockFetch(html);
    const { text } = await fetchAndPreprocess('https://example.com');
    expect(text).not.toContain('alert');
    expect(text).toContain('Hello world');
  });

  it('strips style tags from output', async () => {
    const html = makeLongHtml('<style>.foo { color: red }</style><main>Event info here</main>');
    mockFetch(html);
    const { text } = await fetchAndPreprocess('https://example.com');
    expect(text).not.toContain('.foo');
    expect(text).toContain('Event info here');
  });

  it('strips nav tags from output', async () => {
    const html = makeLongHtml('<nav><a>Home</a><a>About</a></nav><main>Concert tonight</main>');
    mockFetch(html);
    const { text } = await fetchAndPreprocess('https://example.com');
    expect(text).not.toContain('Home');
    expect(text).toContain('Concert tonight');
  });

  it('throws if response is not ok and not retryable (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeResponse(makeLongHtml('<main>Some content</main>'), 404));
    await expect(fetchAndPreprocess('https://example.com')).rejects.toThrow();
  });

  it('throws if HTML is shorter than 5000 chars (bot-blocked detection)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (_: string) => null },
      text: async () => '<html><body>Short page</body></html>',
    });
    await expect(fetchAndPreprocess('https://example.com')).rejects.toThrow();
  });

  it('throws if HTML contains "Just a moment" (Cloudflare detection)', async () => {
    const html = 'Just a moment...' + 'x'.repeat(5500);
    mockFetch(html);
    await expect(fetchAndPreprocess('https://example.com')).rejects.toThrow(/cloudflare|bot|blocked/i);
  });

  it('throws if HTML contains "Enable JavaScript" (JS-gated detection)', async () => {
    const html = 'Enable JavaScript to continue.' + 'x'.repeat(5500);
    mockFetch(html);
    await expect(fetchAndPreprocess('https://example.com')).rejects.toThrow();
  });

  it('collapses whitespace to single spaces', async () => {
    const html = makeLongHtml('<main>Hello   \n\n   world</main>');
    mockFetch(html);
    const { text } = await fetchAndPreprocess('https://example.com');
    expect(text).not.toMatch(/\s{2,}/);
  });

  it('trims output to 15000 characters max', async () => {
    const longContent = 'A'.repeat(20000);
    const html = `<html><body><main>${longContent}</main></body></html>`;
    mockFetch(html);
    const { text } = await fetchAndPreprocess('https://example.com');
    expect(text.length).toBeLessThanOrEqual(15000);
  });

  // ---- New: rawHtml preservation ----

  it('rawHtml preserves script tags (not stripped)', async () => {
    const html = makeLongHtml(
      '<script type="application/ld+json">{"@type":"Event","name":"Test Show"}</script><main>Concert info</main>'
    );
    mockFetch(html);
    const { rawHtml } = await fetchAndPreprocess('https://example.com');
    expect(rawHtml).toContain('<script type="application/ld+json">');
    expect(rawHtml).toContain('"@type":"Event"');
  });

  // ---- New: Retry behavior ----

  it('retries on 429 — second attempt succeeds, no error thrown', async () => {
    const html = makeLongHtml('<main>Content</main>');
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return makeResponse(html, 429);
      }
      return makeResponse(html, 200);
    });
    const { text } = await fetchAndPreprocess('https://example.com');
    expect(text).toContain('Content');
    expect(callCount).toBe(2);
  });

  it('retries on 503 — second attempt succeeds, no error thrown', async () => {
    const html = makeLongHtml('<main>Content</main>');
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return makeResponse(html, 503);
      }
      return makeResponse(html, 200);
    });
    const { text } = await fetchAndPreprocess('https://example.com');
    expect(text).toContain('Content');
    expect(callCount).toBe(2);
  });

  it('no retry on 404 — error thrown immediately, only 1 fetch call', async () => {
    const html = makeLongHtml('<main>Content</main>');
    global.fetch = jest.fn().mockResolvedValue(makeResponse(html, 404));
    await expect(fetchAndPreprocess('https://example.com')).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('exhausted retries — error thrown after 3 attempts (0 + 2 retries)', async () => {
    const html = makeLongHtml('<main>Content</main>');
    global.fetch = jest.fn().mockResolvedValue(makeResponse(html, 429));
    await expect(fetchAndPreprocess('https://example-exhaust.com')).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  }, 15000);

  // ---- New: Per-domain rate limiting ----

  it('per-domain rate limit — two calls to same domain are delayed >= 2000ms', async () => {
    const html = makeLongHtml('<main>Content</main>');
    global.fetch = jest.fn().mockResolvedValue(makeResponse(html, 200));

    const start = Date.now();
    await fetchAndPreprocess('https://ratelimitdomain-a.com');
    await fetchAndPreprocess('https://ratelimitdomain-a.com');
    const elapsed = Date.now() - start;

    // Second call must have been delayed at least 2000ms
    expect(elapsed).toBeGreaterThanOrEqual(2000);
  }, 10000);

  it('different domains not serialized — two different domains complete quickly', async () => {
    const html = makeLongHtml('<main>Content</main>');
    global.fetch = jest.fn().mockResolvedValue(makeResponse(html, 200));

    const start = Date.now();
    await fetchAndPreprocess('https://differentdomain-x1.com');
    await fetchAndPreprocess('https://differentdomain-y1.com');
    const elapsed = Date.now() - start;

    // Different domains should NOT incur the 2s domain rate-limit delay
    expect(elapsed).toBeLessThan(2000);
  }, 5000);

  // ---- New: Multi-page pagination ----

  it('single page default — no maxPages option fetches one page only', async () => {
    const html = makeLongHtml('<main>Page 1 content</main>');
    global.fetch = jest.fn().mockResolvedValue(makeResponse(html, 200));
    const { text } = await fetchAndPreprocess('https://singlepagedefault.com');
    expect(text).toContain('Page 1 content');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('multi-page follows rel="next" — returns combined text from both pages', async () => {
    const page1Html = makeLongHtml(
      '<main>Page 1 content</main><a rel="next" href="https://multipagetest.com/page2">Next</a>'
    );
    const page2Html = makeLongHtml('<main>Page 2 content</main>');

    global.fetch = jest.fn()
      .mockResolvedValueOnce(makeResponse(page1Html, 200))
      .mockResolvedValueOnce(makeResponse(page2Html, 200));

    const { text } = await fetchAndPreprocess('https://multipagetest.com', { maxPages: 2 });
    expect(text).toContain('Page 1 content');
    expect(text).toContain('Page 2 content');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('hard cap at 3 — even with maxPages=5, only 3 pages fetched', async () => {
    const makePageHtml = (n: number, nextUrl?: string) => {
      const nextLink = nextUrl ? `<a rel="next" href="${nextUrl}">Next</a>` : '';
      return makeLongHtml(`<main>Page ${n} content</main>${nextLink}`);
    };

    global.fetch = jest.fn()
      .mockResolvedValueOnce(makeResponse(makePageHtml(1, 'https://hardcaptest.com/page2'), 200))
      .mockResolvedValueOnce(makeResponse(makePageHtml(2, 'https://hardcaptest.com/page3'), 200))
      .mockResolvedValueOnce(makeResponse(makePageHtml(3, 'https://hardcaptest.com/page4'), 200))
      .mockResolvedValueOnce(makeResponse(makePageHtml(4, 'https://hardcaptest.com/page5'), 200))
      .mockResolvedValueOnce(makeResponse(makePageHtml(5), 200));

    const { text } = await fetchAndPreprocess('https://hardcaptest.com', { maxPages: 5 });
    expect(text).toContain('Page 1 content');
    expect(text).toContain('Page 2 content');
    expect(text).toContain('Page 3 content');
    expect(text).not.toContain('Page 4 content');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('stops at last page — no rel="next" link means only one page fetched', async () => {
    const html = makeLongHtml('<main>Only page content</main>');
    global.fetch = jest.fn().mockResolvedValue(makeResponse(html, 200));
    const { text } = await fetchAndPreprocess('https://stopsatlastpage.com', { maxPages: 3 });
    expect(text).toContain('Only page content');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
