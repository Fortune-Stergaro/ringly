import { NextResponse, type NextRequest } from 'next/server';
import { sameOrigin } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPush } from '@/server/push/send';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)
    .eq('is_active', true);
  if (!subs?.length) return NextResponse.json({ total: 0, sent: 0, failed: 0, expired: 0 });

  const payload = {
    kind: 'test',
    title: 'Test notification',
    body: 'If you can see this, this device is registered for alerts.',
    url: '/app/settings',
    tag: `test:${user.id}`,
    groupId: '',
    requireAck: false,
    allowSnooze: false,
    alarm: false,
    priority: 'normal',
    sentAt: new Date().toISOString(),
  };
  let sent = 0;
  let failed = 0;
  let expired = 0;
  await Promise.all(
    subs.map(async (s) => {
      const r = await sendPush(s, payload, { ttl: 120, urgent: true });
      if (r.outcome === 'sent') {
        sent++;
        await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', s.id);
      } else if (r.outcome === 'expired') {
        expired++;
        await admin.from('push_subscriptions').update({ is_active: false }).eq('id', s.id);
      } else {
        failed++;
        await admin.from('push_subscriptions').update({ last_failure_at: new Date().toISOString() }).eq('id', s.id);
      }
    }),
  );
  return NextResponse.json({ total: subs.length, sent, failed, expired });
}
