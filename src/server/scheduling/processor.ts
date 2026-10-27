import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPush, type PushOutcome } from '@/server/push/send';
import { humanMinutes } from '@/lib/time';
import type { Job, PushPayload } from '@/types';

type Admin = ReturnType<typeof createAdminClient>;
const BACKOFF_SECONDS = [30, 120, 300];
const MAX_ATTEMPTS = 3;
const STALE_MS = 15 * 60 * 1000;

interface OccRow {
  id: string;
  occurrence_start: string;
  status: string;
  events: {
    title: string;
    location: string | null;
    priority: 'normal' | 'important';
    require_ack: boolean;
    allow_snooze: boolean;
    status: string;
    groups: { name: string };
  };
}

type Built = { payload: PushPayload; ttl: number; urgent: boolean } | { skip: string };

async function buildPayload(admin: Admin, job: Job): Promise<Built> {
  const sentAt = new Date().toISOString();

  if ((job.kind === 'reminder' || job.kind === 'snooze') && job.occurrence_id) {
    const { data } = await admin
      .from('event_occurrences')
      .select('id, occurrence_start, status, events!inner(title, location, priority, require_ack, allow_snooze, status, groups!inner(name))')
      .eq('id', job.occurrence_id)
      .single();
    const occ = data as unknown as OccRow | null;
    if (!occ) return { skip: 'occurrence missing' };
    if (occ.status !== 'scheduled' || occ.events.status !== 'scheduled') return { skip: 'cancelled' };
    const startMs = new Date(occ.occurrence_start).getTime();
    if (startMs < Date.now() - STALE_MS) return { skip: 'stale' };

    const offset = job.kind === 'snooze' ? 0 : (job.offset_minutes ?? 0);
    const loc = occ.events.location ? ` · ${occ.events.location}` : '';
    const body =
      job.kind === 'snooze'
        ? `Snoozed alarm — starting now${loc}`
        : offset === 0
          ? `Starting now${loc}`
          : `Starts in ${humanMinutes(offset)}${loc}`;
    const alarm = offset === 0;
    const ttl = Math.max(60, Math.min(3600, Math.floor((startMs - Date.now()) / 1000) + 600));
    return {
      ttl,
      urgent: true,
      payload: {
        kind: job.kind,
        title: `${occ.events.groups.name} · ${occ.events.title}`,
        body,
        url: alarm ? `/alarm/${occ.id}` : `/app/events/${occ.id}`,
        tag: job.kind === 'snooze' ? `occ:${occ.id}:snooze` : `occ:${occ.id}:${offset}`,
        groupId: job.group_id,
        occurrenceId: occ.id,
        requireAck: occ.events.require_ack,
        allowSnooze: occ.events.allow_snooze,
        alarm,
        priority: alarm || occ.events.priority === 'important' ? 'important' : 'normal',
        sentAt,
      },
    };
  }

  const p = job.payload as { title?: string; body?: string; url?: string; priority?: PushPayload['priority'] };
  const priority = job.kind === 'urgent' ? 'urgent' : (p.priority ?? 'normal');
  return {
    ttl: 3600,
    urgent: priority !== 'normal',
    payload: {
      kind: job.kind,
      title: p.title ?? 'Notification',
      body: p.body ?? '',
      url: p.url ?? '/app',
      tag: `job:${job.id}`,
      groupId: job.group_id,
      requireAck: false,
      allowSnooze: false,
      alarm: false,
      priority,
      sentAt,
    },
  };
}

async function resolveUserIds(admin: Admin, job: Job): Promise<string[]> {
  if (job.target_user_id) return [job.target_user_id];
  const { data } = await admin
    .from('group_members')
    .select('user_id, muted, joined_at, profiles!inner(suspended_at)')
    .eq('group_id', job.group_id);
  const rows = (data ?? []) as unknown as {
    user_id: string;
    muted: boolean;
    joined_at: string;
    profiles: { suspended_at: string | null };
  }[];
  const loud = job.kind === 'urgent';
  return rows
    .filter((m) => !m.profiles.suspended_at)
    .filter((m) => loud || !m.muted)
    .filter((m) => job.kind !== 'reminder' || new Date(m.joined_at).getTime() <= new Date(job.run_at).getTime())
    .map((m) => m.user_id);
}

interface Totals {
  jobs: number;
  sent: number;
  failed: number;
  expired: number;
}

