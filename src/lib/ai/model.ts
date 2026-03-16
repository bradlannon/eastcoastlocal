import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { db } from '@/lib/db/client';
import { app_settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type AIProvider = 'gemini' | 'claude';

export async function getAIProvider(): Promise<AIProvider> {
  try {
    const row = await db
      .select({ value: app_settings.value })
      .from(app_settings)
      .where(eq(app_settings.key, 'ai_provider'))
      .limit(1);

    const value = row[0]?.value;
    if (value === 'claude') return 'claude';
    return 'gemini';
  } catch {
    return 'gemini';
  }
}

export async function getExtractionModel() {
  const provider = await getAIProvider();
  if (provider === 'claude') {
    return anthropic('claude-sonnet-4-5-20250514');
  }
  return google('gemini-2.5-flash');
}
