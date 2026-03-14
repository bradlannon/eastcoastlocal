import { z } from 'zod';
import { EVENT_CATEGORIES } from '@/lib/db/schema';

export const ExtractedEventSchema = z.object({
  events: z.array(
    z.object({
      performer: z.string().nullable(),
      event_date: z.string().nullable(),
      event_time: z.string().nullable(),
      price: z.string().nullable(),
      ticket_link: z.string().url().nullable(),
      description: z.string().nullable(),
      cover_image_url: z.string().url().nullable(),
      confidence: z.number().min(0).max(1),
      event_category: z.enum(EVENT_CATEGORIES).default('other'),
    })
  ),
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>['events'][number];
