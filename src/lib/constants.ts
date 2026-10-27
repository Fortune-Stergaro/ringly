export const SNOOZE_MINUTES = 5;
export const MAX_SNOOZES = 3;
export const OCCURRENCE_HORIZON_DAYS = 90;
export const DEFAULT_TZ = 'Africa/Lagos';

export const REMINDER_PRESETS = {
  standard: { label: 'Standard', offsets: [15, 0] },
  important: { label: 'Important', offsets: [60, 15, 5, 0] },
  early: { label: 'Early preparation', offsets: [1440, 60, 15] },
} as const;

export const OFFSET_CHOICES = [1440, 180, 60, 30, 15, 10, 5, 0];

export const CATEGORIES = ['lecture', 'meeting', 'deadline', 'study', 'service', 'other'] as const;
