import Firecrawl from '@mendable/firecrawl-js';

const mockScrape = jest.fn();

jest.mock('@mendable/firecrawl-js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ scrape: mockScrape })),
}));

// Import after mock
import { scrapeMarkdown, extractWithSchema, __resetForTests } from './firecrawl';
import { z } from 'zod';

describe('firecrawl client wrapper', () => {
  const originalApiKey = process.env.FIRECRAWL_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetForTests();
  });

  afterEach(() => {
    process.env.FIRECRAWL_API_KEY = originalApiKey;
    __resetForTests();
  });

  describe('getClient / API key guard', () => {
    it('throws when FIRECRAWL_API_KEY is unset', async () => {
      delete process.env.FIRECRAWL_API_KEY;
      await expect(scrapeMarkdown('https://example.com')).rejects.toThrow(
        'FIRECRAWL_API_KEY is not set'
      );
    });

    it('does not throw when FIRECRAWL_API_KEY is set', async () => {
      process.env.FIRECRAWL_API_KEY = 'test-key';
      mockScrape.mockResolvedValue({ markdown: '# Hello', metadata: {} });
      await expect(scrapeMarkdown('https://example.com')).resolves.not.toThrow();
    });
  });

  describe('scrapeMarkdown', () => {
    beforeEach(() => {
      process.env.FIRECRAWL_API_KEY = 'test-key';
    });

    it('calls app.scrape with markdown format and returns { markdown, metadata }', async () => {
      mockScrape.mockResolvedValue({
        markdown: '# Event Page\nSome content here',
        metadata: { title: 'Events', statusCode: 200 },
      });

      const result = await scrapeMarkdown('https://example.com/events');

      expect(mockScrape).toHaveBeenCalledWith('https://example.com/events', {
        formats: ['markdown'],
      });
      expect(result).toEqual({
        markdown: '# Event Page\nSome content here',
        metadata: { title: 'Events', statusCode: 200 },
      });
    });

    it('returns empty markdown and empty metadata when SDK returns nullish values', async () => {
      mockScrape.mockResolvedValue({ markdown: null, metadata: null });

      const result = await scrapeMarkdown('https://example.com');
      expect(result.markdown).toBe('');
      expect(result.metadata).toEqual({});
    });

    it('wraps SDK errors in a descriptive error including the URL', async () => {
      mockScrape.mockRejectedValue(new Error('Network timeout'));

      await expect(scrapeMarkdown('https://example.com/events')).rejects.toThrow(
        /Firecrawl scrape failed for https:\/\/example\.com\/events.*Network timeout/
      );
    });
  });

  describe('extractWithSchema', () => {
    beforeEach(() => {
      process.env.FIRECRAWL_API_KEY = 'test-key';
    });

    const testSchema = z.object({ name: z.string(), date: z.string() });

    it('calls app.scrape with json format containing the schema and returns doc.json', async () => {
      const extracted = { name: 'Concert', date: '2026-05-01' };
      mockScrape.mockResolvedValue({ json: extracted, metadata: {} });

      const result = await extractWithSchema('https://example.com/events', testSchema);

      expect(mockScrape).toHaveBeenCalledWith('https://example.com/events', {
        formats: [{ type: 'json', schema: testSchema }],
      });
      expect(result).toEqual(extracted);
    });

    it('wraps SDK errors in a descriptive error including the URL', async () => {
      mockScrape.mockRejectedValue(new Error('Schema parsing failed'));

      await expect(
        extractWithSchema('https://example.com/events', testSchema)
      ).rejects.toThrow(
        /Firecrawl extract failed for https:\/\/example\.com\/events.*Schema parsing failed/
      );
    });

    it('wraps parse/unexpected errors gracefully', async () => {
      mockScrape.mockRejectedValue(new Error('Invalid JSON response'));

      await expect(
        extractWithSchema('https://example.com/events', testSchema)
      ).rejects.toThrow(/Firecrawl extract failed/);
    });
  });

  describe('lazy singleton', () => {
    it('SDK constructor is called at most once across multiple scrapeMarkdown calls', async () => {
      process.env.FIRECRAWL_API_KEY = 'test-key';
      mockScrape.mockResolvedValue({ markdown: '# Content', metadata: {} });

      await scrapeMarkdown('https://example.com/1');
      await scrapeMarkdown('https://example.com/2');
      await scrapeMarkdown('https://example.com/3');

      expect((Firecrawl as jest.Mock).mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('SDK constructor is called at most once across mixed scrapeMarkdown and extractWithSchema calls', async () => {
      process.env.FIRECRAWL_API_KEY = 'test-key';
      const schema = z.object({ value: z.string() });
      mockScrape.mockResolvedValue({ markdown: '# Content', metadata: {}, json: { value: 'x' } });

      await scrapeMarkdown('https://example.com/1');
      await extractWithSchema('https://example.com/2', schema);

      expect((Firecrawl as jest.Mock).mock.calls.length).toBeLessThanOrEqual(1);
    });
  });
});
