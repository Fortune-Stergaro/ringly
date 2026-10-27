import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { requireUser } from '@/server/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fmt } from '@/lib/time';
import { Banner } from '@/components/Banner';
import { ConfirmButton } from '@/components/ConfirmButton';
import { CopyButton } from '@/components/CopyButton';
import { postAnnouncement, sendUrgent } from '@/app/actions/announcements';
import { createInvite, leaveGroup, regenerateCode, removeMember, revokeInvite, setMemberRole, updateGroup } from '@/app/actions/groups';
import type { Group, Role } from '@/types';

const TABS = ['schedule', 'announcements', 'members', 'settings'] as const;
type Tab = (typeof TABS)[number];

interface OccRow {
  id: string;
  occurrence_start: string;
  status: string;
  events: { id: string; title: string; location: string | null; timezone: string; status: string; priority: string; recurrence: unknown };
}

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string; welcome?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'schedule';
  const { supabase, profile, user } = await requireUser();

  const { data: g } = await supabase.from('groups').select('*').eq('id', id).single();
  if (!g) notFound();
  const group = g as Group;
  const { data: me } = await supabase.from('group_members').select('role, can_send_urgent').eq('group_id', id).eq('user_id', user.id).single();
  if (!me) notFound();
  const role = me.role as Role;
  const isAdmin = role === 'owner' || role === 'admin';
  const canUrgent = role === 'owner' || (role === 'admin' && me.can_send_urgent);
  const base = `/app/groups/${id}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          {group.description && <p className="muted">{group.description}</p>}
          <p className="muted">Group time zone: {group.timezone}</p>
        </div>
        {isAdmin && <Link href={`${base}/events/new`} className="btn-primary"><Plus size={16} aria-hidden /> New event</Link>}
      </div>
      <Banner error={sp.error} message={sp.welcome ? 'You joined the group. Turn on notifications in Settings so you get its alarms.' : undefined} />

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" aria-label="Group sections">
        {TABS.filter((t) => t !== 'settings' || isAdmin).map((t) => (
          <Link key={t} href={`${base}?tab=${t}`} aria-current={tab === t ? 'page' : undefined}
            className={`whitespace-nowrap px-3 py-2 text-sm capitalize ${tab === t ? 'border-b-2 border-teal-700 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>{t}</Link>
        ))}
      </nav>

      {tab === 'schedule' && <Schedule gid={id} tz={profile.timezone} supabase={supabase} />}

      {tab === 'announcements' && (
        <Announcements gid={id} isAdmin={isAdmin} canUrgent={canUrgent} tz={profile.timezone} supabase={supabase} />
      )}

      {tab === 'members' && <Members gid={id} role={role} isAdmin={isAdmin} myId={user.id} supabase={supabase} />}

      {tab === 'settings' && isAdmin && (
        <Settings group={group} role={role} appUrl={appUrl} supabase={supabase} />
      )}

      <form action={leaveGroup} className="pt-4">
        <input type="hidden" name="groupId" value={id} />
        {role !== 'owner' && <ConfirmButton message="Leave this group? You will stop receiving its alerts." className="text-sm text-red-700 underline">Leave group</ConfirmButton>}
      </form>
    </div>
  );
}

type Sb = Awaited<ReturnType<typeof requireUser>>['supabase'];

