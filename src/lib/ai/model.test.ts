/**
 * Characterization tests for src/lib/ai/model.ts
 *
 * Mocks @ai-sdk/anthropic, @ai-sdk/google, and @/lib/db/client so
 * no real network calls or DB connections are made.
 */

// ---- SDK mocks ----
const mockAnthropicModel = { provider: 'anthropic', modelId: 'claude-sonnet-4-5-20250514' };
const mockGoogleModel    = { provider: 'google',    modelId: 'gemini-2.5-flash' };

jest.mock('@ai-sdk/anthropic', () => ({
  anthropic: jest.fn((id: string) => ({ provider: 'anthropic', modelId: id })),
}));

jest.mock('@ai-sdk/google', () => ({
  google: jest.fn((id: string) => ({ provider: 'google', modelId: id })),
}));

// ---- DB mock ----
const mockSelect = jest.fn();
const mockFrom   = jest.fn();
const mockWhere  = jest.fn();
const mockLimit  = jest.fn();

jest.mock('@/lib/db/client', () => ({
  db: {
    select: (...args: unknown[]) => { mockSelect(...args); return { from: mockFrom }; },
  },
}));

// ---- end mocks ----

import { getAIProvider, getExtractionModel } from './model';
import { anthropic } from '@ai-sdk/anthropic';
import { google }    from '@ai-sdk/google';

beforeEach(() => {
  jest.clearAllMocks();
  // Reset chain: select -> from -> where -> limit -> returns []
  mockLimit.mockResolvedValue([]);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
});

describe('getAIProvider', () => {
  it('returns "gemini" by default when DB has no ai_provider row', async () => {
    mockLimit.mockResolvedValue([]);
    const provider = await getAIProvider();
    expect(provider).toBe('gemini');
  });

  it('returns "gemini" when DB value is not "claude"', async () => {
    mockLimit.mockResolvedValue([{ value: 'gemini' }]);
    const provider = await getAIProvider();
    expect(provider).toBe('gemini');
  });

  it('returns "claude" when DB value is "claude"', async () => {
    mockLimit.mockResolvedValue([{ value: 'claude' }]);
    const provider = await getAIProvider();
    expect(provider).toBe('claude');
  });

  it('returns "gemini" when DB throws (fallback)', async () => {
    mockLimit.mockRejectedValue(new Error('DB error'));
    const provider = await getAIProvider();
    expect(provider).toBe('gemini');
  });
});

describe('getExtractionModel', () => {
  it('returns a Google Gemini model when provider is gemini (default)', async () => {
    mockLimit.mockResolvedValue([]);
    const model = await getExtractionModel();
    expect(google).toHaveBeenCalledWith('gemini-2.5-flash');
    expect((model as { provider: string }).provider).toBe('google');
  });

  it('returns an Anthropic Claude model when provider is claude', async () => {
    mockLimit.mockResolvedValue([{ value: 'claude' }]);
    const model = await getExtractionModel();
    expect(anthropic).toHaveBeenCalledWith('claude-sonnet-4-5-20250514');
    expect((model as { provider: string }).provider).toBe('anthropic');
  });

  it('returns a Google model when DB throws (fallback)', async () => {
    mockLimit.mockRejectedValue(new Error('DB error'));
    const model = await getExtractionModel();
    expect((model as { provider: string }).provider).toBe('google');
  });
});
