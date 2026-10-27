import { requireUser } from '@/server/auth';
import { updateProfile, toggleMute } from '@/app/actions/settings';
import { Banner } from '@/components/Banner';
import { NotificationSetup, type DeviceRow } from '@/components/NotificationSetup';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile, user } = await requireUser();
  const [{ data: devices }, { data: memberships }] = await Promise.all([
    supabase.from('push_subscriptions').select('id, endpoint, device_label, platform, last_success_at, last_failure_at, is_active').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('group_members').select('group_id, muted, groups(name)').eq('user_id', user.id),
  ]);
  const groups = (memberships ?? []) as unknown as { group_id: string; muted: boolean; groups: { name: string } }[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Banner error={sp.error} message={sp.saved ? 'Saved.' : undefined} />

      <NotificationSetup devices={(devices ?? []) as DeviceRow[]} />

      <form action={updateProfile} className="card space-y-3">
        <h2 className="font-semibold">Profile</h2>
        <div><label className="label" htmlFor="dn">Display name</label><input id="dn" name="display_name" defaultValue={profile.display_name} required minLength={2} className="input" /></div>
        <div><label className="label" htmlFor="tz">Time zone</label><input id="tz" name="timezone" defaultValue={profile.timezone} className="input" /></div>
        <button className="btn-primary">Save</button>
      </form>

      <section className="card space-y-3">
        <h2 className="font-semibold">Group notifications</h2>
        <p className="muted">Muting stops normal reminders and announcements from a group. Urgent alerts still come through.</p>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {groups.map((g) => (
            <li key={g.group_id} className="flex items-center justify-between py-2">
              <span>{g.groups.name}</span>
              <form action={toggleMute}>
                <input type="hidden" name="groupId" value={g.group_id} />
                <input type="hidden" name="muted" value={String(!g.muted)} />
                <button className="btn-ghost !px-3 !py-1">{g.muted ? 'Unmute' : 'Mute'}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
