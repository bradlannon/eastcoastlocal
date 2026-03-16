'use server';

import { db } from '@/lib/db/client';
import { app_settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { AIProvider } from '@/lib/ai/model';

export async function getAIProviderSetting(): Promise<AIProvider> {
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

export async function setAIProvider(provider: AIProvider): Promise<void> {
  await db
    .insert(app_settings)
    .values({ key: 'ai_provider', value: provider, updated_at: new Date() })
    .onConflictDoUpdate({
      target: app_settings.key,
      set: { value: provider, updated_at: new Date() },
    });
}
