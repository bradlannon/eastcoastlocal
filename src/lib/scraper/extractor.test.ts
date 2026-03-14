import { extractEvents } from './extractor';

jest.mock('ai', () => ({
  generateText: jest.fn(),
  Output: { object: jest.fn(({ schema }) => ({ type: 'object', schema })) },
}));

jest.mock('@ai-sdk/google', () => ({
  google: jest.fn(() => 'mocked-model'),
}));

import { generateText } from 'ai';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

function makeExtractionResult(events: object[]) {
  return {
    experimental_output: { events },
  };
}

// Future date for tests
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const futureDate = tomorrow.toISOString().slice(0, 10);

// Past date for tests
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const pastDate = yesterday.toISOString().slice(0, 10);

describe('extractEvents', () => {
  it('returns events with all fields from LLM output', async () => {
    mockGenerateText.mockResolvedValue(makeExtractionResult([
      { performer: 'The Trews', event_date: futureDate, event_time: '8:00 PM', price: '$20', ticket_link: null, description: 'Great show', cover_image_url: null, confidence: 0.9 },
    ]) as never);

    const result = await extractEvents('some page text', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].performer).toBe('The Trews');
  });

  it('filters out events with null event_date', async () => {
    mockGenerateText.mockResolvedValue(makeExtractionResult([
      { performer: 'Valid Band', event_date: futureDate, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.8 },
      { performer: 'No Date Band', event_date: null, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.9 },
    ]) as never);

    const result = await extractEvents('some page text', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].performer).toBe('Valid Band');
  });

  it('filters out events with null performer', async () => {
    mockGenerateText.mockResolvedValue(makeExtractionResult([
      { performer: null, event_date: futureDate, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.8 },
      { performer: 'Real Band', event_date: futureDate, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.8 },
    ]) as never);

    const result = await extractEvents('some page text', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].performer).toBe('Real Band');
  });

  it('filters out events with confidence below 0.5', async () => {
    mockGenerateText.mockResolvedValue(makeExtractionResult([
      { performer: 'Low Confidence Band', event_date: futureDate, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.3 },
      { performer: 'High Confidence Band', event_date: futureDate, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.8 },
    ]) as never);

    const result = await extractEvents('some page text', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].performer).toBe('High Confidence Band');
  });

  it('filters out events with dates in the past', async () => {
    mockGenerateText.mockResolvedValue(makeExtractionResult([
      { performer: 'Past Band', event_date: pastDate, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.9 },
      { performer: 'Future Band', event_date: futureDate, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.9 },
    ]) as never);

    const result = await extractEvents('some page text', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].performer).toBe('Future Band');
  });

  it('returns empty array when all events are filtered out', async () => {
    mockGenerateText.mockResolvedValue(makeExtractionResult([
      { performer: null, event_date: null, event_time: null, price: null, ticket_link: null, description: null, cover_image_url: null, confidence: 0.2 },
    ]) as never);

    const result = await extractEvents('some page text', 'https://example.com');
    expect(result).toHaveLength(0);
  });
});
