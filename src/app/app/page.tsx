import Link from 'next/link';
import { requireUser } from '@/server/auth';
import { fmtEvent, fmt } from '@/lib/time';
import { Banner } from '@/components/Banner';

export const metadata = { title: 'Home' };

interface Occ {
  id: string;
  occurrence_start: string;
  events: { title: string; location: string | null; timezone: string; priority: string; groups: { name: string } };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile, user } = await requireUser();

  const [{ data: occData }, { data: anns }, { data: groups }, { count: deviceCount }] = await Promise.all([
    supabase
      .from('event_occurrences')
      .select('id, occurrence_start, events!inner(title, location, timezone, priority, status, groups!inner(name))')
      .eq('status', 'scheduled')
      .eq('events.status', 'scheduled')
      .gte('occurrence_start', new Date().toISOString())
      .order('occurrence_start')
      .limit(15),
    supabase.from('announcements').select('id, title, body, kind, created_at, group_id, groups(name)').order('created_at', { ascending: false }).limit(5),
    supabase.from('group_members').select('group_id').eq('user_id', user.id),
    supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
  ]);

  const occs = (occData ?? []) as unknown as Occ[];
  const next = occs[0];
  const byDay = new Map<string, Occ[]>();
  for (const o of occs.slice(1)) {
    const k = fmt(o.occurrence_start, profile.timezone, 'cccc d LLL');
    byDay.set(k, [...(byDay.get(k) ?? []), o]);
  }

  return (
    <div className="space-y-6">
      <Banner error={sp.error} />
      {(deviceCount ?? 0) === 0 && (
        <div className="card border-amber-300 bg-amber-50 dark:bg-amber-950">
          <p className="font-medium">Turn on alerts to get group alarms on this phone</p>
          <p className="muted mt-1">Without a registered device you’ll see events here but won’t be notified.</p>
          <Link href="/app/settings" className="btn-primary mt-3">Set up notifications</Link>
        </div>
      )}

      <section aria-labelledby="next-h">
        <h2 id="next-h" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Next up</h2>
        {next ? (
          <Link href={`/app/events/${next.id}`} className="card block hover:border-teal-600">
            <p className="text-xs text-slate-500">{next.events.groups.name}</p>
            <p className="text-xl font-bold">{next.events.title}</p>
            <p className="muted">{fmtEvent(next.occurrence_start, next.events.timezone, profile.timezone)}</p>
            {next.events.location && <p className="muted">{next.events.location}</p>}
          </Link>
        ) : (
          <div className="card"><p className="muted">Nothing scheduled. {(groups?.length ?? 0) === 0 ? <>Start by <Link className="underline" href="/app/groups">creating or joining a group</Link>.</> : 'Enjoy the quiet.'}</p></div>
        )}
      </section>

      {byDay.size > 0 && (
        <section aria-labelledby="up-h">
          <h2 id="up-h" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming</h2>
          <div className="space-y-4">
            {[...byDay.entries()].map(([day, list]) => (
              <div key={day}>
                <p className="mb-1 text-sm font-medium">{day}</p>
                <ul className="space-y-2">
                  {list.map((o) => (
                    <li key={o.id}>
                      <Link href={`/app/events/${o.id}`} className="card flex items-center justify-between hover:border-teal-600">
                        <span><span className="font-medium">{o.events.title}</span> <span className="muted">· {o.events.groups.name}</span></span>
                        <span className="muted">{fmt(o.occurrence_start, profile.timezone, 'h:mm a')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="ann-h">
        <h2 id="ann-h" className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent announcements</h2>
        {(anns ?? []).length === 0 ? <p className="muted">No announcements yet.</p> : (
          <ul className="space-y-2">
            {(anns ?? []).map((a) => {
              const g = a.groups as unknown as { name: string } | null;
              return (
                <li key={a.id} className="card">
                  <p className="text-xs text-slate-500">{g?.name} · {fmt(a.created_at, profile.timezone, 'd LLL, h:mm a')} {a.kind === 'urgent' && <span className="badge bg-red-100 text-red-800">Urgent</span>}</p>
                  <p className="font-medium">{a.title}</p>
                  {a.body && <p className="muted">{a.body}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