async function Schedule({ gid, tz, supabase }: { gid: string; tz: string; supabase: Sb }) {
  const { data } = await supabase
    .from('event_occurrences')
    .select('id, occurrence_start, status, events!inner(id, title, location, timezone, group_id, status, priority, recurrence)')
    .eq('events.group_id', gid)
    .gte('occurrence_start', new Date(Date.now() - 86400_000).toISOString())
    .order('occurrence_start')
    .limit(100);
  const rows = (data ?? []) as unknown as OccRow[];
  if (rows.length === 0) return <p className="muted">No upcoming events.</p>;
  const days = new Map<string, OccRow[]>();
  for (const r of rows) {
    const k = fmt(r.occurrence_start, tz, 'cccc d LLLL');
    days.set(k, [...(days.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-5">
      {[...days.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">{day}</h2>
          <ul className="space-y-2">
            {list.map((o) => {
              const cancelled = o.status === 'cancelled' || o.events.status === 'cancelled';
              return (
                <li key={o.id}>
                  <Link href={`/app/events/${o.id}`} className="card flex items-center justify-between hover:border-teal-600">
                    <span className={cancelled ? 'line-through opacity-60' : ''}>
                      <span className="font-medium">{o.events.title}</span>
                      {o.events.recurrence ? <span className="muted"> · repeats</span> : null}
                      {o.events.location && <span className="muted"> · {o.events.location}</span>}
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      {cancelled && <span className="badge bg-red-100 text-red-800">Cancelled</span>}
                      {o.events.priority === 'important' && !cancelled && <span className="badge bg-amber-100 text-amber-900">Important</span>}
                      <span className="muted">{fmt(o.occurrence_start, tz, 'h:mm a')}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function Announcements({ gid, isAdmin, canUrgent, tz, supabase }: { gid: string; isAdmin: boolean; canUrgent: boolean; tz: string; supabase: Sb }) {
  const { data } = await supabase
    .from('announcements')
    .select('id, title, body, kind, created_at, profiles(display_name)')
    .eq('group_id', gid)
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = (data ?? []) as unknown as { id: string; title: string; body: string; kind: string; created_at: string; profiles: { display_name: string } | null }[];
  return (
    <div className="space-y-5">
      {isAdmin && (
        <form action={postAnnouncement} className="card space-y-3">
          <h2 className="font-semibold">New announcement</h2>
          <input type="hidden" name="groupId" value={gid} />
          <input name="title" required maxLength={120} className="input" placeholder="Title" aria-label="Title" />
          <textarea name="body" rows={3} className="input" placeholder="Details" aria-label="Details" />
          <fieldset className="space-y-1 text-sm">
            <legend className="label">Delivery</legend>
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="only" defaultChecked /> Announcement only (notify now)</label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="remind" /> Notify now + reminder later</label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="alarm" /> Notify now + alarm later</label>
          </fieldset>
          <div>
            <label className="label" htmlFor="when">Later time (group time zone, for reminder/alarm)</label>
            <input id="when" name="when" type="datetime-local" className="input" />
          </div>
          <button className="btn-primary">Publish</button>
        </form>
      )}

      {canUrgent && (
        <form action={sendUrgent} className="card space-y-3 border-red-300">
          <h2 className="font-semibold text-red-800 dark:text-red-300">Urgent alert</h2>
          <p className="muted">Interrupts every member immediately, including muted members. Limited to 2 per hour. Your name is shown as the sender.</p>
          <input type="hidden" name="groupId" value={gid} />
          <input name="title" required maxLength={120} className="input" placeholder="What’s happening?" aria-label="Urgent title" />
          <textarea name="body" rows={2} className="input" placeholder="Short instruction" aria-label="Urgent details" />
          <ConfirmButton message="Send an urgent alert to every member of this group right now?" className="btn-danger">Send urgent alert</ConfirmButton>
        </form>
      )}

      <ul className="space-y-2">
        {rows.length === 0 && <li className="muted">No announcements yet.</li>}
        {rows.map((a) => (
          <li key={a.id} className="card">
            <p className="text-xs text-slate-500">{a.profiles?.display_name ?? 'Former member'} · {fmt(a.created_at, tz, 'd LLL, h:mm a')} {a.kind === 'urgent' && <span className="badge bg-red-100 text-red-800">Urgent</span>}</p>
            <p className="font-medium">{a.title}</p>
            {a.body && <p className="muted whitespace-pre-wrap">{a.body}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Members({ gid, role, isAdmin, myId, supabase }: { gid: string; role: Role; isAdmin: boolean; myId: string; supabase: Sb }) {
  const { data } = await supabase.from('group_members').select('user_id, role, can_send_urgent, joined_at, profiles(display_name)').eq('group_id', gid).order('joined_at');
  const rows = (data ?? []) as unknown as { user_id: string; role: Role; can_send_urgent: boolean; joined_at: string; profiles: { display_name: string } | null }[];

  let ready: number | null = null;
  if (isAdmin) {
    const { data: subs } = await createAdminClient().from('push_subscriptions').select('user_id').in('user_id', rows.map((r) => r.user_id)).eq('is_active', true);
    ready = new Set((subs ?? []).map((s) => s.user_id as string)).size;
  }

  return (
    <div className="space-y-4">
      {ready !== null && (
        <div className="card">
          <p className="font-medium">Notification readiness: {ready} of {rows.length} members have at least one active device</p>
          <p className="muted">Members without a registered device won’t be alerted. Share the invite link and ask them to enable notifications.</p>
        </div>
      )}
      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {rows.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-medium">{m.profiles?.display_name ?? 'Member'} {m.user_id === myId && <span className="muted">(you)</span>}</p>
              <p className="muted">{m.role}{m.role === 'admin' && m.can_send_urgent ? ' · can send urgent alerts' : ''}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {role === 'owner' && m.role !== 'owner' && (
                <form action={setMemberRole} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="groupId" value={gid} />
                  <input type="hidden" name="userId" value={m.user_id} />
                  <select name="role" defaultValue={m.role} className="input !w-auto" aria-label="Role">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <label className="flex items-center gap-1"><input type="checkbox" name="urgent" defaultChecked={m.can_send_urgent} /> urgent</label>
                  <button className="btn-ghost !px-3 !py-1">Save</button>
                </form>
              )}
              {isAdmin && m.role !== 'owner' && m.user_id !== myId && (m.role === 'member' || role === 'owner') && (
                <form action={removeMember}>
                  <input type="hidden" name="groupId" value={gid} />
                  <input type="hidden" name="userId" value={m.user_id} />
                  <ConfirmButton message={`Remove ${m.profiles?.display_name ?? 'this member'} from the group?`} className="btn-ghost !px-3 !py-1 text-red-700">Remove</ConfirmButton>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Settings({ group, role, appUrl, supabase }: { group: Group; role: Role; appUrl: string; supabase: Sb }) {
  const { data } = await supabase.from('group_invites').select('id, token, expires_at, max_uses, use_count').eq('group_id', group.id).is('revoked_at', null).order('created_at', { ascending: false });
  const invites = data ?? [];
  const wa = (link: string) => `https://wa.me/?text=${encodeURIComponent(`Join ${group.name} on Ringly: ${link}`)}`;
  return (
    <div className="space-y-5">
      {role === 'owner' && (
        <form action={updateGroup} className="card space-y-3">
          <h2 className="font-semibold">Group settings</h2>
          <input type="hidden" name="groupId" value={group.id} />
          <div><label className="label" htmlFor="gname">Name</label><input id="gname" name="name" defaultValue={group.name} required className="input" /></div>
          <div><label className="label" htmlFor="gdesc">Description</label><input id="gdesc" name="description" defaultValue={group.description ?? ''} className="input" /></div>
          <div><label className="label" htmlFor="gtz">Default time zone</label><input id="gtz" name="timezone" defaultValue={group.timezone} className="input" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="invite_code_enabled" defaultChecked={group.invite_code_enabled} /> Allow joining with the invite code</label>
          <button className="btn-primary">Save</button>
        </form>
      )}

      <div className="card space-y-3">
        <h2 className="font-semibold">Invite code</h2>
        <p className="font-mono text-2xl tracking-widest">{group.invite_code}</p>
        <p className="muted">{group.invite_code_enabled ? 'Members can enter this code under Groups → Join with a code.' : 'Code joining is currently disabled.'}</p>
        <form action={regenerateCode}>
          <input type="hidden" name="groupId" value={group.id} />
          <ConfirmButton message="Generate a new code? The old one stops working." className="btn-ghost">Regenerate code</ConfirmButton>
        </form>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Invite links</h2>
        <form action={createInvite} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="groupId" value={group.id} />
          <div><label className="label" htmlFor="days">Expires in (days, optional)</label><input id="days" name="days" type="number" min={0} className="input !w-32" /></div>
          <div><label className="label" htmlFor="max">Max uses (optional)</label><input id="max" name="max_uses" type="number" min={0} className="input !w-32" /></div>
          <button className="btn-primary">Create link</button>
        </form>
        <ul className="space-y-2">
          {invites.length === 0 && <li className="muted">No active links.</li>}
          {invites.map((i) => {
            const link = `${appUrl}/join/${i.token}`;
            return (
              <li key={i.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
                <p className="break-all font-mono text-xs">{link}</p>
                <p className="muted">Used {i.use_count}{i.max_uses ? ` / ${i.max_uses}` : ''} times{i.expires_at ? ` · expires ${new Date(i.expires_at).toLocaleDateString()}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton text={link} label="Copy link" />
                  <a className="btn-ghost !px-3 !py-1" href={wa(link)} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
                  <form action={revokeInvite}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="inviteId" value={i.id} />
                    <button className="btn-ghost !px-3 !py-1 text-red-700">Revoke</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
