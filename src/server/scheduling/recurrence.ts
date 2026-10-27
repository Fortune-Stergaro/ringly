import { DateTime } from 'luxon';
import { OCCURRENCE_HORIZON_DAYS } from '@/lib/constants';

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
  /** ISO weekdays: 1 = Monday … 7 = Sunday */
  byWeekday?: number[];
  /** Inclusive end date, YYYY-MM-DD, in the event time zone */
  until?: string;
  count?: number;
}

const MAX_OCCURRENCES = 500;

/**
 * Expand an event into absolute UTC start instants.
 * Wall-clock time is preserved in the event's IANA zone (so DST zones stay correct).
 */
export function expandOccurrences(
  startISO: string,
  zone: string,
  rec: Recurrence | null,
  horizonDays = OCCURRENCE_HORIZON_DAYS,
  now: DateTime = DateTime.utc(),
): string[] {
  const start = DateTime.fromISO(startISO, { zone: 'utc' }).setZone(zone);
  if (!rec) return [start.toUTC().toISO() as string];

  const startDay = start.startOf('day');
  const horizonEnd = DateTime.max(start, now.setZone(zone)).plus({ days: horizonDays }).endOf('day');
  let last = horizonEnd;
  if (rec.until) {
    const u = DateTime.fromISO(rec.until, { zone }).endOf('day');
    if (u.isValid && u < last) last = u;
  }

  const days = rec.byWeekday?.length ? rec.byWeekday : [start.weekday];
  const out: string[] = [];

  for (let d = startDay; d <= last && out.length < MAX_OCCURRENCES; d = d.plus({ days: 1 })) {
    const daysDiff = Math.round(d.diff(startDay, 'days').days);
    let match = false;
    if (rec.freq === 'daily') {
      match = daysDiff % rec.interval === 0;
    } else if (rec.freq === 'weekly') {
      const weeks = Math.round(d.startOf('week').diff(startDay.startOf('week'), 'days').days / 7);
      match = weeks % rec.interval === 0 && days.includes(d.weekday);
    } else {
      const months = (d.year - start.year) * 12 + (d.month - start.month);
      match = d.day === start.day && months % rec.interval === 0;
    }
    if (!match) continue;
    const occ = DateTime.fromObject(
      { year: d.year, month: d.month, day: d.day, hour: start.hour, minute: start.minute },
      { zone },
    );
    if (occ < start) continue;
    out.push(occ.toUTC().toISO() as string);
    if (rec.count && out.length >= rec.count) break;
  }
  return out;
}

const WD = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function describeRecurrence(rec: Recurrence | null): string {
  if (!rec) return 'Does not repeat';
  const n = rec.interval > 1 ? `${rec.interval} ` : '';
  let base = '';
  if (rec.freq === 'daily') base = rec.interval > 1 ? `Every ${n}days` : 'Every day';
  if (rec.freq === 'weekly') {
    const days = (rec.byWeekday ?? []).map((d) => WD[d]).join(', ');
    base = `Every ${rec.interval > 1 ? n + 'weeks' : 'week'}${days ? ' on ' + days : ''}`;
  }
  if (rec.freq === 'monthly') base = rec.interval > 1 ? `Every ${n}months` : 'Every month';
  if (rec.until) base += `, until ${rec.until}`;
  else if (rec.count) base += `, ${rec.count} times`;
  return base;
}
