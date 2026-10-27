import { z } from 'zod';
import { CATEGORIES } from './constants';
import { isValidZone } from './time';

export const recurrenceSchema = z
  .object({
    freq: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).max(12),
    byWeekday: z.array(z.number().int().min(1).max(7)).max(7).optional(),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    count: z.number().int().min(1).max(500).optional(),
  })
  .nullable();

export const eventInputSchema = z.object({
  id: z.string().uuid().optional(),
  groupId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().max(2000).default(''),
  location: z.string().max(200).optional().default(''),
  meetingUrl: z.union([z.literal(''), z.string().url('Meeting link must be a valid URL')]).optional().default(''),
  category: z.enum(CATEGORIES),
  priority: z.enum(['normal', 'important']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  timezone: z.string().refine(isValidZone, 'Unknown time zone'),
  recurrence: recurrenceSchema,
  reminderOffsets: z.array(z.number().int().min(0).max(10080)).min(1, 'Choose at least one reminder').max(8),
  requireAck: z.boolean(),
  allowSnooze: z.boolean(),
  notify: z.boolean(),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  label: z.string().max(80).optional(),
  platform: z.string().max(40).optional(),
});
