import { NextResponse, type NextRequest } from 'next/server';
import { DateTime } from 'luxon';
import { cronAuthorized } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { expandOccurrences, type Recurrence } from '@/server/scheduling/recurrence';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: events, error } = await admin
    .from('events')
    .select('id, starts_at, timezone, recurrence, duration_minutes')
    .eq('status', 'scheduled')
    .not('recurrence', 'is', null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let added = 0;
  const now = DateTime.utc();
  for (const e of events ?? []) {
    const starts = expandOccurrences(e.starts_at, e.timezone, e.recurrence as Recurrence).filter((s) => DateTime.fromISO(s) > now);
    if (starts.length) {
      const rows = starts.map((s) => ({
        event_id: e.id,
        occurrence_start: s,
        occurrence_end: e.duration_minutes ? DateTime.fromISO(s).plus({ minutes: e.duration_minutes }).toUTC().toISO() : null,
      }));
      await admin.from('event_occurrences').upsert(rows, { onConflict: 'event_id,occurrence_start', ignoreDuplicates: true });
      added += rows.length;
    }
    await admin.rpc('generate_jobs', { p_event: e.id });
  }
  return NextResponse.json({ ok: true, events: events?.length ?? 0, considered: added });
}
export const POST = handle;
export const GET = handle;
