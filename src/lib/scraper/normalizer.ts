// Stub for normalizer - will be fully implemented in Plan 01
// This file is a placeholder so Plan 02 (API clients) can import from it.
// Plan 01 (normalizer) runs in parallel (same wave) and will overwrite this.

import type { ScrapeSource } from '@/types';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

export function normalizePerformer(name: string): string {
  return name.toLowerCase().trim();
}

export async function upsertEvent(
  venueId: number,
  extracted: ExtractedEvent,
  sourceUrl: string
): Promise<void> {
  throw new Error('normalizer.upsertEvent: not yet implemented (stub)');
}
