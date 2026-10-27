import { NextResponse, type NextRequest } from 'next/server';
import { sameOrigin } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_SNOOZES, SNOOZE_MINUTES } from '@/lib/constants';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Readable only if the user is a member (RLS).
  const { data } = await supabase
    .from('event_occurrences')
    .select('id, status, events!inner(group_id, allow_snooze, status)')
    .eq('id', id)
    .single();
  const occ = data as unknown as { id: string; status: string; events: { group_id: string; allow_snooze: boolean; status: string } } | null;
  if (!occ) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!occ.events.allow_snooze || occ.status !== 'scheduled' || occ.events.status !== 'scheduled') {
    return NextResponse.json({ error: 'snooze not available' }, { status: 409 });
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from('notification_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'snooze')
    .eq('occurrence_id', id)
    .eq('target_user_id', user.id);
  if ((count ?? 0) >= MAX_SNOOZES) return NextResponse.json({ error: 'snooze limit reached' }, { status: 429 });

  await admin.from('notification_jobs').insert({
    kind: 'snooze',
    group_id: occ.events.group_id,
    occurrence_id: id,
    target_user_id: user.id,
    run_at: new Date(Date.now() + SNOOZE_MINUTES * 60_000).toISOString(),
  });
  return NextResponse.json({ ok: true, minutes: SNOOZE_MINUTES });
}
