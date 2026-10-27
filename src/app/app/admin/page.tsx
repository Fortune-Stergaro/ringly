import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { setSuspended } from '@/app/actions/settings';
import { Banner } from '@/components/Banner';

export const metadata = { title: 'Platform admin' };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { profile } = await requireUser();
  if (!profile.is_platform_admin) notFound();

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ data: users }, { count: overdue }, { data: last }, { data: deliveries }] = await Promise.all([
    admin.from('profiles').select('id, display_name, suspended_at, created_at').order('created_at', { ascending: false }).limit(50),
    admin.from('notification_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('run_at', cutoff),
    admin.from('system_state').select('value, updated_at').eq('key', 'last_run').maybeSingle(),
    admin.from('notification_deliveries').select('status').gte('attempted_at', since).limit(10000),
  ]);
  const counts = { sent: 0, failed: 0, expired: 0 };
  for (const d of deliveries ?? []) counts[d.status as keyof typeof counts]++;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Platform admin</h1>
      <Banner error={sp.error} />
      <section className="card space-y-1">
        <h2 className="font-semibold">Scheduler health</h2>
        <p>Overdue pending jobs: <b className={(overdue ?? 0) > 0 ? 'text-red-700' : ''}>{overdue ?? 0}</b></p>
        <p className="muted">Last worker run: {last?.updated_at ? new Date(last.updated_at).toLocaleString() : 'never'} {last?.value ? `· ${JSON.stringify(last.value)}` : ''}</p>
        <p className="muted">Deliveries (24h): {counts.sent} accepted · {counts.failed} failed · {counts.expired} expired</p>
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">Users (latest 50)</h2>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {(users ?? []).map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2 text-sm">
              <span>{u.display_name} {u.suspended_at && <span className="badge bg-red-100 text-red-800">Suspended</span>}</span>
              <form action={setSuspended}>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="suspend" value={String(!u.suspended_at)} />
                <button className="btn-ghost !px-3 !py-1">{u.suspended_at ? 'Unsuspend' : 'Suspend'}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
