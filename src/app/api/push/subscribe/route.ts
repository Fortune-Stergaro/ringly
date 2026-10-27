import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushSubscriptionSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = pushSubscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  const { subscription, label, platform } = parsed.data;

  // Admin client: an endpoint may previously belong to another account on a shared device.
  const admin = createAdminClient();
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      platform: platform ?? null,
      device_label: label ?? null,
      is_active: true,
      failure_count: 0,
    },
    { onConflict: 'endpoint' },
  );
  if (error) return NextResponse.json({ error: 'could not save' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const body = z.object({ endpoint: z.string().url() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', body.data.endpoint);
  return NextResponse.json({ ok: true });
}
