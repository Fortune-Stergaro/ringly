import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!me?.is_platform_admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const [{ count }, { data: oldest }, { data: last }] = await Promise.all([
    admin.from('notification_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('run_at', cutoff),
    admin.from('notification_jobs').select('run_at').eq('status', 'pending').lt('run_at', cutoff).order('run_at').limit(1),
    admin.from('system_state').select('value, updated_at').eq('key', 'last_run').maybeSingle(),
  ]);
  return NextResponse.json({
    overdueJobs: count ?? 0,
    oldestOverdueSeconds: oldest?.[0] ? Math.round((Date.now() - new Date(oldest[0].run_at).getTime()) / 1000) : 0,
    lastRun: last?.value ?? null,
    lastRunAt: last?.updated_at ?? null,
  });
}
