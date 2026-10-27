import { DateTime } from 'luxon';
import { DEFAULT_TZ } from './constants';

export function isValidZone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

/** Interpret a wall-clock date + time in `zone` and return an absolute UTC ISO string. */
export function localToUtcISO(date: string, time: string, zone: string): string {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!dt.isValid) throw new Error('Invalid date or time');
  return dt.toUTC().toISO() as string;
}

export function fmt(iso: string, zone: string, format = 'ccc d LLL, h:mm a'): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone || DEFAULT_TZ).toFormat(format);
}

/** "Fri 30 Oct, 4:00 PM" in the event zone, plus the viewer's local time when the zones differ. */
export function fmtEvent(iso: string, eventZone: string, viewerZone: string): string {
  const main = fmt(iso, eventZone);
  if (eventZone === viewerZone) return main;
  return `${main} (${fmt(iso, viewerZone, 'h:mm a')} your time)`;
}

export function humanMinutes(m: number): string {
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  if (m < 1440) {
    const h = Math.round((m / 60) * 10) / 10;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const d = Math.round((m / 1440) * 10) / 10;
  return `${d} day${d === 1 ? '' : 's'}`;
}

export function offsetLabel(m: number): string {
  return m === 0 ? 'At event time' : `${humanMinutes(m)} before`;
}
