import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { expandOccurrences } from '@/server/scheduling/recurrence';
import { localToUtcISO } from '@/lib/time';

const now = DateTime.fromISO('2026-10-26T00:00:00Z');

describe('time conversion', () => {
  it('converts Lagos wall-clock time to UTC (UTC+1, no DST)', () => {
    expect(localToUtcISO('2026-10-30', '16:00', 'Africa/Lagos')).toBe('2026-10-30T15:00:00.000Z');
  });
});

describe('expandOccurrences', () => {
  it('returns a single occurrence when not recurring', () => {
    expect(expandOccurrences('2026-10-30T15:00:00.000Z', 'Africa/Lagos', null, 90, now)).toEqual(['2026-10-30T15:00:00.000Z']);
  });

  it('expands weekly on chosen weekdays', () => {
    const start = localToUtcISO('2026-11-02', '08:00', 'Africa/Lagos'); // Monday
    const out = expandOccurrences(start, 'Africa/Lagos', { freq: 'weekly', interval: 1, byWeekday: [1, 3], count: 4 }, 90, now);
    expect(out).toEqual([
      '2026-11-02T07:00:00.000Z',
      '2026-11-04T07:00:00.000Z',
      '2026-11-09T07:00:00.000Z',
      '2026-11-11T07:00:00.000Z',
    ]);
  });

  it('keeps 08:00 local across a DST change in London', () => {
    const start = localToUtcISO('2026-10-19', '08:00', 'Europe/London'); // BST (UTC+1)
    const out = expandOccurrences(start, 'Europe/London', { freq: 'weekly', interval: 1, count: 2 }, 90, now);
    expect(out).toEqual(['2026-10-19T07:00:00.000Z', '2026-10-26T08:00:00.000Z']); // clocks went back on 25 Oct
  });

  it('respects until and interval for daily', () => {
    const start = localToUtcISO('2026-11-01', '09:00', 'Africa/Lagos');
    const out = expandOccurrences(start, 'Africa/Lagos', { freq: 'daily', interval: 2, until: '2026-11-07' }, 90, now);
    expect(out.length).toBe(4); // 1, 3, 5, 7
  });

  it('monthly skips months without the date', () => {
    const start = localToUtcISO('2026-01-31', '10:00', 'Africa/Lagos');
    const out = expandOccurrences(start, 'Africa/Lagos', { freq: 'monthly', interval: 1, count: 3 }, 400, DateTime.fromISO('2026-01-01T00:00:00Z'));
    expect(out.map((s) => s.slice(0, 10))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });
});
