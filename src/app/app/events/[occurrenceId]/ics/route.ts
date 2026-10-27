import { NextResponse, type NextRequest } from 'next/server';
import { DateTime } from 'luxon';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss'Z'");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ occurrenceId: string }> }) {
  const { occurrenceId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('event_occurrences')
    .select('id, occurrence_start, occurrence_end, events!inner(title, description, location, meeting_url, duration_minutes, groups!inner(name))')
    .eq('id', occurrenceId)
    .single();
  const o = data as unknown as {
    id: string;
    occurrence_start: string;
    occurrence_end: string | null;
    events: { title: string; description: string; location: string | null; meeting_url: string | null; duration_minutes: number | null; groups: { name: string } };
  } | null;
  if (!o) return new NextResponse('Not found', { status: 404 });

  const end = o.occurrence_end ?? DateTime.fromISO(o.occurrence_start).plus({ minutes: o.events.duration_minutes ?? 60 }).toUTC().toISO()!;
  const desc = [o.events.description, o.events.meeting_url].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ringly//EN',
    'BEGIN:VEVENT',
    `UID:${o.id}@ringly`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(o.occurrence_start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${o.events.title} (${o.events.groups.name})`)}`,
    desc ? `DESCRIPTION:${esc(desc)}` : '',
    o.events.location ? `LOCATION:${esc(o.events.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return new NextResponse(lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="event.ics"' },
  });
}
