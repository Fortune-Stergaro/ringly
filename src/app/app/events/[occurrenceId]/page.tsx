import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { fmt, fmtEvent, offsetLabel } from '@/lib/time';
import { describeRecurrence, type Recurrence } from '@/server/scheduling/recurrence';
import { AckButton } from '@/components/AckButton';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Banner } from '@/components/Banner';
import { cancelEvent } from '@/app/actions/events';

export const metadata = { title: 'Event' };

interface Occ {
  id: string;
  occurrence_start: string;
  status: string;
  events: {
    id: string; group_id: string; title: string; description: string; location: string | null; meeting_url: string | null;
    timezone: string; recurrence: Recurrence | null; reminder_offsets: number[]; require_ack: boolean; status: string; priority: string; version: number;
    groups: { id: string; name: string };
  };
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ occurrenceId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { occurrenceId } = await params;
  const sp = await searchParams;
  const { supabase, profile, user } = await requireUser();

  const { data } = await supabase.from('event_occurrences').select('id, occurrence_start, status, events!inner(*, groups!inner(id, name))').eq('id', occurrenceId).single();
  if (!data) notFound();
  const occ = data as unknown as Occ;
  const ev = occ.events;
  const cancelled = occ.status === 'cancelled' || ev.status === 'cancelled';

  const { data: me } = await supabase.from('group_members').select('role').eq('group_id', ev.group_id).eq('user_id', user.id).single();
  const isAdmin = me?.role === 'owner' || me?.role === 'admin';

  const [{ data: myAck }, { data: changes }] = await Promise.all([
    supabase.from('acknowledgements').select('acknowledged_at').eq('occurrence_id', occurrenceId).eq('user_id', user.id).maybeSingle(),
    supabase.from('event_changes').select('id, change_type, created_at, profiles(display_name)').eq('event_id', ev.id).order('created_at', { ascending: false }).limit(8),
  ]);

  let summary: { members: number; acked: number; push_sent: number; push_failed: number; no_device: number } | null = null;
  let memberRows: { user_id: string; name: string; ackedAt: string | null }[] = [];
  if (isAdmin) {
    const { data: s } = await supabase.rpc('occurrence_summary', { p_occ: occurrenceId });
    summary = Array.isArray(s) ? s[0] : s;
    const [{ data: members }, { data: acks }] = await Promise.all([
      supabase.from('group_members').select('user_id, profiles(display_name)').eq('group_id', ev.group_id),
      supabase.from('acknowledgements').select('user_id, acknowledged_at').eq('occurrence_id', occurrenceId),
    ]);
    const ackMap = new Map((acks ?? []).map((a) => [a.user_id as string, a.acknowledged_at as string]));
    memberRows = ((members ?? []) as unknown as { user_id: string; profiles: { display_name: string } | null }[])
      .map((m) => ({ user_id: m.user_id, name: m.profiles?.display_name ?? 'Member', ackedAt: ackMap.get(m.user_id) ?? null }))
      .sort((a, b) => Number(!!a.ackedAt) - Number(!!b.ackedAt) || a.name.localeCompare(b.name));
  }

  const rec = describeRecurrence(ev.recurrence);
  const wasUpdated = ev.version > 1;

  return (
    <div className="space-y-5">
      <Banner error={sp.error} />
      <div>
        <Link href={`/app/groups/${ev.group_id}`} className="muted underline">{ev.groups.name}</Link>
        <h1 className={`text-3xl font-bold ${cancelled ? 'line-through opacity-60' : ''}`}>{ev.title}</h1>
        <div className="mt-1 flex flex-wrap gap-2">
          {cancelled && <span className="badge bg-red-100 text-red-800">Cancelled</span>}
          {wasUpdated && !cancelled && <span className="badge bg-amber-100 text-amber-900">Updated</span>}
          {ev.priority === 'important' && <span className="badge bg-amber-100 text-amber-900">Important</span>}
        </div>
      </div>

      <div className="card space-y-2">
        <p className="text-lg font-medium">{fmtEvent(occ.occurrence_start, ev.timezone, profile.timezone)}</p>
        {ev.location && <p>📍 {ev.location}</p>}
        {ev.meeting_url && <p><a className="underline" href={ev.meeting_url} target="_blank" rel="noopener noreferrer">Open meeting link</a></p>}
        {ev.description && <p className="whitespace-pre-wrap">{ev.description}</p>}
        <p className="muted">{rec}</p>
        <p className="muted">Reminders: {[...ev.reminder_offsets].sort((a, b) => b - a).map(offsetLabel).join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!cancelled && <AckButton occurrenceId={occurrenceId} acked={!!myAck} />}
          <a className="btn-ghost" href={`/app/events/${occurrenceId}/ics`}>Add to calendar</a>
          {isAdmin && !cancelled && <Link className="btn-ghost" href={`/app/groups/${ev.group_id}/events/${ev.id}/edit`}>Edit</Link>}
        </div>
      </div>

      {isAdmin && summary && (
        <section className="card space-y-3" aria-labelledby="ack-h">
          <h2 id="ack-h" className="font-semibold">Acknowledgements & delivery</h2>
          <p className="text-lg">{summary.acked} of {summary.members} acknowledged</p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800"><b>{summary.push_sent}</b><br />push accepted</div>
            <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800"><b>{summary.push_failed}</b><br />push failed</div>
            <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800"><b>{summary.no_device}</b><br />no device</div>
          </div>
          <p className="muted">Delivery means the push service accepted the message. It doesn’t prove the member saw or heard it. Acknowledgement means the member tapped Acknowledge. Neither proves attendance.</p>
          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {memberRows.map((m) => (
              <li key={m.user_id} className="flex justify-between py-1.5">
                <span>{m.name}</span>
                <span className={m.ackedAt ? 'text-teal-700 dark:text-teal-300' : 'muted'}>{m.ackedAt ? `Acknowledged ${fmt(m.ackedAt, profile.timezone, 'h:mm a')}` : 'Not acknowledged'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && !cancelled && (
        <section className="card space-y-3" aria-labelledby="cancel-h">
          <h2 id="cancel-h" className="font-semibold">Cancel</h2>
          <form action={cancelEvent} className="flex flex-wrap gap-2">
            <input type="hidden" name="eventId" value={ev.id} />
            <input type="hidden" name="occurrenceId" value={occurrenceId} />
            <input type="hidden" name="groupId" value={ev.group_id} />
            {ev.recurrence && (
              <button name="scope" value="occurrence" className="btn-ghost">Cancel this session only</button>
            )}
            <ConfirmButton message="Cancel this event? Members will be notified and pending reminders removed." className="btn-danger">{ev.recurrence ? 'Cancel whole series' : 'Cancel event'}</ConfirmButton>
          </form>
        </section>
      )}

      <section aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-2 font-semibold">Change history</h2>
        <ul className="muted space-y-1">
          {(changes ?? []).map((c) => {
            const p = c.profiles as unknown as { display_name: string } | null;
            return <li key={c.id}>{c.change_type} by {p?.display_name ?? 'someone'} · {fmt(c.created_at, profile.timezone, 'd LLL, h:mm a')}</li>;
          })}
        </ul>
      </section>
    </div>
  );
}
