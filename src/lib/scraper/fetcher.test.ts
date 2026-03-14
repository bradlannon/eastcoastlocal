import { fetchAndPreprocess } from './fetcher';

// Helper to make HTML longer than 5000 chars
function makeLongHtml(body: string): string {
  const padding = 'x'.repeat(5500);
  return `<html><body>${body}<!-- ${padding} --></body></html>`;
}

describe('fetchAndPreprocess', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(html: string, ok = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      text: async () => html,
    });
  }

  it('strips script tags from output', async () => {
    const html = makeLongHtml('<script>alert("x")</script><main>Hello world</main>');
    mockFetch(html);
    const result = await fetchAndPreprocess('https://example.com');
    expect(result).not.toContain('alert');
    expect(result).toContain('Hello world');
  });

  it('strips style tags from output', async () => {
    const html = makeLongHtml('<style>.foo { color: red }</style><main>Event info here</main>');
    mockFetch(html);
    const result = await fetchAndPreprocess('https://example.com');
    expect(result).not.toContain('.foo');
    expect(result).toContain('Event info here');
  });

  it('strips nav tags from output', async () => {
    const html = makeLongHtml('<nav><a>Home</a><a>About</a></nav><main>Concert tonight</main>');
    mockFetch(html);
    const result = await fetchAndPreprocess('https://example.com');
    expect(result).not.toContain('Home');
    expect(result).toContain('Concert tonight');
  });

  it('throws if response is not ok', async () => {
    const html = makeLongHtml('<main>Some content</main>');
    mockFetch(html, false);
    await expect(fetchAndPreprocess('https://example.com')).rejects.toThrow();
  });

  it('throws if HTML is shorter than 5000 chars (bot-blocked detection)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
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
    const result = await fetchAndPreprocess('https://example.com');
    expect(result).not.toMatch(/\s{2,}/);
  });

  it('trims output to 15000 characters max', async () => {
    const longContent = 'A'.repeat(20000);
    const html = `<html><body><main>${longContent}</main></body></html>`;
    mockFetch(html);
    const result = await fetchAndPreprocess('https://example.com');
    expect(result.length).toBeLessThanOrEqual(15000);
  });
});