async function processJob(admin: Admin, job: Job, totals: Totals) {
  totals.jobs++;
  const built = await buildPayload(admin, job);
  if ('skip' in built) {
    await admin.from('notification_jobs').update({ status: 'cancelled', last_error: built.skip }).eq('id', job.id);
    return;
  }

  const userIds = await resolveUserIds(admin, job);
  const subs: { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', userIds.slice(i, i + 200))
      .eq('is_active', true);
    subs.push(...(data ?? []));
  }

  const { data: done } = await admin
    .from('notification_deliveries')
    .select('subscription_id')
    .eq('job_id', job.id)
    .eq('status', 'sent');
  const alreadySent = new Set((done ?? []).map((d) => d.subscription_id as string));
  const todo = subs.filter((s) => !alreadySent.has(s.id));

  let transient = 0;
  const now = () => new Date().toISOString();

  for (let i = 0; i < todo.length; i += 20) {
    const chunk = todo.slice(i, i + 20);
    const results = await Promise.all(
      chunk.map(async (s) => ({ s, r: await sendPush(s, built.payload, { ttl: built.ttl, urgent: built.urgent }) })),
    );

    await admin.from('notification_deliveries').upsert(
      results.map(({ s, r }) => ({
        job_id: job.id,
        user_id: s.user_id,
        subscription_id: s.id,
        status: (r.outcome === 'sent' ? 'sent' : r.outcome === 'expired' ? 'expired' : 'failed') as 'sent' | 'expired' | 'failed',
        http_status: r.status ?? null,
        error: r.error ?? null,
        attempted_at: now(),
      })),
      { onConflict: 'job_id,subscription_id' },
    );

    const ids = (o: PushOutcome[]) => results.filter(({ r }) => o.includes(r.outcome)).map(({ s }) => s.id);
    const okIds = ids(['sent']);
    const goneIds = ids(['expired']);
    const badIds = ids(['failed', 'transient']);
    if (okIds.length) await admin.from('push_subscriptions').update({ last_success_at: now(), failure_count: 0 }).in('id', okIds);
    if (goneIds.length) await admin.from('push_subscriptions').update({ is_active: false, last_failure_at: now() }).in('id', goneIds);
    if (badIds.length) await admin.from('push_subscriptions').update({ last_failure_at: now() }).in('id', badIds);

    totals.sent += okIds.length;
    totals.expired += goneIds.length;
    totals.failed += results.filter(({ r }) => r.outcome === 'failed').length;
    transient += results.filter(({ r }) => r.outcome === 'transient').length;
  }

  if (transient > 0) {
    if (job.attempts < MAX_ATTEMPTS) {
      const delay = BACKOFF_SECONDS[Math.min(job.attempts - 1, BACKOFF_SECONDS.length - 1)];
      await admin
        .from('notification_jobs')
        .update({ status: 'pending', run_at: new Date(Date.now() + delay * 1000).toISOString(), locked_at: null, last_error: `${transient} transient failures` })
        .eq('id', job.id);
    } else {
      await admin.from('notification_jobs').update({ status: 'failed', last_error: `${transient} deliveries kept failing` }).eq('id', job.id);
    }
    return;
  }
  await admin.from('notification_jobs').update({ status: 'completed', last_error: null }).eq('id', job.id);
}

export async function processDueJobs(opts: { maxMs?: number } = {}) {
  const admin = createAdminClient();
  const worker = crypto.randomUUID();
  const started = Date.now();
  const maxMs = opts.maxMs ?? 45_000;
  const totals: Totals = { jobs: 0, sent: 0, failed: 0, expired: 0 };

  while (Date.now() - started < maxMs) {
    const { data, error } = await admin.rpc('claim_due_jobs', { batch_size: 25, worker_id: worker });
    if (error) throw new Error(error.message);
    const jobs = (data ?? []) as Job[];
    if (jobs.length === 0) break;
    for (const job of jobs) {
      try {
        await processJob(admin, job, totals);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown error';
        await admin
          .from('notification_jobs')
          .update({ status: job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed', last_error: msg.slice(0, 300), run_at: new Date(Date.now() + 30_000).toISOString() })
          .eq('id', job.id);
      }
    }
  }

  await admin.from('system_state').upsert({ key: 'last_run', value: { at: new Date().toISOString(), ...totals }, updated_at: new Date().toISOString() });
  return totals;
}
